from typing import List, Optional
from datetime import datetime, date
from pydantic import BaseModel, Field


class DebtAgingBucketItem(BaseModel):
    """Chi tiết một nhóm tuổi nợ."""
    bucket_key: str
    bucket_label: str
    amount: int
    invoice_count: int


class AgencyInvoiceDetail(BaseModel):
    """Chi tiết một hóa đơn trong sổ công nợ đại lý."""
    invoice_id: str
    client_request_id: Optional[str] = None
    issued_at: datetime
    due_date: datetime
    total_amount: int
    paid_amount: int
    remaining_amount: int
    status: str
    aging_days: int
    aging_bucket: str
    days_overdue: int
    is_overdue: bool
    notes: Optional[str] = None


class AgencyDebtReportItem(BaseModel):
    """Dữ liệu sổ công nợ của 1 đại lý kèm phân tích tuổi nợ (Story S7-03)."""
    customer_id: str
    customer_code: str
    customer_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_code: Optional[str] = None
    region: Optional[str] = None
    customer_group: Optional[str] = None
    assigned_sales_rep: Optional[str] = None
    credit_limit: int = 0
    max_debt_days: int = 0
    
    # Các chỉ tiêu tài chính cốt lõi
    total_receivable: int = 0     # Tổng phải thu
    total_paid: int = 0           # Tổng đã thu
    total_debt: int = 0           # Tổng còn nợ
    
    # Phân tích theo 4 nhóm tuổi nợ (AC)
    debt_0_30: int = 0            # Nợ 0 - 30 ngày
    debt_31_60: int = 0           # Nợ 31 - 60 ngày
    debt_61_90: int = 0           # Nợ 61 - 90 ngày
    debt_over_90: int = 0         # Nợ trên 90 ngày
    
    # Khoản quá hạn (AC)
    overdue_debt: int = 0         # Tổng nợ quá hạn
    max_overdue_days: int = 0     # Số ngày quá hạn lớn nhất
    is_overdue: bool = False      # Đại lý có khoản quá hạn hay không
    
    unpaid_invoices_count: int = 0
    oldest_invoice_date: Optional[datetime] = None


class AgencyDebtSummary(BaseModel):
    """Dòng tổng cộng ở chân bảng và tổng hợp toàn hệ thống (AC: SCRUM-721)."""
    total_customers: int = 0
    total_receivable: int = 0
    total_paid: int = 0
    total_debt: int = 0
    total_debt_0_30: int = 0
    total_debt_31_60: int = 0
    total_debt_61_90: int = 0
    total_debt_over_90: int = 0
    total_overdue_debt: int = 0
    overdue_customers_count: int = 0


class AgencyDebtReportResponse(BaseModel):
    """Phản hồi danh sách sổ công nợ theo đại lý (SCRUM-718)."""
    items: List[AgencyDebtReportItem]
    summary: AgencyDebtSummary
    total: int
    page: int
    limit: int
    as_of_date: str


class AgencyDebtDetailResponse(BaseModel):
    """Chi tiết công nợ và danh sách hóa đơn của 1 đại lý."""
    customer: AgencyDebtReportItem
    invoices: List[AgencyInvoiceDetail]
