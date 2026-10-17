from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, status, HTTPException, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.models.customer import Customer
from app.schemas.invoice import (
    InvoiceCreateRequest,
    InvoiceResponse,
    InvoicePrintTemplateResponse,
)
from app.services.invoice_service import InvoiceService
from app.services.portal_service import render_invoice_html

router = APIRouter(prefix="/invoices", tags=["Hóa đơn bán hàng (Invoices - Story S7-01)"])


@router.post(
    "",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Phát hành Hóa đơn bán hàng từ phiếu xuất kho (S7-01)",
)
def phat_hanh_hoa_don(
    data: InvoiceCreateRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Phát hành Hóa đơn bán hàng:
    - Tính tiền theo số thực xuất / thực giao (AC-1).
    - Sinh mã liên tục không nhảy cóc qua bộ đếm `invoice_sequences` trong transaction (AC-2).
    - Hỗ trợ gộp nhiều phiếu xuất của cùng 1 đại lý (AC-3).
    - Ràng buộc Unique trên `dispatch_item_id`: Mỗi dòng phiếu xuất chỉ được xuất hóa đơn đúng một lần.
    - Chống gửi trùng lặp qua `client_request_id` (trùng nội dung trả bản ghi cũ, khác nội dung báo 409).
    """
    return InvoiceService.create_invoice(
        db=db,
        payload=data,
        current_user=current_user,
    )


@router.get(
    "",
    response_model=List[InvoiceResponse],
    status_code=status.HTTP_200_OK,
    summary="Danh sách hóa đơn bán hàng có bộ lọc và phân quyền Customer Scope",
)
def danh_sach_hoa_don(
    customer_id: Optional[str] = Query(None, description="Lọc theo ID khách hàng/đại lý"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái thanh toán"),
    from_date: Optional[datetime] = Query(None, description="Từ ngày phát hành"),
    to_date: Optional[datetime] = Query(None, description="Đến ngày phát hành"),
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(50, ge=1, le=100, description="Số bản ghi tối đa"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu danh sách hóa đơn:
    - Bàn giao cho Phúc (S8-06) làm Báo cáo doanh số.
    - Bàn giao cho Thủy (S8-09) làm Báo cáo công nợ.
    - Phân quyền Customer Scope: Đại lý chỉ xem được hóa đơn của chính mình.
    """
    items, _ = InvoiceService.list_invoices(
        db=db,
        current_user=current_user,
        customer_id=customer_id,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
        skip=skip,
        limit=limit,
    )
    return items


@router.get(
    "/{id}",
    response_model=InvoiceResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết hóa đơn bán hàng",
)
def chi_tiet_hoa_don(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xem chi tiết hóa đơn kèm danh sách dòng hàng và thông tin thanh toán.
    Áp dụng kiểm tra bảo mật chống IDOR đối với vai trò Customer.
    """
    return InvoiceService.get_invoice_by_id(db=db, invoice_id=id, current_user=current_user)


@router.get(
    "/{id}/print",
    response_model=InvoicePrintTemplateResponse,
    status_code=status.HTTP_200_OK,
    summary="Dữ liệu mẫu in ấn hóa đơn & xuất PDF chuẩn hóa (AC-5)",
)
def du_lieu_in_hoa_don(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Cung cấp dữ liệu định dạng chuẩn phục vụ chức năng in ấn / xuất PDF cho Thủy (S7-09).
    """
    return InvoiceService.get_print_template(db=db, invoice_id=id, current_user=current_user)


@router.get(
    "/{id}/download",
    summary="Tải lại file hoá đơn đã phát hành (SCRUM-756)",
    status_code=status.HTTP_200_OK,
)
def tai_file_hoa_don(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tải file hoá đơn đã phát hành có kiểm soát Customer Scope (chống IDOR).
    """
    invoice = InvoiceService.get_invoice_by_id(db=db, invoice_id=id, current_user=current_user)
    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
    if not customer:
        customer = Customer(id=invoice.customer_id, code=invoice.customer_id, name=invoice.customer_name or "Đại lý")
    html_content = render_invoice_html(db=db, customer=customer, invoice_id=id)
    return Response(
        content=html_content,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="HoaDon_{id}.html"'},
    )


@router.get(
    "/{id}/print-html",
    response_class=HTMLResponse,
    summary="Xem trang in hoá đơn đã phát hành chuẩn A4 (SCRUM-756)",
    status_code=status.HTTP_200_OK,
)
def xem_trang_in_hoa_don(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xem trang in hoá đơn chuẩn A4 có kiểm soát Customer Scope.
    """
    invoice = InvoiceService.get_invoice_by_id(db=db, invoice_id=id, current_user=current_user)
    customer = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
    if not customer:
        customer = Customer(id=invoice.customer_id, code=invoice.customer_id, name=invoice.customer_name or "Đại lý")
    html_content = render_invoice_html(db=db, customer=customer, invoice_id=id)
    return HTMLResponse(content=html_content, media_type="text/html; charset=utf-8")


# ==============================================================================
# CHẶN SỬA VÀ XOÁ HÓA ĐƠN ĐÃ PHÁT HÀNH (AC-4)
# ==============================================================================
@router.put(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối chỉnh sửa hóa đơn đã phát hành (AC-4)",
)
def sua_hoa_don_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Hóa đơn một khi đã phát hành không được phép chỉnh sửa. Chỉ được lập chứng từ điều chỉnh.",
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối xóa hóa đơn đã phát hành (AC-4)",
)
def xoa_hoa_don_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Hóa đơn một khi đã phát hành không được phép xóa. Chỉ được lập chứng từ điều chỉnh.",
    )
