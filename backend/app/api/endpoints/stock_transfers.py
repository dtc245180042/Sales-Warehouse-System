from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.stock_transfer import (
    StockTransferCreate,
    StockTransferShipRequest,
    StockTransferReceiveRequest,
    StockTransferCancelRequest,
    StockTransferResponse,
    WarehouseStockResponse,
    InTransitSummaryItem,
)
from app.services import stock_transfer_service

router = APIRouter(prefix="/stock-transfers", tags=["Chuyển kho nội bộ (S5-07)"])


@router.get("", response_model=List[StockTransferResponse])
@router.get("/", response_model=List[StockTransferResponse], include_in_schema=False)
def list_stock_transfers(
    source_warehouse: Optional[str] = Query(None, description="Lọc theo kho xuất"),
    destination_warehouse: Optional[str] = Query(None, description="Lọc theo kho nhập"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: draft, in_transit, completed, cancelled, all"),
    search: Optional[str] = Query(None, description="Tìm theo mã phiếu, kho, ghi chú"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Lấy danh sách các phiếu chuyển kho nội bộ (SCRUM-574).
    Hỗ trợ lọc theo kho đi, kho đến, trạng thái và từ khóa tìm kiếm.
    """
    return stock_transfer_service.get_stock_transfers(
        db=db,
        source_warehouse=source_warehouse,
        destination_warehouse=destination_warehouse,
        status_filter=status,
        search=search,
        skip=skip,
        limit=limit,
    )


@router.get("/in-transit-summary", response_model=List[InTransitSummaryItem])
def get_in_transit_summary(
    warehouse: Optional[str] = Query(None, description="Lọc theo kho xuất hoặc kho nhận"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Thống kê tổng hợp hàng hóa đang trên đường vận chuyển giữa các kho (SCRUM-575).
    """
    return stock_transfer_service.get_in_transit_summary(db=db, warehouse=warehouse)


@router.get("/warehouse-stocks", response_model=List[WarehouseStockResponse])
def get_warehouse_stocks(
    warehouse: Optional[str] = Query(None, description="Lọc theo tên kho hàng"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Tra cứu tồn kho chi tiết (tồn kho, tồn vật lý, hàng in-transit) theo kho (SCRUM-575).
    """
    return stock_transfer_service.get_all_warehouse_stocks(db=db, warehouse=warehouse)


@router.get("/{id_or_code}", response_model=StockTransferResponse)
def get_stock_transfer_detail(
    id_or_code: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Xem chi tiết phiếu chuyển kho nội bộ (SCRUM-574).
    """
    return stock_transfer_service.get_stock_transfer_by_id_or_code(db=db, id_or_code=id_or_code)


@router.post("", response_model=StockTransferResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=StockTransferResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_stock_transfer(
    payload: StockTransferCreate,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Lập phiếu chuyển kho nội bộ mới (SCRUM-574, SCRUM-572).
    - Kiểm tra kho đi != kho đến.
    - Kiểm tra tồn khả dụng tại kho đi đủ để chuyển.
    - Tạo phiếu với trạng thái 'draft' (hoặc 'in_transit' nếu chọn ship_immediately).
    """
    return stock_transfer_service.create_stock_transfer(
        db=db,
        data=payload,
        current_user=current_user,
    )


@router.post("/{id_or_code}/ship", response_model=StockTransferResponse)
def ship_stock_transfer(
    id_or_code: str,
    payload: Optional[StockTransferShipRequest] = None,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Xác nhận xuất kho chuyển hàng (SCRUM-570).
    - Trừ tồn kho tại kho xuất.
    - Ghi nhận hàng đang trên đường tới kho đích (in-transit).
    - Hàng CHƯA CỘNG vào kho đích.
    - Ghi thẻ kho xuất chuyển.
    """
    return stock_transfer_service.ship_stock_transfer(
        db=db,
        transfer_id_or_code=id_or_code,
        req=payload,
        current_user=current_user,
    )


@router.post("/{id_or_code}/receive", response_model=StockTransferResponse)
def receive_stock_transfer(
    id_or_code: str,
    payload: StockTransferReceiveRequest,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Xác nhận nhận hàng tại kho đích và khóa phiếu (SCRUM-571, SCRUM-573).
    - Bắt buộc nhập lý do nếu phát hiện chênh lệch giữa số lượng thực nhận và số lượng gửi.
    - Cộng tồn thực nhận vào kho đích.
    - Giảm số lượng hàng đang trên đường.
    - Ghi thẻ kho nhập chuyển.
    - Đổi trạng thái sang 'completed' và khóa phiếu.
    """
    return stock_transfer_service.receive_stock_transfer(
        db=db,
        transfer_id_or_code=id_or_code,
        req=payload,
        current_user=current_user,
    )


@router.post("/{id_or_code}/cancel", response_model=StockTransferResponse)
def cancel_stock_transfer(
    id_or_code: str,
    payload: Optional[StockTransferCancelRequest] = None,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Hủy phiếu chuyển kho nội bộ.
    - Hoàn lại số lượng hàng về kho đi nếu phiếu đã xuất chuyển ('in_transit').
    - Từ chối hủy nếu phiếu đã hoàn thành ('completed').
    """
    return stock_transfer_service.cancel_stock_transfer(
        db=db,
        transfer_id_or_code=id_or_code,
        req=payload,
        current_user=current_user,
    )
