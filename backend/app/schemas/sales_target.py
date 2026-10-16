from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SalesTargetCreate(BaseModel):
    employee_id: str
    region_code: str
    month_year: str
    target_amount: float

class SalesTargetUpdate(BaseModel):
    target_amount: float
    reason: Optional[str] = None # Bắt buộc khi chỉ tiêu đã bị khóa

class SalesTargetResponse(BaseModel):
    id: int
    employee_id: str
    region_code: str
    month_year: str
    target_amount: float
    is_locked: bool

class SalesProgressDashboard(BaseModel):
    employee_id: str
    region_code: str
    month_year: str
    target_amount: float
    actual_sales: float
    completion_rate: float # Tỷ lệ % hoàn thành
    shortfall_amount: float # Số tiền còn thiếu/vượt