from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.auth import User
from app.schemas.profile import ProfileUpdateRequest
from app.services.avatar_service import save_user_avatar_url


class ProfileService:
    """Service xử lý nghiệp vụ xem và cập nhật hồ sơ cá nhân (SCRUM-357 / SCRUM-210)."""

    @staticmethod
    def get_profile(user: User) -> User:
        """Lấy thông tin hồ sơ của người dùng hiện tại."""
        return user

    @staticmethod
    def update_profile(
        db: Session,
        current_user: User,
        data: ProfileUpdateRequest
    ) -> User:
        """Cập nhật thông tin hồ sơ cá nhân:
        - Chỉ cập nhật `full_name`, `phone_number` và `avatar_url` nếu được cung cấp.
        - Không thay đổi các thông tin nhạy cảm (role, username, warehouse, v.v.).
        - Cập nhật thời gian `updated_at`.
        """
        if data.full_name is not None:
            current_user.full_name = data.full_name

        if data.phone_number is not None:
            current_user.phone_number = data.phone_number

        if data.avatar_url is not None and data.avatar_url.strip():
            save_user_avatar_url(db, current_user.id, data.avatar_url.strip())
            setattr(current_user, "avatar_url", data.avatar_url.strip())

        current_user.updated_at = datetime.now(timezone.utc)

        db.add(current_user)
        db.commit()
        db.refresh(current_user)

        return current_user
