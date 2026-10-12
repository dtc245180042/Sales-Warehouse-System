from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

router = APIRouter(prefix="/stock-thresholds", tags=["Stock Thresholds"])

# Lưu trữ cấu hình ngưỡng: key = (sku, warehouse_id)
db_thresholds: Dict[str, dict] = {}

class ThresholdConfig(BaseModel):
    sku: str = Field(..., min_length=1)
    warehouse_id: str = Field(..., min_length=1)
    min_threshold: int = Field(..., ge=0)

@router.post("/")
def set_min_threshold(data: ThresholdConfig):
    key = f"{data.sku}_{data.warehouse_id}"
    threshold_data = {
        "sku": data.sku,
        "warehouse_id": data.warehouse_id,
        "min_threshold": data.min_threshold
    }
    db_thresholds[key] = threshold_data
    return {"message": "Cấu hình ngưỡng tồn tối thiểu thành công", "data": threshold_data}

@router.get("/{warehouse_id}/{sku}")
def get_min_threshold(warehouse_id: str, sku: str):
    key = f"{sku}_{warehouse_id}"
    if key not in db_thresholds:
        raise HTTPException(status_code=404, detail="Chưa khai báo ngưỡng tồn cho SKU và Kho này")
    return db_thresholds[key]