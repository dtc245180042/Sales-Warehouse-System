"""
API Endpoints cho Sổ chi tiết công nợ đại lý (Story S8-10, SCRUM-843 -> SCRUM-849).
Tuân thủ chuẩn RESTful URL: /api/v1/customer-debt-ledgers.
Tự động nạp qua cơ chế Auto-Discovery của AGENTS.md.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, Response, status, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User, UserRole
from app.schemas.customer_debt_ledger import (
    CustomerDebtLedgerResponse,
    CustomerDebtLedgerOverviewResponse,
)
from app.services.customer_debt_ledger_service import (
    get_customer_debt_ledger,
    export_customer_debt_ledger_excel,
    export_customer_debt_ledger_pdf,
    generate_customer_debt_ledger_html,
    get_all_customers_debt_ledger_overview,
)

router = APIRouter(prefix="/customer-debt-ledgers", tags=["Customer Debt Ledgers (S8-10)"])


def _kiem_tra_quyen_truy_cap_customer(current_user: User, customer_id_or_code: str):
    """
    Chặn tấn công IDOR:
    Nếu tài khoản là Customer (Đại lý), chỉ được phép truy cập sổ công nợ của chính đại lý mình.
    """
    user_role = (current_user.role or "").strip().lower()
    if user_role == UserRole.CUSTOMER.value.lower() or user_role == "customer":
        user_cust_id = getattr(current_user, "customer_id", None)
        if not user_cust_id or (user_cust_id != customer_id_or_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập sổ công nợ của đại lý khác."
            )


@router.get(
    "",
    response_model=CustomerDebtLedgerOverviewResponse,
    summary="Danh sách tổng quan công nợ các đại lý",
    status_code=status.HTTP_200_OK,
)
def lay_danh_sach_tong_quan_cong_no(
    search: Optional[str] = Query(None, description="Tìm kiếm theo tên đại lý, mã hoặc số điện thoại"),
    from_date: Optional[str] = Query(None, description="Lọc từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Lọc đến ngày (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Số trang"),
    page_size: int = Query(50, ge=1, le=200, description="Số bản ghi trên trang"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Trả về bảng tổng quan công nợ của tất cả các đại lý trong hệ thống,
    phục vụ Kế toán công nợ theo dõi nhanh dư nợ đầu kỳ, phát sinh tăng/giảm và dư nợ cuối kỳ.
    """
    return get_all_customers_debt_ledger_overview(
        db=db,
        search=search,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{customer_id}",
    response_model=CustomerDebtLedgerResponse,
    summary="Xem sổ chi tiết công nợ của đại lý kèm số dư luỹ kế (SCRUM-844, SCRUM-845)",
    status_code=status.HTTP_200_OK,
)
def lay_so_chi_tiet_cong_no_dai_ly(
    customer_id: str,
    from_date: Optional[str] = Query(None, description="Lọc từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Lọc đến ngày (YYYY-MM-DD)"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Trả về sổ chi tiết công nợ hoàn chỉnh của 1 đại lý theo trình tự thời gian tăng dần:
    - Hồ sơ đại lý và hạn mức tín dụng được cấp.
    - Số dư nợ đầu kỳ (tích lũy từ tất cả giao dịch trước from_date).
    - Các dòng phát sinh tăng (hóa đơn bán hàng) và phát sinh giảm (phiếu thu, chứng từ giảm nợ).
    - Số dư nợ luỹ kế (running balance) tự động tính toán sau từng giao dịch.
    - Tổng phát sinh trong kỳ và số dư nợ cuối kỳ.
    """
    _kiem_tra_quyen_truy_cap_customer(current_user, customer_id)
    return get_customer_debt_ledger(
        db=db,
        customer_id_or_code=customer_id,
        from_date=from_date,
        to_date=to_date,
    )


@router.get(
    "/{customer_id}/export-excel",
    summary="Xuất Excel sổ chi tiết công nợ của đại lý (SCRUM-847)",
    status_code=status.HTTP_200_OK,
)
def xuat_excel_so_chi_tiet_cong_no(
    customer_id: str,
    from_date: Optional[str] = Query(None, description="Lọc từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Lọc đến ngày (YYYY-MM-DD)"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Xuất file Excel (.xlsx) chuẩn biểu mẫu kế toán Việt Nam (Mẫu S31-DN - TT 200/2014/TT-BTC)
    có đầy đủ công thức, định dạng số tiền, kẻ khung viền và chữ ký đối chiếu 2 bên.
    """
    _kiem_tra_quyen_truy_cap_customer(current_user, customer_id)
    excel_bytes = export_customer_debt_ledger_excel(
        db=db,
        customer_id_or_code=customer_id,
        from_date=from_date,
        to_date=to_date,
    )
    filename = f"so_chi_tiet_cong_no_{customer_id}"
    if from_date and to_date:
        filename += f"_{from_date}_{to_date}"
    filename += ".xlsx"

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get(
    "/{customer_id}/export-pdf",
    summary="Xuất PDF sổ chi tiết công nợ của đại lý (SCRUM-846)",
    status_code=status.HTTP_200_OK,
)
def xuat_pdf_so_chi_tiet_cong_no(
    customer_id: str,
    from_date: Optional[str] = Query(None, description="Lọc từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Lọc đến ngày (YYYY-MM-DD)"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Xuất file PDF chuẩn vector A4 Landscape với font tiếng Việt sắc nét,
    phục vụ gửi file đối chiếu số dư công nợ trực tiếp cho đại lý qua email hoặc in ấn.
    """
    _kiem_tra_quyen_truy_cap_customer(current_user, customer_id)
    pdf_bytes = export_customer_debt_ledger_pdf(
        db=db,
        customer_id_or_code=customer_id,
        from_date=from_date,
        to_date=to_date,
    )
    filename = f"so_chi_tiet_cong_no_{customer_id}"
    if from_date and to_date:
        filename += f"_{from_date}_{to_date}"
    filename += ".pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get(
    "/{customer_id}/print-html",
    response_class=HTMLResponse,
    summary="Xuất bản in HTML Sổ chi tiết công nợ chuẩn A4 Offline-First",
    status_code=status.HTTP_200_OK,
)
def xuat_trang_in_so_chi_tiet_cong_no(
    customer_id: str,
    from_date: Optional[str] = Query(None, description="Lọc từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Lọc đến ngày (YYYY-MM-DD)"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Trả về trang HTML hoàn chỉnh có định dạng @media print chuẩn A4 Landscape,
    hỗ trợ in ấn và xem trước tức thì qua trình duyệt mà không cần cài thêm phần mềm.
    """
    _kiem_tra_quyen_truy_cap_customer(current_user, customer_id)
    html_content = generate_customer_debt_ledger_html(
        db=db,
        customer_id_or_code=customer_id,
        from_date=from_date,
        to_date=to_date,
    )
    return HTMLResponse(content=html_content, media_type="text/html; charset=utf-8")
