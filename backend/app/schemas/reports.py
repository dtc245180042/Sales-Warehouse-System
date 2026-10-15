# backend/app/schemas/reports.py
from pydantic import BaseModel
from typing import Optional
from datetime import date

class SlowMovingThresholdConfig(BaseModel):
    min_days: int = 30
    max_days: Optional[int] = None

class InventoryReportItem(BaseModel):
    sku: str
    product_name: str
    category_name: str
    warehouse_id: str
    warehouse_name: str
    current_stock: int
    stock_value: float
    avg_inventory_days: float
    is_slow_moving: bool
    priority_level: int

class InventoryReportFilter(BaseModel):
    warehouse_id: Optional[str] = None
    category_id: Optional[str] = None
    sku: Optional[str] = None
    is_slow_moving: Optional[bool] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    sort_by: Optional[str] = "avg_inventory_days"
    sort_order: Optional[str] = "desc"