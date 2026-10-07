from typing import List, Optional, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class AuditLogBase(BaseModel):
    entity_type: str = Field(..., description="Loại đối tượng: INVENTORY, DEBT, PRICE, INVOICE")
    entity_id: str = Field(..., description="Mã đối tượng (Mã SP, SKU, Mã KH, Mã Bảng giá, Mã Hoá đơn)")
    entity_name: Optional[str] = Field(None, description="Tên đối tượng liên quan")
    action: str = Field(..., description="Hành động thực hiện")
    old_values: Optional[Dict[str, Any]] = Field(None, description="Giá trị trước thay đổi")
    new_values: Optional[Dict[str, Any]] = Field(None, description="Giá trị sau thay đổi")
    change_summary: Optional[str] = Field(None, description="Tóm tắt nội dung thay đổi")
    reason: Optional[str] = Field(None, description="Lý do điều chỉnh")


class AuditLogCreate(AuditLogBase):
    user_id: Optional[int] = None
    username: Optional[str] = None
    user_fullname: Optional[str] = None
    user_role: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = "success"


class AuditLogResponse(AuditLogBase):
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    user_fullname: Optional[str] = None
    user_role: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = "success"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditLogStats(BaseModel):
    total: int = 0
    success: int = 0
    failed: int = 0
    warning: int = 0


class AuditLogPaginationResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    stats: Optional[AuditLogStats] = None



class StockAdjustmentRequest(BaseModel):
    product_id: str = Field(..., description="Mã sản phẩm (ID) hoặc mã SKU")
    actual_stock: int = Field(..., ge=0, description="Số lượng tồn kho thực tế kiểm kê được")
    reason: str = Field(..., min_length=3, description="Lý do điều chỉnh (lệch kiểm kê cuối tháng, hư hỏng...)")
    warehouse: Optional[str] = Field("Kho Tổng Hà Nội", description="Tên kho hàng")


class DebtLimitAdjustmentRequest(BaseModel):
    customer_id: str = Field(..., description="Mã khách hàng (ID hoặc Code)")
    new_credit_limit: float = Field(..., ge=0.0, description="Hạn mức công nợ mới (VNĐ)")
    reason: str = Field(..., min_length=3, description="Lý do điều chỉnh hạn mức công nợ")


class PriceAdjustmentRequest(BaseModel):
    entity_id: str = Field(..., description="Mã sản phẩm, SKU hoặc Mã bảng giá")
    entity_name: Optional[str] = Field(None, description="Tên sản phẩm / Tên bảng giá")
    old_price: float = Field(..., ge=0.0, description="Giá cũ")
    new_price: float = Field(..., ge=0.0, description="Giá mới")
    reason: str = Field(..., min_length=3, description="Lý do thay đổi giá")


class InvoiceAdjustmentRequest(BaseModel):
    order_id: str = Field(..., description="Mã đơn hàng / Hoá đơn")
    old_status: str = Field(..., description="Trạng thái trước")
    new_status: str = Field(..., description="Trạng thái sau")
    reason: str = Field(..., min_length=3, description="Lý do điều chỉnh trạng thái hoá đơn")
