# backend/app/api/inventory_turnover.py
from fastapi import APIRouter, Query
from typing import List, Optional
from app.schemas.inventory_turnover import InventoryTurnoverResponse

router = APIRouter(prefix="/reports/inventory-turnover", tags=["Inventory Turnover Reports"])

mock_data = [
    {
        "product_id": "SKU001",
        "warehouse_id": "WH01",
        "beginning_qty": 100,
        "ending_qty": 60,
        "unit_cost": 50000.0,
        "cogs_amount": 20000000.0
    },
    {
        "product_id": "SKU002",
        "warehouse_id": "WH01",
        "beginning_qty": 200,
        "ending_qty": 150,
        "unit_cost": 100000.0,
        "cogs_amount": 50000000.0
    },
    {
        "product_id": "SKU003",
        "warehouse_id": "WH02",
        "beginning_qty": 0,
        "ending_qty": 0,
        "unit_cost": 20000.0,
        "cogs_amount": 0.0
    }
]

@router.get("", response_model=List[InventoryTurnoverResponse])
def get_inventory_turnover_report(
    warehouse_id: Optional[str] = None,
    product_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    results = []
    
    # Ép kiểu an toàn nếu nhận Query object từ FastAPI
    p_id = str(product_id) if product_id and isinstance(product_id, str) else None
    w_id = str(warehouse_id) if warehouse_id and isinstance(warehouse_id, str) else None

    for item in mock_data:
        if w_id and item["warehouse_id"] != w_id:
            continue
        if p_id and item["product_id"] != p_id:
            continue
            
        avg_qty = (item["beginning_qty"] + item["ending_qty"]) / 2.0
        avg_val = avg_qty * item["unit_cost"]
        
        ratio = round(item["cogs_amount"] / avg_val, 2) if avg_val > 0 else 0.0
        days = round(365.0 / ratio, 1) if ratio > 0 else 0.0
        
        results.append(InventoryTurnoverResponse(
            product_id=item["product_id"],
            warehouse_id=item["warehouse_id"],
            beginning_qty=item["beginning_qty"],
            ending_qty=item["ending_qty"],
            avg_inventory_qty=avg_qty,
            cogs_amount=item["cogs_amount"],
            turnover_ratio=ratio,
            turnover_days=days
        ))
        
    return results