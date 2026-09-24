from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.core.database import Base


class UserRole(str, Enum):
    """7 vai trò chính trong hệ thống Bán hàng & Quản lý Kho."""
    ADMIN = "Admin"
    CUSTOMER = "Customer"
    SALES_REP = "Sales Rep"
    SALES_MANAGER = "Sales Manager"
    WAREHOUSE = "Warehouse"
    WH_MANAGER = "WH Manager"
    ACCOUNTANT = "Accountant"


class User(Base):
    """SQLAlchemy Model cho bảng users."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default=UserRole.CUSTOMER.value)

    # Đếm số lần đăng nhập thất bại liên tiếp (SCRUM-287)
    failed_login_attempts = Column(Integer, default=0, nullable=False)

    # Thời điểm hết hạn khóa tài khoản (SCRUM-287)
    locked_until = Column(DateTime(timezone=True), nullable=True, default=None)

    # Quản lý phiên đăng nhập: Tăng version khi đổi mật khẩu để thu hồi token cũ (SCRUM-307)
    token_version = Column(Integer, default=1, nullable=False)

    # Trạng thái tài khoản
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps
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
        """Kiểm tra xem tài khoản có đang trong thời gian bị khóa hay không."""
        if not self.locked_until:
            return False
        # Nếu locked_until là naive datetime (do SQLite), convert sang aware UTC
        thoi_gian_khoa = self.locked_until
        if thoi_gian_khoa.tzinfo is None:
            thoi_gian_khoa = thoi_gian_khoa.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < thoi_gian_khoa

    # Bí danh tương thích ngược
    is_locked = da_bi_khoa
