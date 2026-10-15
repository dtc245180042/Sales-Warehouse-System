# backend/app/schemas/inventory_turnover.py
from pydantic import BaseModel
from typing import Optional

class InventoryTurnoverResponse(BaseModel):
    product_id: str
    warehouse_id: str
    beginning_qty: int      # Tồn đầu kỳ
    ending_qty: int         # Tồn cuối kỳ
    avg_inventory_qty: float # Tồn trung bình
    cogs_amount: float      # Giá vốn bán hàng
    turnover_ratio: float   # Hệ số vòng quay tồn kho
    turnover_days: float    # Số ngày vòng quay