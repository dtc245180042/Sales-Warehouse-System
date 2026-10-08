from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.auth import User
from app.schemas.profile import ProfileUpdateRequest
from app.services.avatar_service import (
    save_user_avatar_url,
    get_user_avatar,
    build_avatar_urls,
)


class ProfileService:
    """Service xử lý nghiệp vụ xem và cập nhật hồ sơ cá nhân (SCRUM-357 / SCRUM-210)."""

    @staticmethod
    def get_profile(user: User, db: Optional[Session] = None) -> User:
        """Lấy thông tin hồ sơ của người dùng hiện tại kèm avatar_url."""
        if db:
            user_avatar = get_user_avatar(db, user.id)
            if user_avatar:
                avatar_url, _ = build_avatar_urls(user.id, user_avatar.updated_at, user_avatar=user_avatar)
                setattr(user, "avatar_url", avatar_url)
        return user

    @staticmethod
    def update_profile(
        db: Session,
        current_user: User,
        data: ProfileUpdateRequest
    ) -> User:
        """Cập nhật thông tin hồ sơ cá nhân:
        - Chỉ cập nhật `full_name`, `phone_number` và `avatar_url` nếu được cung cấp.
        - Giữ nguyên ảnh đại diện đã có nếu không có ảnh mới được gửi lên.
        - Không thay đổi các thông tin nhạy cảm (role, username, warehouse, v.v.).
        - Cập nhật thời gian `updated_at`.
        """
        if data.full_name is not None:
            current_user.full_name = data.full_name

        if data.phone_number is not None:
            current_user.phone_number = data.phone_number

        if data.avatar_url is not None and data.avatar_url.strip():
            save_user_avatar_url(db, current_user.id, data.avatar_url.strip())

        current_user.updated_at = datetime.now(timezone.utc)

        db.add(current_user)
        db.commit()
        db.refresh(current_user)

        # Sau db.refresh, SQLAlchemy reset các transient attributes không thuộc model columns
        # Nạp lại avatar_url từ bảng user_avatars để ProfileResponse có đầy đủ ảnh
        user_avatar = get_user_avatar(db, current_user.id)
        if user_avatar:
            avatar_url, _ = build_avatar_urls(current_user.id, user_avatar.updated_at, user_avatar=user_avatar)
            setattr(current_user, "avatar_url", avatar_url)
        elif data.avatar_url and data.avatar_url.strip():
            setattr(current_user, "avatar_url", data.avatar_url.strip())

        return current_user

