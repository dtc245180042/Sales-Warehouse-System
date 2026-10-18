from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


# ==============================================================================
# SCHEMAS FOR CREATION
# ==============================================================================
class InvoiceItemInput(BaseModel):
    product_id: Optional[str] = None
    sku: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = "cái"
    quantity: int = 1
    unit_price: int = 0
    discount_amount: int = 0
    vat_amount: int = 0
    subtotal: int = 0


class InvoiceCreateRequest(BaseModel):
    client_request_id: Optional[str] = Field(None, description="ID định danh chống gửi trùng lặp")
    dispatch_ids: Optional[List[str]] = Field(None, description="Danh sách mã phiếu xuất kho cần lập hóa đơn")
    customer_id: Optional[str] = Field(None, description="Mã khách hàng")
    customer_name: Optional[str] = None
    customer_address: Optional[str] = None
    customer_tax_code: Optional[str] = None
    notes: Optional[str] = Field(None, description="Ghi chú hóa đơn")
    items: Optional[List[Any]] = None


# ==============================================================================
# SCHEMAS FOR RESPONSES
# ==============================================================================
class InvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dispatch_id: str
    dispatch_item_id: int
    order_id: str
    product_id: str
    sku: str
    product_name: Optional[str] = None
    unit: str
    quantity: int
    unit_price: int
    discount_amount: int
    vat_amount: int
    subtotal: int


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_request_id: Optional[str] = None
    customer_id: str
    customer_name: Optional[str] = None
    customer_address: Optional[str] = None
    customer_tax_code: Optional[str] = None
    subtotal_amount: int
    discount_amount: int
    vat_amount: int
    total_amount: int
    paid_amount: int
    remaining_amount: int
    status: str
    issued_at: datetime
    due_date: datetime
    issued_by: int
    notes: Optional[str] = None
    items: List[InvoiceItemResponse] = []


class InvoicePrintTemplateResponse(BaseModel):
    """Cấu trúc dữ liệu phục vụ in ấn hóa đơn & xuất PDF chuẩn hóa (AC-5)."""
    model_config = ConfigDict(from_attributes=True)

    invoice_id: str
    company_name: str
    company_address: str
    company_tax_code: str
    customer_name: str
    customer_address: Optional[str] = None
    customer_tax_code: Optional[str] = None
    issued_date_str: str
    due_date_str: str
    items: List[InvoiceItemResponse]
    subtotal_amount: int
    discount_amount: int
    vat_amount: int
    total_amount: int
    total_amount_in_words: str
    created_by_name: str
