# backend/app/api/stock_card.py
from fastapi import APIRouter, Query
from typing import List, Optional
from datetime import datetime
from app.schemas.stock_card import StockCardItem

router = APIRouter(prefix="/stock-card", tags=["Stock Card"])

mock_stock_ledger = [
    {"id": 1, "product_id": "SKU001", "warehouse_id": "WH01", "transaction_type": "IMPORT", "quantity": 100, "balance_after": 100, "doc_ref_id": "PN001", "doc_type": "RECEIPT", "time": "2026-10-01T08:00:00"},
    {"id": 2, "product_id": "SKU001", "warehouse_id": "WH01", "transaction_type": "EXPORT", "quantity": -20, "balance_after": 80, "doc_ref_id": "PX001", "doc_type": "DISPATCH", "time": "2026-10-02T09:30:00"},
    {"id": 3, "product_id": "SKU001", "warehouse_id": "WH01", "transaction_type": "ADJUSTMENT", "quantity": -5, "balance_after": 75, "doc_ref_id": "DC001", "doc_type": "ADJUSTMENT", "time": "2026-10-03T10:15:00"},
    {"id": 4, "product_id": "SKU001", "warehouse_id": "WH02", "transaction_type": "TRANSFER", "quantity": 10, "balance_after": 10, "doc_ref_id": "CK001", "doc_type": "TRANSFER", "time": "2026-10-04T14:00:00"},
]

@router.get("", response_model=List[StockCardItem])
def get_stock_card(
    product_id: str = Query(..., description="Mã sản phẩm"),
    warehouse_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    results = []
    sorted_entries = sorted(mock_stock_ledger, key=lambda x: x["time"])
    
    for entry in sorted_entries:
        if entry["product_id"] != product_id:
            continue
        if warehouse_id and isinstance(warehouse_id, str) and entry["warehouse_id"] != warehouse_id:
            continue
        if from_date and isinstance(from_date, str) and entry["time"] < from_date:
            continue
        if to_date and isinstance(to_date, str) and entry["time"] > to_date:
            continue
            
        results.append(StockCardItem(
            id=entry["id"],
            product_id=entry["product_id"],
            warehouse_id=entry["warehouse_id"],
            transaction_type=entry["transaction_type"],
            quantity=entry["quantity"],
            balance_after=entry["balance_after"],
            doc_ref_id=entry["doc_ref_id"],
            doc_type=entry["doc_type"],
            transaction_time=datetime.fromisoformat(entry["time"])
        ))
        
    return results