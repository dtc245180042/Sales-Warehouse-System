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

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
RESET_TOKEN_EXPIRE_MINUTES = int(os.getenv("RESET_PASSWORD_TOKEN_EXPIRE_MINUTES", "15"))
GENERIC_FORGOT_PASSWORD_MESSAGE = (
    "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư của bạn."
)


def get_utc_now() -> datetime:
    """Lấy thời gian UTC hiện tại dạng naive để tương thích tốt với SQLite/MySQL."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def request_password_reset(db: Session, email: str, background_tasks: BackgroundTasks) -> str:
    """Xử lý yêu cầu quên mật khẩu.
    Tạo token an toàn, lưu CSDL, gửi email ngầm bằng BackgroundTasks.
    BẢO MẬT: Luôn trả về cùng một thông báo chung kể cả khi email không tồn tại để chống User Enumeration.
    """
    clean_email = email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()

    if user and user.is_active:
        # 1. Hủy bỏ (vô hiệu hóa) các token cũ chưa sử dụng của user này
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.is_used == False
        ).update({"is_used": True})

        # 2. Tạo token ngẫu nhiên an toàn bằng thư viện secrets
        token_str = secrets.token_urlsafe(32)
        expires_at = get_utc_now() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)

        # 3. Lưu token vào CSDL
        db_token = PasswordResetToken(
            user_id=user.id,
            token=token_str,
            expires_at=expires_at,
            is_used=False
        )
        db.add(db_token)
        db.commit()

        # 4. Tạo đường dẫn liên kết đặt lại mật khẩu
        reset_url = f"{FRONTEND_URL}/reset-password?token={token_str}"

        # 5. Gửi email bất đồng bộ qua BackgroundTasks
        background_tasks.add_task(
            send_password_reset_email,
            to_email=user.email,
            reset_url=reset_url,
            expire_minutes=RESET_TOKEN_EXPIRE_MINUTES
        )

    # Luôn trả về thông báo chung, không tiết lộ sự tồn tại của email
    return GENERIC_FORGOT_PASSWORD_MESSAGE


def reset_password_with_token(db: Session, token: str, new_password: str) -> str:
    """Xác thực token và cập nhật mật khẩu mới cho người dùng."""
    now = get_utc_now()
    db_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token,
        PasswordResetToken.is_used == False,
        PasswordResetToken.expires_at > now
    ).first()

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"
        )

    user = db.query(User).filter(User.id == db_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng không tồn tại"
        )

    # Cập nhật mật khẩu mới
    user.hashed_password = get_password_hash(new_password)
    # Đánh dấu token đã được sử dụng
    db_token.is_used = True

    db.commit()
    return "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới."


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Xác thực người dùng qua username/email và mật khẩu."""
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


def build_user_claims_response(user: User, db: Session) -> UserClaimsResponse:
    """Tạo cấu trúc dữ liệu phản hồi bao gồm User profile, roles, permissions, context kho/địa bàn và cây menu tương ứng (SCRUM-301)."""
    roles = user.get_roles_list()
    permissions = user.get_permissions_list()

    # Xác định vai trò chính để lọc cây menu
    primary_role = roles[0] if roles else None
    menus = get_user_navigation_menu(db=db, role_name=primary_role, permission_codes=permissions)

    return UserClaimsResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        phone_number=user.phone_number,
        is_active=user.is_active,
        warehouse_id=user.warehouse_id,
        warehouse_name=user.warehouse_name,
        region=user.region,
        roles=roles,
        permissions=permissions,
        navigation_menus=menus
    )
