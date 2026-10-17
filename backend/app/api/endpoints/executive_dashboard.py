from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.services.executive_dashboard_service import ExecutiveDashboardService
from app.schemas.executive_dashboard import (
    DashboardKPISummary,
    DailySalesPoint,
    RegionalSalesPoint,
    OverdueAgencyItem,
    ExecutiveDashboardResponse,
)

router = APIRouter(
    prefix="/executive-dashboard",
    tags=["Dashboard Điều Hành Bán Hàng & Kho (S8-05 / SC-276)"],
)


@router.get(
    "",
    response_model=ExecutiveDashboardResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy toàn bộ số liệu Dashboard điều hành bán hàng và kho (S8-05)",
)
def lay_du_lieu_dashboard_dieu_hanh(
    period: str = Query("this_month", description="Kỳ lọc: this_month, last_month, today, custom"),
    custom_start: Optional[date] = Query(None, description="Từ ngày (nếu period=custom)"),
    custom_end: Optional[date] = Query(None, description="Đến ngày (nếu period=custom)"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực địa lý"),
    refresh: bool = Query(False, description="Làm mới trực tiếp, bỏ qua cache"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Cung cấp toàn bộ số liệu điều hành cho Quản lý kinh doanh (Sales Manager) và Ban Giám đốc:
    - 6 Thẻ chỉ số tổng hợp (doanh số hôm nay/tháng này, đơn chờ duyệt, đơn chờ xuất, nợ quá hạn, SKU dưới tồn).
    - Biểu đồ doanh số theo ngày trong tháng.
    - Biểu đồ phân bổ doanh số theo khu vực.
    - Danh sách đại lý nợ quá hạn sắp xếp giảm dần theo số tiền nợ.
    - Tối ưu tải nhanh dưới 2 giây với cơ chế TTL In-Memory Cache.
    """
    return ExecutiveDashboardService.get_dashboard_data(
        db=db,
        period_type=period,
        custom_start=custom_start,
        custom_end=custom_end,
        region=region,
        refresh=refresh,
    )


@router.get(
    "/kpis",
    response_model=DashboardKPISummary,
    status_code=status.HTTP_200_OK,
    summary="Chỉ lấy 6 thẻ chỉ số KPI điều hành cốt lõi",
)
def lay_the_chi_so_kpi(
    period: str = Query("this_month"),
    custom_start: Optional[date] = None,
    custom_end: Optional[date] = None,
    region: Optional[str] = None,
    refresh: bool = False,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Truy xuất nhanh 6 thẻ chỉ số KPI bán hàng & kho."""
    dash = ExecutiveDashboardService.get_dashboard_data(
        db=db,
        period_type=period,
        custom_start=custom_start,
        custom_end=custom_end,
        region=region,
        refresh=refresh,
    )
    return dash.kpis


@router.get(
    "/overdue-agencies",
    response_model=List[OverdueAgencyItem],
    status_code=status.HTTP_200_OK,
    summary="Danh sách đại lý quá hạn công nợ xếp theo số tiền nợ (Subtask 12)",
)
def lay_danh_sach_dai_ly_qua_han(
    region: Optional[str] = Query(None, description="Lọc theo khu vực đại lý"),
    refresh: bool = False,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Trả về danh sách đại lý có nợ quá hạn, sắp xếp giảm dần theo số tiền nợ.
    Hiển thị thông tin mã, tên, khu vực, hạn mức tín dụng, số ngày quá hạn lớn nhất, số hóa đơn quá hạn.
    """
    dash = ExecutiveDashboardService.get_dashboard_data(
        db=db,
        period_type="this_month",
        region=region,
        refresh=refresh,
    )
    return dash.overdue_agencies


@router.get(
    "/daily-sales",
    response_model=List[DailySalesPoint],
    status_code=status.HTTP_200_OK,
    summary="Số liệu biểu đồ doanh số theo ngày trong tháng (Subtask 16)",
)
def lay_bieu_do_doanh_so_ngay(
    period: str = Query("this_month"),
    custom_start: Optional[date] = None,
    custom_end: Optional[date] = None,
    region: Optional[str] = None,
    refresh: bool = False,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Truy xuất chuỗi thời gian doanh số theo từng ngày trong tháng để vẽ biểu đồ."""
    dash = ExecutiveDashboardService.get_dashboard_data(
        db=db,
        period_type=period,
        custom_start=custom_start,
        custom_end=custom_end,
        region=region,
        refresh=refresh,
    )
    return dash.daily_sales


@router.get(
    "/regional-sales",
    response_model=List[RegionalSalesPoint],
    status_code=status.HTTP_200_OK,
    summary="Số liệu biểu đồ doanh số theo khu vực (Subtask 16)",
)
def lay_bieu_do_doanh_so_khu_vuc(
    period: str = Query("this_month"),
    custom_start: Optional[date] = None,
    custom_end: Optional[date] = None,
    refresh: bool = False,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Truy xuất cơ cấu doanh số và tỷ trọng phân bổ theo từng khu vực địa lý."""
    dash = ExecutiveDashboardService.get_dashboard_data(
        db=db,
        period_type=period,
        custom_start=custom_start,
        custom_end=custom_end,
        refresh=refresh,
    )
    return dash.regional_sales


@router.post(
    "/clear-cache",
    status_code=status.HTTP_200_OK,
    summary="Làm sạch bộ nhớ đệm cache dashboard",
)
def lam_sach_cache_dashboard(
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Xóa sạch cache in-memory của dashboard điều hành."""
    ExecutiveDashboardService.clear_cache()
    return {"message": "Đã làm sạch bộ nhớ đệm cache dashboard điều hành."}
