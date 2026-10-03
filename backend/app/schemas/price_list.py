from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PriceListItemBase(BaseModel):
    product_id: str = Field(..., description="Mã ID sản phẩm (ví dụ: PRD-001)")
    product_sku: Optional[str] = Field(None, description="Mã SKU sản phẩm")
    product_name: str = Field(..., description="Tên sản phẩm")
    unit: str = Field("Chiếc", description="Đơn vị tính")
    listed_price: float = Field(..., ge=0, description="Giá niêm yết")
    floor_price: float = Field(..., ge=0, description="Giá sàn tối thiểu")
    sale_price: float = Field(..., ge=0, description="Giá bán áp dụng cho nhóm")
    discount_percent: Optional[float] = Field(0.0, ge=0, le=100, description="Phần trăm chiết khấu")
    note: Optional[str] = None


class PriceListItemCreate(PriceListItemBase):
    pass


class PriceListItemUpdate(BaseModel):
    product_id: Optional[str] = None
    product_sku: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = None
    listed_price: Optional[float] = None
    floor_price: Optional[float] = None
    sale_price: Optional[float] = None
    discount_percent: Optional[float] = None
    note: Optional[str] = None


class PriceListItemResponse(PriceListItemBase):
    id: int
    price_list_id: int
    requires_approval: bool
    status: str
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PriceListItemPaginatedResponse(BaseModel):
    items: List[PriceListItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class PriceListItemApprovalRequest(BaseModel):
    approved: bool = Field(..., description="Đồng ý duyệt dòng giá (True) hoặc Từ chối (False)")
    note: Optional[str] = Field(None, description="Lý do hoặc ghi chú phê duyệt dòng giá")


class PriceListBase(BaseModel):
    code: str = Field(..., description="Mã bảng giá (ví dụ: PL-TIER1-2026)")
    name: str = Field(..., description="Tên bảng giá")
    customer_group: str = Field(..., description="Nhóm khách hàng: TIER_1, TIER_2, RETAIL, VIP, WHOLESALE")
    valid_from: datetime = Field(..., description="Thời điểm bắt đầu hiệu lực")
    valid_to: Optional[datetime] = Field(None, description="Thời điểm kết thúc hiệu lực")
    is_active: Optional[bool] = True


class PriceListCreate(PriceListBase):
    items: List[PriceListItemCreate] = Field(default_factory=list, description="Danh sách các dòng giá sản phẩm")


class PriceListUpdate(BaseModel):
    name: Optional[str] = None
    customer_group: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    is_active: Optional[bool] = None
    items: Optional[List[PriceListItemCreate]] = None


class PriceListResponse(PriceListBase):
    id: int
    version: int
    parent_id: Optional[int] = None
    status: str
    has_orders: bool
    orders_count: int
    is_locked: bool = Field(default=False, description="Trạng thái bị khóa sửa đổi khi đã phát sinh đơn hàng (SCRUM-416)")
    is_expired: bool = Field(default=False, description="Bảng giá đã hết hạn hiệu lực (SCRUM-417)")
    is_effective: bool = Field(default=False, description="Bảng giá đang có hiệu lực áp dụng tại thời điểm hiện tại (SCRUM-417)")
    requires_approval: bool
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_note: Optional[str] = None
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    items_count: Optional[int] = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PriceListDetailResponse(PriceListResponse):
    items: List[PriceListItemResponse] = []


class PriceListPaginatedResponse(BaseModel):
    items: List[PriceListResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class PriceApprovalRequest(BaseModel):
    approved: bool = Field(..., description="Đồng ý duyệt (True) hoặc Từ chối (False)")
    note: Optional[str] = Field(None, description="Lý do hoặc ghi chú phê duyệt")
    auto_resolve_overlap: bool = Field(
        default=False,
        description="Tự động giải quyết chồng lấn bằng cách ngắt ngày kết thúc (valid_to) của bảng giá cũ cùng nhóm/phiên bản trước (SCRUM-417)"
    )


class ConflictingPriceListBrief(BaseModel):
    id: int
    code: str
    name: str
    version: int
    customer_group: str
    status: str
    valid_from: datetime
    valid_to: Optional[datetime] = None


class PriceListOverlapCheckResponse(BaseModel):
    has_overlap: bool
    customer_group: str
    valid_from: datetime
    valid_to: Optional[datetime] = None
    message: str
    conflicts: List[ConflictingPriceListBrief] = []


class PriceLookupResponse(BaseModel):
    found: bool
    customer_group: str
    product_id: str
    price_list_id: Optional[int] = None
    price_list_name: Optional[str] = None
    price_list_code: Optional[str] = None
    version: Optional[int] = None
    sale_price: Optional[float] = None
    floor_price: Optional[float] = None
    listed_price: Optional[float] = None
    discount_percent: Optional[float] = None
    status: Optional[str] = None
    message: Optional[str] = None


class PriceListCloneRequest(BaseModel):
    """Yêu cầu tạo phiên bản kế thừa từ bảng giá cũ (SCRUM-416)."""
    new_code: Optional[str] = Field(None, description="Mã bảng giá phiên bản mới (để trống để tự động sinh dạng {code}-V{version})")
    new_name: Optional[str] = Field(None, description="Tên bảng giá phiên bản mới (để trống để tự động sinh)")
    valid_from: Optional[datetime] = Field(None, description="Thời điểm bắt đầu hiệu lực")
    valid_to: Optional[datetime] = Field(None, description="Thời điểm kết thúc hiệu lực")
    copy_items: bool = Field(True, description="Sao chép toàn bộ dòng giá từ bảng giá cũ")
    price_adjustment_percent: Optional[float] = Field(None, description="Tùy chọn: Tăng/giảm giá bán đồng loạt theo % (+5 hoặc -10)")
    auto_close_parent: bool = Field(False, description="Tùy chọn: Tự động cập nhật valid_to của bản cũ về trước valid_from bản mới")


class PriceListLockStatusResponse(BaseModel):
    """Trạng thái khóa sửa đổi của bảng giá (SCRUM-416)."""
    price_list_id: int
    code: str
    name: str
    version: int
    is_locked: bool
    orders_count: int
    has_orders: bool
    can_edit: bool
    can_delete: bool
    lock_reason: Optional[str] = None


class PriceListVersionHistoryItem(BaseModel):
    """Thông tin một phiên bản trong chuỗi kế thừa bảng giá (SCRUM-416)."""
    id: int
    code: str
    name: str
    version: int
    parent_id: Optional[int] = None
    customer_group: str
    status: str
    valid_from: datetime
    valid_to: Optional[datetime] = None
    has_orders: bool
    orders_count: int
    is_locked: bool
    requires_approval: bool
    items_count: int = 0
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerGroupActivePriceListBrief(BaseModel):
    """Thông tin tóm tắt bảng giá đang có hiệu lực của nhóm khách hàng."""
    id: int
    code: str
    name: str
    version: int
    valid_from: datetime
    valid_to: Optional[datetime] = None
    items_count: int = 0
    requires_approval: bool = False

    model_config = ConfigDict(from_attributes=True)


class CustomerGroupSummaryItem(BaseModel):
    """Tổng quan quản lý bảng giá cho từng nhóm khách hàng (SCRUM-417, SCRUM-419)."""
    customer_group: str
    group_label: str
    has_active_price_list: bool
    active_price_list: Optional[CustomerGroupActivePriceListBrief] = None
    total_price_lists: int = 0
    pending_approval_count: int = 0
    expired_count: int = 0
    draft_count: int = 0


class CustomerGroupSummaryResponse(BaseModel):
    items: List[CustomerGroupSummaryItem]
    total_groups: int


class BulkPriceLookupRequest(BaseModel):
    """Yêu cầu tra cứu giá bán hàng loạt theo danh sách sản phẩm cho nhóm khách hàng."""
    product_ids: List[str] = Field(..., min_length=1, description="Danh sách mã sản phẩm cần tra cứu giá")
    check_date: Optional[datetime] = Field(None, description="Thời điểm áp dụng giá (mặc định là hiện tại)")


class BulkPriceLookupItemResult(BaseModel):
    """Kết quả giá bán của một sản phẩm trong nhóm khách hàng."""
    product_id: str
    product_sku: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = "Chiếc"
    found: bool
    listed_price: Optional[float] = None
    floor_price: Optional[float] = None
    sale_price: Optional[float] = None
    discount_percent: Optional[float] = None
    note: Optional[str] = None


class BulkPriceLookupResponse(BaseModel):
    """Kết quả tra cứu giá hàng loạt cho nhóm khách hàng."""
    customer_group: str
    price_list_id: Optional[int] = None
    price_list_code: Optional[str] = None
    price_list_name: Optional[str] = None
    version: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    message: str
    items: List[BulkPriceLookupItemResult] = []
