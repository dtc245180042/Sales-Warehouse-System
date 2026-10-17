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
    # Trường tương thích với Frontend
    targetId: Optional[str] = None
    scope: Optional[str] = "individual"
    userId: Optional[str] = None
    userName: Optional[str] = None
    territory: Optional[str] = None
    targetRevenue: Optional[float] = None
    currentRevenue: Optional[float] = None
    remainingRevenue: Optional[float] = None
    revenuePercentage: Optional[float] = None
    targetOrders: Optional[int] = 100
    currentOrders: Optional[int] = 0
    ordersPercentage: Optional[float] = 0.0
    status: Optional[str] = "active"