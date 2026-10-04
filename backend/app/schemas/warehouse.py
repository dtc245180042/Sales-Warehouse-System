from pydantic import BaseModel
from typing import Dict, Optional
from datetime import datetime

class SKUUnitUpdateRequest(BaseModel):
    base_unit: str
    units: Dict[str, float]  # Ví dụ: {"Thùng": 24, "Lốc": 6, "Lon": 1}

class ConvertQuantityRequest(BaseModel):
    sku: str
    quantity: float
    unit_name: str
    transaction_time: Optional[datetime] = None