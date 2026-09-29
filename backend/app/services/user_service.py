from datetime import datetime, timedelta, timezone
import logging
import math
import re
import secrets
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.auth import Role, User, UserRole
from app.schemas.user import UserCreate, UserUpdate
from app.services.email_service import send_account_activation_email

logger = logging.getLogger(__name__)


# Danh sách các vai trò thuộc nhóm Kho
WAREHOUSE_ROLES: List[str] = [
    UserRole.WAREHOUSE.value,
    UserRole.WH_MANAGER.value,
    "WAREHOUSE",
    "WH_MANAGER",
]


def validate_username_format(username: str) -> None:
    """Kiểm tra tính hợp lệ của tên đăng nhập (SCRUM-324)."""
    cleaned = username.strip()
    if len(cleaned) < 3 or len(cleaned) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập phải có độ dài từ 3 đến 50 ký tự.",
        )
    if not re.match(r"^[a-zA-Z0-9_.-]+$", cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập chỉ được chứa chữ cái, chữ số, dấu gạch dưới, gạch ngang hoặc dấu chấm.",
        )


def validate_email_format(email: str) -> None:
    """Kiểm tra định dạng email hợp lệ (SCRUM-324)."""
    cleaned = email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng email '{email}' không hợp lệ.",
        )



def validate_phone_format(phone: str) -> None:
    """Kiểm tra định dạng số điện thoại (SCRUM-324)."""
    cleaned = phone.strip().replace(" ", "").replace("-", "")
    if not re.match(r"^(\+84|0)[0-9]{9,10}$", cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng số điện thoại '{phone}' không hợp lệ (yêu cầu 10 chữ số bắt đầu bằng 0).",
        )


def create_user(user_data: UserCreate, db: Session) -> User:
    """Tạo người dùng mới (SCRUM-205, SCRUM-206 & SCRUM-324):
    
    - Kiểm tra tính hợp lệ của dữ liệu trước khi lưu (email, phone, username).
    - Kiểm tra trùng username, email và số điện thoại (SCRUM-325).
    - Cấp mật khẩu tạm thời nếu không truyền mật khẩu.
    - Kiểm tra ràng buộc vai trò kho phải gắn với ít nhất một kho.
    """
    username = user_data.username.strip()
    email = user_data.email.strip().lower()
    phone = user_data.phone_number.strip() if user_data.phone_number else None

    # 1. Kiểm tra định dạng dữ liệu hợp lệ (SCRUM-324)
    validate_username_format(username)
    validate_email_format(email)
    if phone:
        validate_phone_format(phone)

    # 2. Kiểm tra trùng tên đăng nhập
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tên đăng nhập '{username}' đã tồn tại trong hệ thống. Vui lòng chọn tên khác.",
        )

    # 3. Kiểm tra trùng địa chỉ email
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Địa chỉ email '{email}' đã được đăng ký cho một tài khoản khác.",
        )

    # 4. Kiểm tra trùng số điện thoại (SCRUM-325)
    if phone:
        if db.query(User).filter(User.phone_number == phone).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số điện thoại '{phone}' đã được đăng ký cho một tài khoản khác.",
            )

    # 5. Ràng buộc vai trò kho (SCRUM-206)


    primary_role = user_data.role or UserRole.CUSTOMER.value
    role_names = user_data.role_names or []
    is_warehouse_role = primary_role in WAREHOUSE_ROLES or any(r in WAREHOUSE_ROLES for r in role_names)

    if is_warehouse_role and not user_data.assigned_warehouse:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người dùng thuộc vai trò kho phải được gắn với ít nhất một kho hoặc địa bàn cụ thể.",
        )

    # 6. Thiết lập mật khẩu và mã kích hoạt tài khoản (SCRUM-323)
    initial_password = user_data.password if user_data.password else f"Temp@{secrets.token_hex(4)}1"
    must_change = user_data.password is None
    activation_token = secrets.token_urlsafe(32)

    # 7. Trạng thái tài khoản ban đầu: hỗ trợ lưu trạng thái chờ kích hoạt (SCRUM-323)
    is_pending = (
        user_data.require_activation is True or
        (user_data.status and user_data.status.strip().lower() in ["pending_activation", "chờ kích hoạt"])
    )

    if is_pending:
        is_active = False
        lock_reason = "Chờ kích hoạt"
    else:
        is_active = user_data.is_active if user_data.is_active is not None else True
        lock_reason = None

    new_user = User(
        username=username,
        email=email,
        full_name=user_data.full_name,
        phone_number=user_data.phone_number,
        role=primary_role,
        assigned_warehouse=user_data.assigned_warehouse,
        hashed_password=get_password_hash(initial_password),
        must_change_password=must_change,
        is_active=is_active,
        lock_reason=lock_reason,
        reset_password_token=activation_token,
        reset_password_expires_at=datetime.now(timezone.utc) + timedelta(days=2),
        token_version=1,
    )

    # Gán các vai trò Many-to-Many nếu có
    if role_names:
        for role_name in role_names:
            role_obj = db.query(Role).filter(
                or_(Role.name == role_name.upper(), Role.name == role_name)
            ).first()
            if role_obj and role_obj not in new_user.roles:
                new_user.roles.append(role_obj)

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Gán temporary_password để trả về cho client / Admin tiện sao chép (SCRUM-323)
    new_user.temporary_password = initial_password if must_change else None

    # 8. Gửi email kích hoạt tài khoản và cấp mật khẩu tạm (SCRUM-323)
    try:
        send_account_activation_email(
            to_email=new_user.email,
            username=new_user.username,
            temp_password=initial_password,
            full_name=new_user.full_name,
            activation_token=activation_token,
        )
    except Exception as exc:
        logger.warning(f"Lỗi khi gửi email kích hoạt tài khoản cho {new_user.email}: {exc}")

    return new_user


