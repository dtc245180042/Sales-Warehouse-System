from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class RouteCashCollectionCreate(BaseModel):
    """Payload ghi nhận khoản thu theo tuyến tại cửa hàng (S7-05)."""
    customer_id: str = Field(..., description="Mã khách hàng / cửa hàng / đại lý")
    customer_name: Optional[str] = Field(None, description="Tên cửa hàng")
    customer_address: Optional[str] = Field(None, description="Địa chỉ cửa hàng")
    route_name: Optional[str] = Field(None, description="Tên tuyến bán hàng / khu vực")
    order_id: Optional[str] = Field(None, description="Mã đơn hàng liên quan nếu có")
    invoice_id: Optional[str] = Field(None, description="Mã hóa đơn liên quan nếu có")
    amount: int = Field(..., ge=1000, description="Số tiền thực thu tại điểm (VNĐ)")
    payment_method: str = Field(default="CASH", description="Phương thức: CASH hoặc BANK_TRANSFER")
    collection_date: Optional[datetime] = Field(None, description="Thời điểm thu tiền thực tế tại cửa hàng")
    receipt_image_url: Optional[str] = Field(None, description="Đường dẫn file ảnh biên lai thu tiền")
    notes: Optional[str] = Field(None, description="Ghi chú thu tiền")


class RouteCashCollectionUpdate(BaseModel):
    """Payload sửa khoản thu khi chưa được kế toán xác nhận."""
    amount: Optional[int] = Field(None, ge=1000, description="Số tiền thu đã sửa")
    payment_method: Optional[str] = Field(None, description="Phương thức thu tiền")
    receipt_image_url: Optional[str] = Field(None, description="Link ảnh biên lai mới")
    notes: Optional[str] = Field(None, description="Ghi chú cập nhật")


class RemittanceConfirmRequest(BaseModel):
    """Payload Kế toán xác nhận nhận tiền nộp về công ty (Chờ nộp -> Đã nộp)."""
    remitted_amount: Optional[int] = Field(None, description="Số tiền thực tế nộp về công ty (mặc định bằng số tiền thu)")
    remittance_notes: Optional[str] = Field(None, description="Ghi chú đối chiếu của kế toán")


class CollectionAdjustmentRequest(BaseModel):
    """Payload lập chứng từ điều chỉnh hoặc hủy bù cho khoản đã nộp có kiểm soát."""
    adjusted_amount: int = Field(..., description="Số tiền mới sau điều chỉnh (hoặc 0 nếu hủy bù)")
    adjustment_reason: str = Field(..., min_length=5, description="Lý do điều chỉnh / hủy bù bắt buộc")
    notes: Optional[str] = Field(None, description="Ghi chú chi tiết")


class RouteCashCollectionResponse(BaseModel):
    """Dữ liệu chi tiết khoản thu theo tuyến trả về API."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    collection_code: str
    amount: int
    payment_method: str
    collection_date: datetime
    collector_id: int
    collector_name: Optional[str] = None
    collector_phone: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    customer_address: Optional[str] = None
    route_name: Optional[str] = None
    order_id: Optional[str] = None
    invoice_id: Optional[str] = None
    receipt_image_url: Optional[str] = None
    receipt_image_hash: Optional[str] = None
    status: str
    is_locked: bool
    confirmed_by_id: Optional[int] = None
    confirmed_by_name: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    remittance_notes: Optional[str] = None
    remitted_amount: Optional[int] = None
    is_adjustment: bool = False
    original_collection_id: Optional[str] = None
    adjustment_reason: Optional[str] = None
    adjusted_by_id: Optional[int] = None
    adjusted_by_name: Optional[str] = None
    adjusted_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DailyReconciliationDiscrepancyWarning(BaseModel):
    """Cảnh báo chênh lệch đối chiếu theo từng khoản thu hoặc ngày."""
    collection_id: Optional[str] = None
    collector_id: int
    collector_name: Optional[str] = None
    warning_type: str  # UNDER_REMITTED, OVER_REMITTED, PENDING_OVERDUE, DISCREPANCY
    severity: str      # LOW, MEDIUM, HIGH, CRITICAL
    message: str
    details: Optional[dict] = None


class DailyReconciliationSummary(BaseModel):
    """Bảng đối chiếu tổng hợp tiền thu theo nhân viên và theo ngày (S7-05 Subtask 10 & 8)."""
    date: str = Field(..., description="Ngày đối chiếu định dạng YYYY-MM-DD")
    collector_id: int
    collector_name: str
    total_collected_amount: int = Field(0, description="Tổng tiền nhân viên đã thu tại các điểm")
    total_remitted_amount: int = Field(0, description="Tổng tiền kế toán đã xác nhận nộp về công ty")
    total_pending_amount: int = Field(0, description="Tổng tiền đang treo ở trạng thái Chờ nộp")
    count_collected: int = 0
    count_remitted: int = 0
    count_pending: int = 0
    discrepancy_amount: int = Field(0, description="Chênh lệch: (Đã nộp) - (Tổng thu - Còn chờ nộp)")
    reconciliation_status: str = Field(..., description="BALANCED, UNDER_REMITTED, OVER_REMITTED, PENDING_OVERDUE")
    warnings: List[DailyReconciliationDiscrepancyWarning] = []
    collections: List[RouteCashCollectionResponse] = []
