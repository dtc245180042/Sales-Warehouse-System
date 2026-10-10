from datetime import datetime
from typing import List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, computed_field


class OrderItemBase(BaseModel):
    product_id: Union[str, int] = Field(..., description="ID sản phẩm")
    sku: Optional[str] = Field(None, description="Mã SKU")
    name: str = Field(..., description="Tên sản phẩm")
    unit: Optional[str] = Field("cái", description="Đơn vị tính (S3-09: cái, hộp, thùng...)")
    price: float = Field(0.0, ge=0, description="Đơn giá")
    quantity: int = Field(1, ge=1, description="Số lượng")
    discount: float = Field(0.0, ge=0, description="Giảm giá sản phẩm")
    subtotal: float = Field(0.0, ge=0, description="Thành tiền")
    floor_price: Optional[float] = Field(None, description="Giá sàn tối thiểu quy định trong bảng giá")
    is_below_floor: Optional[bool] = Field(False, description="Cờ cảnh báo giá bán dưới giá sàn")


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemResponse(OrderItemBase):
    id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def productId(self) -> str:
        return str(self.product_id)


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
    status: str = "pending"  # pending, draft, confirmed, shipping, completed, cancelled
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    note: Optional[str] = None
    requires_approval: Optional[bool] = False
    approval_reason: Optional[str] = None
    delivery_address_id: Optional[int] = None
    delivery_address_name: Optional[str] = None
    delivery_receiver_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_notes: Optional[str] = None
    expected_delivery_date: Optional[str] = None  # S3-09: Ngày giao hàng mong muốn
    requires_approval: Optional[bool] = False
    approval_reason: Optional[str] = None


class OrderDraftUpdate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    price_list_id: Optional[int] = None
    items: Optional[List[OrderItemCreate]] = None
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    tax: Optional[float] = None
    total: Optional[float] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    note: Optional[str] = None
    requires_approval: Optional[bool] = None
    approval_reason: Optional[str] = None
    delivery_address_id: Optional[int] = None
    delivery_address_name: Optional[str] = None
    delivery_receiver_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_notes: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    requires_approval: Optional[bool] = None
    approval_reason: Optional[str] = None


class OrderCalculateItem(BaseModel):
    product_id: Union[str, int]
    quantity: int = Field(1, ge=1)
    price: Optional[float] = None
    unit: Optional[str] = "cái"


class OrderCalculateRequest(BaseModel):
    customer_id: str
    items: List[OrderCalculateItem] = Field(..., min_length=1)
    price_list_id: Optional[int] = None


class OrderCalculateItemResponse(BaseModel):
    product_id: str
    sku: Optional[str] = None
    name: str
    unit: Optional[str] = "cái"
    unit_price: float
    floor_price: Optional[float] = None
    is_below_floor: bool = False
    requires_approval: bool = False
    quantity: int
    discount_amount: float = 0.0
    discount_rate: Optional[float] = 0.0
    subtotal: float
    applied_discount_name: Optional[str] = None
    warning_message: Optional[str] = None


class OrderCalculateResponse(BaseModel):
    subtotal: float
    discount: float
    total: float
    items: List[OrderCalculateItemResponse] = []
    requires_approval: bool = False
    approval_reasons: List[str] = []
    warning_message: Optional[str] = None


class ProductSearchForOrderResponse(BaseModel):
    id: Union[int, str]
    sku: str
    name: str
    price: float
    sale_price: float
    stock: int
    unit: str
    packaging_spec: Optional[str] = None
    available_units: List[str] = []


class OrderStatusUpdate(BaseModel):
    status: str = Field(..., description="Trạng thái mới: draft, pending, pending_approval, confirmed, shipping, completed, cancelled")


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
    requires_approval: bool = False
    approval_reason: Optional[str] = None
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    note: Optional[str] = None
    delivery_address_id: Optional[int] = None
    delivery_address_name: Optional[str] = None
    delivery_receiver_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_notes: Optional[str] = None
    requires_approval: Optional[bool] = False
    approval_reason: Optional[str] = None
    customer_is_locked: bool = False
    customer_lock_warning: Optional[str] = None
    expected_delivery_date: Optional[str] = None
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
    def expectedDeliveryDate(self) -> Optional[str]:
        return self.expected_delivery_date

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

    @computed_field
    def requiresApproval(self) -> bool:
        return bool(self.requires_approval)

    @computed_field
    def approvalReason(self) -> Optional[str]:
        return self.approval_reason