def activate_user_with_token(
    token: str,
    new_password: Optional[str] = None,
    db: Session = None,
) -> User:
    """Kích hoạt tài khoản người dùng bằng mã kích hoạt / token (SCRUM-323)."""
    cleaned_token = token.strip()
    user = db.query(User).filter(User.reset_password_token == cleaned_token).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã kích hoạt tài khoản không hợp lệ hoặc không tồn tại.",
        )

    # Kiểm tra hạn của token kích hoạt
    if user.reset_password_expires_at:
        expiry = user.reset_password_expires_at
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expiry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã kích hoạt tài khoản đã hết hạn.",
            )

    # Kích hoạt tài khoản
    user.is_active = True
    user.lock_reason = None
    user.reset_password_token = None
    user.reset_password_expires_at = None
    user.failed_login_attempts = 0
    user.locked_until = None

    if new_password:
        if len(new_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mật khẩu mới phải có ít nhất 6 ký tự.",
            )
        user.hashed_password = get_password_hash(new_password)
        user.must_change_password = False
        user.token_version += 1

    db.commit()
    db.refresh(user)
    return user



def list_users(
    query: Optional[str],
    role: Optional[str],
    is_active: Optional[bool],
    page: int,
    page_size: int,
    db: Session,
) -> Tuple[List[User], int, int]:
    """Tìm kiếm, lọc và phân trang người dùng (SCRUM-205, mặc định 20 dòng):
    
    Returns:
        (users_list, total_count, total_pages)
    """
    stmt = db.query(User)

    # Tìm kiếm theo từ khóa: username, email, họ tên hoặc số điện thoại
    if query and query.strip():
        search_term = f"%{query.strip()}%"
        stmt = stmt.filter(
            or_(
                User.username.ilike(search_term),
                User.email.ilike(search_term),
                User.full_name.ilike(search_term),
                User.phone_number.ilike(search_term),
            )
        )

    # Lọc theo vai trò
    if role and role.strip():
        stmt = stmt.filter(User.role == role.strip())

    # Lọc theo trạng thái
    if is_active is not None:
        stmt = stmt.filter(User.is_active == is_active)

    total_count = stmt.count()
    total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1

    users = (
        stmt.order_by(User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return users, total_count, total_pages


def get_user_by_id(user_id: int, db: Session) -> Optional[User]:
    """Lấy thông tin người dùng theo ID."""
    return db.query(User).filter(User.id == user_id).first()


def update_user(
    user_id: int,
    update_data: UserUpdate,
    current_user: User,
    db: Session,
) -> User:
    """Cập nhật thông tin và vai trò người dùng (SCRUM-205 & SCRUM-206):
    
    - Ngăn Admin tự thu hồi quyền quản trị của chính mình.
    - Kiểm tra ràng buộc vai trò kho phải gắn với kho cụ thể.
    """
    target_user = get_user_by_id(user_id, db)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng.",
        )

    # 1. Ràng buộc: Quản trị viên không thể tự thu hồi quyền của chính mình
    if target_user.id == current_user.id:
        if update_data.role and update_data.role.upper() != UserRole.ADMIN.value.upper():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự thu hồi vai trò quản trị viên của chính mình.",
            )

    # 2. Kiểm tra format và trùng tên đăng nhập khi cập nhật (SCRUM-324 & SCRUM-325)
    if update_data.username is not None:
        new_username = update_data.username.strip()
        validate_username_format(new_username)
        if new_username and new_username != target_user.username:
            if db.query(User).filter(User.username == new_username, User.id != target_user.id).first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tên đăng nhập '{new_username}' đã tồn tại trong hệ thống. Vui lòng chọn tên khác.",
                )
            target_user.username = new_username

    # 3. Kiểm tra format và trùng email khi cập nhật (SCRUM-324 & SCRUM-325)
    if update_data.email is not None:
        new_email = update_data.email.strip().lower()
        validate_email_format(new_email)
        if new_email and new_email != target_user.email:
            if db.query(User).filter(User.email == new_email, User.id != target_user.id).first():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Địa chỉ email '{new_email}' đã được đăng ký cho một tài khoản khác.",
                )
            target_user.email = new_email

    # 4. Kiểm tra format và trùng số điện thoại khi cập nhật (SCRUM-324 & SCRUM-325)
    if update_data.phone_number is not None:
        new_phone = update_data.phone_number.strip() if update_data.phone_number else None
        if new_phone:
            validate_phone_format(new_phone)
            if new_phone != target_user.phone_number:
                if db.query(User).filter(User.phone_number == new_phone, User.id != target_user.id).first():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Số điện thoại '{new_phone}' đã được đăng ký cho một tài khoản khác.",
                    )
        target_user.phone_number = new_phone

    # 5. Cập nhật thông tin cơ bản
    if update_data.full_name is not None:
        target_user.full_name = update_data.full_name
    if update_data.assigned_warehouse is not None:
        target_user.assigned_warehouse = update_data.assigned_warehouse

    # 6. Cập nhật trạng thái tài khoản: hoạt động, khóa hoặc ngừng sử dụng (SCRUM-324)
    if update_data.status is not None:
        normalized_status = update_data.status.strip().lower()
        if normalized_status in ["active", "hoạt động"]:
            target_user.is_active = True
            target_user.lock_reason = None
            target_user.failed_login_attempts = 0
            target_user.locked_until = None
        elif normalized_status in ["locked", "khóa"]:
            if target_user.id == current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Không thể tự khóa tài khoản của chính mình.",
                )
            target_user.is_active = False
            target_user.locked_until = datetime(2099, 1, 1, tzinfo=timezone.utc)
            target_user.lock_reason = update_data.lock_reason.strip() if update_data.lock_reason else "Khóa bởi quản trị viên"
            target_user.token_version += 1
        elif normalized_status in ["inactive", "ngừng sử dụng", "deactivated"]:
            if target_user.id == current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Không thể tự vô hiệu hóa hoặc ngừng sử dụng tài khoản của chính mình.",
                )
            target_user.is_active = False
            target_user.locked_until = None
            target_user.lock_reason = update_data.lock_reason.strip() if update_data.lock_reason else "Ngừng sử dụng"
            target_user.token_version += 1
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Trạng thái tài khoản '{update_data.status}' không hợp lệ. Chỉ chấp nhận: active (hoạt động), locked (khóa), inactive (ngừng sử dụng).",
            )
    elif update_data.is_active is not None:
        if not update_data.is_active and target_user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự vô hiệu hóa tài khoản của chính mình.",
            )
        target_user.is_active = update_data.is_active
        if not update_data.is_active:
            target_user.token_version += 1
            if update_data.lock_reason:
                target_user.lock_reason = update_data.lock_reason


    # 6. Cập nhật vai trò và kiểm tra ràng buộc vai trò kho

    if update_data.role:
        target_user.role = update_data.role

    is_warehouse = target_user.role in WAREHOUSE_ROLES or (
        update_data.role_names and any(r in WAREHOUSE_ROLES for r in update_data.role_names)
    )
    if is_warehouse and not target_user.assigned_warehouse:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người dùng thuộc vai trò kho phải được gắn với ít nhất một kho hoặc địa bàn cụ thể.",
        )

    # Cập nhật danh sách vai trò nếu có
    if update_data.role_names is not None:
        target_user.roles.clear()
        for role_name in update_data.role_names:
            role_obj = db.query(Role).filter(
                or_(Role.name == role_name.upper(), Role.name == role_name)
            ).first()
            if role_obj:
                target_user.roles.append(role_obj)

    db.commit()
    db.refresh(target_user)
    return target_user


