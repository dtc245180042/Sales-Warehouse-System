from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class StockReceiptItemCreate(BaseModel):
    product_id: str = Field(..., description="Mã sản phẩm (PRD-xxx)")
    quantity: int = Field(..., gt=0, description="Số lượng nhập (nguyên dương, đơn vị cơ sở)")
    cost_price: float = Field(0.0, ge=0.0, description="Đơn giá nhập")
    lot_number: Optional[str] = Field(None, description="Số lô hàng (AC-3)")
    expiry_date: Optional[datetime] = Field(None, description="Hạn sử dụng (AC-3)")


class StockReceiptItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: str
    product_name: Optional[str] = None
    sku: Optional[str] = None
    quantity: int
    cost_price: Optional[float] = None  # Che giấu đối với vai trò Thủ kho
    lot_number: Optional[str] = None
    expiry_date: Optional[datetime] = None


class StockReceiptCreate(BaseModel):
    supplier_id: Optional[str] = Field(None, description="Mã nhà cung cấp (SUP-xxx)")
    warehouse_id: int = Field(..., description="ID kho hàng nhận (1: Hà Nội, 2: Đà Nẵng, 3: TP.HCM)")
    note: Optional[str] = Field(None, description="Ghi chú phiếu nhập")
    receipt_code: Optional[str] = Field(None, description="Mã phiếu tùy chọn; để trống sẽ tự sinh PNK-YYYYMMDD-XXXX")
    items: List[StockReceiptItemCreate] = Field(..., min_length=1, description="Danh sách mặt hàng nhập")


class StockReceiptUpdate(BaseModel):
    supplier_id: Optional[str] = Field(None, description="Mã nhà cung cấp mới")
    warehouse_id: Optional[int] = Field(None, description="ID kho hàng nhận mới")
    note: Optional[str] = Field(None, description="Ghi chú mới")
    items: Optional[List[StockReceiptItemCreate]] = Field(None, description="Danh sách mặt hàng cập nhật")


class StockReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    receipt_code: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    warehouse_id: int
    warehouse_name: str
    status: str
    note: Optional[str] = None
    total_items: int
    total_quantity: int
    total_cost_amount: Optional[float] = None  # Che giấu đối với vai trò Thủ kho
    created_by_id: int
    confirmed_by_id: Optional[int] = None
    confirmed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: List[StockReceiptItemResponse] = []


class StockReceiptListResponse(BaseModel):
    items: List[StockReceiptResponse]
    total: int
    page: int
    size: int
    total_pages: int
