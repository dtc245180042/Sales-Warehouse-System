from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field


class StockReceiptItemBase(BaseModel):
    product_id: str
    sku: Optional[str] = None
    name: str
    unit: str = "Chiếc"
    quantity: int = Field(1, ge=1)
    cost_price: float = Field(0.0, ge=0)
    subtotal: float = Field(0.0, ge=0)


class StockReceiptItemCreate(StockReceiptItemBase):
    pass


class StockReceiptItemResponse(StockReceiptItemBase):
    id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def productId(self) -> str:
        return self.product_id

    @computed_field
    def costPrice(self) -> float:
        return self.cost_price


class StockReceiptCreate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    warehouse: str = "Kho Tổng Hà Nội"
    target_warehouse: Optional[str] = None
    reason: Optional[str] = None
    items: List[StockReceiptItemCreate] = Field(..., min_length=1)
    total_amount: float = 0.0
    created_by: Optional[str] = None
    note: Optional[str] = None


class StockReceiptResponse(BaseModel):
    id: str
    code: str
    type: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    warehouse: str
    target_warehouse: Optional[str] = None
    reason: Optional[str] = None
    total_items: int
    total_amount: float
    created_by: Optional[str] = None
    note: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    items: List[StockReceiptItemResponse] = []

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def supplierName(self) -> Optional[str]:
        return self.supplier_name

    @computed_field
    def customerName(self) -> Optional[str]:
        return self.customer_name

    @computed_field
    def totalItems(self) -> int:
        return self.total_items

    @computed_field
    def totalAmount(self) -> float:
        return self.total_amount

    @computed_field
    def createdBy(self) -> Optional[str]:
        return self.created_by

    @computed_field
    def createdAt(self) -> Optional[str]:
        return self.created_at.strftime("%Y-%m-%d %H:%M") if self.created_at else None


class InventoryHistoryResponse(BaseModel):
    id: str
    code: str
    type: str
    product_id: str
    product_name: str
    sku: Optional[str] = None
    quantity: int
    balance_after: int
    warehouse: str
    performer: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def productId(self) -> str:
        return self.product_id

    @computed_field
    def productName(self) -> str:
        return self.product_name

    @computed_field
    def balanceAfter(self) -> int:
        return self.balance_after

    @computed_field
    def date(self) -> Optional[str]:
        return self.created_at.strftime("%Y-%m-%d %H:%M") if self.created_at else None
