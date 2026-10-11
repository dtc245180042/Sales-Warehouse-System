from datetime import datetime, timezone
import random
from typing import Optional, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.models.auth import User
from app.models.supplier import Supplier
from app.models.product import Product
from app.models.stock_receipt import StockReceipt, StockReceiptItem
from app.schemas.stock_receipt import (
    StockReceiptCreate,
    StockReceiptUpdate,
    StockReceiptResponse,
    StockReceiptItemResponse,
    StockReceiptListResponse,
)
from app.services.stock_ledger import (
    record_stock_movement,
    resolve_warehouse,
    StockMovementType,
)


def _can_view_cost(user: Optional[User]) -> bool:
    """Kiểm tra quyền xem giá vốn nhập kho (Bảo mật chi phí).
    Thủ kho (Warehouse) và Nhân viên bán hàng không được xem giá vốn.
    Admin, Quản lý kho (WH Manager), Kế toán (Accountant), Giám đốc được xem.
    """
    if not user:
        return True  # Fallback cho testing nội bộ
    role_str = str(user.role).strip().lower()
    restricted_roles = {"warehouse", "thủ kho", "sales rep", "customer"}
    return role_str not in restricted_roles


def _generate_receipt_code(db: Session) -> str:
    """Tự động sinh mã phiếu nhập kho: PNK-YYYYMMDD-XXXX (AC-2)."""
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"PNK-{today_str}-"

    # Đếm số phiếu nhập đã tạo trong ngày
    count = db.query(func.count(StockReceipt.id)).filter(
        StockReceipt.receipt_code.like(f"{prefix}%")
    ).scalar() or 0

    next_num = count + 1
    code = f"{prefix}{next_num:04d}"

    # Đảm bảo không trùng lặp nếu có giao dịch đồng thời
    while db.query(StockReceipt.id).filter(StockReceipt.receipt_code == code).first():
        next_num += 1
        code = f"{prefix}{next_num:04d}"

    return code


def _map_to_response(
    db: Session,
    receipt: StockReceipt,
    can_view_cost: bool,
) -> StockReceiptResponse:
    """Chuyển đổi ORM StockReceipt sang schema StockReceiptResponse kèm ẩn giá vốn nếu không đủ quyền."""
    _, wh_name = resolve_warehouse(db, receipt.warehouse_id)
    sup_name = receipt.supplier.name if receipt.supplier else None

    item_responses = []
    for it in receipt.items:
        prod_name = it.product.name if it.product else None
        item_responses.append(
            StockReceiptItemResponse(
                id=it.id,
                product_id=it.product_id,
                product_name=prod_name,
                sku=it.sku or (it.product.sku if it.product else None),
                quantity=it.quantity,
                cost_price=it.cost_price if can_view_cost else None,
                lot_number=it.lot_number,
                expiry_date=it.expiry_date,
            )
        )

    return StockReceiptResponse(
        id=receipt.id,
        receipt_code=receipt.receipt_code,
        supplier_id=receipt.supplier_id,
        supplier_name=sup_name,
        warehouse_id=receipt.warehouse_id,
        warehouse_name=wh_name,
        status=receipt.status,
        note=receipt.note,
        total_items=receipt.total_items,
        total_quantity=receipt.total_quantity,
        total_cost_amount=receipt.total_cost_amount if can_view_cost else None,
        created_by_id=receipt.created_by_id,
        confirmed_by_id=receipt.confirmed_by_id,
        confirmed_at=receipt.confirmed_at,
        created_at=receipt.created_at,
        updated_at=receipt.updated_at,
        items=item_responses,
    )


