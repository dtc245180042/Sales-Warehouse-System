from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class MenuItemBase(BaseModel):
    code: str
    title: str
    path: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[int] = None
    order: Optional[int] = 0
    is_active: Optional[bool] = True
    required_permission_code: Optional[str] = None


class MenuItemCreate(MenuItemBase):
    pass


class MenuItemUpdate(BaseModel):
    title: Optional[str] = None
    path: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[int] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None
    required_permission_code: Optional[str] = None


class MenuItemResponse(MenuItemBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    children: List["MenuItemResponse"] = []

    model_config = ConfigDict(from_attributes=True)


class UserMenuResponse(BaseModel):
    role: Optional[str] = None
    menus: List[MenuItemResponse] = []
