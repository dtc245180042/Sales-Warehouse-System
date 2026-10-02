from pydantic import BaseModel
from typing import List, Optional

# --- Model đơn vị tính ---
class UnitConversionCreate(BaseModel):
    unit_name: str
    conversion_rate: float

# --- Request khai báo mới ---
class SKUUnitCreateRequest(BaseModel):
    sku: str
    base_unit: str
    conversions: List[UnitConversionCreate]

# --- Request cập nhật ---
class SKUUnitUpdateRequest(BaseModel):
    base_unit: Optional[str] = None
    conversions: List[UnitConversionCreate]

# --- Response trả về dữ liệu ---
class UnitConversionResponse(BaseModel):
    unit_name: str
    conversion_rate: float
    is_base: bool

class SKUUnitResponse(BaseModel):
    sku: str
    base_unit: str
    units: List[UnitConversionResponse]