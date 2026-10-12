from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.stock_take import (
    StockTakeCreate,
    StockTakeResponse,
    StockTakeCountUpdate,
    StockTakeConfirmRequest,
    StockTakeCancelRequest,
    StockTakePreviewItem,
)
from app.services import stock_take_service

router = APIRouter(prefix="/stock-takes", tags=["Kiểm kê kho"])


@router.get("/products-preview", response_model=List[StockTakePreviewItem])
def get_products_preview(
    warehouse: str = Query("Kho Tổng Hà Nội", description="Kho hàng kiểm kê"),
    scope_type: str = Query("WAREHOUSE", description="Phạm vi: WAREHOUSE, CATEGORY"),
    category_id: Optional[int] = Query(None, description="ID nhóm hàng nếu scope_type == CATEGORY"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Xem trước danh sách sản phẩm và tồn sổ tại thời điểm hiện tại
    trước khi bấm lập phiếu kiểm kê.
    """
    return stock_take_service.get_preview_products(
        db=db,
        warehouse=warehouse,
        scope_type=scope_type,
        category_id=category_id,
    )


@router.get("", response_model=List[StockTakeResponse])
@router.get("/", response_model=List[StockTakeResponse], include_in_schema=False)
def list_stock_takes(
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc trạng thái: draft, in_progress, completed, cancelled"),
    warehouse: Optional[str] = Query(None, description="Lọc theo kho"),
    search: Optional[str] = Query(None, description="Tìm theo mã phiếu hoặc người tạo"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Lấy danh sách các phiếu kiểm kê kho hàng (S5-08).
    """
    return stock_take_service.get_stock_takes(
        db=db,
        status_filter=status_filter,
        warehouse=warehouse,
        search=search,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=StockTakeResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=StockTakeResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_stock_take(
    data: StockTakeCreate,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Lập phiếu kiểm kê kho và tạo snapshot số tồn sổ tại thời điểm lập.
    (SCRUM-581 & SCRUM-582).
    """
    return stock_take_service.create_stock_take(
        db=db,
        data=data,
        current_user=current_user,
    )


@router.get("/{take_id}", response_model=StockTakeResponse)
def get_stock_take_detail(
    take_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Xem chi tiết phiếu kiểm kê và danh sách các dòng hàng (SCRUM-582).
    """
    return stock_take_service.get_stock_take_by_id(db=db, take_id=take_id)


@router.put("/{take_id}/items", response_model=StockTakeResponse)
@router.patch("/{take_id}/items", response_model=StockTakeResponse, include_in_schema=False)
def update_stock_take_items(
    take_id: str,
    count_data: StockTakeCountUpdate,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Cập nhật số đếm thực tế và tính chênh lệch từng dòng kiểm kê (SCRUM-580).
    """
    return stock_take_service.update_counted_items(
        db=db,
        take_id=take_id,
        count_data=count_data,
        current_user=current_user,
    )


@router.post("/{take_id}/confirm", response_model=StockTakeResponse)
def confirm_stock_take(
    take_id: str,
    confirm_data: StockTakeConfirmRequest,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Chốt kiểm kê và điều chỉnh tồn kho về số thực đếm.
    - SCRUM-585: Phân quyền chỉ Quản lý kho (WH Manager / Admin) mới được phép chốt.
    - SCRUM-584: Bắt buộc nhập lý do khi có chênh lệch tồn.
    - SCRUM-583: Cập nhật tồn kho theo số thực đếm và ghi thẻ kho (InventoryHistory).
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vui lòng đăng nhập để thực hiện chốt phiếu kiểm kê."
        )
    return stock_take_service.confirm_stock_take(
        db=db,
        take_id=take_id,
        confirm_data=confirm_data,
        current_user=current_user,
    )


@router.post("/{take_id}/cancel", response_model=StockTakeResponse)
def cancel_stock_take(
    take_id: str,
    cancel_data: StockTakeCancelRequest,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Hủy phiếu kiểm kê kho (khi chưa hoàn tất).
    """
    return stock_take_service.cancel_stock_take(
        db=db,
        take_id=take_id,
        cancel_data=cancel_data,
        current_user=current_user,
    )
