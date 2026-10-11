from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field, field_serializer


class StockTakeItemBase(BaseModel):
    product_id: str
    sku: Optional[str] = None
    product_name: str
    category_name: Optional[str] = None
    unit: str = "cái"
    system_quantity: int = 0
    actual_quantity: Optional[int] = None
    discrepancy_quantity: int = 0
    is_counted: bool = False
    cost_price: Optional[float] = 0.0
    note: Optional[str] = None


class StockTakeItemResponse(StockTakeItemBase):
    id: int
    stock_take_id: str
    created_at: datetime

    @field_serializer("created_at", check_fields=False)
    def serialize_datetime(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    model_config = ConfigDict(from_attributes=True)


class StockTakeItemCountInput(BaseModel):
    id: Optional[int] = None
    product_id: Optional[str] = None
    actual_quantity: int = Field(ge=0, description="Số lượng thực tế đếm được")
    note: Optional[str] = None


class StockTakeCountUpdate(BaseModel):
    items: List[StockTakeItemCountInput]


class StockTakeCreate(BaseModel):
    warehouse: str = Field(default="Kho Tổng Hà Nội", description="Kho hàng thực hiện kiểm kê")
    scope_type: str = Field(default="WAREHOUSE", description="Phạm vi: WAREHOUSE, CATEGORY, CUSTOM")
    category_id: Optional[int] = Field(default=None, description="ID nhóm hàng nếu scope_type == CATEGORY")
    product_ids: Optional[List[str]] = Field(default=None, description="Danh sách product_id nếu scope_type == CUSTOM")
    note: Optional[str] = None


class StockTakeConfirmRequest(BaseModel):
    adjustment_reason: Optional[str] = Field(default=None, description="Lý do điều chỉnh kiểm kê (bắt buộc khi có chênh lệch)")


class StockTakeCancelRequest(BaseModel):
    cancel_reason: Optional[str] = Field(default=None, description="Lý do hủy phiếu kiểm kê")


class StockTakeResponse(BaseModel):
    id: str
    code: str
    warehouse: str
    scope_type: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    status: str
    total_items: int
    total_system_qty: int
    total_actual_qty: int
    total_discrepancy_qty: int
    has_discrepancy: bool
    adjustment_reason: Optional[str] = None
    note: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    confirmed_by_id: Optional[int] = None
    confirmed_by_name: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    cancelled_by_name: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: List[StockTakeItemResponse] = []

    @field_serializer("created_at", "updated_at", "confirmed_at", "cancelled_at", check_fields=False)
    def serialize_datetime(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    model_config = ConfigDict(from_attributes=True)


class StockTakeListResponse(BaseModel):
    items: List[StockTakeResponse]
    total: int


class StockTakePreviewItem(BaseModel):
    product_id: str
    sku: Optional[str] = None
    name: str
    category: str
    category_id: Optional[int] = None
    unit: str = "cái"
    system_quantity: int = 0
    cost_price: float = 0.0
