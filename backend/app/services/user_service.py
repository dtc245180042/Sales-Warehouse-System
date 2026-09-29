import math
import secrets
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.auth import Role, User, UserRole
from app.schemas.user import UserCreate, UserUpdate

# Danh sách các vai trò thuộc nhóm Kho
WAREHOUSE_ROLES: List[str] = [
    UserRole.WAREHOUSE.value,
    UserRole.WH_MANAGER.value,
    "WAREHOUSE",
    "WH_MANAGER",
]


def create_user(user_data: UserCreate, db: Session) -> User:
    """Tạo người dùng mới (SCRUM-205 & SCRUM-206):
    
    - Kiểm tra trùng username và email (báo lỗi cụ thể).
    - Cấp mật khẩu tạm thời nếu không truyền mật khẩu.
    - Kiểm tra ràng buộc vai trò kho phải gắn với ít nhất một kho.
    """
    username = user_data.username.strip()
    email = user_data.email.strip().lower()

    # 1. Kiểm tra trùng tên đăng nhập
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tên đăng nhập '{username}' đã tồn tại trong hệ thống. Vui lòng chọn tên khác.",
        )

    # 2. Kiểm tra trùng địa chỉ email
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Địa chỉ email '{email}' đã được đăng ký cho một tài khoản khác.",
        )

    # 3. Ràng buộc vai trò kho (SCRUM-206)
    primary_role = user_data.role or UserRole.CUSTOMER.value
    role_names = user_data.role_names or []
    is_warehouse_role = primary_role in WAREHOUSE_ROLES or any(r in WAREHOUSE_ROLES for r in role_names)

    if is_warehouse_role and not user_data.assigned_warehouse:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người dùng thuộc vai trò kho phải được gắn với ít nhất một kho hoặc địa bàn cụ thể.",
        )

    # 4. Thiết lập mật khẩu
    initial_password = user_data.password if user_data.password else f"Temp@{secrets.token_hex(4)}1"
    must_change = user_data.password is None

    new_user = User(
        username=username,
        email=email,
        full_name=user_data.full_name,
        phone_number=user_data.phone_number,
        role=primary_role,
        assigned_warehouse=user_data.assigned_warehouse,
        hashed_password=get_password_hash(initial_password),
        must_change_password=must_change,
        is_active=user_data.is_active if user_data.is_active is not None else True,
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
    return new_user


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

    # 2. Cập nhật thông tin cơ bản
    if update_data.full_name is not None:
        target_user.full_name = update_data.full_name
    if update_data.phone_number is not None:
        target_user.phone_number = update_data.phone_number
    if update_data.assigned_warehouse is not None:
        target_user.assigned_warehouse = update_data.assigned_warehouse
    if update_data.is_active is not None:
        target_user.is_active = update_data.is_active

    # 3. Cập nhật vai trò và kiểm tra ràng buộc vai trò kho
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
