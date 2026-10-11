from fastapi import APIRouter
from typing import List
from backend.app.api.stock_threshold_api import db_thresholds
from backend.app.api.stock_warning_service import check_low_stock

router = APIRouter(prefix="/stock-dashboard", tags=["Stock Dashboard"])

# Giả lập dữ liệu tồn kho thực tế trong hệ thống
db_inventory = [
    {"sku": "SKU_001", "warehouse_id": "WH_1", "quantity": 5},
    {"sku": "SKU_002", "warehouse_id": "WH_1", "quantity": 50},
    {"sku": "SKU_003", "warehouse_id": "WH_2", "quantity": 2}
]

@router.get("/low-stock-alert", response_model=List[dict])
def get_low_stock_alerts():
    """
    Trả về danh sách các SKU có số tồn kho dưới ngưỡng tối thiểu
    phục vụ cho màn hình Sổ tồn và Dashboard kho.
    """
    alerts = check_low_stock(db_inventory, db_thresholds)
    return alerts