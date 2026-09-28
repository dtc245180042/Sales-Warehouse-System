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
    password: str
    role_names: Optional[List[str]] = []


class UserResponse(UserBase):
    id: int
    role: Optional[str] = None
    token_version: Optional[int] = 1
    created_at: Optional[datetime] = None
    roles: List[RoleResponse] = []

    model_config = ConfigDict(from_attributes=True)
