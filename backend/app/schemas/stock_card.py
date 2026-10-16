from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class StockCardItem(BaseModel):
    id: int
    product_id: str
    warehouse_id: str
    transaction_type: str
    quantity: int
    balance_after: int
    doc_ref_id: Optional[str] = None
    doc_type: Optional[str] = None
    transaction_time: datetime

class StockCardFilter(BaseModel):
    product_id: str
    warehouse_id: Optional[str] = None
    from_date: Optional[str] = None
    to_date: Optional[str] = None