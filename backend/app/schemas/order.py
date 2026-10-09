from datetime import datetime
from typing import List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, computed_field


class OrderItemBase(BaseModel):
    product_id: Union[str, int] = Field(..., description="ID sản phẩm")
    sku: Optional[str] = Field(None, description="Mã SKU")
    name: str = Field(..., description="Tên sản phẩm")
    price: float = Field(0.0, ge=0, description="Đơn giá")
    quantity: int = Field(1, ge=1, description="Số lượng")
    discount: float = Field(0.0, ge=0, description="Giảm giá sản phẩm")
    subtotal: float = Field(0.0, ge=0, description="Thành tiền")


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemResponse(OrderItemBase):
    id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def productId(self) -> str:
        return self.product_id


class OrderCreate(BaseModel):
    customer_id: str = Field(..., description="ID khách hàng")
    customer_name: str = Field(..., description="Tên khách hàng")
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    price_list_id: Optional[int] = None
    items: List[OrderItemCreate] = Field(..., min_length=1)
    subtotal: float = 0.0
    discount: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    paid_amount: float = 0.0
    change_amount: float = 0.0
    payment_method: str = "cash"
    payment_status: str = "paid"
    status: str = "pending"
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    note: Optional[str] = None
    delivery_address_id: Optional[int] = None
    delivery_address_name: Optional[str] = None
    delivery_receiver_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_notes: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: str = Field(..., description="Trạng thái mới: pending, confirmed, shipping, completed, cancelled")


class OrderResponse(BaseModel):
    id: str
    code: str
    customer_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    price_list_id: Optional[int] = None
    items: List[OrderItemResponse] = []
    subtotal: float
    discount: float
    tax: float
    total: float
    paid_amount: float
    change_amount: float
    payment_method: str
    payment_status: str
    status: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    note: Optional[str] = None
    delivery_address_id: Optional[int] = None
    delivery_address_name: Optional[str] = None
    delivery_receiver_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_notes: Optional[str] = None
    customer_is_locked: bool = False
    customer_lock_warning: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def deliveryAddressId(self) -> Optional[int]:
        return self.delivery_address_id

    @computed_field
    def deliveryAddressName(self) -> Optional[str]:
        return self.delivery_address_name

    @computed_field
    def deliveryReceiverName(self) -> Optional[str]:
        return self.delivery_receiver_name

    @computed_field
    def deliveryPhone(self) -> Optional[str]:
        return self.delivery_phone

    @computed_field
    def deliveryAddress(self) -> Optional[str]:
        return self.delivery_address

    @computed_field
    def deliveryNotes(self) -> Optional[str]:
        return self.delivery_notes

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def customerName(self) -> str:
        return self.customer_name

    @computed_field
    def customerPhone(self) -> Optional[str]:
        return self.customer_phone

    @computed_field
    def customerAddress(self) -> Optional[str]:
        return self.customer_address

    @computed_field
    def paidAmount(self) -> float:
        return self.paid_amount

    @computed_field
    def changeAmount(self) -> float:
        return self.change_amount

    @computed_field
    def paymentMethod(self) -> str:
        return self.payment_method

    @computed_field
    def paymentStatus(self) -> str:
        return self.payment_status

    @computed_field
    def staffId(self) -> Optional[str]:
        return self.staff_id

    @computed_field
    def staffName(self) -> Optional[str]:
        return self.staff_name

    @computed_field
    def createdAt(self) -> Optional[str]:
        return self.created_at.strftime("%Y-%m-%d %H:%M") if self.created_at else None

    @computed_field
    def updatedAt(self) -> Optional[str]:
        return self.updated_at.strftime("%Y-%m-%d %H:%M") if self.updated_at else None

    @computed_field
    def customerIsLocked(self) -> bool:
        return self.customer_is_locked

    @computed_field
    def customerLockWarning(self) -> Optional[str]:
        return self.customer_lock_warning
