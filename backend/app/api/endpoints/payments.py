from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.payment import (
    PaymentCreateRequest,
    PaymentResponse,
)
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Phiếu thu & Đối trừ công nợ (Payments - Story S7-02)"])


@router.post(
    "",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ghi nhận thanh toán và đối trừ công nợ (S7-02)",
)
def ghi_nhan_thanh_toan(
    data: PaymentCreateRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Ghi nhận Phiếu thu tiền và đối trừ công nợ:
    - Ghi nhận đầy đủ thông tin: số tiền, hình thức thu, ngày thu, người thu (AC-1).
    - Sinh mã liên tục không nhảy cóc qua bộ đếm `payment_sequences` trong transaction (PT-YYYY-XXXXXXX).
    - Hỗ trợ đối trừ vào hóa đơn cụ thể hoặc tự động đối trừ theo nguyên tắc FIFO (AC-2).
    - Cho phép thu một phần; hóa đơn chuyển sang PARTIALLY_PAID hoặc PAID (AC-3).
    - Chặn thu vượt quá tổng công nợ còn lại (AC-4).
    - Chống gửi trùng lặp qua `client_request_id` (trùng nội dung trả bản ghi cũ, khác nội dung báo 409).
    """
    return PaymentService.create_payment(
        db=db,
        payload=data,
        current_user=current_user,
    )


@router.get(
    "",
    response_model=List[PaymentResponse],
    status_code=status.HTTP_200_OK,
    summary="Danh sách phiếu thu tiền có bộ lọc và phân quyền Customer Scope",
)
def danh_sach_phieu_thu(
    customer_id: Optional[str] = Query(None, description="Lọc theo ID khách hàng/đại lý"),
    payment_method: Optional[str] = Query(None, description="Lọc theo hình thức thu tiền (CASH, BANK_TRANSFER, CARD)"),
    from_date: Optional[datetime] = Query(None, description="Từ ngày thu"),
    to_date: Optional[datetime] = Query(None, description="Đến ngày thu"),
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(50, ge=1, le=100, description="Số bản ghi tối đa"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu danh sách phiếu thu tiền:
    - Bàn giao dữ liệu cho Trang, Thủy, Quang để tính sổ chi tiết công nợ và ráp giao diện.
    - Phân quyền Customer Scope: Đại lý chỉ xem được phiếu thu của chính mình.
    """
    items, _ = PaymentService.list_payments(
        db=db,
        current_user=current_user,
        customer_id=customer_id,
        payment_method=payment_method,
        from_date=from_date,
        to_date=to_date,
        skip=skip,
        limit=limit,
    )
    return items


@router.get(
    "/{id}",
    response_model=PaymentResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết phiếu thu tiền kèm danh sách đối trừ",
)
def chi_tiet_phieu_thu(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xem chi tiết phiếu thu kèm danh sách phân bổ đối trừ vào từng hóa đơn.
    Áp dụng kiểm tra bảo mật chống IDOR đối với vai trò Customer.
    """
    return PaymentService.get_payment_by_id(db=db, payment_id=id, current_user=current_user)


# ==============================================================================
# CHẶN SỬA VÀ XOÁ PHIẾU THU ĐÃ GHI NHẬN (AC-5)
# ==============================================================================
@router.put(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối chỉnh sửa phiếu thu đã ghi nhận (AC-5)",
)
def sua_phieu_thu_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Phiếu thu một khi đã ghi nhận không được phép chỉnh sửa. Chỉ được lập bút toán điều chỉnh.",
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối xóa phiếu thu đã ghi nhận (AC-5)",
)
def xoa_phieu_thu_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Phiếu thu một khi đã ghi nhận không được phép xóa. Chỉ được lập bút toán điều chỉnh.",
    )