def create_stock_receipt(
    db: Session,
    data: StockReceiptCreate,
    current_user: User,
) -> StockReceiptResponse:
    """
    Tạo mới phiếu nhập kho từ nhà cung cấp ở trạng thái DRAFT (AC-1, AC-2, AC-3, AC-4).
    Phiếu DRAFT không thay đổi tồn kho thực tế!
    """
    # 1. Kiểm tra kho hợp lệ
    resolve_warehouse(db, data.warehouse_id)

    # 2. Kiểm tra nhà cung cấp nếu có
    if data.supplier_id:
        supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy nhà cung cấp với mã '{data.supplier_id}'.",
            )

    # 3. Kiểm tra danh sách mặt hàng
    if not data.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu nhập kho phải có ít nhất 1 mặt hàng.",
        )

    # 4. Sinh mã phiếu
    receipt_code = (data.receipt_code or "").strip()
    if receipt_code:
        exist = db.query(StockReceipt.id).filter(StockReceipt.receipt_code == receipt_code).first()
        if exist:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Mã phiếu nhập '{receipt_code}' đã tồn tại trong hệ thống.",
            )
    else:
        receipt_code = _generate_receipt_code(db)

    # 5. Khởi tạo đối tượng phiếu nhập DRAFT
    receipt = StockReceipt(
        receipt_code=receipt_code,
        supplier_id=data.supplier_id,
        warehouse_id=data.warehouse_id,
        status="DRAFT",
        note=data.note,
        created_by_id=current_user.id,
    )
    db.add(receipt)
    db.flush()

    total_qty = 0
    total_cost = 0.0

    # 6. Tạo các dòng hàng StockReceiptItem
    for it in data.items:
        if it.quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số lượng nhập cho SKU '{it.product_id}' phải lớn hơn 0.",
            )
        prod = db.query(Product).filter(Product.id == it.product_id).first()
        if not prod:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy sản phẩm với mã '{it.product_id}'.",
            )

        item_cost = max(0.0, float(it.cost_price or 0.0))
        item_total = it.quantity * item_cost
        total_qty += it.quantity
        total_cost += item_total

        receipt_item = StockReceiptItem(
            receipt_id=receipt.id,
            product_id=prod.id,
            sku=prod.sku,
            quantity=it.quantity,
            cost_price=item_cost,
            lot_number=it.lot_number,
            expiry_date=it.expiry_date,
        )
        db.add(receipt_item)

    receipt.total_items = len(data.items)
    receipt.total_quantity = total_qty
    receipt.total_cost_amount = total_cost

    db.commit()
    db.refresh(receipt)

    can_view = _can_view_cost(current_user)
    return _map_to_response(db, receipt, can_view)


def update_stock_receipt(
    db: Session,
    receipt_id: int,
    data: StockReceiptUpdate,
    current_user: User,
) -> StockReceiptResponse:
    """
    Cập nhật thông tin phiếu nhập kho.
    Quy tắc AC-5: Chỉ cho phép sửa khi trạng thái là DRAFT. Phiếu đã CONFIRMED là bất biến!
    """
    receipt = db.query(StockReceipt).filter(StockReceipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu nhập kho ID '{receipt_id}'.",
        )

    if receipt.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể chỉnh sửa phiếu nhập ở trạng thái '{receipt.status}'. Phiếu đã xác nhận là bất biến!",
        )

    if data.warehouse_id is not None:
        resolve_warehouse(db, data.warehouse_id)
        receipt.warehouse_id = data.warehouse_id

    if data.supplier_id is not None:
        if data.supplier_id:
            supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
            if not supplier:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy nhà cung cấp với mã '{data.supplier_id}'.",
                )
        receipt.supplier_id = data.supplier_id

    if data.note is not None:
        receipt.note = data.note

    if data.items is not None:
        if not data.items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phiếu nhập kho phải có ít nhất 1 mặt hàng.",
            )
        # Xóa các dòng hàng cũ
        db.query(StockReceiptItem).filter(StockReceiptItem.receipt_id == receipt.id).delete()

        total_qty = 0
        total_cost = 0.0
        for it in data.items:
            if it.quantity <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Số lượng nhập cho SKU '{it.product_id}' phải lớn hơn 0.",
                )
            prod = db.query(Product).filter(Product.id == it.product_id).first()
            if not prod:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy sản phẩm với mã '{it.product_id}'.",
                )
            item_cost = max(0.0, float(it.cost_price or 0.0))
            total_qty += it.quantity
            total_cost += it.quantity * item_cost

            receipt_item = StockReceiptItem(
                receipt_id=receipt.id,
                product_id=prod.id,
                sku=prod.sku,
                quantity=it.quantity,
                cost_price=item_cost,
                lot_number=it.lot_number,
                expiry_date=it.expiry_date,
            )
            db.add(receipt_item)

        receipt.total_items = len(data.items)
        receipt.total_quantity = total_qty
        receipt.total_cost_amount = total_cost

    receipt.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(receipt)

    can_view = _can_view_cost(current_user)
    return _map_to_response(db, receipt, can_view)


