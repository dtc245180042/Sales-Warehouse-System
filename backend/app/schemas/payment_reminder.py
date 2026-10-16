from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict


class PaymentReminderCandidate(BaseModel):
    """Hoá đơn thuộc diện cần gửi nhắc hạn thanh toán (SCRUM-760)."""
    invoice_id: str
    customer_id: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    total_amount: int
    remaining_amount: int
    due_date: datetime
    reminder_type: str                   # BEFORE_DUE_3_DAYS hoặc OVERDUE
    days_until_due: int                  # > 0 nếu sắp đến hạn, = 0 nếu đúng hạn
    days_overdue: int                    # > 0 nếu đã quá hạn
    already_reminded_today: bool         # Đã được nhắc trong ngày chưa (chống gửi trùng)

    model_config = ConfigDict(from_attributes=True)


class PaymentReminderCandidateListResponse(BaseModel):
    """Danh sách các hoá đơn cần nhắc hạn thanh toán."""
    target_date: str
    total: int
    before_due_count: int
    overdue_count: int
    candidates: List[PaymentReminderCandidate]


class PaymentReminderJobRequest(BaseModel):
    """Yêu cầu kích hoạt job quét công nợ và sinh nhắc hạn (SCRUM-761)."""
    target_date: Optional[str] = None    # YYYY-MM-DD, mặc định hôm nay UTC
    customer_id: Optional[str] = None   # Lọc theo đại lý cụ thể nếu cần
    invoice_id: Optional[str] = None    # Lọc theo mã hoá đơn cụ thể nếu cần
    dry_run: bool = False                # Nếu True chỉ giả lập quét, không gửi email hay tạo DB record


class PaymentReminderItemResult(BaseModel):
    """Kết quả xử lý nhắc hạn cho một hoá đơn."""
    invoice_id: str
    customer_id: str
    reminder_type: str
    email_status: str
    in_app_status: str
    skipped: bool = False
    skip_reason: Optional[str] = None


class PaymentReminderJobResponse(BaseModel):
    """Báo cáo thống kê kết quả chạy job định kỳ (SCRUM-761, SCRUM-762, SCRUM-763)."""
    success: bool = True
    run_date: str
    total_invoices_scanned: int
    eligible_count: int
    before_due_count: int
    overdue_count: int
    emails_sent: int
    emails_failed: int
    in_app_created: int
    skipped_duplicates: int
    details: List[PaymentReminderItemResult] = []


class PaymentReminderLogResponse(BaseModel):
    """Bản ghi nhật ký gửi nhắc hạn (SCRUM-763)."""
    id: int
    invoice_id: str
    customer_id: str
    reminder_type: str
    run_date: str
    amount_due: int
    due_date: datetime
    days_overdue: int
    channel: str
    email_to: Optional[str] = None
    email_status: str
    email_error: Optional[str] = None
    in_app_status: str
    notification_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentReminderLogListResponse(BaseModel):
    total: int
    page: int
    limit: int
    items: List[PaymentReminderLogResponse]


class NotificationResponse(BaseModel):
    """Thông báo trong ứng dụng cho đại lý (SCRUM-759)."""
    id: int
    user_id: Optional[int] = None
    customer_id: Optional[str] = None
    title: str
    content: str
    type: str
    reference_type: str
    reference_id: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationListResponse(BaseModel):
    """Danh sách thông báo kèm số lượng chưa đọc."""
    total: int
    unread_count: int
    page: int
    limit: int
    items: List[NotificationResponse]
