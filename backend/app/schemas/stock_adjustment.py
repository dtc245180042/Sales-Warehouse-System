from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

class StockAdjustItemSchema(BaseModel):
    productId: str
    sku: Optional[str] = ""
    name: Optional[str] = ""
    currentStock: Optional[int] = 0
    adjustQty: int
    costPrice: Optional[float] = 0.0
    lossValue: Optional[float] = 0.0
    note: Optional[str] = None

class StockAdjustCreateSchema(BaseModel):
    id: Optional[str] = None
    code: Optional[str] = None
    warehouse: str
    adjustType: str  # damaged, lost, expired
    adjustDate: Optional[str] = None
    reason: str
    items: List[StockAdjustItemSchema]
    attachmentUrl: Optional[str] = None
    note: Optional[str] = None
    createdBy: Optional[str] = None
    createdByName: Optional[str] = None

class StockAdjustRejectSchema(BaseModel):
    reason: str

class StockAdjustResponseSchema(BaseModel):
    id: str
    code: str
    warehouse: str
    adjustType: str
    adjustDate: str
    reason: str
    items: List[StockAdjustItemSchema]
    status: str
    totalLossQty: int
    totalLossValue: float
    createdBy: str
    createdByName: str
    createdAt: str
    reviewedBy: Optional[str] = None
    reviewedByName: Optional[str] = None
    reviewedAt: Optional[str] = None
    rejectReason: Optional[str] = None
    attachmentUrl: Optional[str] = None
    note: Optional[str] = None
