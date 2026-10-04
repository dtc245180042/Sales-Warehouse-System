from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime
from app.core.database import Base


class UserAvatar(Base):
    """Bảng lưu trữ thông tin ảnh đại diện và thumbnail người dùng (SCRUM-362, SCRUM-364).
    Tuân thủ Additive-Only: Lưu Scalar user_id, không sửa bảng User cũ.
    """
    __tablename__ = "user_avatars"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, unique=True, nullable=False, index=True)
    original_filename = Column(String(255), nullable=True)
    avatar_path = Column(String(500), nullable=False)
    thumbnail_path = Column(String(500), nullable=False)
    content_type = Column(String(50), nullable=False)  # image/jpeg hoặc image/png
    file_size = Column(Integer, nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
