from datetime import date, datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class LotStatus(str, Enum):
    ACTIVE = "ACTIVE"
    NEAR_EXPIRY = "NEAR_EXPIRY"
    EXPIRED = "EXPIRED"
    EXHAUSTED = "EXHAUSTED"


class InitialLotItem(BaseModel):
    warehouse_id: int = Field(..., description="Mã kho hàng (1: Hà Nội, 2: Đà Nẵng, 3: TP.HCM)")
    lot_number: str = Field(..., min_length=1, max_length=100, description="Số lô hàng")
    mfg_date: date = Field(..., description="Ngày sản xuất (YYYY-MM-DD)")
    exp_date: date = Field(..., description="Hạn sử dụng (YYYY-MM-DD)")


class LotTrackingToggleRequest(BaseModel):
    manage_by_lot: bool = Field(..., description="Bật (True) hoặc Tắt (False) quản lý theo lô")
    near_expiry_threshold_days: Optional[int] = Field(30, ge=1, le=365, description="Số ngày cảnh báo cận date")
    initial_lots: Optional[List[InitialLotItem]] = Field(
        default_factory=list,
        description="Danh sách lô đầu kỳ cho các kho đang có tồn vật lý khi bật manage_by_lot"
    )


class ProductLotCreate(BaseModel):
    product_id: str = Field(..., description="Mã sản phẩm (String(50) khớp products.id)")
    warehouse_id: int = Field(..., description="Mã kho hàng")
    lot_number: str = Field(..., min_length=1, max_length=100, description="Số lô hàng")
    mfg_date: date = Field(..., description="Ngày sản xuất")
    exp_date: date = Field(..., description="Hạn sử dụng")
    initial_quantity: int = Field(..., ge=0, description="Số lượng ban đầu của lô")
    remaining_quantity: Optional[int] = Field(None, ge=0, description="Số lượng còn lại (mặc định = initial_quantity)")


class ProductLotUpdate(BaseModel):
    mfg_date: Optional[date] = None
    exp_date: Optional[date] = None
    remaining_quantity: Optional[int] = Field(None, ge=0)


class ProductLotResponse(BaseModel):
    id: int
    lot_number: str
    product_id: str
    warehouse_id: int
    mfg_date: date
    exp_date: date
    initial_quantity: int
    remaining_quantity: int
    status: LotStatus
    days_to_expiry: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductLotListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[ProductLotResponse]


class LotExpiryWarningItem(BaseModel):
    lot_id: int
    lot_number: str
    product_id: str
    product_name: Optional[str] = None
    warehouse_id: int
    warehouse_name: Optional[str] = None
    exp_date: date
    days_to_expiry: int
    remaining_quantity: int
    status: LotStatus


class LotExpiryWarningResponse(BaseModel):
    total_warnings: int
    near_expiry_count: int
    expired_count: int
    items: List[LotExpiryWarningItem]


class LotDispatchCheckRequest(BaseModel):
    lot_id: int
    override_reason: Optional[str] = None


class LotDispatchCheckResponse(BaseModel):
    valid: bool
    lot_id: int
    status: LotStatus
    days_to_expiry: int
    is_expired: bool
    override_allowed: bool
    message: str


# ==============================================================================
# SCHEMAS CHO STORY S6-04 (FEFO SUGGESTION)
# ==============================================================================

class FEFOSuggestionRequest(BaseModel):
    product_id: str = Field(..., description="Mã sản phẩm cần xuất kho")
    warehouse_id: int = Field(..., description="Mã kho xuất hàng")
    requested_quantity: int = Field(..., gt=0, description="Số lượng yêu cầu xuất (phải > 0)")


class FEFOSuggestionItem(BaseModel):
    lot_id: int
    lot_number: str
    mfg_date: date
    exp_date: date
    remaining_quantity: int
    allocated_quantity: int
    days_to_expiry: int


class FEFOSuggestionResponse(BaseModel):
    product_id: str
    warehouse_id: int
    requested_quantity: int
    allocated_total: int
    shortfall: int
    is_fully_allocated: bool
    manage_by_lot: bool
    message: Optional[str] = None
    suggested_lots: List[FEFOSuggestionItem]


class FEFOOverrideValidationRequest(BaseModel):
    suggested_lot_ids: List[int] = Field(..., description="Danh sách ID các lô được hệ thống gợi ý FEFO")
    selected_lot_id: int = Field(..., description="ID lô người dùng thực tế chọn")
    lot_override_reason: Optional[str] = Field(None, description="Lý do ghi đè nếu chọn khác gợi ý")

