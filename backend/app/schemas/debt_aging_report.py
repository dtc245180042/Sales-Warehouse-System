"""
Schema cho Báo cáo Công nợ Quá hạn theo Tuổi nợ (Story S8-09).

Mục tiêu: Kế toán công nợ xem được báo cáo phân tích tuổi nợ theo:
- Nhóm tuổi nợ (Current, 1-30, 31-60, 61-90, >90 ngày)
- Theo nhân viên phụ trách
- Xác định đại lý rủi ro cao nhất
- Xuất Excel
"""
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class DebtAgingBucket(BaseModel):
    """Một nhóm tuổi nợ (aging bucket) cho một đại lý."""
    bucket_label: str = Field(..., description="Nhãn nhóm tuổi nợ: 'Chưa đến hạn', '1-30 ngày', '31-60 ngày', '61-90 ngày', 'Trên 90 ngày'")
    days_min: int = Field(..., description="Số ngày quá hạn tối thiểu (0 = chưa đến hạn)")
    days_max: Optional[int] = Field(None, description="Số ngày quá hạn tối đa (None = không giới hạn)")
    invoice_count: int = Field(0, description="Số hóa đơn trong nhóm này")
    amount: int = Field(0, description="Tổng tiền còn nợ trong nhóm (VNĐ)")


class DebtAgingCustomerRow(BaseModel):
    """Một dòng đại lý trong báo cáo tuổi nợ."""
    customer_id: str
    customer_name: str
    customer_code: Optional[str] = None
    region: Optional[str] = None
    assigned_sales_rep: Optional[str] = None

    # Tổng quan
    total_invoices: int = Field(0, description="Tổng số hóa đơn chưa thanh toán đủ")
    total_debt: int = Field(0, description="Tổng dư nợ (VNĐ)")

    # Phân tích tuổi nợ
    current_amount: int = Field(0, description="Nợ chưa đến hạn (VNĐ)")
    bucket_1_30: int = Field(0, description="Nợ quá hạn 1-30 ngày (VNĐ)")
    bucket_31_60: int = Field(0, description="Nợ quá hạn 31-60 ngày (VNĐ)")
    bucket_61_90: int = Field(0, description="Nợ quá hạn 61-90 ngày (VNĐ)")
    bucket_over_90: int = Field(0, description="Nợ quá hạn trên 90 ngày (VNĐ)")

    # Chỉ số rủi ro
    overdue_total: int = Field(0, description="Tổng nợ quá hạn (VNĐ)")
    overdue_ratio: float = Field(0.0, description="Tỷ lệ nợ quá hạn / tổng nợ (0-1)")
    risk_level: str = Field("LOW", description="Mức độ rủi ro: LOW, MEDIUM, HIGH, CRITICAL")

    # Hóa đơn quá hạn lâu nhất
    oldest_overdue_days: int = Field(0, description="Số ngày quá hạn của hóa đơn cũ nhất")
    oldest_invoice_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SalesRepAgingSummary(BaseModel):
    """Tổng hợp tuổi nợ theo nhân viên phụ trách."""
    sales_rep_name: str = Field(..., description="Tên nhân viên phụ trách")
    customer_count: int = Field(0, description="Số đại lý phụ trách")
    total_debt: int = Field(0, description="Tổng dư nợ (VNĐ)")
    overdue_total: int = Field(0, description="Tổng nợ quá hạn (VNĐ)")
    current_amount: int = Field(0)
    bucket_1_30: int = Field(0)
    bucket_31_60: int = Field(0)
    bucket_61_90: int = Field(0)
    bucket_over_90: int = Field(0)
    overdue_ratio: float = Field(0.0)
    high_risk_customers: int = Field(0, description="Số đại lý mức rủi ro HIGH hoặc CRITICAL")


class AgingBucketSummary(BaseModel):
    """Tóm tắt tổng từng nhóm tuổi nợ (dòng tổng cuối bảng)."""
    bucket_label: str
    total_amount: int = Field(0, description="Tổng tiền toàn hệ thống trong nhóm (VNĐ)")
    customer_count: int = Field(0, description="Số đại lý có nợ trong nhóm")
    invoice_count: int = Field(0)
    percentage: float = Field(0.0, description="% so với tổng dư nợ")


class DebtAgingReportResponse(BaseModel):
    """Kết quả đầy đủ báo cáo Công nợ Quá hạn theo Tuổi nợ (S8-09)."""
    report_date: str = Field(..., description="Ngày lập báo cáo (dd/MM/yyyy)")

    # Tổng quan toàn hệ thống
    total_customers_with_debt: int = Field(0, description="Tổng số đại lý còn dư nợ")
    total_debt_amount: int = Field(0, description="Tổng dư nợ toàn hệ thống (VNĐ)")
    total_overdue_amount: int = Field(0, description="Tổng nợ quá hạn toàn hệ thống (VNĐ)")
    total_invoices_outstanding: int = Field(0, description="Tổng số hóa đơn chưa thanh toán đủ")

    # Tóm tắt từng nhóm tuổi nợ
    bucket_summaries: List[AgingBucketSummary] = []

    # Danh sách chi tiết từng đại lý
    customers: List[DebtAgingCustomerRow] = []

    # Top đại lý rủi ro cao nhất (max 10)
    top_risk_customers: List[DebtAgingCustomerRow] = []

    # Tổng hợp theo nhân viên phụ trách
    by_sales_rep: List[SalesRepAgingSummary] = []
