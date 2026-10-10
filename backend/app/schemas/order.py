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
    available_stock: Optional[int] = None
    warehouse: Optional[str] = None
    physical_stock: Optional[int] = None
    reserved_stock: Optional[int] = None


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
    customer_is_locked: bool = False
    customer_lock_warning: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    copied_from_order_id: Optional[str] = None
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

    @computed_field
    def copiedFromOrderId(self) -> Optional[str]:
        return self.copied_from_order_id


# ============================================================================
# SCRUM-236 (S4-04): Gợi ý mặt hàng từ lịch sử mua hàng 3 tháng gần nhất
# ============================================================================

class PurchaseHistoryItemSuggestion(BaseModel):
    product_id: str
    sku: Optional[str] = None
    name: str
    unit: str = "cái"
    category: Optional[str] = "Khác"
    category_id: Optional[int] = None
    avg_quantity: float = Field(..., description="Số lượng bình quân trong các đơn 90 ngày (làm tròn 1 chữ số thập phân)")
    total_quantity: int = Field(0, description="Tổng số lượng đã mua trong 90 ngày")
    order_count: int = Field(0, description="Số đơn hàng đã mua sản phẩm này trong 90 ngày")
    last_quantity: int = Field(1, description="Số lượng mua trong lần gần nhất")
    last_purchased_at: Optional[str] = Field(None, description="Thời gian mua lần gần nhất (YYYY-MM-DD HH:MM)")
    last_price: float = Field(0.0, description="Đơn giá mua lần gần nhất")
    current_price: float = Field(0.0, description="Giá bán niêm yết hiện tại")
    stock: int = Field(0, description="Tồn kho hiện tại")

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def productId(self) -> str:
        return self.product_id

    @computed_field
    def categoryId(self) -> Optional[int]:
        return self.category_id

    @computed_field
    def avgQuantity(self) -> float:
        return self.avg_quantity

    @computed_field
    def totalQuantity(self) -> int:
        return self.total_quantity

    @computed_field
    def orderCount(self) -> int:
        return self.order_count

    @computed_field
    def lastQuantity(self) -> int:
        return self.last_quantity

    @computed_field
    def lastPurchasedAt(self) -> Optional[str]:
        return self.last_purchased_at

    @computed_field
    def lastPrice(self) -> float:
        return self.last_price

    @computed_field
    def currentPrice(self) -> float:
        return self.current_price


class PurchaseHistoryGroupSuggestion(BaseModel):
    category: str = Field(..., description="Tên nhóm hàng")
    category_id: Optional[int] = None
    item_count: int = Field(0, description="Số lượng sản phẩm trong nhóm")
    total_suggested_quantity: float = Field(0.0, description="Tổng số lượng bình quân của cả nhóm")
    items: List[PurchaseHistoryItemSuggestion] = []

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def categoryId(self) -> Optional[int]:
        return self.category_id

    @computed_field
    def itemCount(self) -> int:
        return self.item_count

    @computed_field
    def totalSuggestedQuantity(self) -> float:
        return self.total_suggested_quantity


class LastOrderItemSummary(BaseModel):
    product_id: str
    sku: Optional[str] = None
    name: str
    unit: str = "cái"
    quantity: int = 1
    price: float = 0.0

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def productId(self) -> str:
        return self.product_id


class LastOrderSummary(BaseModel):
    order_id: str
    code: str
    created_at: Optional[str] = None
    total: float = 0.0
    items: List[LastOrderItemSummary] = []

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def orderId(self) -> str:
        return self.order_id

    @computed_field
    def createdAt(self) -> Optional[str]:
        return self.created_at


class PurchaseHistorySuggestionResponse(BaseModel):
    customer_id: str
    customer_name: str
    time_window_days: int = 90
    total_orders_in_window: int = 0
    has_purchase_history: bool = False
    items: List[PurchaseHistoryItemSuggestion] = []
    groups: List[PurchaseHistoryGroupSuggestion] = []
    last_order: Optional[LastOrderSummary] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def customerName(self) -> str:
        return self.customer_name

    @computed_field
    def timeWindowDays(self) -> int:
        return self.time_window_days

    @computed_field
    def totalOrdersInWindow(self) -> int:
        return self.total_orders_in_window

    @computed_field
    def hasPurchaseHistory(self) -> bool:
        return self.has_purchase_history

    @computed_field
    def lastOrder(self) -> Optional[LastOrderSummary]:
        return self.last_order


class MergeItemsRequest(BaseModel):
    current_items: List[OrderItemCreate] = []
    items_to_add: List[OrderItemCreate] = []
    strategy: str = Field("merge", description="'merge': cộng dồn số lượng; 'replace_qty': lấy số lượng mới")


class MergeItemsResponse(BaseModel):
    items: List[OrderItemCreate] = []
    merged_count: int = 0
    added_count: int = 0


class OrderCopyResponse(BaseModel):
    order: OrderResponse
    warnings: List[str] = Field(default_factory=list, description="Cảnh báo sản phẩm ngừng kinh doanh không được sao chép")
    message: str = Field("Sao chép đơn hàng thành công sang đơn nháp mới.", description="Thông báo trạng thái")

