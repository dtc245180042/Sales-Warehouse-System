from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class PortalProductResponse(BaseModel):
    id: str
    sku: str
    name: str
    unit: str
    packaging_spec: Optional[str] = None
    image_url: Optional[str] = None
    sale_price: int
    stock_status: str  # IN_STOCK, LOW_STOCK, OUT_OF_STOCK
    min_order_quantity: int = 1


class PortalProductPaginationResponse(BaseModel):
    items: List[PortalProductResponse]
    total: int
    page: int
    limit: int


class PortalCreditResponse(BaseModel):
    credit_limit: int
    max_debt_days: int
    dispatched_debt: int
    committed_debt: int
    total_used_credit: int
    available_credit: int
    has_overdue: bool
    allow_order_on_credit: bool


class PortalCartItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    product_id: str = Field(..., min_length=1, max_length=50)
    quantity: int = Field(..., gt=0, le=10000)
    unit: str = Field(..., min_length=1, max_length=20)


class PortalCartCalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    items: List[PortalCartItemIn] = Field(..., min_length=1, max_length=100)


class PortalCartItemCalculated(BaseModel):
    product_id: str
    sku: str
    name: str
    unit: str
    unit_price: int
    quantity: int
    line_subtotal: int
    discount_rate: float
    line_discount: int
    line_total: int
    applied_policy_name: Optional[str] = None


class PortalCartCalculateResponse(BaseModel):
    items: List[PortalCartItemCalculated]
    subtotal: int
    total_discount: int
    tax_amount: int
    total_amount: int


class PortalOrderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    expected_total: int = Field(..., gt=0)
    delivery_address_id: int = Field(..., description="ID điểm giao hàng hợp lệ của đại lý")
    delivery_notes: Optional[str] = Field(None, max_length=500)
    items: List[PortalCartItemIn] = Field(..., min_length=1, max_length=100)


class PortalOrderResponse(BaseModel):
    id: str
    code: str
    customer_id: str
    customer_name: str
    source: str
    status: str
    subtotal: int
    discount: int
    tax: int
    total: int
    paid_amount: int
    delivery_receiver_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_notes: Optional[str] = None
    is_unassigned: bool
    created_at: str
    items_count: int


# ==============================================================================
# SCHEMAS THEO DÕI ĐƠN HÀNG ĐẠI LÝ (S5-01 / SC-243)
# ==============================================================================

class PortalOrderItemResponse(BaseModel):
    """Chi tiết từng dòng hàng hiển thị số lượng đặt và số lượng thực giao (S5-01)."""
    id: int
    product_id: str
    sku: Optional[str] = None
    name: str
    unit: Optional[str] = "cái"
    price: float
    quantity: int                                        # Số lượng đặt
    delivered_quantity: Optional[int] = None             # Số lượng thực giao (null nếu chưa giao)
    is_short_delivered: bool = False                     # True nếu thực giao < số lượng đặt
    short_delivered_quantity: int = 0                    # Chênh lệch giao thiếu
    discount: float = 0.0
    subtotal: float = 0.0


class PortalOrderListItemResponse(BaseModel):
    """Mục đơn hàng trên danh sách theo dõi của đại lý (S5-01)."""
    id: str
    code: str
    customer_id: str
    status: str
    total: float
    subtotal: float
    discount: float
    payment_status: str = "unpaid"
    expected_delivery_date: Optional[str] = None         # Ngày giao dự kiến
    created_at: str
    items_count: int
    has_short_delivery: bool = False                     # Có mặt hàng nào giao thiếu không


class PortalOrderListPaginationResponse(BaseModel):
    """Phân trang danh sách đơn hàng của đại lý (S5-01)."""
    items: List[PortalOrderListItemResponse]
    total: int
    page: int
    limit: int


class PortalOrderDetailResponse(BaseModel):
    """Chi tiết toàn diện đơn hàng của đại lý đối chiếu số lượng thực giao (S5-01)."""
    id: str
    code: str
    customer_id: str
    customer_name: str
    status: str
    payment_method: str = "transfer"
    payment_status: str = "unpaid"
    subtotal: float
    discount: float
    tax: float
    total: float
    paid_amount: float
    delivery_receiver_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_notes: Optional[str] = None
    expected_delivery_date: Optional[str] = None         # Ngày giao dự kiến
    created_at: str
    updated_at: Optional[str] = None
    items: List[PortalOrderItemResponse] = []
    has_short_delivery: bool = False                     # Cờ giao thiếu tổng thể của đơn
