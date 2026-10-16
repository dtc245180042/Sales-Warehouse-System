from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


# ==============================================================================
# SCHEMAS FOR CREATION (REQUEST)
# ==============================================================================
class DispatchLotCreate(BaseModel):
    lot_id: int = Field(..., description="ID của lô hàng cần xuất")
    quantity: int = Field(..., gt=0, description="Số lượng lấy từ lô này")
    expiry_override_reason: Optional[str] = Field(None, description="Lý do xuất lô hết hạn (chỉ Admin/WH Manager)")
    lot_override_reason: Optional[str] = Field(None, description="Lý do chọn lô khác gợi ý FEFO")


class DispatchItemCreate(BaseModel):
    product_id: str = Field(..., description="Mã sản phẩm (ID)")
    dispatched_quantity: int = Field(..., gt=0, description="Số lượng thực xuất trong đợt này")
    lot_override_reason: Optional[str] = Field(None, description="Lý do ghi đè nếu tập lô khác gợi ý FEFO")
    lots: Optional[List[DispatchLotCreate]] = Field(default_factory=list, description="Danh sách lô chỉ định (nếu rỗng thì tự động FEFO)")


class StockDispatchCreate(BaseModel):
    client_request_id: Optional[str] = Field(None, description="ID định danh request từ client để chống bấm hai lần")
    order_id: str = Field(..., description="ID đơn hàng cần xuất kho")
    warehouse_id: int = Field(..., description="ID kho hàng thực hiện xuất")
    delivery_type: Optional[str] = Field(None, description="Hình thức giao nhận (cho phép null)")
    notes: Optional[str] = Field(None, description="Ghi chú xuất kho")
    items: List[DispatchItemCreate] = Field(..., min_length=1, description="Danh sách sản phẩm xuất kho")


# ==============================================================================
# SCHEMAS FOR RESPONSES
# ==============================================================================
class DispatchLotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lot_id: int
    lot_number: str
    quantity: int
    expiry_override_reason: Optional[str] = None
    lot_override_reason: Optional[str] = None


class DispatchItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: str
    sku: str
    product_name: Optional[str] = None
    ordered_quantity: int
    dispatched_quantity: int
    shortfall_quantity: int
    lot_override_reason: Optional[str] = None
    lots: List[DispatchLotResponse] = []


class StockDispatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_request_id: Optional[str] = None
    order_id: str
    customer_id: str
    customer_name: Optional[str] = None
    customer_address: Optional[str] = None
    warehouse_id: int
    warehouse_name: Optional[str] = None
    status: str
    delivery_type: Optional[str] = None
    total_items: int
    total_dispatched_quantity: int
    is_partial: bool
    has_shortfall: bool
    dispatched_by: int
    dispatched_at: datetime
    notes: Optional[str] = None
    items: List[DispatchItemResponse] = []


# ==============================================================================
# SCHEMAS FOR PENDING SHORTFALL ORDERS
# ==============================================================================
class PendingShortfallItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: str
    sku: str
    product_name: Optional[str] = None
    ordered_quantity: int
    dispatched_quantity: int
    remaining_shortfall: int


class PendingOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_id: str
    order_code: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    order_status: str
    total_ordered: int
    total_dispatched: int
    total_shortfall: int
    shortfall_items: List[PendingShortfallItem] = []
