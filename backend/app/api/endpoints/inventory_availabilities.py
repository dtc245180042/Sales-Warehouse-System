from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.models.stock_reservation import StockReservation
from app.schemas.inventory_reservation import (
    SkuAvailabilityResponse,
    CheckOrderAvailabilityRequest,
    CheckOrderAvailabilityResponse,
    CustomerWarehouseProfileCreate,
    CustomerWarehouseProfileResponse,
    StockReservationResponse,
)
from app.services import inventory_reservation_service

router = APIRouter(prefix="/inventory-availabilities", tags=["Quản Lý Tồn Khả Dụng & Giữ Chỗ (S4-03)"])


@router.get("", response_model=SkuAvailabilityResponse)
@router.get("/", response_model=SkuAvailabilityResponse, include_in_schema=False)
def get_sku_availability(
    customer_id: Optional[str] = Query(None, description="Mã khách hàng / đại lý để xác định kho phục vụ"),
    product_id: Optional[str] = Query(None, description="Mã ID sản phẩm (PRD-xxx hoặc id số)"),
    sku: Optional[str] = Query(None, description="Mã SKU sản phẩm"),
    warehouse_name: Optional[str] = Query(None, description="Tên kho hàng cụ thể (nếu muốn tra cứu trực tiếp kho)"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Lấy thông tin tồn khả dụng và số lượng tối đa có thể đặt cho từng SKU theo kho phục vụ đại lý (SCRUM-505, SCRUM-507).
    Công thức: Tồn khả dụng = Tồn thực tế - Tồn đang giữ chỗ (Available = Physical - Reserved)
    """
    return inventory_reservation_service.calculate_sku_availability(
        db=db,
        customer_id=customer_id,
        product_id=product_id,
        sku=sku,
        warehouse_name=warehouse_name,
    )


@router.post("/check", response_model=CheckOrderAvailabilityResponse)
def check_order_items_availability(
    req: CheckOrderAvailabilityRequest,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Kiểm tra tồn khả dụng cho toàn bộ danh sách mặt hàng dự kiến đặt (SCRUM-506, SCRUM-507).
    Chặn khi số lượng vượt tồn khả dụng và trả về số lượng tối đa còn đặt được cho từng dòng hàng.
    """
    return inventory_reservation_service.check_order_items_availability(db=db, req=req)


@router.get("/customer-warehouse/{customer_id}")
def get_customer_servicing_warehouse(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy thông tin kho phục vụ được phân công cho đại lý (SCRUM-505)."""
    wh_name, wh_code = inventory_reservation_service.get_customer_servicing_warehouse(db=db, customer_id=customer_id)
    return {
        "customer_id": customer_id,
        "warehouse_name": wh_name,
        "warehouse_code": wh_code,
    }


@router.post(
    "/customer-warehouse",
    response_model=CustomerWarehouseProfileResponse,
    status_code=status.HTTP_200_OK,
)
def assign_customer_servicing_warehouse(
    data: CustomerWarehouseProfileCreate,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Gán hoặc cập nhật kho phục vụ mặc định cho đại lý (SCRUM-505)."""
    return inventory_reservation_service.assign_customer_servicing_warehouse(db=db, data=data)


@router.get("/reservations", response_model=List[StockReservationResponse])
def get_stock_reservations(
    order_id: Optional[str] = Query(None, description="Lọc theo mã đơn hàng"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái giữ chỗ (active, fulfilled, released)"),
    warehouse: Optional[str] = Query(None, description="Lọc theo tên kho"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Tra cứu danh sách các phiếu giữ chỗ tồn kho (SCRUM-504)."""
    query = db.query(StockReservation)
    if order_id:
        query = query.filter((StockReservation.order_id == order_id) | (StockReservation.order_code == order_id))
    if status_filter:
        query = query.filter(StockReservation.status == status_filter)
    if warehouse:
        query = query.filter(StockReservation.warehouse == warehouse)

    return query.order_by(StockReservation.created_at.desc()).limit(100).all()
