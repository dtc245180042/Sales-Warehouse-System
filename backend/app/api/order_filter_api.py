from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.order_filter_service import filter_orders_service

router = APIRouter(prefix="/orders", tags=["Order Filter"])

@router.get("/search")
def search_orders(
    status: Optional[str] = Query(None, description="Lọc theo trạng thái"),
    customer_id: Optional[str] = Query(None, description="Lọc theo đại lý/khách hàng"),
    staff_id: Optional[str] = Query(None, description="Lọc theo nhân viên kinh doanh"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực"),
    start_date: Optional[datetime] = Query(None, description="Từ ngày"),
    end_date: Optional[datetime] = Query(None, description="Đến ngày"),
    user_role: Optional[str] = Query("MANAGER", description="Vai trò: SALES_STAFF hoặc MANAGER"),
    current_staff_id: Optional[str] = Query(None, description="Mã nhân viên hiện tại"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    API danh sách đơn hàng kèm bộ lọc, phân quyền & tổng doanh thu (SCRUM-606, SCRUM-608, SCRUM-609, SCRUM-610)
    """
    return filter_orders_service(
        db=db,
        status=status,
        customer_id=customer_id,
        staff_id=staff_id,
        region=region,
        start_date=start_date,
        end_date=end_date,
        current_user_role=user_role,
        current_user_staff_id=current_staff_id,
        page=page,
        page_size=page_size
    )