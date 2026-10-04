from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.schemas.inventory import (
    StockReceiptCreate,
    StockReceiptResponse,
    InventoryHistoryResponse,
)
from app.services import inventory_service

router = APIRouter(prefix="/inventory", tags=["Kho & Tồn kho"])


@router.get("/stock-in", response_model=List[StockReceiptResponse])
def get_stock_in_list(db: Session = Depends(lay_phien_db)):
    """Lấy danh sách các phiếu nhập kho."""
    return inventory_service.get_stock_in_receipts(db=db)


@router.post("/stock-in", response_model=StockReceiptResponse, status_code=status.HTTP_201_CREATED)
def create_stock_in(
    receipt_in: StockReceiptCreate,
    db: Session = Depends(lay_phien_db),
):
    """Tạo phiếu nhập kho và tăng số lượng tồn kho sản phẩm."""
    return inventory_service.create_stock_in_receipt(db=db, receipt_in=receipt_in)


@router.get("/stock-out", response_model=List[StockReceiptResponse])
def get_stock_out_list(db: Session = Depends(lay_phien_db)):
    """Lấy danh sách các phiếu xuất kho."""
    return inventory_service.get_stock_out_receipts(db=db)


@router.post("/stock-out", response_model=StockReceiptResponse, status_code=status.HTTP_201_CREATED)
def create_stock_out(
    receipt_in: StockReceiptCreate,
    db: Session = Depends(lay_phien_db),
):
    """Tạo phiếu xuất kho và giảm số lượng tồn kho sản phẩm."""
    return inventory_service.create_stock_out_receipt(db=db, receipt_in=receipt_in)


@router.get("/history", response_model=List[InventoryHistoryResponse])
def get_inventory_history(db: Session = Depends(lay_phien_db)):
    """Lấy danh sách lịch sử biến động thẻ kho."""
    return inventory_service.get_all_inventory_history(db=db)
