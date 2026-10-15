from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.lot import (
    LotStatus,
    ProductLotCreate,
    ProductLotResponse,
    ProductLotListResponse,
    LotExpiryWarningResponse,
    LotDispatchCheckRequest,
    LotDispatchCheckResponse,
    LotTrackingToggleRequest,
)
from app.services.lot_service import LotService

router = APIRouter(prefix="/lots", tags=["Quản lý Lô & Hạn sử dụng (S6-01)"])


@router.post(
    "",
    response_model=ProductLotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Khai báo lô hàng mới (S6-01)",
)
def tao_lo_hang_moi(
    data: ProductLotCreate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Khai báo thông tin lô hàng mới cho sản phẩm.
    Quy tắc nghiệp vụ:
    - POST /lots chỉ khai báo lô, không tự cộng thêm tồn kho.
    - Tổng số lượng các lô của (product_id, warehouse_id) không được vượt quá physical_stock hiện tại.
    """
    return LotService.create_lot(db=db, data=data)


@router.get(
    "/near-expiry",
    response_model=LotExpiryWarningResponse,
    status_code=status.HTTP_200_OK,
    summary="Danh sách cảnh báo lô cận date và hết hạn (S6-01)",
)
def lay_danh_sach_lo_can_date(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    threshold_days: Optional[int] = Query(None, ge=1, le=365, description="Ngưỡng ngày cận date tùy chọn"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Lấy danh sách các lô hàng cận date hoặc đã quá hạn còn tồn kho."""
    return LotService.get_expiry_warnings(
        db=db,
        warehouse_id=warehouse_id,
        threshold_days=threshold_days,
    )


@router.post(
    "/check-dispatch",
    response_model=LotDispatchCheckResponse,
    status_code=status.HTTP_200_OK,
    summary="Kiểm tra tính hợp lệ của lô trước khi xuất kho (S6-01)",
)
def kiem_tra_lo_xuat_kho(
    data: LotDispatchCheckRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Kiểm tra hạn dùng của lô trước khi xuất kho.
    Nếu lô đã hết hạn: Chặn xuất trừ khi người dùng là Quản trị viên (Admin) hoặc Quản lý kho (WH Manager)
    và bắt buộc phải có lý do ghi đè (override_reason).
    """
    result = LotService.check_lot_dispatch_validity(
        db=db,
        lot_id=data.lot_id,
        current_user=current_user,
        override_reason=data.override_reason,
    )
    return LotDispatchCheckResponse(**result)


@router.get(
    "",
    response_model=ProductLotListResponse,
    status_code=status.HTTP_200_OK,
    summary="Tra cứu và lọc danh sách lô hàng (S6-01)",
)
def lay_danh_sach_lo(
    product_id: Optional[str] = Query(None, description="Lọc theo mã sản phẩm"),
    warehouse_id: Optional[int] = Query(None, description="Lọc theo mã kho hàng"),
    status: Optional[LotStatus] = Query(None, description="Lọc theo trạng thái: ACTIVE, NEAR_EXPIRY, EXPIRED, EXHAUSTED"),
    page: int = Query(1, ge=1, description="Số trang hiển thị"),
    page_size: int = Query(20, ge=1, le=1000, description="Số lượng mỗi trang"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Tra cứu danh sách các lô hàng có lọc theo sản phẩm, kho, trạng thái và phân trang."""
    return LotService.list_lots(
        db=db,
        product_id=product_id,
        warehouse_id=warehouse_id,
        status_filter=status,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{lot_id}",
    response_model=ProductLotResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết lô hàng (S6-01)",
)
def lay_chi_tiet_lo(
    lot_id: int,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Lấy thông tin chi tiết của một lô hàng theo ID."""
    return LotService.get_lot_by_id(db=db, lot_id=lot_id)


@router.put(
    "/products/{product_id}/lot-tracking",
    status_code=status.HTTP_200_OK,
    summary="Bật / tắt tính năng quản lý theo lô cho sản phẩm (S6-01 alias)",
)
def bat_tat_quan_ly_lo_alias(
    product_id: str,
    data: LotTrackingToggleRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Alias bật / tắt quản lý theo lô đặt dưới /lots/products/{product_id}/lot-tracking."""
    return LotService.toggle_lot_tracking(db=db, product_id=product_id, request=data)
