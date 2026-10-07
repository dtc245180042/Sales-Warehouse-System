import csv
import io
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Request, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro
from app.models.user import User
from app.schemas.audit_log import (
    AuditLogResponse,
    AuditLogPaginationResponse,
    AuditLogStats,
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
        description="Lọc theo loại đối tượng / Module: INVENTORY, DEBT, PRICE, INVOICE, PRODUCT, ORDER...",
    ),
    user_id: Optional[int] = Query(None, description="Lọc theo ID người thực hiện"),
    username: Optional[str] = Query(None, description="Lọc theo tên hoặc họ tên người thực hiện"),
    action: Optional[str] = Query(None, description="Lọc theo hành động"),
    entity_id: Optional[str] = Query(None, description="Lọc theo mã đối tượng"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: success, failed, warning"),
    start_date: Optional[datetime] = Query(None, description="Thời điểm bắt đầu (ISO 8601)"),
    end_date: Optional[datetime] = Query(None, description="Thời điểm kết thúc (ISO 8601)"),
    search: Optional[str] = Query(None, description="Tìm kiếm từ khóa tổng hợp"),
    sort_desc: bool = Query(True, description="Sắp xếp thời gian giảm dần (mới nhất trước)"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    API tra cứu nhật ký thao tác dành cho Quản trị viên và Quản lý.
    Thực hiện lọc và phân trang hoàn toàn trên máy chủ (Server-side) chống quá tải máy khách.
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
        status=status,
        sort_desc=sort_desc,
    )

    stats_dict = audit_service.get_audit_log_stats(db=db)
    stats_obj = AuditLogStats(**stats_dict)

    return AuditLogPaginationResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        stats=stats_obj,
    )


@router.get(
    "/stats",
    response_model=AuditLogStats,
    summary="Thống kê tổng quan số lượng nhật ký thao tác (SC212)",
)
def get_audit_log_statistics(
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Lấy số liệu thống kê: tổng số nhật ký, thành công, thất bại, cảnh báo."""
    stats_dict = audit_service.get_audit_log_stats(db=db)
    return AuditLogStats(**stats_dict)


@router.get(
    "/export",
    summary="Xuất danh sách nhật ký thao tác ra file CSV tương thích Excel (SC212)",
)
def export_audit_logs_csv(
    entity_type: Optional[str] = Query(None, description="Lọc theo Module"),
    user_id: Optional[int] = Query(None, description="Lọc theo ID người dùng"),
    username: Optional[str] = Query(None, description="Lọc theo tên người dùng"),
    action: Optional[str] = Query(None, description="Lọc theo hành động"),
    entity_id: Optional[str] = Query(None, description="Lọc theo mã đối tượng"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái"),
    start_date: Optional[datetime] = Query(None, description="Thời điểm bắt đầu"),
    end_date: Optional[datetime] = Query(None, description="Thời điểm kết thúc"),
    search: Optional[str] = Query(None, description="Từ khóa tìm kiếm"),
    limit: int = Query(10000, ge=1, le=50000, description="Giới hạn số dòng xuất"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xuất dữ liệu nhật ký kiểm toán trực tiếp từ máy chủ với UTF-8 BOM,
    tương thích hoàn hảo với Microsoft Excel mà không làm tràn bộ nhớ máy khách.
    """
    def generate_csv():
        # UTF-8 BOM cho Excel hiển thị tiếng Việt chuẩn
        yield "\ufeff"
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "Mã nhật ký",
            "Thời gian",
            "Người thực hiện",
            "Tài khoản",
            "Vai trò",
            "Hành động",
            "Module",
            "Mã đối tượng",
            "Tên đối tượng",
            "Mô tả thay đổi",
            "Trạng thái",
            "Địa chỉ IP",
            "Lý do",
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        logs = audit_service.query_audit_logs_for_export(
            db=db,
            entity_type=entity_type,
            user_id=user_id,
            username=username,
            action=action,
            entity_id=entity_id,
            start_date=start_date,
            end_date=end_date,
            search=search,
            status=status,
            limit=limit,
        )

        for log in logs:
            dt_str = log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else ""
            status_label = (
                "Thành công"
                if log.status == "success"
                else ("Thất bại" if log.status == "failed" else "Cảnh báo")
            )
            writer.writerow([
                f"LOG-{log.id:04d}",
                dt_str,
                log.user_fullname or log.username or "Hệ thống",
                log.username or "",
                log.user_role or "",
                log.action or "",
                log.entity_type or "",
                log.entity_id or "",
                log.entity_name or "",
                log.change_summary or "",
                status_label,
                log.ip_address or "",
                log.reason or "",
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    filename = f"nhat_ky_thao_tac_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
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
