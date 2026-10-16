# backend/app/schemas/inventory_excel.py
from pydantic import BaseModel
from typing import Optional, List

class InventoryExcelExportRequest(BaseModel):
    warehouse_id: Optional[str] = None
    category_id: Optional[str] = None
    search_keyword: Optional[str] = None
    month_year: Optional[str] = "2026-10"

class InventoryExcelItem(BaseModel):
    product_id: str
    product_name: str
    warehouse_id: str
    category_name: str
    beginning_qty: int
    import_qty: int
    export_qty: int
    ending_qty: int
    unit_cost: float
    total_value: float