from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.stock_receipt import (
    StockReceiptCreate,
    StockReceiptUpdate,
    StockReceiptResponse,
    StockReceiptListResponse,
)
from app.services import stock_receipt_service

router = APIRouter(prefix="/stock-receipts", tags=["Phiếu Nhập Kho Nhà Cung Cấp (S5-04)"])


@router.post(
    "",
    response_model=StockReceiptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo phiếu nhập kho nhà cung cấp (Draft)",
)
@router.post(
    "/",
    response_model=StockReceiptResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def create_receipt(
    data: StockReceiptCreate,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Tạo phiếu nhập kho mới từ nhà cung cấp (AC-1, AC-2, AC-3).
    Phiếu ở trạng thái DRAFT sẽ không thay đổi tồn kho thực tế (AC-4).
    """
    return stock_receipt_service.create_stock_receipt(db, data, current_user)


@router.get(
    "",
    response_model=StockReceiptListResponse,
    summary="Danh sách phiếu nhập kho",
)
@router.get(
    "/",
    response_model=StockReceiptListResponse,
    include_in_schema=False,
)
def list_receipts(
    page: int = Query(1, ge=1, description="Số trang"),
    size: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: DRAFT, CONFIRMED, CANCELLED"),
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho"),
    supplier_id: Optional[str] = Query(None, description="Lọc theo mã NCC"),
    search: Optional[str] = Query(None, description="Tìm theo mã phiếu nhập"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Lấy danh sách phiếu nhập kho kèm phân trang và bộ lọc nâng cao."""
    return stock_receipt_service.list_stock_receipts(
        db,
        page=page,
        size=size,
        status_filter=status,
        warehouse_id=warehouse_id,
        supplier_id=supplier_id,
        search=search,
        current_user=current_user,
    )


@router.get(
    "/{id}",
    response_model=StockReceiptResponse,
    summary="Chi tiết phiếu nhập kho",
)
def get_receipt(
    id: int,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Xem chi tiết một phiếu nhập kho. Ẩn giá vốn nếu là tài khoản Thủ kho."""
    return stock_receipt_service.get_stock_receipt(db, id, current_user)


@router.put(
    "/{id}",
    response_model=StockReceiptResponse,
    summary="Chỉnh sửa phiếu nhập kho (Chỉ DRAFT)",
)
def update_receipt(
    id: int,
    data: StockReceiptUpdate,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Cập nhật thông tin phiếu nhập kho (AC-5).
    Chỉ cho phép sửa khi phiếu ở trạng thái DRAFT. Phiếu đã CONFIRMED là bất biến.
    """
    return stock_receipt_service.update_stock_receipt(db, id, data, current_user)


@router.post(
    "/{id}/confirm",
    response_model=StockReceiptResponse,
    summary="Xác nhận nhập kho thực tế (Tăng on-hand & Ghi sổ cái)",
)
def confirm_receipt(
    id: int,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Xác nhận hoàn tất phiếu nhập (AC-4, AC-5):
    - Đổi trạng thái sang CONFIRMED.
    - Cộng tồn thực tế physical_stock vào đúng kho hàng.
    - Ghi nhận bút toán vào sổ cái thẻ kho tập trung (IN_PURCHASE).
    - Cập nhật số liệu lịch sử nhà cung cấp.
    """
    return stock_receipt_service.confirm_stock_receipt(db, id, current_user)


@router.post(
    "/{id}/cancel",
    response_model=StockReceiptResponse,
    summary="Hủy phiếu nhập kho (Chỉ DRAFT)",
)
def cancel_receipt(
    id: int,
    reason: Optional[str] = Query(None, description="Lý do hủy phiếu"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Hủy phiếu nhập kho ở trạng thái DRAFT.
    Phiếu đã CONFIRMED bắt buộc lập phiếu điều chỉnh, không được hủy trực tiếp.
    """
    return stock_receipt_service.cancel_stock_receipt(db, id, current_user, reason)
