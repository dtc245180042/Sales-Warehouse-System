from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, computed_field


class CustomerBase(BaseModel):
    name: str = Field(..., description="Tên khách hàng hoặc đối tác")
    phone: Optional[str] = Field(None, description="Số điện thoại")
    email: Optional[str] = Field(None, description="Địa chỉ email")
    address: Optional[str] = Field(None, description="Địa chỉ")
    customer_group: str = Field("RETAIL", description="Nhóm khách hàng (TIER_1, TIER_2, WHOLESALE, VIP, RETAIL)")
    region: Optional[str] = Field(None, description="Khu vực địa bàn (ví dụ: Miền Bắc, Miền Trung, Miền Nam)")
    assigned_sales_rep: Optional[str] = Field(None, description="Nhân viên kinh doanh phụ trách")
    status: str = Field("active", description="Trạng thái (active, inactive, locked)")


class CustomerCreate(CustomerBase):
    id: Optional[str] = None
    code: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customer_group: Optional[str] = None
    region: Optional[str] = None
    assigned_sales_rep: Optional[str] = None
    status: Optional[str] = None


class CustomerResponse(CustomerBase):
    id: str
    code: str
    total_orders: int = 0
    total_spent: float = 0.0
    last_order_date: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def totalOrders(self) -> int:
        return self.total_orders

    @computed_field
    def totalSpent(self) -> float:
        return self.total_spent

    @computed_field
    def lastOrderDate(self) -> Optional[str]:
        return self.last_order_date

    @computed_field
    def createdAt(self) -> Optional[str]:
        return self.created_at.strftime("%Y-%m-%d") if self.created_at else None

    @computed_field
    def assignedSalesRep(self) -> Optional[str]:
        return self.assigned_sales_rep

    @computed_field
    def customerGroup(self) -> str:
        return self.customer_group


class CustomerPaginationResponse(BaseModel):
    """Schema danh sách đại lý phân trang theo chuẩn SCRUM-229."""
    items: List[CustomerResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class CustomerFilterOptions(BaseModel):
    """Schema danh sách các tùy chọn lọc đại lý (SCRUM-229)."""
    regions: List[str]
    customer_groups: List[str]
    sales_reps: List[str]
    statuses: List[str]
