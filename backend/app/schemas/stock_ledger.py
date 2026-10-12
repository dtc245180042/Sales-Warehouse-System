from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class StockBalanceItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: str
    sku: Optional[str] = None
    product_name: str
    category: Optional[str] = None
    unit: Optional[str] = None
    warehouse_id: int
    warehouse_name: str
    physical_stock: int       # Cột 1: Tồn thực tế trong kho
    reserved_stock: int       # Cột 2: Tồn đang giữ chỗ cho đơn hàng
    available_stock: int      # Cột 3: Tồn khả dụng = Physical - Reserved
    min_stock: int            # Hạn mức tồn an toàn tối thiểu
    is_low_stock: bool        # Cảnh báo tồn thấp: Available < Min


class StockBalanceListResponse(BaseModel):
    items: List[StockBalanceItem]
    total: int
    page: int
    size: int
    total_pages: int


class StockLedgerEntryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    idempotency_key: str
    reference_code: str
    line_ref: Optional[str] = None
    movement_type: str
    product_id: str
    product_name: Optional[str] = None
    sku: Optional[str] = None
    warehouse_id: int
    warehouse_name: str
    quantity_base: int
    previous_physical: int
    new_physical: int
    performer_id: int
    performer_name: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


class StockLedgerEntryListResponse(BaseModel):
    items: List[StockLedgerEntryItem]
    total: int
    page: int
    size: int
    total_pages: int


class ProductStockCardResponse(BaseModel):
    product_id: str
    sku: Optional[str] = None
    product_name: str
    unit: Optional[str] = None
    balances: List[StockBalanceItem]
    entries: StockLedgerEntryListResponse


class StockDriftItem(BaseModel):
    product_id: str
    sku: Optional[str] = None
    product_name: Optional[str] = None
    ledger_physical: int
    profile_physical: int
    drift: int


class StockDriftResponse(BaseModel):
    total_drifted_skus: int
    items: List[StockDriftItem]
