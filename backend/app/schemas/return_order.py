from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.return_order import ReturnReason, ItemCondition


class ReturnItemCreate(BaseModel):
    """Khai báo một sản phẩm trong yêu cầu trả hàng."""
    invoice_item_id: int = Field(..., description="ID dòng hàng trên hoá đơn gốc (InvoiceItem.id)")
    lot_id: Optional[int] = Field(None, description="ID lô hàng (bắt buộc nếu SKU quản lý lô, cấm nếu không quản lý lô)")
    quantity: int = Field(..., gt=0, description="Số lượng trả (phải > 0 và <= hạn mức lô đã xuất)")
    condition: ItemCondition = Field(
        default=ItemCondition.GOOD,
        description="Tình trạng hàng: GOOD (nguyên vẹn nhập kho gốc) hoặc DAMAGED (hỏng nhập kho lỗi 99)",
    )


class ReturnOrderCreateRequest(BaseModel):
    """Payload tạo Phiếu yêu cầu trả hàng từ đại lý (Story S8-01)."""
    client_request_id: Optional[str] = Field(
        None,
        max_length=100,
        description="Khóa chống gửi trùng lặp từ Client (Idempotency Key)",
    )
    invoice_id: str = Field(..., description="Mã hoá đơn gốc (HD-YYYY-XXXXXXX)")
    return_reason: ReturnReason = Field(..., description="Lý do trả hàng")
    notes: Optional[str] = Field(
        None,
        description="Ghi chú chi tiết (Bắt buộc nếu return_reason là OTHER)",
    )
    items: List[ReturnItemCreate] = Field(
        ...,
        min_length=1,
        description="Danh sách sản phẩm yêu cầu trả (ít nhất 1 dòng)",
    )


class ReturnConfirmRequest(BaseModel):
    """Payload Quản lý kho xác nhận nhận hàng."""
    notes: Optional[str] = Field(None, description="Ghi chú kiểm đếm khi nhận kho")


class ReturnCancelRequest(BaseModel):
    """Payload hủy phiếu yêu cầu trả hàng."""
    cancel_reason: str = Field(
        ...,
        min_length=3,
        description="Lý do hủy yêu cầu trả hàng (Bắt buộc)",
    )


class ReturnOrderItemResponse(BaseModel):
    """Chi tiết một dòng sản phẩm trong phiếu trả hàng."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_item_id: int
    product_id: str
    sku: str
    product_name: Optional[str] = None
    unit: Optional[str] = None
    quantity: int
    condition: str
    lot_id: Optional[int] = None
    lot_number: Optional[str] = None
    unit_price: int
    discount_amount: int
    vat_amount: int
    subtotal: int


class ReturnOrderResponse(BaseModel):
    """Thông tin Phiếu trả hàng và kết quả xử lý."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_request_id: Optional[str] = None
    invoice_id: str
    customer_id: str
    customer_name: Optional[str] = None
    status: str
    return_reason: str
    notes: Optional[str] = None
    origin_warehouse_id: int
    requested_by: int
    requested_by_name: Optional[str] = None
    requested_at: datetime
    confirmed_by: Optional[int] = None
    confirmed_by_name: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    cancelled_by: Optional[int] = None
    cancelled_by_name: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    total_returned_value: int
    created_at: datetime
    items: List[ReturnOrderItemResponse] = []
