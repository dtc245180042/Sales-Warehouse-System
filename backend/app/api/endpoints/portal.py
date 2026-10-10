from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Header, Request, Response, status
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
)
from app.schemas.customer_delivery_address import DeliveryAddressResponse
from app.services import portal_service

router = APIRouter(prefix="/portal", tags=["Cổng Đại Lý Đặt Hàng (SCRUM-242 / S4-10)"])


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
