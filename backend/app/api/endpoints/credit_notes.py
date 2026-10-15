from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.credit_note import (
    CreditNoteCreateRequest,
    CreditNoteResponse,
)
from app.services.credit_note_service import CreditNoteService

router = APIRouter(prefix="/credit-notes", tags=["Chứng từ giảm nợ khi trả hàng"])


@router.post(
    "",
    response_model=CreditNoteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Lập chứng từ điều chỉnh giảm trừ công nợ khi trả hàng",
)
def lap_chung_tu_giam_no(
    data: CreditNoteCreateRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Lập chứng từ điều chỉnh giảm trừ công nợ khi trả hàng:
    - Quyền: Chỉ Kế toán (Accountant) hoặc Quản trị viên (Admin).
    - Căn cứ: Phiếu trả hàng đã được Quản lý kho xác nhận (ReturnOrder.status == CONFIRMED).
    - Ràng buộc: Mỗi phiếu trả hàng chỉ được lập duy nhất một Credit Note (chống lập trùng lặp).
    - Tính toán: Lấy theo đơn giá, chiết khấu và thuế gốc từ các dòng hàng trả về (ReturnOrderItem).
    - Đối trừ: Giảm trực tiếp số nợ còn lại trên hoá đơn gốc (Invoice.remaining_amount) và cập nhật trạng thái hoá đơn.
    - An toàn: Không sửa trực tiếp CustomerCreditProfile.current_debt, gọi hook an toàn bàn giao cho Trang.
    - Idempotent: client_request_id chống gửi 2 lần cùng một yêu cầu.
    """
    return CreditNoteService.create_credit_note(
        db=db,
        payload=data,
        current_user=current_user,
    )


@router.get(
    "",
    response_model=List[CreditNoteResponse],
    status_code=status.HTTP_200_OK,
    summary="Danh sách chứng từ giảm nợ",
)
def danh_sach_chung_tu_giam_no(
    customer_id: Optional[str] = Query(None, description="Lọc theo mã khách hàng/đại lý"),
    invoice_id: Optional[str] = Query(None, description="Lọc theo mã hoá đơn gốc"),
    return_order_id: Optional[str] = Query(None, description="Lọc theo mã phiếu trả hàng"),
    from_date: Optional[datetime] = Query(None, description="Lọc từ ngày"),
    to_date: Optional[datetime] = Query(None, description="Lọc đến ngày"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu danh sách chứng từ giảm nợ:
    - Hỗ trợ bộ lọc theo khách hàng, hoá đơn, phiếu trả hàng, khoảng thời gian.
    - Customer Scope: Nếu là tài khoản Đại lý (Customer), tự động giới hạn chỉ xem chứng từ của chính mình (chống IDOR).
    """
    items, _ = CreditNoteService.list_credit_notes(
        db=db,
        current_user=current_user,
        customer_id=customer_id,
        invoice_id=invoice_id,
        return_order_id=return_order_id,
        from_date=from_date,
        to_date=to_date,
        skip=skip,
        limit=limit,
    )
    return items


@router.get(
    "/{id}",
    response_model=CreditNoteResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết chứng từ giảm nợ",
)
def chi_tiet_chung_tu_giam_no(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xem chi tiết một chứng từ giảm nợ kèm danh sách dòng hàng điều chỉnh (chống IDOR)."""
    return CreditNoteService.get_credit_note_by_id(
        db=db,
        credit_note_id=id,
        current_user=current_user,
    )


# ==============================================================================
# CHẶN SỬA VÀ XOÁ CHỨNG TỪ GIẢM NỢ (BẤT BIẾN KẾ TOÁN)
# ==============================================================================
@router.put(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối chỉnh sửa chứng từ giảm nợ (Bất biến)",
)
def sua_chung_tu_giam_no_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Chứng từ giảm nợ là chứng từ kế toán bất biến, không hỗ trợ chỉnh sửa qua PUT.",
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối xóa chứng từ giảm nợ (Bất biến)",
)
def xoa_chung_tu_giam_no_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Chứng từ giảm nợ là chứng từ kế toán bất biến, không hỗ trợ xóa qua DELETE.",
    )
