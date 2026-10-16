from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.agency_debt_report import (
    AgencyDebtReportResponse,
    AgencyDebtDetailResponse,
)
from app.services.agency_debt_service import AgencyDebtService

router = APIRouter(
    prefix="/agency-debt-reports",
    tags=["Sổ công nợ theo đại lý & Phân tích tuổi nợ (Story S7-03)"],
)


@router.get(
    "",
    response_model=AgencyDebtReportResponse,
    status_code=status.HTTP_200_OK,
    summary="Báo cáo sổ công nợ theo đại lý với phân tích tuổi nợ và tổng hợp chân bảng (S7-03)",
)
def lay_bao_cao_so_cong_no_dai_ly(
    as_of_date: Optional[date] = Query(None, description="Ngày chốt công nợ (mặc định là hôm nay)"),
    search: Optional[str] = Query(None, description="Tìm nhanh theo mã đại lý, tên hoặc SĐT"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực địa lý"),
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm khách hàng/đại lý"),
    assigned_sales_rep: Optional[str] = Query(None, description="Lọc theo nhân viên kinh doanh phụ trách"),
    only_overdue: bool = Query(False, description="Lọc riêng nhóm đại lý có nợ quá hạn (AC-2)"),
    aging_group: Optional[str] = Query(None, description="Lọc theo nhóm tuổi nợ cụ thể: 0_30, 31_60, 61_90, over_90"),
    has_debt_only: bool = Query(True, description="Chỉ hiển thị đại lý có phát sinh công nợ hoặc còn nợ"),
    page: int = Query(1, ge=1, description="Số trang"),
    limit: int = Query(50, ge=1, le=1000, description="Kích thước trang"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Truy xuất Sổ công nợ theo đại lý kèm phân tích tuổi nợ:
    - SCRUM-717: Tính toán các nhóm tuổi nợ 0-30, 31-60, 61-90, >90 ngày và xác định nợ quá hạn theo due_date.
    - SCRUM-718: Tổng hợp các chỉ tiêu phải thu, đã thu, còn nợ theo từng đại lý.
    - SCRUM-719: Bộ lọc linh hoạt & tối ưu truy vấn Zero N+1.
    - SCRUM-721: Trả về dòng tổng cộng `summary` khớp chính xác 100% để hiển thị ở chân bảng.
    - Phân quyền Customer Scope: Tài khoản đại lý chỉ xem được dữ liệu nợ của chính mình.
    """
    return AgencyDebtService.get_agency_debt_report(
        db=db,
        current_user=current_user,
        as_of_date=as_of_date,
        search=search,
        region=region,
        customer_group=customer_group,
        assigned_sales_rep=assigned_sales_rep,
        only_overdue=only_overdue,
        aging_group=aging_group,
        has_debt_only=has_debt_only,
        page=page,
        limit=limit,
    )


@router.get(
    "/export-excel",
    status_code=status.HTTP_200_OK,
    summary="Xuất báo cáo sổ công nợ theo đại lý ra file Excel chuẩn kế toán (SCRUM-722)",
)
def xuat_excel_so_cong_no_dai_ly(
    as_of_date: Optional[date] = Query(None, description="Ngày chốt công nợ"),
    search: Optional[str] = Query(None, description="Tìm nhanh theo mã đại lý, tên hoặc SĐT"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực địa lý"),
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm khách hàng/đại lý"),
    assigned_sales_rep: Optional[str] = Query(None, description="Lọc theo NVKD phụ trách"),
    only_overdue: bool = Query(False, description="Chỉ xuất đại lý có nợ quá hạn"),
    aging_group: Optional[str] = Query(None, description="Lọc theo nhóm tuổi nợ: 0_30, 31_60, 61_90, over_90"),
    has_debt_only: bool = Query(True, description="Chỉ xuất đại lý có phát sinh công nợ"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xuất báo cáo sổ công nợ ra định dạng Excel (.xlsx):
    - Đầy đủ tiêu đề, ngày lập, người lập và bộ lọc áp dụng.
    - Các cột phân tích tuổi nợ 0-30, 31-60, 61-90, >90 ngày.
    - Định dạng số tiền VNĐ `#,#0` chuẩn kế toán.
    - Dòng TỔNG CỘNG ở chân bảng highlight nổi bật tính tổng các cột.
    """
    excel_stream = AgencyDebtService.export_agency_debt_excel(
        db=db,
        current_user=current_user,
        as_of_date=as_of_date,
        search=search,
        region=region,
        customer_group=customer_group,
        assigned_sales_rep=assigned_sales_rep,
        only_overdue=only_overdue,
        aging_group=aging_group,
        has_debt_only=has_debt_only,
    )

    filename_date = (as_of_date or date.today()).strftime("%Y%m%d")
    filename = f"so_cong_no_theo_dai_ly_{filename_date}.xlsx"

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get(
    "/{customer_id}/invoices",
    response_model=AgencyDebtDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Chi tiết các hóa đơn và tuổi nợ của một đại lý cụ thể (Drill-down)",
)
def chi_tiet_hoa_don_cong_no_dai_ly(
    customer_id: str,
    as_of_date: Optional[date] = Query(None, description="Ngày chốt công nợ"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Truy xuất danh sách chi tiết các hóa đơn phát sinh công nợ của 1 đại lý:
    - Danh sách các hóa đơn, ngày phát hành, hạn thanh toán.
    - Tuổi nợ của từng hóa đơn và số ngày quá hạn.
    - Phân quyền IDOR: Đại lý chỉ được xem hóa đơn của chính mình.
    """
    return AgencyDebtService.get_agency_invoices_detail(
        db=db,
        customer_id=customer_id,
        current_user=current_user,
        as_of_date=as_of_date,
    )
