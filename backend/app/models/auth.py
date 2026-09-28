from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Table,
    func
)
from sqlalchemy.orm import relationship
from app.core.database import Base

# Bảng liên kết Nhiều - Nhiều giữa Role và Permission
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
)

# Bảng liên kết Nhiều - Nhiều giữa User và Role
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
)


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), unique=True, nullable=False, index=True)  # ví dụ: order:create, inventory:view
    name = Column(String(100), nullable=False)                          # ví dụ: Tạo đơn hàng
    module = Column(String(50), nullable=False, index=True)             # ví dụ: orders, inventory, users
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Quan hệ với Role
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")

    def __repr__(self):
        return f"<Permission code={self.code} module={self.module}>"


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)  # ADMIN, MANAGER, SALES, WAREHOUSE, ACCOUNTANT
    display_name = Column(String(100), nullable=False)                 # Quản trị viên, Quản lý, Nhân viên bán hàng
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Quan hệ với Permission và User
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")
    users = relationship("User", secondary=user_roles, back_populates="roles")

    def __repr__(self):
        return f"<Role name={self.name}>"


from enum import Enum


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
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default=UserRole.CUSTOMER.value)
    full_name = Column(String(100), nullable=True)
    phone_number = Column(String(20), nullable=True)
    assigned_warehouse = Column(String(100), nullable=True)

    # Đếm số lần đăng nhập thất bại liên tiếp (SCRUM-287)
    failed_login_attempts = Column(Integer, default=0, nullable=False)

    # Thời điểm hết hạn khóa tài khoản (SCRUM-287)
    locked_until = Column(DateTime(timezone=True), nullable=True, default=None)
    lock_reason = Column(String(255), nullable=True)

    # Quản lý phiên đăng nhập: Tăng version khi đổi mật khẩu để thu hồi token cũ (SCRUM-307)
    token_version = Column(Integer, default=1, nullable=False)

    # Đặt lại mật khẩu qua email (SCRUM-200)
    reset_password_token = Column(String(255), nullable=True, index=True)
    reset_password_expires_at = Column(DateTime(timezone=True), nullable=True)
    must_change_password = Column(Boolean, default=False, nullable=False)

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

    # Quan hệ với Role (RBAC)
    roles = relationship("Role", secondary=user_roles, back_populates="users")

    def da_bi_khoa(self) -> bool:
        """Kiểm tra xem tài khoản có đang trong thời gian bị khóa hay không."""
        if not self.locked_until:
            return False
        thoi_gian_khoa = self.locked_until
        if thoi_gian_khoa.tzinfo is None:
            thoi_gian_khoa = thoi_gian_khoa.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < thoi_gian_khoa

    is_locked = da_bi_khoa

    def has_permission(self, permission_code: str) -> bool:
        """Kiểm tra người dùng có quyền cụ thể hay không."""
        if self.role == "Admin" or self.role == "ADMIN":
            return True
        for r in self.roles:
            if r.name.upper() == "ADMIN":
                return True
            for perm in r.permissions:
                if perm.code == permission_code:
                    return True
        return False

    def has_role(self, role_name: str) -> bool:
        """Kiểm tra người dùng có vai trò cụ thể hay không."""
        if self.role and self.role.upper() == role_name.upper():
            return True
        return any(r.name.upper() == role_name.upper() for r in self.roles)

    def __repr__(self):
        return f"<User username={self.username} email={self.email}>"
