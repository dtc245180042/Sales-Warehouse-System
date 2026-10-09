from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.order import (
    OrderCreate,
    OrderStatusUpdate,
    OrderResponse,
    OrderDraftUpdate,
    OrderCalculateRequest,
    OrderCalculateResponse,
    ProductSearchForOrderResponse,
)
from app.services import order_service

router = APIRouter(prefix="/orders", tags=["Đơn hàng"])


@router.post("/calculate", response_model=OrderCalculateResponse)
def calculate_order_totals(
    req: OrderCalculateRequest,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Tính tạm tính, chiết khấu và tổng tiền đơn hàng theo thời gian thực (S3-09, SCRUM-230)."""
    return order_service.calculate_order_totals(
        db=db,
        customer_id=req.customer_id,
        items=req.items,
        price_list_id=req.price_list_id,
        current_user=current_user,
    )


@router.get("/drafts", response_model=List[OrderResponse])
def get_draft_orders(
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy danh sách các đơn hàng nháp đang soạn dở (phạm vi theo Sales Rep) (S3-09, SCRUM-230)."""
    return order_service.get_draft_orders(db=db, current_user=current_user)


@router.get("/products/search", response_model=List[ProductSearchForOrderResponse])
def search_products_for_order(
    q: Optional[str] = Query(None, description="Từ khóa SKU hoặc tên sản phẩm"),
    db: Session = Depends(lay_phien_db),
):
    """Tìm kiếm sản phẩm hỗ trợ tạo đơn hàng kèm quy cách/đơn vị tính (S3-09, SCRUM-230)."""
    return order_service.search_products_for_order(db=db, query_str=q)


@router.get("", response_model=List[OrderResponse])
@router.get("/", response_model=List[OrderResponse], include_in_schema=False)
def get_orders(
    search: Optional[str] = Query(None, description="Tìm theo mã đơn, tên khách hàng hoặc SĐT"),
    status_filter: Optional[str] = Query(None, description="Lọc trạng thái: pending, confirmed, shipping, completed, cancelled"),
    customer_id: Optional[str] = Query(None, description="Lọc theo mã khách hàng"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy danh sách đơn hàng trong hệ thống (lọc phạm vi cho Sales Rep)."""
    return order_service.get_all_orders(
        db=db,
        search=search,
        status_filter=status_filter,
        customer_id=customer_id,
        current_user=current_user,
    )


@router.get("/{order_id}", response_model=OrderResponse)
def get_order_detail(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy chi tiết một đơn hàng kèm danh sách mặt hàng (kiểm tra phạm vi cho Sales Rep)."""
    return order_service.get_order_by_id(db=db, order_id=order_id, current_user=current_user)


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_new_order(
    order_in: OrderCreate,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Tạo đơn hàng mới (tự động trừ kho và cập nhật chi tiêu đối tác; chặn POS ngoài phạm vi cho Sales Rep)."""
    return order_service.create_order(db=db, order_in=order_in, current_user=current_user)


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


@router.put("/{order_id}/draft", response_model=OrderResponse)
def update_draft_order(
    order_id: str,
    draft_in: OrderDraftUpdate,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Cập nhật đơn hàng nháp đang soạn dở (S3-09, SCRUM-230)."""
    return order_service.update_draft_order(
        db=db,
        order_id=order_id,
        draft_in=draft_in,
        current_user=current_user,
    )


@router.post("/{order_id}/submit", response_model=OrderResponse)
def submit_draft_order(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Chốt đơn hàng nháp thành đơn hàng chính thức (trừ kho và tính doanh số) (S3-09, SCRUM-230)."""
    return order_service.submit_draft_order(
        db=db,
        order_id=order_id,
        current_user=current_user,
    )
