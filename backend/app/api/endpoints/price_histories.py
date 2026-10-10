from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.models.auth import User
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.schemas.product_price_history import ProductPriceHistoryListResponse
from app.services import price_history_service

router = APIRouter(tags=["Lịch sử thay đổi giá sản phẩm"])


@router.get(
    "/products/{product_id}/price-history",
    response_model=ProductPriceHistoryListResponse,
    summary="Tra cứu lịch sử thay đổi giá của một sản phẩm (S3-02 / SCRUM-424)"
)
def get_product_price_history(
    product_id: str,
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm khách hàng: TIER_1, TIER_2, RETAIL, VIP..."),
    from_date: Optional[datetime] = Query(None, description="Từ thời điểm áp dụng"),
    to_date: Optional[datetime] = Query(None, description="Đến thời điểm áp dụng"),
    page: int = Query(1, ge=1, description="Số trang (bắt đầu từ 1)"),
    limit: int = Query(20, ge=1, le=100, description="Số bản ghi trên mỗi trang"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu dòng thời gian thay đổi giá bất biến của một sản phẩm qua các thời kỳ.
    Chỉ cho phép các vai trò: Quản trị viên, Quản lý kinh doanh, Nhân viên kinh doanh, Kế toán.
    """
    return price_history_service.get_product_price_history(
        db=db,
        product_id=product_id,
        customer_group=customer_group,
        from_date=from_date,
        to_date=to_date,
        page=page,
        limit=limit,
        current_user=current_user
    )
