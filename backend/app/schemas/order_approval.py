from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class FloorPriceViolationItem(BaseModel):
    """Chi tiết sản phẩm bán dưới giá sàn quy định."""
    product_id: str = Field(..., description="ID sản phẩm")
    sku: Optional[str] = Field(None, description="Mã SKU")
    name: str = Field(..., description="Tên sản phẩm")
    unit_price: float = Field(..., description="Đơn giá bán áp dụng trên đơn")
    floor_price: float = Field(..., description="Giá sàn tối thiểu cho phép")
    diff_amount: float = Field(..., description="Chênh lệch giá bán so với giá sàn (floor_price - unit_price)")
    diff_percent: float = Field(..., description="Tỷ lệ % bán dưới giá sàn")
    quantity: int = Field(1, description="Số lượng")
    subtotal_gap: float = Field(..., description="Tổng thiệt hại tiền so với giá sàn (diff_amount * quantity)")


class CreditLimitViolationDetail(BaseModel):
    """Chi tiết mức vi phạm hạn mức công nợ hoặc nợ quá hạn."""
    credit_limit: int = Field(..., description="Hạn mức công nợ được cấp (VNĐ)")
    current_debt: int = Field(..., description="Dư nợ đã xuất trước khi tạo đơn (VNĐ)")
    order_unpaid_amount: int = Field(..., description="Nợ chưa thanh toán của đơn này (VNĐ)")
    total_debt_projected: int = Field(..., description="Dự kiến tổng nợ sau khi xuất đơn (VNĐ)")
    excess_amount: int = Field(..., description="Số tiền nợ vượt hạn mức (VNĐ)")
    max_debt_days: int = Field(..., description="Số ngày nợ tối đa cho phép")
    overdue_days: int = Field(0, description="Số ngày nợ quá hạn hiện tại")
    overdue_order_code: Optional[str] = Field(None, description="Mã đơn hàng nợ quá hạn")
    message: str = Field(..., description="Mô tả chi tiết vi phạm")


class ViolationItem(BaseModel):
    """Thông tin tóm tắt từng lý do vi phạm."""
    type: str = Field(..., description="Loại vi phạm: credit_limit, overdue_debt, floor_price")
    title: str = Field(..., description="Tiêu đề vi phạm")
    severity: str = Field("danger", description="Mức độ nghiêm trọng: danger, warning")
    description: str = Field(..., description="Mô tả nội dung vi phạm")
    violation_amount: Optional[float] = Field(None, description="Số tiền vi phạm (VNĐ)")


class OrderApprovalActionRequest(BaseModel):
    """Yêu cầu xử lý duyệt đơn theo ba hành động."""
    action: str = Field(
        ...,
        description="Hành động: APPROVE (Duyệt), REJECT (Từ chối), RETURN (Trả lại sửa)"
    )
    comment: Optional[str] = Field(
        None,
        description="Ý kiến của Quản lý kinh doanh (Bắt buộc khi REJECT và RETURN)"
    )


class OrderApprovalRejectRequest(BaseModel):
    """Ý kiến bắt buộc khi từ chối đơn hàng."""
    comment: str = Field(..., min_length=1, description="Ý kiến lý do từ chối (bắt buộc)")


class OrderApprovalReturnRequest(BaseModel):
    """Ý kiến bắt buộc khi trả lại đơn hàng để sửa."""
    comment: str = Field(..., min_length=1, description="Ý kiến hướng dẫn sửa đổi (bắt buộc)")


class OrderApprovalApproveRequest(BaseModel):
    """Ghi chú tùy chọn khi duyệt đơn hàng."""
    comment: Optional[str] = Field(None, description="Ý kiến/ghi chú khi duyệt (tùy chọn)")


class OrderApprovalHistoryResponse(BaseModel):
    """Lịch sử phê duyệt đơn hàng bất biến."""
    id: int
    order_id: str
    order_code: Optional[str] = None
    action: str
    previous_status: str
    new_status: str
    comment: Optional[str] = None
    performed_by_id: Optional[int] = None
    performed_by_name: str
    performed_by_role: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderApprovalListItem(BaseModel):
    """Dữ liệu đơn chờ duyệt trên danh sách."""
    id: int
    order_id: str
    order_code: str
    customer_id: str
    customer_name: str
    order_total: float
    approval_status: str
    order_status: str
    staff_name: Optional[str] = None
    has_credit_limit_violation: bool
    credit_excess_amount: int
    overdue_days: int
    has_floor_price_violation: bool
    floor_price_violation_count: int
    total_floor_price_gap: float
    violation_summary: Optional[str] = None
    violations: List[ViolationItem] = []
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderApprovalDetailResponse(BaseModel):
    """Dữ liệu chi tiết đơn hàng chờ duyệt cùng phân tích vi phạm toàn diện."""
    id: int
    order_id: str
    order_code: str
    customer_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    order_total: float
    order_subtotal: float
    order_discount: float
    paid_amount: float
    unpaid_amount: float
    approval_status: str
    order_status: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    created_at: datetime

    # Vi phạm công nợ
    has_credit_limit_violation: bool
    credit_detail: Optional[CreditLimitViolationDetail] = None

    # Vi phạm giá sàn
    has_floor_price_violation: bool
    floor_price_violations: List[FloorPriceViolationItem] = []
    floor_price_violation_count: int = 0
    total_floor_price_gap: float = 0.0

    # Danh sách vi phạm tổng quát
    violations: List[ViolationItem] = []

    # Giữ chỗ tồn kho & Quyết định
    is_stock_reserved: bool = False
    decision_comment: Optional[str] = None
    processed_by_id: Optional[int] = None
    processed_by_name: Optional[str] = None
    processed_by_role: Optional[str] = None
    processed_at: Optional[datetime] = None

    # Danh sách mặt hàng của đơn
    items: List[dict] = []

    # Audit trail lịch sử duyệt
    histories: List[OrderApprovalHistoryResponse] = []

    model_config = ConfigDict(from_attributes=True)


class OrderApprovalEvaluationResponse(BaseModel):
    """Kết quả kiểm tra vi phạm đơn hàng."""
    requires_approval: bool
    has_credit_limit_violation: bool
    has_floor_price_violation: bool
    violations: List[ViolationItem] = []
    floor_price_violations: List[FloorPriceViolationItem] = []
    credit_detail: Optional[CreditLimitViolationDetail] = None
