from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.stock_ledger import (
    StockBalanceListResponse,
    StockLedgerEntryListResponse,
    ProductStockCardResponse,
    StockDriftResponse,
)
from app.services import stock_ledger

router = APIRouter(prefix="/stock-ledger", tags=["Sổ Tồn Kho & Thẻ Kho Tập Trung (S5-05, S5-06)"])


@router.get(
    "/balances",
    response_model=StockBalanceListResponse,
    summary="Báo cáo số dư tồn kho 3 cột (Physical, Reserved, Available)",
)
def get_stock_balances(
    page: int = Query(1, ge=1, description="Số trang"),
    size: int = Query(20, ge=1, le=100, description="Kích thước trang"),
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho hàng"),
    category_id: Optional[int] = Query(None, description="Lọc theo ID nhóm hàng"),
    stock_status: Optional[str] = Query(None, description="Lọc trạng thái: all, in_stock, out_of_stock, low_stock"),
    search: Optional[str] = Query(None, description="Tìm kiếm theo mã SKU hoặc tên sản phẩm"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Sổ tồn kho 3 cột chuẩn Sprint 5 (S5-05, S5-06):
    - Cột 1: physical_stock (Tồn thực tế trong kho)
    - Cột 2: reserved_stock (Tồn đang giữ chỗ active cho đơn hàng)
    - Cột 3: available_stock (Tồn khả dụng = Physical - Reserved)
    Hỗ trợ cảnh báo low-stock khi available_stock < min_stock (S5-09).
    """
    data = stock_ledger.get_ledger_pagination(
        db,
        warehouse_id=warehouse_id,
        category_id=category_id,
        stock_status=stock_status,
        search=search,
        page=page,
        limit=size,
    )
    total_pages = max(1, (data["total"] + size - 1) // size)
    return StockBalanceListResponse(
        items=data["items"],
        total=data["total"],
        page=page,
        size=size,
        total_pages=total_pages,
    )


@router.get(
    "/entries",
    response_model=StockLedgerEntryListResponse,
    summary="Sổ cái chi tiết biến động / Lịch sử thẻ kho",
)
def get_ledger_entries(
    page: int = Query(1, ge=1, description="Số trang"),
    size: int = Query(20, ge=1, le=100, description="Kích thước trang"),
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho"),
    product_id: Optional[str] = Query(None, description="Lọc theo mã SKU / ID sản phẩm"),
    movement_type: Optional[str] = Query(None, description="Lọc loại biến động (IN_PURCHASE, OUT_SALE, TRANSFER_IN...)"),
    reference_code: Optional[str] = Query(None, description="Lọc theo mã chứng từ (PNK-xxx, ORD-xxx)"),
    search: Optional[str] = Query(None, description="Tìm kiếm từ khóa chung"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Tra cứu sổ cái biến động kho lưu trữ bất biến (S5-05):
    - Mỗi dòng thể hiện số lượng biến động (+/-), tồn trước, tồn sau, người thực hiện, lý do.
    """
    return stock_ledger.get_ledger_entries_pagination(
        db,
        page=page,
        size=size,
        warehouse_id=warehouse_id,
        product_id=product_id,
        movement_type=movement_type,
        reference_code=reference_code,
        search=search,
    )


@router.get(
    "/products/{product_id}/card",
    response_model=ProductStockCardResponse,
    summary="Thẻ kho chi tiết cho một sản phẩm cụ thể",
)
def get_product_stock_card(
    product_id: str,
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho cụ thể"),
    page: int = Query(1, ge=1, description="Số trang lịch sử biến động"),
    size: int = Query(20, ge=1, le=100, description="Số dòng mỗi trang"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Thẻ kho chi tiết từng SKU (S5-05):
    - Hiển thị số dư 3 cột theo từng kho hàng.
    - Lịch sử biến động nhập / xuất / chuyển kho / kiểm kê theo thứ tự thời gian.
    """
    return stock_ledger.get_product_stock_card(
        db,
        product_id=product_id,
        warehouse_id=warehouse_id,
        page=page,
        size=size,
    )


@router.get(
    "/drift",
    response_model=StockDriftResponse,
    summary="Kiểm tra đối soát lệch tồn kho (Chỉ đọc)",
)
def get_stock_drift(
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Đối soát bất biến dữ liệu (Pha 1.5):
    Kiểm tra tổng physical_stock của các kho có khớp với ProductStockProfile.physical_stock hay không.
    """
    drift_items = stock_ledger.check_ledger_drift(db)
    formatted_items = []
    for d in drift_items:
        formatted_items.append({
            "product_id": d["product_id"],
            "sku": d.get("sku"),
            "product_name": None,
            "ledger_physical": d["warehouse_stocks_total"],
            "profile_physical": d["profile_physical_stock"],
            "drift": d["drift"],
        })

    return StockDriftResponse(
        total_drifted_skus=len(formatted_items),
        items=formatted_items,
    )
