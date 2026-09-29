from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.role import RoleResponse


class UserBase(BaseModel):
    username: str
    email: str = Field(..., description="Địa chỉ email người dùng")
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: Optional[bool] = True


class UserCreate(UserBase):
    password: Optional[str] = None  # Nếu không nhập, hệ thống tự cấp mật khẩu tạm
    role: Optional[str] = "Customer"
    role_names: Optional[List[str]] = []
    assigned_warehouse: Optional[str] = None


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    role: Optional[str] = None
    role_names: Optional[List[str]] = None
    assigned_warehouse: Optional[str] = None
    is_active: Optional[bool] = None



class UserLockRequest(BaseModel):
    reason: str = Field(..., min_length=1, description="Lý do khóa tài khoản (bắt buộc theo SCRUM-207)")


class UserResponse(UserBase):
    id: int
    role: Optional[str] = None
    assigned_warehouse: Optional[str] = None
    lock_reason: Optional[str] = None
    must_change_password: Optional[bool] = False
    token_version: Optional[int] = 1
    created_at: Optional[datetime] = None
    roles: List[RoleResponse] = []

    model_config = ConfigDict(from_attributes=True)


class UserPaginatedResponse(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
