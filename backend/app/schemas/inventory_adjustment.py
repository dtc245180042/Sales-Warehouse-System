# backend/app/schemas/inventory_adjustment.py
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class AdjustmentCreate(BaseModel):
    warehouse_id: str
    product_id: str
    adjustment_type: str # DAMAGED, LOST, EXPIRED
    quantity_adjusted: int
    loss_value: float = Field(..., gt=0, description="Bắt buộc ghi nhận giá trị tổn thất > 0") # SCRUM-791
    reason: str = Field(..., min_length=5, description="Bắt buộc chọn/nhập lý do hợp lệ") # SCRUM-791

class AdjustmentApprove(BaseModel):
    status: str # APPROVED hoặc REJECTED

class AdjustmentResponse(BaseModel):
    id: int
    code: str
    warehouse_id: str
    product_id: str
    adjustment_type: str
    quantity_adjusted: int
    loss_value: float
    reason: str
    created_by: str
    approved_by: Optional[str] = None
    status: str
    created_at: datetime