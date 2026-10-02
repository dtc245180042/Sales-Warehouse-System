from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class PermissionBase(BaseModel):
    code: str
    name: str
    module: str
    description: Optional[str] = None


class PermissionCreate(PermissionBase):
    pass


class PermissionUpdate(BaseModel):
    name: Optional[str] = None
    module: Optional[str] = None
    description: Optional[str] = None


class PermissionResponse(PermissionBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
