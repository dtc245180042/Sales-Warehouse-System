from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field


class SupplierBase(BaseModel):
    name: str = Field(..., description="Tên nhà cung cấp")
    contact_person: Optional[str] = Field(None, description="Người liên hệ")
    phone: Optional[str] = Field(None, description="Số điện thoại")
    email: Optional[str] = Field(None, description="Email")
    address: Optional[str] = Field(None, description="Địa chỉ")
    status: str = Field("active", description="Trạng thái: active, inactive")


class SupplierCreate(SupplierBase):
    id: Optional[str] = None
    code: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None


class SupplierResponse(SupplierBase):
    id: str
    code: str
    total_imports: int = 0
    total_spent: float = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def contactPerson(self) -> Optional[str]:
        return self.contact_person

    @computed_field
    def totalImports(self) -> int:
        return self.total_imports

    @computed_field
    def totalSpent(self) -> float:
        return self.total_spent

    @computed_field
    def createdAt(self) -> Optional[str]:
        return self.created_at.strftime("%Y-%m-%d") if self.created_at else None
