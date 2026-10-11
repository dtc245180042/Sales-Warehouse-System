from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class StockReceiptItemCreate(BaseModel):
    product_id: str = Field(..., description="Mã sản phẩm (PRD-xxx)")
    input_quantity: int = Field(..., gt=0, description="Số lượng nhập theo đơn vị khai báo (vd: 10 thùng)")
    input_unit: Optional[str] = Field(None, description="Tên đơn vị nhập (vd: thùng, kiện)")
    conversion_rate: int = Field(1, ge=1, description="Hệ số quy đổi sang đơn vị cơ sở (vd: 24 lon/thùng)")
    lot_number: Optional[str] = Field(None, description="Số lô sản xuất (AC-3: bắt buộc với hàng date)")
    expiry_date: Optional[datetime] = Field(None, description="Hạn sử dụng (AC-3: bắt buộc với hàng date)")


class StockReceiptItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: str
    product_name: Optional[str] = None
    sku: Optional[str] = None
    input_quantity: int
    input_unit: Optional[str] = None
    conversion_rate: int
    quantity_base: int
    adjusted_quantity: int = 0
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
    total_quantity: int  # Tổng số lượng cơ sở (quantity_base)
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


class StockReceiptAdjustmentItem(BaseModel):
    product_id: str = Field(..., description="Mã sản phẩm cần đảo ngược")
    quantity: int = Field(..., gt=0, description="Số lượng cơ sở cần đảo ngược (không vượt số đã nhập)")


class StockReceiptAdjustmentRequest(BaseModel):
    reason: str = Field(..., min_length=3, description="Lý do điều chỉnh / đảo ngược phiếu nhập (bắt buộc)")
    items: List[StockReceiptAdjustmentItem] = Field(..., min_length=1, description="Danh sách mặt hàng cần đảo ngược")
