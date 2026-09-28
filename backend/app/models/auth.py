from datetime import datetime
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


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    phone_number = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Thông tin phân vùng kho và địa bàn công tác
    warehouse_id = Column(Integer, nullable=True, index=True)
    warehouse_name = Column(String(100), nullable=True)
    region = Column(String(100), nullable=True)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Quan hệ với Role
    roles = relationship("Role", secondary=user_roles, back_populates="users")

    def get_roles_list(self) -> list:
        """Lấy danh sách mã vai trò của người dùng."""
        return [r.name for r in self.roles]

    def get_permissions_list(self) -> list:
        """Lấy danh sách phẳng tất cả các mã quyền hạn của người dùng."""
        perms = set()
        for role in self.roles:
            for p in role.permissions:
                perms.add(p.code)
        return sorted(list(perms))

    def has_permission(self, permission_code: str) -> bool:
        """Kiểm tra người dùng có quyền cụ thể hay không."""
        for role in self.roles:
            if role.name == "ADMIN":
                return True
            for perm in role.permissions:
                if perm.code == permission_code:
                    return True
        return False

    def has_role(self, role_name: str) -> bool:
        """Kiểm tra người dùng có vai trò cụ thể hay không."""
        return any(role.name == role_name for role in self.roles)

    def __repr__(self):
        return f"<User username={self.username} email={self.email}>"


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())

    user = relationship("User")

    def __repr__(self):
        return f"<PasswordResetToken user_id={self.user_id} is_used={self.is_used}>"
