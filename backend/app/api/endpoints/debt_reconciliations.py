from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, Query, Path, status, Response, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.services.debt_reconciliation_service import DebtReconciliationService
from app.schemas.debt_reconciliation import (
    DebtStatementGenerateRequest,
    CustomerConfirmRequest,
    CustomerDisputeRequest,
    DebtReconciliationStatementResponse,
    DebtReconciliationStatementSummary,
)

router = APIRouter(
    prefix="/debt-reconciliations",
    tags=["Đối Chiếu Công Nợ Đại Lý (S7-06 / SC-267)"],
)


@router.post(
    "/generate",
    response_model=DebtReconciliationStatementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tổng hợp số liệu công nợ theo kỳ để sinh biên bản đối chiếu (Subtask 10)",
)
def tao_bien_ban_doi_chieu_cong_no(
    payload: DebtStatementGenerateRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Kế toán công nợ lập biên bản đối chiếu định kỳ cho một đại lý:
    Tính toán số dư nợ đầu kỳ, tổng phát sinh tăng, tổng phát sinh giảm và số dư nợ cuối kỳ.
    Tự động liên kết các hóa đơn bán hàng và phiếu thu phát sinh trong kỳ.
    """
    if current_user and (current_user.role or "").lower() == "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản khách hàng / đại lý không có quyền tạo biên bản đối chiếu công nợ.",
        )
    return DebtReconciliationService.generate_statement(
        db=db,
        payload=payload,
        current_user=current_user,
    )


@router.get(
    "",
    response_model=List[DebtReconciliationStatementResponse],
    status_code=status.HTTP_200_OK,
    summary="Danh sách các biên bản đối chiếu công nợ",
)
def danh_sach_bien_ban_doi_chieu(
    customer_id: Optional[str] = Query(None, description="Lọc theo mã khách hàng"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái"),
    period_from: Optional[date] = Query(None, description="Từ ngày"),
    period_to: Optional[date] = Query(None, description="Đến ngày"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Truy vấn danh sách biên bản đối chiếu công nợ có bộ lọc và phân trang."""
    items, _ = DebtReconciliationService.list_statements(
        db=db,
        customer_id=customer_id,
        status_filter=status_filter,
        period_from=period_from,
        period_to=period_to,
        skip=skip,
        limit=limit,
    )
    return items


@router.get(
    "/{statement_id}",
    response_model=DebtReconciliationStatementResponse,
    status_code=status.HTTP_200_OK,
    summary="Chi tiết một biên bản đối chiếu công nợ kèm bảng kê chứng từ",
)
def chi_tiet_bien_ban_doi_chieu(
    statement_id: str = Path(..., description="Mã biên bản đối chiếu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xem đầy đủ thông tin số liệu tổng hợp và chi tiết từng dòng chứng từ của biên bản."""
    return DebtReconciliationService.get_statement(db=db, statement_id=statement_id)


@router.get(
    "/{statement_id}/pdf",
    status_code=status.HTTP_200_OK,
    summary="Xuất PDF / Bản in chuẩn biên bản đối chiếu công nợ (Subtask 12)",
)
def xuat_pdf_bien_ban_doi_chieu(
    statement_id: str = Path(..., description="Mã biên bản đối chiếu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xuất mẫu PDF/HTML chuẩn biên bản đối chiếu công nợ A4 có đầy đủ thông tin hai bên,
    kỳ đối chiếu, bảng tổng hợp 4 chỉ tiêu, bảng kê chứng từ và chữ ký xác nhận 3 bên.
    """
    html_content = DebtReconciliationService.generate_pdf_html(db=db, statement_id=statement_id)
    return Response(
        content=html_content,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": f'inline; filename="BienBanDoiChieu_{statement_id}.html"'
        },
    )


@router.put(
    "/{statement_id}/portal-confirm",
    response_model=DebtReconciliationStatementResponse,
    status_code=status.HTTP_200_OK,
    summary="Đại lý xác nhận đồng ý khớp số liệu trên cổng đại lý (Subtask 8)",
)
def dai_ly_xac_nhan_khop_so_lieu(
    payload: CustomerConfirmRequest,
    statement_id: str = Path(..., description="Mã biên bản đối chiếu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Cổng đại lý B2B: Đại lý kiểm tra số liệu công nợ và bấm xác nhận đồng ý chốt số liệu.
    Trạng thái chuyển sang CONFIRMED và lưu thời điểm xác nhận.
    """
    return DebtReconciliationService.customer_confirm(
        db=db,
        statement_id=statement_id,
        payload=payload,
        current_user=current_user,
    )


@router.put(
    "/{statement_id}/portal-dispute",
    response_model=DebtReconciliationStatementResponse,
    status_code=status.HTTP_200_OK,
    summary="Đại lý gửi phản hồi chênh lệch số liệu trên cổng đại lý (Subtask 8)",
)
def dai_ly_phan_hoi_lech_so_lieu(
    payload: CustomerDisputeRequest,
    statement_id: str = Path(..., description="Mã biên bản đối chiếu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Cổng đại lý B2B: Đại lý phản hồi phát hiện chênh lệch giữa hai bên.
    Ghi nhận số dư đại lý tự tính, chênh lệch tuyệt đối, lý do giải trình và chuyển trạng thái sang DISPUTED.
    """
    return DebtReconciliationService.customer_dispute(
        db=db,
        statement_id=statement_id,
        payload=payload,
        current_user=current_user,
    )
