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
