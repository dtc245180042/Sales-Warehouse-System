from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime
from app.core.database import Base


class DeviceLockout(Base):
    __tablename__ = "device_lockouts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ip_address = Column(String(100), index=True, nullable=False)
    device_summary = Column(String(255), nullable=True)
    user_agent = Column(String(500), nullable=True)
    failed_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True, default=None)
    lock_reason = Column(String(255), nullable=True)
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

    def da_bi_khoa(self) -> bool:
        """Kiểm tra thiết bị có đang trong thời gian bị khóa hay không."""
        if not self.locked_until:
            return False
        thoi_gian_khoa = self.locked_until
        if thoi_gian_khoa.tzinfo is None:
            thoi_gian_khoa = thoi_gian_khoa.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < thoi_gian_khoa
