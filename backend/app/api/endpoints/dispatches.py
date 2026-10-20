from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.models.stock_dispatch import StockDispatch, StockDispatchItem
from app.models.order import Order
from app.schemas.dispatch import (
    StockDispatchCreate,
    StockDispatchResponse,
    PendingOrderResponse,
)
from app.services.dispatch_service import DispatchService

router = APIRouter(prefix="/dispatches", tags=["Quản lý Xuất kho (Stock Dispatches - S6-05)"])


@router.post(
    "",
    response_model=StockDispatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo và xác nhận Phiếu xuất kho trong một lần (S6-05)",
)
def tao_va_xac_nhan_phieu_xuat(
    data: StockDispatchCreate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tạo và xác nhận Phiếu xuất kho (Stock Dispatch):
    - Trạng thái duy nhất: CONFIRMED.
    - Trừ tồn lô nguyên tử, trừ tồn vật lý (OUT_SALE), chuyển giữ chỗ và cập nhật đơn hàng.
    - Chống bấm hai lần qua `client_request_id`.
    - Tự động gợi ý FEFO khi không truyền danh sách lô.
    - Toàn bộ quy trình nằm trong một transaction nguyên tử.
    """
    return DispatchService.create_and_confirm_dispatch(
        db=db,
        payload=data,
        current_user=current_user,
    )


@router.get(
    "/backorders",
    status_code=status.HTTP_200_OK,
    summary="Danh sách hàng nợ / cần giao bù (Backorders - S6-05)",
)
def danh_sach_no_hang(
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    items = (
        db.query(StockDispatchItem, StockDispatch)
        .join(StockDispatch, StockDispatchItem.dispatch_id == StockDispatch.id)
        .filter(StockDispatchItem.shortfall_quantity > 0)
        .all()
    )
    res = []
    for it, disp in items:
        order = db.query(Order).filter(Order.id == disp.order_id).first()
        res.append({
            "id": f"BO-{it.id}",
            "dispatch_id": disp.id,
            "order_id": disp.order_id,
            "order_code": order.code if order else disp.order_id,
            "customer_name": disp.customer_name or (order.customer_name if order else "Đại lý"),
            "product_id": it.product_id,
            "product_name": it.product_name,
            "sku": it.sku,
            "ordered_quantity": it.ordered_quantity,
            "dispatched_quantity": it.dispatched_quantity,
            "shortfall_quantity": it.shortfall_quantity,
            "status": "PENDING_RESTOCK",
            "created_at": disp.created_at.isoformat() if disp.created_at else None,
        })
    return res


@router.get(
    "/pending-orders",
    response_model=List[PendingOrderResponse],
    status_code=status.HTTP_200_OK,
    summary="Liệt kê danh sách các đơn hàng còn nợ hàng (Shortfall > 0)",
)
def danh_sach_don_con_no(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Endpoint chỉ đọc tra cứu các đơn hàng còn nợ hàng cấp đơn (AC-2).
    - Tính toán: Số lượng nợ = Số lượng đặt - Tổng đã xuất của các phiếu CONFIRMED.
    - Đơn còn nợ vẫn được tiếp tục xuất kho các đợt tiếp theo.
    """
    return DispatchService.get_pending_shortfall_orders(
        db=db,
        warehouse_id=warehouse_id,
    )


@router.get(
    "",
    response_model=List[StockDispatchResponse],
    status_code=status.HTTP_200_OK,
    summary="Danh sách phiếu xuất kho có bộ lọc và phân trang",
)
def danh_sach_phieu_xuat(
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái phiếu"),
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho hàng"),
    order_id: Optional[str] = Query(None, description="Lọc theo ID đơn hàng"),
    customer_id: Optional[str] = Query(None, description="Lọc theo ID khách hàng/đại lý"),
    is_partial: Optional[bool] = Query(None, description="Lọc theo phiếu xuất một phần"),
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(50, ge=1, le=100, description="Số bản ghi tối đa"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Truy vấn danh sách phiếu xuất kho phục vụ điều phối và bàn giao:
    - Bàn giao cho Trường: Lấy danh sách phiếu để làm Phân tuyến xe (S6-06) và Xác nhận giao (S6-08).
    - Bàn giao cho Trung: Lấy danh sách phiếu xuất để theo dõi Hàng trên đường (S6-07).
    """
    items, _ = DispatchService.list_dispatches(
        db=db,
        status_filter=status_filter,
        warehouse_id=warehouse_id,
        order_id=order_id,
        customer_id=customer_id,
        is_partial=is_partial,
        skip=skip,
        limit=limit,
    )
    return items


@router.get(
    "/{id}",
    response_model=StockDispatchResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết phiếu xuất kho kèm danh sách lô",
)
def chi_tiet_phieu_xuat(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu chi tiết phiếu xuất kho kèm đầy đủ dòng hàng và chi tiết lô đã xuất.
    """
    return DispatchService.get_dispatch_by_id(db=db, dispatch_id=id)


# ==============================================================================
# CHẶN SỬA VÀ XOÁ PHIẾU XUẤT KHO (AC-4)
# ==============================================================================
@router.put(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối chỉnh sửa phiếu xuất kho đã xác nhận",
)
def sua_phieu_xuat_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Phiếu xuất kho một khi đã xác nhận không được phép chỉnh sửa.",
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối xoá phiếu xuất kho đã xác nhận",
)
def xoa_phieu_xuat_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Phiếu xuất kho một khi đã xác nhận không được phép xóa.",
    )