def confirm_stock_receipt(
    db: Session,
    receipt_id: int,
    current_user: User,
) -> StockReceiptResponse:
    """
    Xác nhận hoàn tất phiếu nhập kho (AC-4, AC-5):
    1. Kiểm tra trạng thái DRAFT.
    2. Duyệt từng mặt hàng, gọi record_stock_movement (IN_PURCHASE) với auto_commit=False.
    3. Cập nhật thống kê nhà cung cấp (total_imports, total_spent, has_receipts).
    4. Đổi trạng thái -> CONFIRMED, lưu confirmed_by_id và confirmed_at.
    5. Commit toàn bộ trong một transaction nguyên tử!
    """
    receipt = db.query(StockReceipt).filter(StockReceipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu nhập kho ID '{receipt_id}'.",
        )

    if receipt.status == "CONFIRMED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Phiếu nhập kho '{receipt.receipt_code}' đã được xác nhận trước đó (bất biến).",
        )

    if receipt.status == "CANCELLED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể xác nhận phiếu nhập đã hủy '{receipt.receipt_code}'.",
        )

    if not receipt.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu nhập không có mặt hàng nào để nhập kho.",
        )

    try:
        # Ghi sổ từng dòng hàng vào Sổ tồn kho đa kho S5
        for item in receipt.items:
            record_stock_movement(
                db,
                product_id=item.product_id,
                warehouse_id=receipt.warehouse_id,
                quantity_base=item.quantity,
                movement_type=StockMovementType.IN_PURCHASE,
                reference_code=receipt.receipt_code,
                line_ref=f"LINE-{item.id}",
                performer_id=current_user.id,
                note=f"Nhập kho NCC theo phiếu {receipt.receipt_code}",
                auto_commit=False,
            )

        # Cập nhật thông số nhà cung cấp nếu có liên kết
        if receipt.supplier:
            receipt.supplier.total_imports = (receipt.supplier.total_imports or 0) + 1
            receipt.supplier.total_spent = (receipt.supplier.total_spent or 0.0) + (receipt.total_cost_amount or 0.0)
            receipt.supplier.has_receipts = True

        # Đổi trạng thái phiếu
        receipt.status = "CONFIRMED"
        receipt.confirmed_by_id = current_user.id
        receipt.confirmed_at = datetime.now(timezone.utc)
        receipt.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(receipt)

    except Exception:
        db.rollback()
        raise

    can_view = _can_view_cost(current_user)
    return _map_to_response(db, receipt, can_view)


def cancel_stock_receipt(
    db: Session,
    receipt_id: int,
    current_user: User,
    reason: Optional[str] = None,
) -> StockReceiptResponse:
    """
    Hủy phiếu nhập kho (AC-5):
    Chỉ cho phép hủy khi phiếu đang ở trạng thái DRAFT.
    Phiếu đã CONFIRMED không được hủy trực tiếp mà phải dùng phiếu điều chỉnh/đảo ngược!
    """
    receipt = db.query(StockReceipt).filter(StockReceipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu nhập kho ID '{receipt_id}'.",
        )

    if receipt.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ có thể hủy phiếu nhập ở trạng thái DRAFT. Phiếu trạng thái '{receipt.status}' là bất biến!",
        )

    receipt.status = "CANCELLED"
    cancel_note = f"[Đã hủy bởi User #{current_user.id}: {reason}]" if reason else f"[Đã hủy bởi User #{current_user.id}]"
    receipt.note = f"{receipt.note}\n{cancel_note}".strip() if receipt.note else cancel_note
    receipt.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(receipt)

    can_view = _can_view_cost(current_user)
    return _map_to_response(db, receipt, can_view)


def get_stock_receipt(
    db: Session,
    receipt_id: int,
    current_user: Optional[User] = None,
) -> StockReceiptResponse:
    """Lấy thông tin chi tiết một phiếu nhập kho."""
    receipt = db.query(StockReceipt).filter(StockReceipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu nhập kho ID '{receipt_id}'.",
        )
    can_view = _can_view_cost(current_user)
    return _map_to_response(db, receipt, can_view)


def list_stock_receipts(
    db: Session,
    *,
    page: int = 1,
    size: int = 20,
    status_filter: Optional[str] = None,
    warehouse_id: Optional[int] = None,
    supplier_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: Optional[User] = None,
) -> StockReceiptListResponse:
    """Danh sách phiếu nhập kho có phân trang và bộ lọc nâng cao."""
    query = db.query(StockReceipt)

    if status_filter:
        query = query.filter(StockReceipt.status == status_filter.strip().upper())

    if warehouse_id is not None:
        query = query.filter(StockReceipt.warehouse_id == warehouse_id)

    if supplier_id:
        query = query.filter(StockReceipt.supplier_id == supplier_id)

    if search:
        kw = f"%{search.strip()}%"
        query = query.filter(StockReceipt.receipt_code.ilike(kw))

    total = query.count()
    items = query.order_by(desc(StockReceipt.created_at)).offset((page - 1) * size).limit(size).all()

    can_view = _can_view_cost(current_user)
    responses = [_map_to_response(db, r, can_view) for r in items]
    total_pages = max(1, (total + size - 1) // size)

    return StockReceiptListResponse(
        items=responses,
        total=total,
        page=page,
        size=size,
        total_pages=total_pages,
    )
