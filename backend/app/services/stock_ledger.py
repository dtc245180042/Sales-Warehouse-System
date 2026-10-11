"""
services/stock_ledger.py
Sổ tồn kho & thẻ kho tập trung.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, or_, desc, and_, case
from sqlalchemy.orm import Session

from app.core.database import la_sqlite
from app.models.auth import User
from app.models.inventory import InventoryHistory
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.stock_reservation import StockReservation
from app.models.warehouse_stock import StockLedgerEntry, WarehouseStock

# Lazy import model Warehouse
try:
    from app.models.warehouse import Warehouse
except ImportError:
    Warehouse = None


# ==============================================================================
# HẰNG SỐ BẢN ĐỒ KHO DỰ PHÒNG (Gom vào 1 nơi duy nhất, xóa/thay thế khi VT push bảng)
# ==============================================================================
FALLBACK_WAREHOUSE_MAP: Dict[int, Dict[str, str]] = {
    1: {"code": "WH-HANOI", "name": "Kho Tổng Hà Nội"},
    2: {"code": "WH-DANANG", "name": "Kho Đà Nẵng"},
    3: {"code": "WH-HCM", "name": "Kho Tổng TP.HCM"},
}


def resolve_warehouse(db: Session, warehouse_id: int) -> Tuple[str, str]:
    """
    Hàm ánh xạ kho duy nhất cho toàn hệ thống:
    Trả về (warehouse_code, warehouse_name).
    Nếu warehouse_id không hợp lệ -> Bắn HTTP 400.
    """
    if not isinstance(warehouse_id, int) or warehouse_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã kho hàng (warehouse_id={warehouse_id}) không hợp lệ.",
        )

    # 1. Tra cứu bảng Warehouse nếu đã được tạo
    if Warehouse is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if wh:
            code = getattr(wh, "code", f"WH-{warehouse_id}")
            name = getattr(wh, "name", f"Kho #{warehouse_id}")
            return code, name

    # 2. Tra cứu danh mục kho dự phòng fallback
    if warehouse_id in FALLBACK_WAREHOUSE_MAP:
        info = FALLBACK_WAREHOUSE_MAP[warehouse_id]
        return info["code"], info["name"]

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Không tìm thấy kho hàng với mã warehouse_id={warehouse_id}.",
    )


def resolve_warehouse_id_by_name(db: Session, warehouse_name: str) -> Optional[int]:
    """Ánh xạ ngược từ tên kho dạng chuỗi sang warehouse_id (dùng khi tính reserved và dispatch)."""
    if not warehouse_name or not str(warehouse_name).strip():
        return None

    clean_name = str(warehouse_name).strip().lower()

    if Warehouse is not None:
        wh = db.query(Warehouse).filter(Warehouse.name.ilike(f"%{clean_name}%")).first()
        if wh:
            return wh.id

    for wid, data in FALLBACK_WAREHOUSE_MAP.items():
        if clean_name in data["name"].lower() or data["code"].lower() in clean_name or any(a.lower() in clean_name for a in data.get("aliases", [])):
            return wid

    return None


# Alias hàm ánh xạ duy nhất
map_warehouse_name_to_id = resolve_warehouse_id_by_name


# ==============================================================================
# ĐỊNH NGHĨA LOẠI BIẾN ĐỘNG KHO (CONTRACT v3)
# ==============================================================================
class StockMovementType(str, Enum):
    """Mỗi loại quyết định chiều +/- cố định. quantity_base luôn dương."""

    IN_PURCHASE = "IN_PURCHASE"                    # (+) Nhập mua từ NCC
    IN_PURCHASE_REVERSAL = "IN_PURCHASE_REVERSAL"  # (-) Chỉ từ phiếu điều chỉnh nhập

    TRANSFER_OUT = "TRANSFER_OUT"                  # (-) Kho đi, theo SỐ GỬI (Hàng chuyển sang in_transit)
    TRANSFER_IN = "TRANSFER_IN"                    # (+) Kho đến, theo SỐ NHẬN THỰC TẾ

    AUDIT_SURPLUS = "AUDIT_SURPLUS"                # (+) Thực đếm > sổ sách
    AUDIT_SHORTAGE = "AUDIT_SHORTAGE"              # (-) Thực đếm < sổ sách

    # Điều chỉnh khác (bắt buộc có note)
    ADJUSTMENT_IN = "ADJUSTMENT_IN"                # (+)
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT"              # (-)

    # Xuất bán / Hoàn tất đơn hàng (Cầu nối S5 & Luồng đơn hàng)
    OUT_SALE = "OUT_SALE"                          # (-) Xuất kho giao hàng


_INCREASE = {
    StockMovementType.IN_PURCHASE,
    StockMovementType.TRANSFER_IN,
    StockMovementType.AUDIT_SURPLUS,
    StockMovementType.ADJUSTMENT_IN,
}
_DECREASE = {
    StockMovementType.IN_PURCHASE_REVERSAL,
    StockMovementType.TRANSFER_OUT,
    StockMovementType.AUDIT_SHORTAGE,
    StockMovementType.ADJUSTMENT_OUT,
    StockMovementType.OUT_SALE,
}
_NOTE_REQUIRED = {
    StockMovementType.IN_PURCHASE_REVERSAL,
    StockMovementType.AUDIT_SURPLUS,
    StockMovementType.AUDIT_SHORTAGE,
    StockMovementType.ADJUSTMENT_IN,
    StockMovementType.ADJUSTMENT_OUT,
}


@dataclass
class StockMovementResult:
    product_id: str
    sku: str
    warehouse_id: int
    warehouse_code: str
    warehouse_name: str
    previous_physical: int
    delta_quantity: int        # (+) hoặc (-)
    new_physical: int
    current_reserved: int      # Tính động từ stock_reservations
    available_stock: int       # new_physical - current_reserved
    history_record_id: str


# ==============================================================================
# CÁC HÀM NỘI BỘ: BACKFILL, LOCK BI QUAN & ĐỒNG BỘ BẢNG CŨ
# ==============================================================================
def _get_active_reserved_for_sku_warehouse(
    db: Session,
    product_id: str,
    sku: Optional[str],
    warehouse_name: str,
) -> int:
    """Tính động số lượng đang giữ chỗ (reserved) từ bảng stock_reservations."""
    cond = [
        StockReservation.status == "active",
        StockReservation.warehouse == warehouse_name,
    ]
    if sku:
        cond.append(or_(StockReservation.product_id == product_id, StockReservation.sku == sku))
    else:
        cond.append(StockReservation.product_id == product_id)

    total_res = db.query(
        func.coalesce(func.sum(StockReservation.reserved_quantity), 0)
    ).filter(*cond).scalar() or 0

    return int(total_res)


def _ensure_default_warehouse_backfilled(
    db: Session,
    product_id: str,
    sku: Optional[str] = None,
) -> None:
    """
    Đảm bảo kho mặc định (1) được backfill từ ProductStockProfile cũ
    trước khi thực hiện bất kỳ phép tính hoặc đồng bộ nào trên sản phẩm.
    """
    ws_wh1 = db.query(WarehouseStock).filter(
        WarehouseStock.product_id == product_id,
        WarehouseStock.warehouse_id == 1,
    ).first()
    if not ws_wh1:
        old_profile = db.query(ProductStockProfile).filter(
            ProductStockProfile.product_id == product_id
        ).first()
        prod = db.query(Product).filter(Product.id == product_id).first()
        prod_min = prod.min_stock if prod and prod.min_stock is not None else None
        prof_min = old_profile.min_stock if old_profile and old_profile.min_stock is not None else None
        init_min = int(prof_min if prof_min is not None else (prod_min if prod_min is not None else 10))
        if old_profile:
            init_physical = int(
                old_profile.physical_stock
                if old_profile.physical_stock is not None
                else (old_profile.stock or 0)
            )
            ws_wh1 = WarehouseStock(
                product_id=product_id,
                sku=sku or old_profile.sku,
                warehouse_id=1,
                physical_stock=init_physical,
                min_stock=init_min,
            )
            db.add(ws_wh1)
            db.flush()


def _get_or_create_stock_row(
    db: Session,
    product_id: str,
    warehouse_id: int,
    sku: Optional[str] = None,
    for_update: bool = True,
) -> WarehouseStock:
    """
    Lấy hoặc khởi tạo dòng WarehouseStock có khóa bi quan (SELECT FOR UPDATE)
    và cơ chế Backfill tự động từ ProductStockProfile (kho mặc định = 1).
    """
    # Đảm bảo kho 1 luôn được backfill nếu chưa có
    _ensure_default_warehouse_backfilled(db, product_id, sku)

    query = db.query(WarehouseStock).filter(
        WarehouseStock.product_id == product_id,
        WarehouseStock.warehouse_id == warehouse_id,
    )
    if for_update and not la_sqlite:
        query = query.with_for_update()

    stock_row = query.first()
    if not stock_row:
        prod = db.query(Product).filter(Product.id == product_id).first()
        init_min = int(prod.min_stock if prod and prod.min_stock is not None else 10)
        stock_row = WarehouseStock(
            product_id=product_id,
            sku=sku,
            warehouse_id=warehouse_id,
            physical_stock=0,
            min_stock=init_min,
        )
        db.add(stock_row)
        db.flush()

    return stock_row


def _sync_legacy_stock(
    db: Session,
    product_id: str,
) -> Tuple[int, int, int]:
    """
    Đồng bộ số liệu tổng hợp vào ProductStockProfile và Product (Quyết định S5 số 2 & 9):
    physical_stock = tổng physical_stock của TẤT CẢ các kho
    reserved_stock = tổng reserved_stock đang active của sản phẩm
    stock (khả dụng) = physical_stock - reserved_stock
    Trả về: (total_physical, total_reserved, total_available)
    """
    # Đảm bảo kho 1 đã được backfill trước khi sum
    _ensure_default_warehouse_backfilled(db, product_id)

    total_physical = int(
        db.query(func.coalesce(func.sum(WarehouseStock.physical_stock), 0))
        .filter(WarehouseStock.product_id == product_id)
        .scalar()
        or 0
    )

    total_reserved = int(
        db.query(func.coalesce(func.sum(StockReservation.reserved_quantity), 0))
        .filter(
            StockReservation.product_id == product_id,
            StockReservation.status == "active",
        )
        .scalar()
        or 0
    )

    total_available = max(0, total_physical - total_reserved)

    profile = db.query(ProductStockProfile).filter(
        ProductStockProfile.product_id == product_id
    ).first()
    if profile:
        profile.physical_stock = total_physical
        profile.reserved_stock = total_reserved
        profile.stock = total_available
    else:
        prod = db.query(Product).filter(Product.id == product_id).first()
        if prod:
            profile = ProductStockProfile(
                product_id=product_id,
                sku=prod.sku,
                physical_stock=total_physical,
                reserved_stock=total_reserved,
                stock=total_available,
                min_stock=int(prod.min_stock if prod.min_stock is not None else 10),
                warehouse="Kho Tổng Hà Nội",
            )
            db.add(profile)

    prod = db.query(Product).filter(Product.id == product_id).first()
    if prod:
        prod.stock = total_available

    return total_physical, total_reserved, total_available


# ==============================================================================
# HÀM 1 - GHI BIẾN ĐỘNG TỒN THỰC TẾ (VT và NT2 bắt buộc gọi, không tự UPDATE)
# ==============================================================================
def record_stock_movement(
    db: Session,
    *,
    product_id: str,
    warehouse_id: int,
    quantity_base: int,                 # Số nguyên DƯƠNG, đơn vị cơ sở
    movement_type: StockMovementType,
    reference_code: str,                # PNK-xxx, CK-xxx, KK-xxx
    performer_id: int,                  # User.id người thực hiện (không lưu tên)
    line_ref: str = "",                 # Tránh trùng khi cùng SKU xuất hiện nhiều dòng
    note: Optional[str] = None,
    auto_commit: bool = False,
) -> StockMovementResult:
    """
    Ghi nhận một biến động kho vào Sổ Tồn Kho theo hợp đồng v3:
    1. Kiểm tra quantity_base là int > 0, movement_type, note nếu bắt buộc.
    2. Ánh xạ kho qua resolve_warehouse(), nếu không hợp lệ -> 400.
    3. Kiểm tra chống ghi trùng idempotency -> 409.
    4. Lock dòng tồn (SELECT FOR UPDATE nếu không phải SQLite).
    5. Tính chiều +/-; chặn âm kho nếu new_physical < 0 -> 400.
    6. Ghi StockLedgerEntry (chỉ performer_id).
    7. Ghi thẻ kho cũ InventoryHistory với balance_after = tổng các kho.
    8. Đồng bộ _sync_legacy_stock().
    """
    # 1. Kiểm tra tính hợp lệ của tham số
    if not isinstance(quantity_base, int) or isinstance(quantity_base, bool) or quantity_base <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Số lượng biến động kho (quantity_base) phải là số nguyên lớn hơn 0.",
        )

    if movement_type not in _INCREASE | _DECREASE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Loại biến động kho '{movement_type}' không hợp lệ.",
        )

    if movement_type in _NOTE_REQUIRED and not (note and note.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Loại biến động '{movement_type.value}' bắt buộc phải có lý do.",
        )

    # 2. Kiểm tra sản phẩm tồn tại
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm có mã '{product_id}'.",
        )

    # 3. Kiểm tra kho tồn tại qua hàm ánh xạ duy nhất
    wh_code, wh_name = resolve_warehouse(db, warehouse_id)

    # 4. Kiểm tra chống ghi trùng (Idempotency Key) -> 409 Conflict
    clean_line = (line_ref or "").strip()
    idempotency_key = f"{reference_code}:{clean_line}:{product_id}:{warehouse_id}:{movement_type.value}"
    existing_entry = db.query(StockLedgerEntry).filter(
        StockLedgerEntry.idempotency_key == idempotency_key
    ).first()
    if existing_entry:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Giao dịch đã được ghi nhận trước đó (Khóa chống trùng: {idempotency_key}).",
        )

    # 5. Lock dòng tồn và tính toán số dư mới
    stock_row = _get_or_create_stock_row(db, product_id, warehouse_id, product.sku, for_update=True)
    prev_physical = int(stock_row.physical_stock or 0)

    delta = quantity_base if movement_type in _INCREASE else -quantity_base
    new_physical = prev_physical + delta

    # Chặn âm kho tuyệt đối
    if new_physical < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tồn kho tại '{wh_name}' không đủ để xuất/điều chỉnh! "
                f"Sản phẩm: {product.name} ({product.sku}). "
                f"Tồn thực tế hiện tại: {prev_physical}, yêu cầu giảm: {quantity_base}."
            ),
        )

    stock_row.physical_stock = new_physical
    db.flush()

    # 6. Ghi sổ cái chi tiết StockLedgerEntry (chỉ lưu performer_id)
    history_uuid = f"LEDGER-{uuid.uuid4().hex[:10].upper()}"
    ledger_entry = StockLedgerEntry(
        idempotency_key=idempotency_key,
        reference_code=reference_code,
        line_ref=clean_line,
        movement_type=movement_type.value,
        product_id=product_id,
        sku=product.sku,
        warehouse_id=warehouse_id,
        quantity_base=quantity_base,
        previous_physical=prev_physical,
        new_physical=new_physical,
        performer_id=performer_id,
        note=note.strip() if note else None,
    )
    db.add(ledger_entry)

    # 7. Đồng bộ sang legacy và lấy tổng tồn các kho
    total_physical, total_reserved, total_available = _sync_legacy_stock(db, product_id)

    # 8. Ghi thẻ kho cũ InventoryHistory với balance_after = tổng các kho (Quyết định 9)
    inv_history = InventoryHistory(
        id=history_uuid,
        code=reference_code,
        type="in" if movement_type in _INCREASE else "out",
        product_id=product_id,
        product_name=product.name,
        sku=product.sku,
        quantity=abs(delta),
        balance_after=total_physical,
        warehouse=wh_name,
        performer=f"User #{performer_id}",
        note=f"[{movement_type.value}] {note or ''}".strip(),
    )
    db.add(inv_history)

    # 9. Tính tồn giữ chỗ động cho kho này
    active_reserved_wh = _get_active_reserved_for_sku_warehouse(
        db, product_id, product.sku, wh_name
    )
    available_stock_wh = max(0, new_physical - active_reserved_wh)

    if auto_commit:
        db.commit()
        db.refresh(stock_row)

    return StockMovementResult(
        product_id=product_id,
        sku=product.sku or "",
        warehouse_id=warehouse_id,
        warehouse_code=wh_code,
        warehouse_name=wh_name,
        previous_physical=prev_physical,
        delta_quantity=delta,
        new_physical=new_physical,
        current_reserved=active_reserved_wh,
        available_stock=available_stock_wh,
        history_record_id=history_uuid,
    )


# ==============================================================================
# HÀM 2 - SỔ TỒN 3 CỘT CHO 1 SKU TRONG 1 KHO (NT1, BT gọi)
# ==============================================================================
def get_sku_ledger_summary(
    db: Session,
    *,
    product_id: str,
    warehouse_id: int,
) -> Dict[str, Any]:
    """
    Trả về dữ liệu 3 cột chuẩn mực:
    physical_stock (Cột 1), reserved_stock (Cột 2), available_stock (Cột 3).
    is_low_stock = min_stock > 0 and available_stock < min_stock.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm có mã '{product_id}'.",
        )

    wh_code, wh_name = resolve_warehouse(db, warehouse_id)
    stock_row = _get_or_create_stock_row(
        db, product_id, warehouse_id, product.sku, for_update=False
    )

    physical = int(stock_row.physical_stock or 0)
    reserved = _get_active_reserved_for_sku_warehouse(
        db, product_id, product.sku, wh_name
    )
    available = max(0, physical - reserved)

    prod_min = int(product.min_stock) if product.min_stock is not None else 10
    min_stk = int(stock_row.min_stock) if stock_row.min_stock is not None else prod_min
    if stock_row.min_stock == 10 and prod_min != 10:
        min_stk = prod_min

    # Dấu nhỏ hơn (<) cảnh báo tồn dưới mức tối thiểu
    is_low_stock = bool(min_stk > 0 and available < min_stk)

    return {
        "product_id": product.id,
        "sku": product.sku,
        "product_name": product.name,
        "unit": product.unit or "cái",
        "warehouse_id": warehouse_id,
        "warehouse_code": wh_code,
        "warehouse_name": wh_name,
        "physical_stock": physical,     # Cột 1: Tồn thực tế
        "reserved_stock": reserved,     # Cột 2: Tồn đang giữ chỗ
        "available_stock": available,   # Cột 3: Tồn khả dụng (1 - 2)
        "min_stock": min_stk,
        "is_low_stock": is_low_stock,
    }