def lock_user(
    user_id: int,
    reason: str,
    current_user: User,
    db: Session,
) -> Dict[str, Any]:
    """Khóa tài khoản và thu hồi các phiên đăng nhập (SCRUM-207)."""
    target_user = get_user_by_id(user_id, db)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng.",
        )

    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự khóa tài khoản của chính mình.",
        )

    target_user.is_active = False
    target_user.lock_reason = reason.strip()
    target_user.token_version += 1  # Lập tức thu hồi các phiên đăng nhập đang mở
    db.commit()

    is_sales = target_user.role in [UserRole.SALES_REP.value, UserRole.SALES_MANAGER.value]
    handover_warning = None
    if is_sales:
        handover_warning = (
            f"CẢNH BÁO: Nhân viên '{target_user.username}' thuộc bộ phận kinh doanh phụ trách các đại lý địa bàn. "
            f"Vui lòng phân công bàn giao danh sách khách hàng/đại lý ngay lập tức."
        )

    return {
        "status": "success",
        "message": f"Tài khoản '{target_user.username}' đã bị khóa thành công.",
        "lock_reason": target_user.lock_reason,
        "session_revoked": True,
        "handover_warning": handover_warning,
    }


def unlock_user(user_id: int, db: Session) -> User:
    """Mở khóa tài khoản người dùng (SCRUM-207)."""
    target_user = get_user_by_id(user_id, db)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng.",
        )

    target_user.is_active = True
    target_user.lock_reason = None
    target_user.failed_login_attempts = 0
    target_user.locked_until = None
    db.commit()
    db.refresh(target_user)
    return target_user
