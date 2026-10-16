from typing import List, Optional
from datetime import datetime, date
from pydantic import BaseModel, ConfigDict, Field


class DashboardKPISummary(BaseModel):
    """6 chỉ số điều hành cốt lõi (SC-276 / S8-05)."""
    model_config = ConfigDict(from_attributes=True)

    revenue_today: int = Field(0, description="Doanh số bán hôm nay (VNĐ)")
    revenue_this_month: int = Field(0, description="Doanh số bán tháng này (VNĐ)")
    pending_approval_orders: int = Field(0, description="Số đơn hàng chờ duyệt")
    pending_dispatch_orders: int = Field(0, description="Số đơn hàng chờ xuất kho / đóng gói")
    overdue_debt_amount: int = Field(0, description="Tổng số tiền công nợ quá hạn (VNĐ)")
    low_stock_sku_count: int = Field(0, description="Số lượng SKU có tồn kho dưới định mức tối thiểu")

    # Các chỉ số bổ trợ điều hành
    total_orders_today: int = Field(0, description="Số đơn phát sinh hôm nay")
    total_orders_this_month: int = Field(0, description="Số đơn phát sinh tháng này")
    overdue_agencies_count: int = Field(0, description="Số lượng đại lý đang có nợ quá hạn")


class DailySalesPoint(BaseModel):
    """Điểm dữ liệu doanh số theo ngày trong tháng."""
    model_config = ConfigDict(from_attributes=True)

    date: str = Field(..., description="Ngày dạng YYYY-MM-DD")
    label: str = Field(..., description="Nhãn hiển thị biểu đồ DD/MM")
    sales_amount: int = Field(0, description="Doanh số bán trong ngày (VNĐ)")
    order_count: int = Field(0, description="Số lượng đơn hàng hoàn tất/phát sinh")


class RegionalSalesPoint(BaseModel):
    """Điểm dữ liệu doanh số theo khu vực địa lý."""
    model_config = ConfigDict(from_attributes=True)

    region: str = Field(..., description="Tên khu vực (Miền Bắc, Miền Nam, Miền Trung...)")
    sales_amount: int = Field(0, description="Tổng doanh số tại khu vực (VNĐ)")
    order_count: int = Field(0, description="Số đơn hàng tại khu vực")
    percentage: float = Field(0.0, description="Tỷ trọng doanh số (%)")


class OverdueAgencyItem(BaseModel):
    """Thông tin đại lý quá hạn công nợ (Sắp xếp giảm dần theo số tiền nợ)."""
    model_config = ConfigDict(from_attributes=True)

    customer_id: str = Field(..., description="Mã ID khách hàng/đại lý")
    customer_code: str = Field(..., description="Mã quản lý đại lý")
    customer_name: str = Field(..., description="Tên đại lý")
    customer_phone: Optional[str] = Field(None, description="Số điện thoại liên hệ")
    region: Optional[str] = Field(None, description="Khu vực hoạt động")
    credit_limit: int = Field(0, description="Hạn mức công nợ được cấp (VNĐ)")
    overdue_amount: int = Field(..., description="Tổng số tiền nợ quá hạn (VNĐ)")
    max_overdue_days: int = Field(0, description="Số ngày quá hạn lớn nhất")
    overdue_invoices_count: int = Field(0, description="Số lượng hóa đơn quá hạn")
    status: str = Field("active", description="Trạng thái đại lý")


class ExecutiveDashboardResponse(BaseModel):
    """Toàn bộ dữ liệu tổng hợp cho Dashboard điều hành bán hàng và kho."""
    model_config = ConfigDict(from_attributes=True)

    kpis: DashboardKPISummary
    daily_sales: List[DailySalesPoint]
    regional_sales: List[RegionalSalesPoint]
    overdue_agencies: List[OverdueAgencyItem]
    filter_period: str = Field("this_month", description="Kỳ lọc dữ liệu")
    selected_region: Optional[str] = Field(None, description="Khu vực được chọn")
    cached: bool = Field(False, description="Dữ liệu lấy từ bộ nhớ đệm cache hay không")
    execution_time_ms: float = Field(..., description="Thời gian thực thi truy vấn tính bằng mili-giây (< 2000ms)")
    generated_at: datetime = Field(..., description="Thời điểm kết xuất số liệu UTC")
