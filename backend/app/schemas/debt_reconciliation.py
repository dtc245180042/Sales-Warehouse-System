from typing import List, Optional
from datetime import datetime, date
from pydantic import BaseModel, Field, ConfigDict


class DebtStatementGenerateRequest(BaseModel):
    """Payload tạo biên bản đối chiếu công nợ theo kỳ cho đại lý (S7-06)."""
    customer_id: str = Field(..., description="Mã khách hàng / Đại lý")
    period_from: date = Field(..., description="Từ ngày đối chiếu (YYYY-MM-DD)")
    period_to: date = Field(..., description="Đến ngày đối chiếu (YYYY-MM-DD)")
    representative: Optional[str] = Field(None, description="Người đại diện của đại lý")
    notes: Optional[str] = Field(None, description="Ghi chú lập biên bản")


class CustomerConfirmRequest(BaseModel):
    """Payload đại lý xác nhận đồng ý khớp số liệu trên cổng đại lý."""
    feedback_notes: Optional[str] = Field(None, description="Ý kiến phản hồi của đại lý khi xác nhận")


class CustomerDisputeRequest(BaseModel):
    """Payload đại lý phản hồi chênh lệch số liệu trên cổng đại lý."""
    customer_claimed_balance: int = Field(..., description="Số dư nợ theo sổ sách của đại lý (VNĐ)")
    dispute_reason: str = Field(..., min_length=5, description="Lý do báo chênh lệch bắt buộc")
    feedback_notes: Optional[str] = Field(None, description="Chi tiết các hóa đơn hoặc khoản thanh toán lệch")


class DebtReconciliationEntryResponse(BaseModel):
    """Chi tiết từng dòng chứng từ phát sinh trong kỳ."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    entry_date: date
    doc_type: str
    doc_number: str
    description: Optional[str] = None
    increase_amount: int
    decrease_amount: int
    running_balance: int


class DebtReconciliationStatementResponse(BaseModel):
    """Dữ liệu chi tiết biên bản đối chiếu công nợ trả về API."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    statement_code: str
    customer_id: str
    customer_code: Optional[str] = None
    customer_name: str
    customer_tax_code: Optional[str] = None
    customer_address: Optional[str] = None
    customer_phone: Optional[str] = None
    representative: Optional[str] = None
    period_from: date
    period_to: date
    opening_balance: int
    period_increase: int
    period_decrease: int
    closing_balance: int
    status: str
    notes: Optional[str] = None
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    customer_confirmed_at: Optional[datetime] = None
    customer_feedback_notes: Optional[str] = None
    customer_claimed_balance: Optional[int] = None
    discrepancy_amount: Optional[int] = None
    dispute_reason: Optional[str] = None
    disputed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    entries: List[DebtReconciliationEntryResponse] = []


class DebtReconciliationStatementSummary(BaseModel):
    """Tóm tắt biên bản đối chiếu trong danh sách."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    statement_code: str
    customer_id: str
    customer_name: str
    period_from: date
    period_to: date
    opening_balance: int
    period_increase: int
    period_decrease: int
    closing_balance: int
    status: str
    discrepancy_amount: Optional[int] = None
    created_at: datetime