# ==============================================================================
# HÀM 3 - DANH SÁCH SỔ TỒN PHÂN TRANG
# ==============================================================================
def get_ledger_pagination(
    db: Session,
    *,
    warehouse_id: Optional[int] = None,
    category_id: Optional[int] = None,
    stock_status: Optional[str] = None,  # all | in_stock | out_of_stock | low_stock
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> Dict[str, Any]:
    """Lấy danh sách sổ tồn kho 3 cột có phân trang và bộ lọc tối ưu bằng SQL."""
    target_wh_id = warehouse_id if warehouse_id and warehouse_id > 0 else 1
    wh_code, wh_name = resolve_warehouse(db, target_wh_id)

    # 1. Subquery tính tổng reserved_stock đang active theo warehouse
    res_sub = (
        db.query(
            StockReservation.product_id.label("prod_id"),
            func.coalesce(func.sum(StockReservation.reserved_quantity), 0).label("reserved_qty"),
        )
        .filter(
            StockReservation.status == "active",
            StockReservation.warehouse == wh_name,
        )
        .group_by(StockReservation.product_id)
        .subquery()
    )

    # 2. Các biểu thức tính toán chuẩn mực
    physical_expr = func.coalesce(WarehouseStock.physical_stock, 0)
    reserved_expr = func.coalesce(res_sub.c.reserved_qty, 0)
    avail_diff = physical_expr - reserved_expr
    available_expr = case(
        (avail_diff > 0, avail_diff),
        else_=0
    )
    min_expr = func.coalesce(WarehouseStock.min_stock, Product.min_stock, 10)

    # 3. Truy vấn kết hợp
    query = (
        db.query(
            Product,
            WarehouseStock,
            reserved_expr.label("reserved_stock"),
            available_expr.label("available_stock"),
            min_expr.label("computed_min_stock"),
        )
        .outerjoin(
            WarehouseStock,
            and_(
                WarehouseStock.product_id == Product.id,
                WarehouseStock.warehouse_id == target_wh_id,
            ),
        )
        .outerjoin(
            res_sub,
            res_sub.c.prod_id == Product.id,
        )
        .filter(Product.status == "ACTIVE")
    )

    if category_id:
        query = query.filter(Product.category_id == category_id)

    if search and search.strip():
        kw = f"%{search.strip()}%"
        query = query.filter(or_(Product.sku.ilike(kw), Product.name.ilike(kw)))

    if stock_status == "out_of_stock":
        query = query.filter(available_expr <= 0)
    elif stock_status == "in_stock":
        query = query.filter(available_expr > 0)
    elif stock_status == "low_stock":
        query = query.filter(and_(min_expr > 0, available_expr < min_expr))

    total = query.count()
    rows = query.order_by(Product.name.asc()).offset((page - 1) * limit).limit(limit).all()

    items = []
    for prod, ws, res_qty, avail_qty, min_val in rows:
        phys_qty = int(ws.physical_stock if ws and ws.physical_stock is not None else 0)
        res_int = int(res_qty or 0)
        avail_int = int(avail_qty or 0)
        min_int = int(min_val or 10)
        is_low = bool(min_int > 0 and avail_int < min_int)
        items.append({
            "product_id": prod.id,
            "sku": prod.sku,
            "product_name": prod.name,
            "unit": prod.unit or "cái",
            "warehouse_id": target_wh_id,
            "warehouse_code": wh_code,
            "warehouse_name": wh_name,
            "physical_stock": phys_qty,
            "reserved_stock": res_int,
            "available_stock": avail_int,
            "min_stock": min_int,
            "is_low_stock": is_low,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "warehouse_id": target_wh_id,
        "warehouse_code": wh_code,
        "warehouse_name": wh_name,
    }


# ==============================================================================
# HÀM KIỂM SOÁT LỆCH TỒN (LEDGER DRIFT DETECTION - CHỈ ĐỌC)
# ==============================================================================
def check_ledger_drift(db: Session) -> List[Dict[str, Any]]:
    """
    Hàm chỉ đọc đối soát kiểm tra xem có sản phẩm nào bị lệch bất biến:
    tổng warehouse_stocks.physical_stock != ProductStockProfile.physical_stock hay không.
    Trả về danh sách các sản phẩm bị lệch (drift != 0).
    """
    profiles = db.query(ProductStockProfile).all()
    drift_items: List[Dict[str, Any]] = []

    for prof in profiles:
        total_ws_physical = int(
            db.query(func.coalesce(func.sum(WarehouseStock.physical_stock), 0))
            .filter(WarehouseStock.product_id == prof.product_id)
            .scalar()
            or 0
        )
        legacy_physical = int(prof.physical_stock if prof.physical_stock is not None else (prof.stock or 0))
        drift = total_ws_physical - legacy_physical

        if drift != 0:
            drift_items.append({
                "product_id": prof.product_id,
                "sku": prof.sku,
                "warehouse_stocks_total": total_ws_physical,
                "profile_physical_stock": legacy_physical,
                "drift": drift,
            })

    return drift_items


# ==============================================================================
# HÀM 4 - TRUY VẤN LỊCH SỬ THẺ KHO CHI TIẾT (MOVEMENT ENTRIES)
# ==============================================================================
def get_ledger_entries_pagination(
    db: Session,
    *,
    page: int = 1,
    size: int = 20,
    warehouse_id: Optional[int] = None,
    product_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    reference_code: Optional[str] = None,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """Lấy danh sách các bút toán biến động thẻ kho có phân trang và bộ lọc."""
    query = db.query(StockLedgerEntry)

    if warehouse_id is not None and warehouse_id > 0:
        query = query.filter(StockLedgerEntry.warehouse_id == warehouse_id)

    if product_id:
        query = query.filter(StockLedgerEntry.product_id == product_id.strip())

    if movement_type:
        query = query.filter(StockLedgerEntry.movement_type == movement_type.strip().upper())

    if reference_code:
        query = query.filter(StockLedgerEntry.reference_code.ilike(f"%{reference_code.strip()}%"))

    if search and search.strip():
        kw = f"%{search.strip()}%"
        query = query.filter(
            or_(
                StockLedgerEntry.reference_code.ilike(kw),
                StockLedgerEntry.sku.ilike(kw),
                StockLedgerEntry.product_id.ilike(kw),
                StockLedgerEntry.note.ilike(kw),
            )
        )

    total = query.count()
    entries = query.order_by(desc(StockLedgerEntry.created_at)).offset((page - 1) * size).limit(size).all()

    items = []
    prod_cache: Dict[str, Optional[str]] = {}
    user_cache: Dict[int, str] = {}
    wh_cache: Dict[int, str] = {}

    for e in entries:
        if e.warehouse_id not in wh_cache:
            _, wh_name = resolve_warehouse(db, e.warehouse_id)
            wh_cache[e.warehouse_id] = wh_name
        wh_name = wh_cache[e.warehouse_id]

        if e.product_id not in prod_cache:
            p = db.query(Product).filter(Product.id == e.product_id).first()
            prod_cache[e.product_id] = p.name if p else None
        p_name = prod_cache[e.product_id]

        if e.performer_id not in user_cache:
            u = db.query(User).filter(User.id == e.performer_id).first()
            user_cache[e.performer_id] = (u.full_name or u.username) if u else f"User #{e.performer_id}"
        u_name = user_cache[e.performer_id]

        items.append({
            "id": e.id,
            "idempotency_key": e.idempotency_key,
            "reference_code": e.reference_code,
            "line_ref": e.line_ref,
            "movement_type": e.movement_type,
            "product_id": e.product_id,
            "product_name": p_name,
            "sku": e.sku,
            "warehouse_id": e.warehouse_id,
            "warehouse_name": wh_name,
            "quantity_base": e.quantity_base,
            "previous_physical": e.previous_physical,
            "new_physical": e.new_physical,
            "performer_id": e.performer_id,
            "performer_name": u_name,
            "note": e.note,
            "created_at": e.created_at,
        })

    total_pages = max(1, (total + size - 1) // size)
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "total_pages": total_pages,
    }


def get_product_stock_card(
    db: Session,
    product_id: str,
    *,
    warehouse_id: Optional[int] = None,
    page: int = 1,
    size: int = 20,
) -> Dict[str, Any]:
    """Thẻ kho tổng hợp chi tiết cho 1 SKU cụ thể (gồm số dư 3 cột và lịch sử biến động)."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm với mã '{product_id}'.",
        )

    # Lấy số dư các kho
    target_whs = [warehouse_id] if warehouse_id and warehouse_id > 0 else list(FALLBACK_WAREHOUSE_MAP.keys())
    balances = []
    for wid in target_whs:
        sum_data = get_sku_ledger_summary(db, product_id=product_id, warehouse_id=wid)
        balances.append({
            "product_id": product.id,
            "sku": product.sku,
            "product_name": product.name,
            "category": product.category,
            "unit": product.unit or "cái",
            "warehouse_id": wid,
            "warehouse_name": sum_data["warehouse_name"],
            "physical_stock": sum_data["physical_stock"],
            "reserved_stock": sum_data["reserved_stock"],
            "available_stock": sum_data["available_stock"],
            "min_stock": sum_data["min_stock"],
            "is_low_stock": sum_data["is_low_stock"],
        })

    # Lấy danh sách lịch sử biến động
    entries_res = get_ledger_entries_pagination(
        db,
        page=page,
        size=size,
        warehouse_id=warehouse_id,
        product_id=product_id,
    )

    return {
        "product_id": product.id,
        "sku": product.sku,
        "product_name": product.name,
        "unit": product.unit or "cái",
        "balances": balances,
        "entries": entries_res,
    }

