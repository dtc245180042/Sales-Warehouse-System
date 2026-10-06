from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Request, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro
from app.models.user import User
from app.schemas.audit_log import (
    AuditLogResponse,
    AuditLogPaginationResponse,
    StockAdjustmentRequest,
    DebtLimitAdjustmentRequest,
    PriceAdjustmentRequest,
    InvoiceAdjustmentRequest,
)
from app.services import audit_service

router = APIRouter(prefix="/audit-logs", tags=["Nhật ký thao tác & Kiểm toán (SC212)"])


@router.get(
    "",
    response_model=AuditLogPaginationResponse,
    summary="Tra cứu nhật ký thao tác có phân trang và bộ lọc đa năng (SC212)",
)
def get_audit_logs(
    page: int = Query(1, ge=1, description="Số trang hiển thị"),
    page_size: int = Query(20, ge=1, le=100, description="Số bản ghi mỗi trang"),
    entity_type: Optional[str] = Query(
        None,
        description="Lọc theo loại đối tượng: INVENTORY (tồn kho), DEBT (công nợ), PRICE (giá), INVOICE (hoá đơn)",
    ),
    user_id: Optional[int] = Query(None, description="Lọc theo ID người thực hiện"),
    username: Optional[str] = Query(None, description="Lọc theo tên tài khoản"),
    action: Optional[str] = Query(None, description="Lọc theo hành động"),
    entity_id: Optional[str] = Query(None, description="Lọc theo mã đối tượng"),
    start_date: Optional[datetime] = Query(None, description="Thời điểm bắt đầu (ISO 8601)"),
    end_date: Optional[datetime] = Query(None, description="Thời điểm kết thúc (ISO 8601)"),
    search: Optional[str] = Query(None, description="Tìm kiếm từ khóa tổng hợp"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    API tra cứu nhật ký thao tác dành cho Quản trị viên và Quản lý.
    Cho phép lọc theo người dùng, loại đối tượng, khoảng thời gian và phân trang.
    """
    items, total, total_pages = audit_service.get_audit_logs(
        db=db,
        page=page,
        page_size=page_size,
        entity_type=entity_type,
        user_id=user_id,
        username=username,
        action=action,
        entity_id=entity_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )

    return AuditLogPaginationResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/{log_id}",
    response_model=AuditLogResponse,
    summary="Xem chi tiết một bản ghi nhật ký thao tác (SC212)",
)
def get_audit_log_detail(
    log_id: int,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xem chi tiết snapshot giá trị trước và sau của một thao tác cụ thể."""
    log_entry = audit_service.get_audit_log_by_id(db=db, log_id=log_id)
    if not log_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy bản ghi nhật ký có ID '{log_id}'.",
        )
    return log_entry


@router.post(
    "/stock-adjustment",
    response_model=AuditLogResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Điều chỉnh tồn kho khi kiểm kê lệch và tự động ghi nhật ký (SC212)",
)
def adjust_inventory_stock(
    req: StockAdjustmentRequest,
    request: Request,
    current_user: User = Depends(
        yeu_cau_vai_tro("Admin", "WH Manager", "Warehouse", "Sales Manager")
    ),
    db: Session = Depends(lay_phien_db),
):
    """
    Thực hiện điều chỉnh tồn kho cho sản phẩm khi kiểm kê phát hiện lệch số liệu.
    Hệ thống sẽ cập nhật tồn kho thực tế, tạo thẻ kho điều chỉnh và ghi lại snapshot trước/sau vào Audit Log.
    """
    client_ip = request.client.host if request.client else None
    _, audit_entry = audit_service.adjust_inventory_stock(
        db=db,
        product_id=req.product_id,
        actual_stock=req.actual_stock,
        reason=req.reason,
        warehouse=req.warehouse or "Kho Tổng",
        user_id=current_user.id,
        username=current_user.username,
        user_fullname=current_user.full_name,
        user_role=current_user.role,
        ip_address=client_ip,
    )
    return audit_entry


@router.post(
    "/debt-limit-adjustment",
    response_model=AuditLogResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Điều chỉnh hạn mức công nợ khách hàng và tự động ghi nhật ký (SC212)",
)
def adjust_customer_debt_limit(
    req: DebtLimitAdjustmentRequest,
    request: Request,
    current_user: User = Depends(
        yeu_cau_vai_tro("Admin", "Sales Manager", "Accountant")
    ),
    db: Session = Depends(lay_phien_db),
):
    """
    Thực hiện điều chỉnh hạn mức công nợ cho khách hàng / đại lý.
    Hệ thống sẽ cập nhật hồ sơ công nợ và ghi lại snapshot trước/sau vào Audit Log.
    """
    client_ip = request.client.host if request.client else None
    _, audit_entry = audit_service.adjust_customer_debt_limit(
        db=db,
        customer_id=req.customer_id,
        new_credit_limit=req.new_credit_limit,
        reason=req.reason,
        user_id=current_user.id,
        username=current_user.username,
        user_fullname=current_user.full_name,
        user_role=current_user.role,
        ip_address=client_ip,
    )
    return audit_entry


@router.post(
    "/price-adjustment",
    response_model=AuditLogResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ghi nhận thay đổi giá bán / giá sản phẩm vào nhật ký (SC212)",
)
def adjust_price(
    req: PriceAdjustmentRequest,
    request: Request,
    current_user: User = Depends(
        yeu_cau_vai_tro("Admin", "Sales Manager")
    ),
    db: Session = Depends(lay_phien_db),
):
    """Ghi vết điều chỉnh giá bán hoặc giá sàn."""
    client_ip = request.client.host if request.client else None
    return audit_service.adjust_price(
        db=db,
        entity_id=req.entity_id,
        entity_name=req.entity_name,
        old_price=req.old_price,
        new_price=req.new_price,
        reason=req.reason,
        user_id=current_user.id,
        username=current_user.username,
        user_fullname=current_user.full_name,
        user_role=current_user.role,
        ip_address=client_ip,
    )


@router.post(
    "/invoice-adjustment",
    response_model=AuditLogResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ghi nhận điều chỉnh trạng thái hoá đơn / đơn hàng vào nhật ký (SC212)",
)
def adjust_invoice_status(
    req: InvoiceAdjustmentRequest,
    request: Request,
    current_user: User = Depends(
        yeu_cau_vai_tro("Admin", "Sales Manager", "Accountant")
    ),
    db: Session = Depends(lay_phien_db),
):
    """Ghi vết thay đổi trạng thái hoá đơn (hủy hoá đơn, hoàn tiền, thanh toán)."""
    client_ip = request.client.host if request.client else None
    return audit_service.adjust_invoice_status(
        db=db,
        order_id=req.order_id,
        old_status=req.old_status,
        new_status=req.new_status,
        reason=req.reason,
        user_id=current_user.id,
        username=current_user.username,
        user_fullname=current_user.full_name,
        user_role=current_user.role,
        ip_address=client_ip,
    )
