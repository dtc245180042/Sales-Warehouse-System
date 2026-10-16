from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class CreditNoteItemResponse(BaseModel):
    """Schema thông tin một dòng hàng trong Chứng từ giảm nợ."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    credit_note_id: str
    return_order_item_id: int
    product_id: str
    sku: str
    product_name: Optional[str] = None
    unit: Optional[str] = "cái"
    quantity: int
    unit_price: int
    discount_amount: int
    vat_amount: int
    subtotal: int


class CreditNoteCreateRequest(BaseModel):
    """Schema yêu cầu lập chứng từ giảm nợ (Story S8-02)."""
    client_request_id: Optional[str] = Field(
        None,
        description="Mã định danh chống gửi trùng lặp (Idempotent client request ID)",
        json_schema_extra={"example": "REQ-CN-20261016-001"}
    )
    return_order_id: str = Field(
        ...,
        description="Mã phiếu trả hàng đã được Quản lý kho xác nhận (CONFIRMED)",
        json_schema_extra={"example": "TH-2026-0000001"}
    )
    notes: Optional[str] = Field(
        None,
        description="Ghi chú nghiệp vụ kế toán cho chứng từ giảm nợ",
        json_schema_extra={"example": "Giảm trừ công nợ cho hàng hỏng vỡ và lỗi kỹ thuật theo thỏa thuận"}
    )
    adjustment_date: Optional[datetime] = Field(
        None,
        description="Ngày lập chứng từ (nếu không truyền sẽ lấy thời điểm hiện tại)"
    )


class CreditNoteResponse(BaseModel):
    """Schema phản hồi thông tin Chứng từ giảm nợ."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_request_id: Optional[str] = None
    return_order_id: str
    invoice_id: str
    customer_id: str
    customer_name: Optional[str] = None
    adjustment_amount: int
    adjustment_date: datetime
    created_by: int
    created_by_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    items: List[CreditNoteItemResponse] = []
