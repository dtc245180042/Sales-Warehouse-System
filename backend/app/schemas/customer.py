import re
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator


class CustomerBase(BaseModel):
    name: str = Field(..., description="Tên khách hàng hoặc đại lý")
    phone: Optional[str] = Field(None, description="Số điện thoại")
    email: Optional[str] = Field(None, description="Địa chỉ email")
    address: Optional[str] = Field(None, description="Địa chỉ")
    customer_group: str = Field("RETAIL", description="Nhóm khách hàng (TIER_1, TIER_2, WHOLESALE, VIP, RETAIL)")
    tax_code: Optional[str] = Field(None, description="Mã số thuế đại lý (10 hoặc 13 số)")
    region: Optional[str] = Field(None, description="Khu vực địa bàn / Tỉnh thành phụ trách (ví dụ: Miền Bắc, Miền Trung, Miền Nam)")
    assigned_sales_rep: Optional[str] = Field(None, description="Nhân viên kinh doanh phụ trách")
    status: str = Field("active", description="Trạng thái (active, inactive, locked)")

    @field_validator("tax_code")
    def validate_tax_code(cls, v):
        if not v:
            return None
        v = v.strip()
        if not v:
            return None
        # Kiểm tra chuẩn MST Việt Nam: 10 chữ số hoặc 13 chữ số (dạng 10 số kèm gạch nối 3 số hoặc 13 số liền)
        if not re.match(r"^(\d{10}|\d{10}-\d{3}|\d{13})$", v):
            raise ValueError("Mã số thuế không hợp lệ. Vui lòng nhập đúng định dạng 10 số (ví dụ: 0301234567) hoặc 13 số (ví dụ: 0301234567-001).")
        return v

    @field_validator("customer_group")
    def validate_customer_group(cls, v):
        if not v:
            return "RETAIL"
        v = v.strip().upper()
        allowed = {"TIER_1", "TIER_2", "WHOLESALE", "RETAIL", "VIP"}
        if v not in allowed:
            raise ValueError(f"Nhóm khách hàng không hợp lệ. Chỉ chấp nhận một trong các nhóm: {', '.join(allowed)}")
        return v


class CustomerCreate(CustomerBase):
    id: Optional[str] = None
    code: Optional[str] = Field(None, description="Mã đại lý duy nhất")

    @field_validator("code")
    def normalize_code(cls, v):
        if v is not None:
            v = v.strip()
            if not v:
                return None
            return v.upper()
        return None


class CustomerUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customer_group: Optional[str] = None
    tax_code: Optional[str] = None
    region: Optional[str] = None
    assigned_sales_rep: Optional[str] = None
    status: Optional[str] = None

    @field_validator("code")
    def normalize_code(cls, v):
        if v is not None:
            v = v.strip()
            if not v:
                return None
            return v.upper()
        return None

    @field_validator("tax_code")
    def validate_tax_code(cls, v):
        if not v:
            return None
        v = v.strip()
        if not v:
            return None
        if not re.match(r"^(\d{10}|\d{10}-\d{3}|\d{13})$", v):
            raise ValueError("Mã số thuế không hợp lệ. Vui lòng nhập đúng định dạng 10 số hoặc 13 số.")
        return v

    @field_validator("customer_group")
    def validate_customer_group(cls, v):
        if v is None:
            return None
        v = v.strip().upper()
        allowed = {"TIER_1", "TIER_2", "WHOLESALE", "RETAIL", "VIP"}
        if v not in allowed:
            raise ValueError(f"Nhóm khách hàng không hợp lệ. Chỉ chấp nhận một trong các nhóm: {', '.join(allowed)}")
        return v


class CustomerStatusUpdate(BaseModel):
    status: str = Field(..., description="Trạng thái mới: 'active' hoặc 'inactive'")

    @field_validator("status")
    def validate_status(cls, v):
        v = v.strip().lower()
        if v not in ("active", "inactive"):
            raise ValueError("Trạng thái chỉ được là 'active' hoặc 'inactive'")
        return v


class CustomerResponse(CustomerBase):
    id: str
    code: str
    total_orders: int = 0
    total_spent: float = 0.0
    last_order_date: Optional[str] = None
    
    # Thông tin người phụ trách (lấy từ bảng phụ customer_assignments)
    assigned_staff_id: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    assigned_staff_phone: Optional[str] = None
    
    # Thông tin hạn mức công nợ (lấy từ bảng phụ customer_credit_profiles)
    credit_limit: Optional[int] = None
    max_debt_days: Optional[int] = None
    current_debt: Optional[int] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    assigned_staff_id: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    assigned_staff_phone: Optional[str] = None
    assigned_at: Optional[str] = None

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
    def assignedStaffId(self) -> Optional[str]:
        return self.assigned_staff_id

    @computed_field
    def assignedStaffName(self) -> Optional[str]:
        return self.assigned_staff_name

    @computed_field
    def assignedStaffPhone(self) -> Optional[str]:
        return self.assigned_staff_phone

    @computed_field
    def assignedAt(self) -> Optional[str]:
        return self.assigned_at

    @computed_field
    def assignedSalesRep(self) -> Optional[str]:
        return self.assigned_sales_rep or self.assigned_staff_name

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

