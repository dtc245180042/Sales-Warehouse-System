from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, Field


class ProductPriceHistoryResponse(BaseModel):
    id: int
    batch_id: Optional[str] = None
    product_id: str
    product_sku: Optional[str] = None
    product_name: str
    price_list_id: Optional[int] = None
    price_list_name: Optional[str] = None
    customer_group: Optional[str] = None
    price_type: str
    old_price: int
    new_price: int
    change_diff: int
    change_percent: Decimal
    reason: str
    effective_from: datetime
    changed_by_id: Optional[int] = None
    changed_by_name: Optional[str] = None
    changed_by_role: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProductPriceHistoryListResponse(BaseModel):
    items: List[ProductPriceHistoryResponse]
    total: int
    page: int
    limit: int
    total_pages: int
