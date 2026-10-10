from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime

class AgencyResponse(BaseModel):
    id: int
    code: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    region: Optional[str] = None            # Khu vực (SCRUM-468)
    customer_group: Optional[str] = None    # Nhóm khách hàng (SCRUM-468)
    assigned_person: Optional[str] = None   # Người phụ trách (SCRUM-468)
    status: Optional[str] = None           # Trạng thái (SCRUM-468)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True