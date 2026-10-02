from pydantic import BaseModel
from typing import List, Optional

# --- Dữ liệu gửi lên (Request Body) ---
class UnitConversionCreate(BaseModel):
    unit_name: str
    conversion_rate: float

class SKUUnitCreateRequest(BaseModel):
    sku: str
    base_unit: str
    conversions: List[UnitConversionCreate]

# --- Dữ liệu trả về (Response Body) ---
class UnitConversionResponse(BaseModel):
    unit_name: str
    conversion_rate: float
    is_base: bool

class SKUUnitResponse(BaseModel):
    sku: str
    base_unit: str
    units: List[UnitConversionResponse]