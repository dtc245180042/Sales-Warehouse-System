from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Header, Request, Response, status, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_dai_ly_hien_tai, lay_nguoi_dung_hien_tai
from app.models.customer import Customer
from app.models.auth import User
from app.models.customer_delivery_address import CustomerDeliveryAddress
from app.schemas.portal import (
    PortalProductPaginationResponse,
    PortalCreditResponse,
    PortalCartCalculateRequest,
    PortalCartCalculateResponse,
    PortalOrderCreateRequest,
    PortalOrderResponse,
    PortalOrderListPaginationResponse,
    PortalOrderDetailResponse,
    PortalReorderPreviewResponse,
    PortalReorderRequest,
    PortalReorderResponse,
    PortalDebtOverviewResponse,
    PortalInvoiceListResponse,
    PortalInvoiceDetailResponse,
)
from app.schemas.customer_delivery_address import DeliveryAddressResponse
from app.schemas.delivery_tracking import DeliveryTimelineResponse, DeliveryTrackingListResponse
from app.services import portal_service
from app.services.delivery_tracking_service import DeliveryTrackingService

router = APIRouter(prefix="/portal", tags=["Cổng Đại Lý Đặt Hàng (SCRUM-242)"])


@router.get("/me", summary="Lấy thông tin hồ sơ đại lý đang đăng nhập")
def get_portal_profile(
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Thông tin cơ bản của đại lý, nhóm khách hàng và tài khoản đăng nhập."""
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "customer_id": current_customer.id,
        "customer_code": current_customer.code,
        "customer_name": current_customer.name,
        "customer_phone": current_customer.phone,
        "customer_group": current_customer.customer_group or "WHOLESALE",
        "region": current_customer.region,
        "address": current_customer.address,
        "status": current_customer.status,
    }


@router.get("/credit", response_model=PortalCreditResponse, summary="Xem hạn mức và tình hình công nợ toàn vẹn")
def get_portal_credit(
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """Lấy hạn mức, dư nợ đã xuất kho, và nợ cam kết từ các đơn chờ duyệt (chống Pending Leak)."""
    return portal_service.get_portal_credit(db=db, customer=current_customer)


@router.get("/products", response_model=PortalProductPaginationResponse, summary="Danh mục sản phẩm với giá theo nhóm")
def get_portal_products(
    search: Optional[str] = Query(None, description="Tìm theo tên sản phẩm hoặc mã SKU"),
    category_id: Optional[int] = Query(None, description="Lọc theo danh mục"),
    page: int = Query(1, ge=1, description="Số trang"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """Lấy danh mục sản phẩm theo bảng giá B2B hiệu lực của nhóm đại lý.
    Sản phẩm ngoài bảng giá bị ẩn. Giá vốn và số tồn cụ thể được bảo mật.
    """
    return portal_service.get_portal_products(
        db=db,
        customer=current_customer,
        search=search,
        category_id=category_id,
        page=page,
        limit=limit,
    )


@router.get("/delivery-addresses", response_model=List[DeliveryAddressResponse], summary="Danh sách địa chỉ giao hàng của đại lý")
def get_portal_delivery_addresses(
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """Lấy danh sách các điểm nhận hàng đã đăng ký của chính đại lý này."""
    addresses = db.query(CustomerDeliveryAddress).filter(
        CustomerDeliveryAddress.customer_id == current_customer.id,
        CustomerDeliveryAddress.status == "active"
    ).order_by(CustomerDeliveryAddress.is_default.desc(), CustomerDeliveryAddress.id.asc()).all()
    return addresses


@router.post("/cart/calculate", response_model=PortalCartCalculateResponse, summary="Tính toán giá trị giỏ hàng thời gian thực")
def calculate_portal_cart(
    req: PortalCartCalculateRequest,
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """Server-side tự động tính chiết khấu sản lượng và tổng tiền giỏ hàng theo bảng giá B2B."""
    return portal_service.calculate_portal_cart(
        db=db,
        customer=current_customer,
        items=req.items,
    )


@router.post(
    "/orders",
    response_model=PortalOrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo đơn hàng từ Cổng đại lý (Chống gửi trùng & Kiểm tra công nợ)"
)
def create_portal_order(
    req: PortalOrderCreateRequest,
    request: Request,
    response: Response,
    x_idempotency_key: str = Header(..., alias="X-Idempotency-Key", description="Khóa định danh chống gửi trùng lặp đơn"),
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Đại lý tự tạo đơn đặt hàng:
    - Bắt buộc Header 'X-Idempotency-Key'
    - Đơn luôn khởi tạo ở trạng thái 'pending' (Chờ duyệt)
    - Tự động gán NVKD hoặc đánh dấu is_unassigned=True
    - Kiểm tra công nợ chống Pending Leak và kiểm tra trượt giá 409
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    result = portal_service.create_portal_order(
        db=db,
        customer=current_customer,
        data=req,
        idempotency_key=x_idempotency_key,
        client_ip=client_ip,
        user_id=current_user.id,
        username=current_user.username,
    )
    if result.pop("_is_replay", False):
        response.status_code = status.HTTP_200_OK
    return result


@router.get(
    "/orders",
    response_model=PortalOrderListPaginationResponse,
    summary="Danh sách đơn hàng của đại lý (S5-01 / SC-243)"
)
def get_portal_orders(
    status: Optional[str] = Query(None, description="Lọc theo trạng thái đơn hàng (pending, confirmed, shipping, completed, cancelled)"),
    page: int = Query(1, ge=1, description="Số trang hiển thị"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Theo dõi danh sách đơn hàng của đại lý kèm trạng thái, ngày giao dự kiến và tổng tiền.
    Áp dụng kiểm soát dữ liệu: Chỉ thấy đơn hàng của chính đại lý đăng nhập.
    """
    return portal_service.get_portal_orders(
        db=db,
        customer=current_customer,
        status_filter=status,
        page=page,
        limit=limit,
    )


@router.get(
    "/orders/{order_id}",
    response_model=PortalOrderDetailResponse,
    summary="Chi tiết đơn hàng kèm số lượng thực giao (S5-01 / SC-243)"
)
def get_portal_order_detail(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Xem chi tiết dòng hàng của đơn và số lượng thực giao trong trường hợp giao thiếu hoặc giao chưa đủ.
    Áp dụng kiểm soát dữ liệu: Từ chối nếu truy cập đơn của đại lý khác (chống IDOR).
    """
    return portal_service.get_portal_order_detail(
        db=db,
        customer=current_customer,
        order_id=order_id,
    )


@router.get(
    "/orders/{order_id}/reorder-preview",
    response_model=PortalReorderPreviewResponse,
    summary="Xem trước đơn đặt lại kèm phân loại mặt hàng ngừng kinh doanh và giá mới (S5-02 / SC-244)"
)
def get_portal_reorder_preview(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Lấy chi tiết đơn cũ để chọn lại:
    - Danh sách dòng hàng có thể đặt lại với giá hiện hành mới
    - Danh sách dòng hàng bị loại do ngừng kinh doanh
    - Cảnh báo biến động giá
    - Chống IDOR
    """
    return portal_service.get_portal_reorder_preview(
        db=db,
        customer=current_customer,
        order_id=order_id,
    )


@router.post(
    "/orders/{order_id}/reorder",
    response_model=PortalReorderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo đơn đặt lại từ đơn cũ (toàn bộ hoặc một phần) (S5-02 / SC-244)"
)
def create_portal_reorder(
    order_id: str,
    req: PortalReorderRequest,
    request: Request,
    response: Response,
    x_idempotency_key: str = Header(..., alias="X-Idempotency-Key", description="Khóa định danh chống gửi trùng lặp đơn đặt lại"),
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Tạo đơn mới dựa trên một đơn lịch sử:
    - Cho phép chọn toàn bộ hoặc một phần dòng hàng
    - Tự động bỏ các mặt hàng ngừng kinh doanh khỏi đơn mới
    - Áp lại giá theo bảng giá hiện hành của đại lý
    - Kiểm tra công nợ khả dụng
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    return portal_service.create_portal_reorder(
        db=db,
        customer=current_customer,
        order_id=order_id,
        data=req,
        idempotency_key=x_idempotency_key,
        client_ip=client_ip,
        user_id=current_user.id,
        username=current_user.username,
    )


# ==============================================================================
# THEO DÕI GIAO HÀNG ĐẠI LÝ (S6-09, SCRUM-694, SCRUM-698)
# ==============================================================================

@router.get(
    "/orders/{order_id}/timeline",
    response_model=DeliveryTimelineResponse,
    summary="Theo dõi timeline trạng thái giao hàng của đơn (S6-09 / SCRUM-694)",
)
def get_portal_order_timeline(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Theo dõi tiến trình giao hàng 5 mốc theo từng đơn dành cho Đại lý:
    - 1. Đã duyệt (APPROVED) -> 2. Đang soạn (PACKING) -> 3. Đã xuất (EXPORTED) -> 4. Đang giao (DELIVERING) -> 5. Đã giao (DELIVERED)
    - Chống IDOR: Chỉ xem đơn của chính đại lý đăng nhập.
    """
    return DeliveryTrackingService.get_delivery_timeline(
        db=db,
        order_id=order_id,
        current_customer=current_customer,
    )


@router.get(
    "/delivery-tracking",
    response_model=DeliveryTrackingListResponse,
    summary="Danh sách tiến trình giao hàng của đại lý (S6-09 / SCRUM-698)",
)
def get_portal_delivery_tracking_list(
    status: Optional[str] = Query(None, description="Lọc theo trạng thái đơn hàng"),
    page: int = Query(1, ge=1, description="Số trang hiển thị"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Theo dõi danh sách tiến trình giao hàng của riêng đại lý đăng nhập (SCRUM-698).
    Chống IDOR: Chỉ hiển thị các đơn thuộc về đại lý này.
    """
    return DeliveryTrackingService.list_delivery_trackings(
        db=db,
        status_filter=status,
        page=page,
        limit=limit,
        current_customer=current_customer,
    )


# ==============================================================================
# QUẢN LÝ CÔNG NỢ & HOÁ ĐƠN ĐẠI LÝ (S7-07, SCRUM-753, SCRUM-754, SCRUM-756)
# ==============================================================================

@router.get(
    "/debt",
    response_model=PortalDebtOverviewResponse,
    summary="Xem công nợ tổng quan và danh sách hoá đơn của chính đại lý (SCRUM-753, SCRUM-754)",
)
def get_portal_debt_overview(
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái hoá đơn (ALL, UNPAID, PARTIALLY_PAID, PAID, OVERDUE)"),
    from_date: Optional[datetime] = Query(None, description="Từ ngày phát hành"),
    to_date: Optional[datetime] = Query(None, description="Đến ngày phát hành"),
    page: int = Query(1, ge=1, description="Số trang hiển thị"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    customer_id: Optional[str] = Query(None, description="Mã đại lý cần tra cứu (chống IDOR: chỉ cho phép đại lý của mình)"),
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Xem công nợ của chính đại lý:
    - Trả về hạn mức công nợ (credit_limit), tổng nợ còn phải trả (total_debt), hạn mức còn lại (available_credit)
    - Cảnh báo nợ quá hạn (has_overdue, overdue_debt, max_debt_days)
    - Danh sách các hoá đơn phát hành kèm số tiền, hạn thanh toán, trạng thái
    - Kiểm soát truy cập: Chỉ trả dữ liệu của đại lý đang đăng nhập, chống IDOR sang đại lý khác (SCRUM-754).
    """
    if customer_id and customer_id != current_customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập dữ liệu công nợ của đại lý khác.",
        )
    return portal_service.get_portal_debt_overview(
        db=db,
        customer=current_customer,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
        page=page,
        limit=limit,
    )


@router.get(
    "/invoices",
    response_model=PortalInvoiceListResponse,
    summary="Danh sách hoá đơn bán hàng của chính đại lý (SCRUM-753, SCRUM-754)",
)
def get_portal_invoices(
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái (ALL, UNPAID, PARTIALLY_PAID, PAID, OVERDUE)"),
    from_date: Optional[datetime] = Query(None, description="Từ ngày phát hành"),
    to_date: Optional[datetime] = Query(None, description="Đến ngày phát hành"),
    page: int = Query(1, ge=1, description="Số trang hiển thị"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    customer_id: Optional[str] = Query(None, description="Mã đại lý cần tra cứu"),
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Danh sách hoá đơn bán hàng của đại lý kèm phân trang và lọc theo trạng thái.
    Kiểm soát truy cập: Đại lý chỉ xem được hoá đơn của chính mình (SCRUM-754).
    """
    if customer_id and customer_id != current_customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập dữ liệu hoá đơn của đại lý khác.",
        )
    return portal_service.get_portal_invoices(
        db=db,
        customer=current_customer,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
        page=page,
        limit=limit,
    )


@router.get(
    "/invoices/{invoice_id}",
    response_model=PortalInvoiceDetailResponse,
    summary="Tra cứu chi tiết hoá đơn đã phát hành cho đại lý (SCRUM-756, SCRUM-754)",
)
def get_portal_invoice_detail(
    invoice_id: str,
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Tra cứu chi tiết hoá đơn đã phát hành kèm các dòng sản phẩm chi tiết.
    Kiểm soát an toàn: Từ chối 403 nếu truy cập hoá đơn của đại lý khác (chống IDOR).
    """
    return portal_service.get_portal_invoice_detail(
        db=db,
        customer=current_customer,
        invoice_id=invoice_id,
    )


@router.get(
    "/invoices/{invoice_id}/download",
    summary="Tải lại file hoá đơn đã phát hành từ hệ thống (SCRUM-756, SCRUM-754)",
)
def download_portal_invoice(
    invoice_id: str,
    format: str = Query("html", description="Định dạng tải về (html)"),
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Cho phép đại lý tải lại file hoá đơn bán hàng định dạng in ấn khổ A4 từ hệ thống.
    Kiểm soát quyền truy cập: Chỉ tải được hoá đơn thuộc tài khoản đại lý hiện tại.
    """
    html_content = portal_service.render_invoice_html(
        db=db,
        customer=current_customer,
        invoice_id=invoice_id,
    )
    filename = f"HoaDon_{invoice_id}.html"
    return Response(
        content=html_content,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@router.get(
    "/invoices/{invoice_id}/print",
    response_class=HTMLResponse,
    summary="Xem trước mẫu in hoá đơn đã phát hành chuẩn A4 (SCRUM-756)",
)
def print_portal_invoice(
    invoice_id: str,
    db: Session = Depends(lay_phien_db),
    current_customer: Customer = Depends(lay_dai_ly_hien_tai),
):
    """
    Trả về trang HTML in ấn hoá đơn hoàn chỉnh chuẩn A4 để đại lý xem trước hoặc in trực tiếp.
    """
    html_content = portal_service.render_invoice_html(
        db=db,
        customer=current_customer,
        invoice_id=invoice_id,
    )
    return HTMLResponse(content=html_content, media_type="text/html; charset=utf-8")
