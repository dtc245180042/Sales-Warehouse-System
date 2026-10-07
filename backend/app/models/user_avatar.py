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
    external_url = Column(String(500), nullable=True)

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


# Đảm bảo cột external_url tự động tồn tại trong CSDL SQLite đang dùng
try:
    from app.core.database import engine
    from sqlalchemy import text
    with engine.connect() as _conn:
        _res = _conn.execute(text("PRAGMA table_info(user_avatars)")).fetchall()
        _cols = [r[1] for r in _res]
        if _cols and "external_url" not in _cols:
            _conn.execute(text("ALTER TABLE user_avatars ADD COLUMN external_url VARCHAR(500)"))
            _conn.commit()
except Exception:
    pass
