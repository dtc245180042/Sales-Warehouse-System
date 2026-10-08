from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
)
from app.core.database import Base


class CustomerLockProfile(Base):
    """
    Bảng Profile 1-1 quản lý trạng thái khoá/mở giao dịch của đại lý/khách hàng (SC-228).
    Tuân thủ quy tắc Additive-Only của AGENTS.md (không sửa bảng customers gốc).
    """
    __tablename__ = "customer_lock_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), unique=True, nullable=False, index=True)

    is_locked = Column(Boolean, default=False, nullable=False)
    lock_reason = Column(Text, nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    locked_by = Column(String(255), nullable=True)

    unlocked_at = Column(DateTime(timezone=True), nullable=True)
    unlocked_by = Column(String(255), nullable=True)
    unlock_reason = Column(Text, nullable=True)

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


class CustomerLockHistory(Base):
    """
    Bảng lưu lịch sử các lần khoá / mở giao dịch đại lý để phục vụ kiểm soát và truy vết (SC-228).
    """
    __tablename__ = "customer_lock_histories"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), nullable=False, index=True)

    action = Column(String(50), nullable=False)  # "lock" hoặc "unlock"
    reason = Column(Text, nullable=False)
    actor_username = Column(String(100), nullable=True)
    actor_name = Column(String(255), nullable=True)
    actor_role = Column(String(100), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
