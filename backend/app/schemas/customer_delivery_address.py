from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field


class DeliveryAddressBase(BaseModel):
    name: str = Field(..., min_length=1, description="Tên điểm giao hàng (VD: Kho số 1, Chi nhánh Cầu Giấy)")
    receiver_name: str = Field(..., min_length=1, description="Họ tên người nhận hàng")
    phone: str = Field(..., min_length=3, description="Số điện thoại người nhận")
    address: str = Field(..., min_length=3, description="Địa chỉ chi tiết nhận hàng")
    directions_note: Optional[str] = Field(None, description="Ghi chú đường đi / chỉ dẫn giao nhận")
    is_default: bool = Field(False, description="Đặt làm điểm giao hàng mặc định")
    status: str = Field("active", description="Trạng thái (active, inactive)")


class DeliveryAddressCreate(DeliveryAddressBase):
    customer_id: Optional[str] = Field(None, description="Mã khách hàng (nếu không truyền qua URL)")


class DeliveryAddressUpdate(BaseModel):
    name: Optional[str] = None
    receiver_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    directions_note: Optional[str] = None
    is_default: Optional[bool] = None
    status: Optional[str] = None


class DeliveryAddressResponse(DeliveryAddressBase):
    id: int
    customer_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def receiverName(self) -> str:
        return self.receiver_name

    @computed_field
    def directionsNote(self) -> Optional[str]:
        return self.directions_note

    @computed_field
    def isDefault(self) -> bool:
        return self.is_default

    @computed_field
    def createdAt(self) -> Optional[str]:
        return self.created_at.strftime("%Y-%m-%d %H:%M") if self.created_at else None
