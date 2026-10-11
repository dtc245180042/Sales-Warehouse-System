from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict, field_serializer


class StockTransferItemBase(BaseModel):
    product_id: str = Field(..., description="Mã ID sản phẩm")
    sku: Optional[str] = Field(None, description="Mã SKU")
    product_name: str = Field(..., description="Tên sản phẩm")
    unit: str = Field("cái", description="Đơn vị tính")
    cost_price: float = Field(0.0, ge=0, description="Đơn giá vốn")


class StockTransferItemCreate(StockTransferItemBase):
    transfer_quantity: int = Field(..., gt=0, description="Số lượng chuyển đi (bắt buộc > 0)")


class StockTransferItemReceive(BaseModel):
    product_id: str = Field(..., description="Mã ID sản phẩm")
    received_quantity: int = Field(..., ge=0, description="Số lượng thực tế nhận được (>= 0)")
    discrepancy_reason: Optional[str] = Field(None, description="Lý do chênh lệch cho sản phẩm này (nếu có)")


class StockTransferItemResponse(StockTransferItemBase):
    id: int
    transfer_id: str
    transfer_quantity: int
    received_quantity: Optional[int] = None
    discrepancy_quantity: int = 0
    discrepancy_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("created_at", when_used="json", check_fields=False)
    def serialize_item_created_at(self, dt: Optional[datetime]) -> Optional[str]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


class StockTransferCreate(BaseModel):
    source_warehouse: str = Field(..., min_length=1, description="Kho xuất / Kho đi")
    destination_warehouse: str = Field(..., min_length=1, description="Kho nhập / Kho đến")
    items: List[StockTransferItemCreate] = Field(..., min_length=1, description="Danh sách mặt hàng cần chuyển")
    note: Optional[str] = Field(None, description="Ghi chú điều chuyển")
    ship_immediately: bool = Field(False, description="Tùy chọn: Xuất chuyển đi ngay (chuyển sang in_transit) thay vì lưu draft")


class StockTransferShipRequest(BaseModel):
    shipped_by: Optional[str] = Field(None, description="Tên người xác nhận xuất kho")
    note: Optional[str] = Field(None, description="Ghi chú thêm khi xuất kho")


class StockTransferReceiveRequest(BaseModel):
    items: List[StockTransferItemReceive] = Field(..., min_length=1, description="Danh sách số lượng thực nhận từng món")
    discrepancy_reason: Optional[str] = Field(None, description="Lý do chênh lệch chung (bắt buộc nếu tổng nhận != tổng gửi)")
    received_by: Optional[str] = Field(None, description="Tên người nhận tại kho đích")
    note: Optional[str] = Field(None, description="Ghi chú nhập kho")


class StockTransferCancelRequest(BaseModel):
    cancel_reason: Optional[str] = Field(None, description="Lý do hủy phiếu chuyển kho")


class StockTransferResponse(BaseModel):
    id: str
    code: str
    source_warehouse: str
    destination_warehouse: str
    status: str
    transfer_date: datetime
    total_items: int
    total_received_items: int
    has_discrepancy: bool
    discrepancy_reason: Optional[str] = None
    note: Optional[str] = None
    created_by: Optional[str] = None
    created_by_id: Optional[int] = None
    shipped_by: Optional[str] = None
    shipped_at: Optional[datetime] = None
    received_by: Optional[str] = None
    received_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[StockTransferItemResponse] = []

    model_config = ConfigDict(from_attributes=True)

    @field_serializer(
        "transfer_date",
        "created_at",
        "updated_at",
        "shipped_at",
        "received_at",
        "cancelled_at",
        when_used="json",
        check_fields=False,
    )
    def serialize_transfer_datetimes(self, dt: Optional[datetime]) -> Optional[str]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


class WarehouseStockResponse(BaseModel):
    id: int
    warehouse: str
    product_id: str
    sku: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = "cái"
    cost_price: Optional[float] = 0.0
    stock: int
    physical_stock: int
    in_transit_stock: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InTransitSummaryItem(BaseModel):
    transfer_id: str
    transfer_code: str
    source_warehouse: str
    destination_warehouse: str
    product_id: str
    sku: Optional[str] = None
    product_name: str
    unit: str
    in_transit_quantity: int
    shipped_at: Optional[datetime] = None
    created_by: Optional[str] = None
