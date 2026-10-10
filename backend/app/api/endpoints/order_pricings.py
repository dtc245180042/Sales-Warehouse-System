from typing import Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.pricing import (
    LinePricingLookupRequest,
    LinePricingLookupResponse,
    OrderPricingValidateRequest,
    OrderPricingValidateResponse,
)
from app.services import order_pricing_service

router = APIRouter(prefix="/order-pricings", tags=["Order Pricings & Auto Pricing (SCRUM-488..SCRUM-495)"])


@router.post(
    "/lookup-line",
    response_model=LinePricingLookupResponse,
    summary="API tra cứu giá áp dụng, giá sàn và chiết khấu cho một dòng hàng (SCRUM-488..SCRUM-492)"
)
def lookup_line_pricing(
    req: LinePricingLookupRequest,
    strict_block: bool = Query(True, description="Chặn (400) nếu SKU không có bảng giá hiệu lực"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Tra cứu giá bán mặc định theo nhóm khách hàng và SKU khi thêm dòng hàng (SCRUM-489):
    - Lấy đơn giá và giá sàn từ bảng giá đang hiệu lực của nhóm khách hàng mà đại lý thuộc về.
    - Tính lại chiết khấu theo sản lượng khi số lượng thay đổi (SCRUM-491).
    - Kiểm tra giá sàn khi người dùng sửa giá thủ công và gắn cờ cần duyệt (SCRUM-490).
    - Chặn thêm dòng hàng khi SKU không có bảng giá hiệu lực và trả thông báo lỗi (SCRUM-492).
    """
    return order_pricing_service.lookup_line_pricing(
        db=db,
        customer_id=req.customer_id,
        product_id=req.product_id,
        sku=req.sku,
        quantity=req.quantity,
        custom_price=req.custom_price,
        strict_block=strict_block,
    )


@router.get(
    "/lookup-line",
    response_model=LinePricingLookupResponse,
    summary="Tra cứu giá một dòng hàng qua Query params (GET tiện lợi cho Frontend)"
)
def lookup_line_pricing_get(
    customer_id: str = Query(..., description="ID hoặc Mã khách hàng"),
    product_id: Optional[str] = Query(None, description="ID sản phẩm"),
    sku: Optional[str] = Query(None, description="Mã SKU sản phẩm"),
    quantity: int = Query(1, ge=1, description="Số lượng đặt mua"),
    custom_price: Optional[float] = Query(None, ge=0, description="Giá sửa thủ công"),
    strict_block: bool = Query(False, description="Chặn (400) nếu không có bảng giá"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Tra cứu giá áp dụng và chiết khấu cho một sản phẩm theo phương thức GET."""
    return order_pricing_service.lookup_line_pricing(
        db=db,
        customer_id=customer_id,
        product_id=product_id,
        sku=sku,
        quantity=quantity,
        custom_price=custom_price,
        strict_block=strict_block,
    )


@router.post(
    "/validate-cart",
    response_model=OrderPricingValidateResponse,
    summary="Kiểm tra bảng giá, giá sàn và chiết khấu cho toàn bộ giỏ hàng/đơn hàng"
)
def validate_order_cart(
    req: OrderPricingValidateRequest,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Kiểm tra toàn bộ các dòng hàng trong đơn trước khi tạo đơn hoặc lưu nháp."""
    return order_pricing_service.validate_order_cart(
        db=db,
        customer_id=req.customer_id,
        items=req.items,
        price_list_id=req.price_list_id,
    )


@router.get(
    "/effective-price-list/{customer_id}",
    summary="Lấy thông tin bảng giá đang hiệu lực của khách hàng/đại lý"
)
def get_effective_price_list(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy thông tin bảng giá đang hiệu lực theo nhóm của khách hàng."""
    cust, active_pl = order_pricing_service.get_effective_price_list_for_customer(db, customer_id)
    group_label = order_pricing_service.GROUP_LABELS.get(cust.customer_group, cust.customer_group)
    if not active_pl:
        return {
            "has_effective_price_list": False,
            "customer_id": cust.id,
            "customer_name": cust.name,
            "customer_group": cust.customer_group,
            "customer_group_label": group_label,
            "price_list": None,
            "message": f"Không có bảng giá nào đang hiệu lực cho nhóm '{group_label}'."
        }
    return {
        "has_effective_price_list": True,
        "customer_id": cust.id,
        "customer_name": cust.name,
        "customer_group": cust.customer_group,
        "customer_group_label": group_label,
        "price_list": {
            "id": active_pl.id,
            "code": active_pl.code,
            "name": active_pl.name,
            "customer_group": active_pl.customer_group,
            "valid_from": active_pl.valid_from,
            "valid_to": active_pl.valid_to,
            "total_items": len(active_pl.items),
        }
    }
