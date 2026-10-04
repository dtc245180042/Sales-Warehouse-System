from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.schemas.order import OrderCreate, OrderStatusUpdate, OrderResponse
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["Đơn hàng"])


@router.get("", response_model=List[OrderResponse])
@router.get("/", response_model=List[OrderResponse], include_in_schema=False)
def get_orders(
    search: Optional[str] = Query(None, description="Tìm theo mã đơn, tên khách hàng hoặc SĐT"),
    status_filter: Optional[str] = Query(None, description="Lọc trạng thái: pending, confirmed, shipping, completed, cancelled"),
    customer_id: Optional[str] = Query(None, description="Lọc theo mã khách hàng"),
    db: Session = Depends(lay_phien_db),
):
    """Lấy danh sách đơn hàng trong hệ thống."""
    return order_service.get_all_orders(
        db=db,
        search=search,
        status_filter=status_filter,
        customer_id=customer_id,
    )


@router.get("/{order_id}", response_model=OrderResponse)
def get_order_detail(
    order_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Lấy chi tiết một đơn hàng kèm danh sách mặt hàng."""
    return order_service.get_order_by_id(db=db, order_id=order_id)


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_new_order(
    order_in: OrderCreate,
    db: Session = Depends(lay_phien_db),
):
    """Tạo đơn hàng mới (tự động trừ kho và cập nhật chi tiêu đối tác)."""
    return order_service.create_order(db=db, order_in=order_in)


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: str,
    status_in: OrderStatusUpdate,
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật trạng thái đơn hàng (tự động hoàn kho nếu hủy đơn)."""
    return order_service.update_order_status(db=db, order_id=order_id, new_status=status_in.status)


@router.post("/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Hủy đơn hàng và hoàn lại số lượng tồn kho sản phẩm."""
    return order_service.cancel_order(db=db, order_id=order_id)
