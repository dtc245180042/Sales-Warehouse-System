import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.models.auth import User, PasswordResetToken
from app.core.security import get_password_hash, verify_password
from app.services.email_service import send_password_reset_email
from app.services.menu_service import get_user_navigation_menu
from app.schemas.auth import UserClaimsResponse

# ---------------------------------------------------------------------------
# Hằng số cấu hình
# ---------------------------------------------------------------------------
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
RESET_TOKEN_EXPIRE_MINUTES = int(os.getenv("RESET_PASSWORD_TOKEN_EXPIRE_MINUTES", "15"))

GENERIC_FORGOT_PASSWORD_MESSAGE = (
    "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư của bạn."
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_utc_now() -> datetime:
    """Lấy thời gian UTC hiện tại dạng naive để tương thích tốt với SQLite/MySQL."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Service functions — Router gọi vào đây, không truy cập DB trực tiếp
# ---------------------------------------------------------------------------

def build_user_claims_response(user: User, db: Session) -> UserClaimsResponse:
    """Tổng hợp claims đầy đủ của user: profile + roles + permissions + cây menu (SCRUM-203 / SCRUM-301).

    FE dùng response này để:
    - Hiển thị đúng Sidebar menu theo vai trò.
    - Guard route phía client dựa trên danh sách permissions.
    - Hiển thị thông tin kho/địa bàn đang làm việc.
    """
    roles = user.get_roles_list()
    permissions = user.get_permissions_list()

    # Xác định vai trò chính (ưu tiên role đầu tiên trong danh sách)
    primary_role = roles[0] if roles else None
    menus = get_user_navigation_menu(db=db, role_name=primary_role, permission_codes=permissions)

    return UserClaimsResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        token_version=user.token_version,
        full_name=user.full_name,
        phone_number=user.phone_number,
        assigned_warehouse=user.assigned_warehouse or user.warehouse_name,
        warehouse_id=user.warehouse_id,
        warehouse_name=user.warehouse_name,
        region=user.region,
        must_change_password=user.must_change_password,
        roles=roles,
        permissions=permissions,
        navigation_menus=menus,
    )


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Xác thực người dùng qua username/email và mật khẩu.

    Trả về User nếu hợp lệ, None nếu không tìm thấy / sai mật khẩu / bị vô hiệu hóa.
    """
    user = db.query(User).filter(
        (User.username == username) | (User.email == username.lower())
    ).first()

    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


def request_password_reset(
    db: Session, email: str, background_tasks: BackgroundTasks
) -> str:
    """Xử lý yêu cầu quên mật khẩu.

    1. Hủy token cũ chưa sử dụng của user.
    2. Sinh token ngẫu nhiên an toàn, lưu DB.
    3. Gửi email bất đồng bộ qua BackgroundTasks.

    BẢO MẬT: Luôn trả thông báo chung kể cả khi email không tồn tại
    để chống User Enumeration Attack.
    """
    clean_email = email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()

    if user and user.is_active:
        # 1. Vô hiệu hóa toàn bộ token cũ chưa dùng
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.is_used == False,  # noqa: E712
        ).update({"is_used": True})

        # 2. Tạo token ngẫu nhiên và lưu DB
        token_str = secrets.token_urlsafe(32)
        expires_at = _get_utc_now() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)

        db_token = PasswordResetToken(
            user_id=user.id,
            token=token_str,
            expires_at=expires_at,
            is_used=False,
        )
        db.add(db_token)
        db.commit()

        # 3. Gửi email bất đồng bộ
        reset_url = f"{FRONTEND_URL}/reset-password?token={token_str}"
        background_tasks.add_task(
            send_password_reset_email,
            to_email=user.email,
            reset_url=reset_url,
            expire_minutes=RESET_TOKEN_EXPIRE_MINUTES,
        )

    return GENERIC_FORGOT_PASSWORD_MESSAGE


def reset_password_with_token(db: Session, token: str, new_password: str) -> str:
    """Xác thực token và cập nhật mật khẩu mới cho người dùng.

    Token phải: tồn tại trong DB, chưa được dùng, còn hạn.
    Sau khi đặt lại thành công: đánh dấu token is_used = True.
    """
    now = _get_utc_now()
    db_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token,
        PasswordResetToken.is_used == False,  # noqa: E712
        PasswordResetToken.expires_at > now,
    ).first()

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
        )

    user = db.query(User).filter(User.id == db_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng không tồn tại",
        )

    user.hashed_password = get_password_hash(new_password)
    db_token.is_used = True
    db.commit()

    return "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới."
