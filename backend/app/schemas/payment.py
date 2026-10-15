from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.payment import PaymentMethod


class PaymentAllocationItemCreate(BaseModel):
    """Khai báo đối trừ vào hóa đơn cụ thể (AC-2 thủ công)."""
    invoice_id: str = Field(..., description="Mã hóa đơn cần đối trừ (HD-YYYY-XXXXXXX)")
    allocated_amount: int = Field(..., gt=0, description="Số tiền đối trừ cho hóa đơn này (VNĐ)")


class PaymentCreateRequest(BaseModel):
    """Payload tạo Phiếu thu tiền & Đối trừ công nợ (S7-02)."""
    client_request_id: Optional[str] = Field(
        None,
        max_length=100,
        description="Khóa chống trùng lặp từ Client (Idempotency Key)",
    )
    customer_id: str = Field(..., description="Mã khách hàng / đại lý nộp tiền")
    amount: int = Field(..., gt=0, description="Số tiền thực thu (VNĐ)")
    payment_method: PaymentMethod = Field(
        default=PaymentMethod.BANK_TRANSFER,
        description="Hình thức thu (CASH, BANK_TRANSFER, CARD)",
    )
    payment_date: Optional[datetime] = Field(
        None,
        description="Thời điểm thu tiền (mặc định lấy thời điểm hiện tại)",
    )
    reference_code: Optional[str] = Field(
        None,
        max_length=100,
        description="Mã tham chiếu ngân hàng, mã giao dịch POS hoặc số hóa đơn ngoài",
    )
    notes: Optional[str] = Field(
        None,
        description="Ghi chú nghiệp vụ thu tiền",
    )
    allocations: Optional[List[PaymentAllocationItemCreate]] = Field(
        default=None,
        description=(
            "Danh sách đối trừ hóa đơn cụ thể. Nếu để trống hoặc null, "
            "hệ thống sẽ tự động đối trừ theo nguyên tắc FIFO (hóa đơn cũ nhất trước)."
        ),
    )


class PaymentAllocationResponse(BaseModel):
    """Thông tin chi tiết một dòng đối trừ công nợ."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    payment_id: str
    invoice_id: str
    allocated_amount: int
    created_at: datetime


class PaymentResponse(BaseModel):
    """Thông tin Phiếu thu tiền và kết quả đối trừ công nợ."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_request_id: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    amount: int
    payment_method: str
    payment_date: datetime
    collector_id: int
    collector_name: Optional[str] = None
    reference_code: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    allocations: List[PaymentAllocationResponse] = []
