from datetime import datetime, timezone
from typing import Optional, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.models.auth import User
from app.models.supplier import Supplier
from app.models.product import Product
from app.models.stock_receipt import SupplierStockReceipt, SupplierStockReceiptItem
from app.schemas.stock_receipt import (
    StockReceiptCreate,
    StockReceiptUpdate,
    StockReceiptResponse,
    StockReceiptItemResponse,
    StockReceiptListResponse,
    StockReceiptAdjustmentRequest,
)
from app.services.stock_ledger import (
    record_stock_movement,
    resolve_warehouse,
    get_sku_ledger_summary,
    StockMovementType,
)


def _is_date_managed_product(product: Product) -> bool:
    """
    AC-3: Nhận biết sản phẩm quản lý theo date (hạn sử dụng / số lô).
    Quy tắc: Nhóm hàng hoặc tên sản phẩm thuộc các ngành thực phẩm, sữa, đồ uống,
    bánh kẹo, đồ tươi sống, dược phẩm.
    """
    date_keywords = [
        "sữa", "thực phẩm", "đồ uống", "bánh", "kẹo", "tươi",
        "date", "hạn dùng", "food", "dairy", "beverage", "dược"
    ]
    check_text = f"{product.category or ''} {product.name or ''}".lower()
    return any(kw in check_text for kw in date_keywords)


def _generate_receipt_code(db: Session) -> str:
    """Tự động sinh mã phiếu nhập kho: PNK-YYYYMMDD-XXXX (AC-1)."""
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"PNK-{today_str}-"

    count = db.query(func.count(SupplierStockReceipt.id)).filter(
        SupplierStockReceipt.receipt_code.like(f"{prefix}%")
    ).scalar() or 0

    next_num = count + 1
    code = f"{prefix}{next_num:04d}"

    while db.query(SupplierStockReceipt.id).filter(SupplierStockReceipt.receipt_code == code).first():
        next_num += 1
        code = f"{prefix}{next_num:04d}"

    return code


def _map_to_response(
    db: Session,
    receipt: SupplierStockReceipt,
) -> StockReceiptResponse:
    """Chuyển đổi ORM sang schema response. Tra cứu tên kho động qua resolve_warehouse."""
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
                input_quantity=it.input_quantity,
                input_unit=it.input_unit,
                conversion_rate=it.conversion_rate,
                quantity_base=it.quantity_base,
                adjusted_quantity=it.adjusted_quantity or 0,
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
    Tạo mới phiếu nhập kho từ nhà cung cấp ở trạng thái DRAFT.
    - AC-2: Tự động tính quantity_base = input_quantity * conversion_rate trên server.
    - AC-3: Bắt buộc lot_number & expiry_date cho sản phẩm quản lý theo date.
    - AC-4: Phiếu DRAFT không thay đổi tồn kho thực tế!
    """
    resolve_warehouse(db, data.warehouse_id)

    if data.supplier_id:
        supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy nhà cung cấp với mã '{data.supplier_id}'.",
            )

    if not data.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu nhập kho phải có ít nhất 1 mặt hàng.",
        )

    receipt_code = (data.receipt_code or "").strip()
    if receipt_code:
        exist = db.query(SupplierStockReceipt.id).filter(SupplierStockReceipt.receipt_code == receipt_code).first()
        if exist:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Mã phiếu nhập '{receipt_code}' đã tồn tại trong hệ thống.",
            )
    else:
        receipt_code = _generate_receipt_code(db)

    receipt = SupplierStockReceipt(
        receipt_code=receipt_code,
        supplier_id=data.supplier_id,
        warehouse_id=data.warehouse_id,
        status="DRAFT",
        note=data.note,
        created_by_id=current_user.id,
    )
    db.add(receipt)
    db.flush()

    total_base_qty = 0

    for it in data.items:
        if it.input_quantity <= 0:
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

        # AC-3: Kiểm tra hàng quản lý theo date
        if _is_date_managed_product(prod):
            if not it.lot_number or not it.lot_number.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sản phẩm '{prod.name}' quản lý theo hạn sử dụng, bắt buộc phải có số lô (lot_number).",
                )
            if not it.expiry_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sản phẩm '{prod.name}' quản lý theo hạn sử dụng, bắt buộc phải có ngày hết hạn (expiry_date).",
                )

        # AC-2: Server tự tính toán số lượng cơ sở quantity_base
        conv_rate = max(1, int(it.conversion_rate or 1))
        qty_base = it.input_quantity * conv_rate
        total_base_qty += qty_base

        receipt_item = SupplierStockReceiptItem(
            receipt_id=receipt.id,
            product_id=prod.id,
            sku=prod.sku,
            input_quantity=it.input_quantity,
            input_unit=it.input_unit or prod.unit,
            conversion_rate=conv_rate,
            quantity_base=qty_base,
            lot_number=it.lot_number.strip() if it.lot_number else None,
            expiry_date=it.expiry_date,
        )
        db.add(receipt_item)

    receipt.total_items = len(data.items)
    receipt.total_quantity = total_base_qty

    db.commit()
    db.refresh(receipt)

    return _map_to_response(db, receipt)


def update_stock_receipt(
    db: Session,
    receipt_id: int,
    data: StockReceiptUpdate,
    current_user: User,
) -> StockReceiptResponse:
    """Cập nhật phiếu nhập kho (AC-5: Chỉ cho phép sửa khi DRAFT)."""
    receipt = db.query(SupplierStockReceipt).filter(SupplierStockReceipt.id == receipt_id).first()
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
        db.query(SupplierStockReceiptItem).filter(SupplierStockReceiptItem.receipt_id == receipt.id).delete()

        total_base_qty = 0
        for it in data.items:
            if it.input_quantity <= 0:
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

            if _is_date_managed_product(prod):
                if not it.lot_number or not it.lot_number.strip():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Sản phẩm '{prod.name}' quản lý theo hạn sử dụng, bắt buộc phải có số lô (lot_number).",
                    )
                if not it.expiry_date:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Sản phẩm '{prod.name}' quản lý theo hạn sử dụng, bắt buộc phải có ngày hết hạn (expiry_date).",
                    )

            conv_rate = max(1, int(it.conversion_rate or 1))
            qty_base = it.input_quantity * conv_rate
            total_base_qty += qty_base

            receipt_item = SupplierStockReceiptItem(
                receipt_id=receipt.id,
                product_id=prod.id,
                sku=prod.sku,
                input_quantity=it.input_quantity,
                input_unit=it.input_unit or prod.unit,
                conversion_rate=conv_rate,
                quantity_base=qty_base,
                lot_number=it.lot_number.strip() if it.lot_number else None,
                expiry_date=it.expiry_date,
            )
            db.add(receipt_item)

        receipt.total_items = len(data.items)
        receipt.total_quantity = total_base_qty

    receipt.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(receipt)

    return _map_to_response(db, receipt)


def confirm_stock_receipt(
    db: Session,
    receipt_id: int,
    current_user: User,
) -> StockReceiptResponse:
    """
    Xác nhận hoàn tất phiếu nhập kho (AC-4, AC-5):
    - Chặn xác nhận hai lần (trả về 409 Conflict).
    - Gọi record_stock_movement với quantity_base (AC-2) và IN_PURCHASE.
    - Cập nhật số lần nhập NCC (total_imports, has_receipts).
    """
    receipt = db.query(SupplierStockReceipt).filter(SupplierStockReceipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu nhập kho ID '{receipt_id}'.",
        )

    # Chặn xác nhận hai lần -> 409 Conflict
    if receipt.status == "CONFIRMED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Phiếu nhập kho '{receipt.receipt_code}' đã được xác nhận trước đó (giao dịch bất biến).",
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
        for item in receipt.items:
            # AC-2: record_stock_movement nhận số lượng cơ sở (quantity_base)
            record_stock_movement(
                db,
                product_id=item.product_id,
                warehouse_id=receipt.warehouse_id,
                quantity_base=item.quantity_base,
                movement_type=StockMovementType.IN_PURCHASE,
                reference_code=receipt.receipt_code,
                line_ref=f"LINE-{item.id}",
                performer_id=current_user.id,
                note=f"Nhập kho NCC theo phiếu {receipt.receipt_code}",
                auto_commit=False,
            )

        if receipt.supplier:
            receipt.supplier.total_imports = (receipt.supplier.total_imports or 0) + 1
            receipt.supplier.has_receipts = True

        receipt.status = "CONFIRMED"
        receipt.confirmed_by_id = current_user.id
        receipt.confirmed_at = datetime.now(timezone.utc)
        receipt.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(receipt)

    except Exception:
        db.rollback()
        raise

    return _map_to_response(db, receipt)


def adjust_stock_receipt(
    db: Session,
    receipt_id: int,
    data: StockReceiptAdjustmentRequest,
    current_user: User,
) -> StockReceiptResponse:
    """
    AC-5: Điều chỉnh / đảo ngược phiếu nhập kho đã CONFIRMED:
    - Gọi IN_PURCHASE_REVERSAL (-) để giảm tồn kho vật lý.
    - Bắt buộc lý do (reason).
    - Không đảo vượt số lượng đã nhập của từng dòng hàng.
    - Không làm âm tồn kho thực tế hiện tại.
    """
    receipt = db.query(SupplierStockReceipt).filter(SupplierStockReceipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu nhập kho ID '{receipt_id}'.",
        )

    if receipt.status != "CONFIRMED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ có thể lập phiếu điều chỉnh cho phiếu đã CONFIRMED. Trạng thái hiện tại: '{receipt.status}'.",
        )

    if not data.reason or not data.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải nhập lý do điều chỉnh phiếu nhập kho.",
        )

    items_map = {it.product_id: it for it in receipt.items}

    try:
        for adj_item in data.items:
            target_receipt_item = items_map.get(adj_item.product_id)
            if not target_receipt_item:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sản phẩm '{adj_item.product_id}' không có trong phiếu nhập gốc '{receipt.receipt_code}'.",
                )

            # Kiểm tra: không đảo vượt số lượng đã nhập
            remaining_to_adjust = target_receipt_item.quantity_base - (target_receipt_item.adjusted_quantity or 0)
            if adj_item.quantity > remaining_to_adjust:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Số lượng yêu cầu đảo ({adj_item.quantity}) vượt quá số lượng còn lại có thể đảo ({remaining_to_adjust}) của sản phẩm '{adj_item.product_id}'.",
                )

            # Kiểm tra: không làm âm tồn kho thực tế hiện tại
            summary = get_sku_ledger_summary(db, product_id=adj_item.product_id, warehouse_id=receipt.warehouse_id)
            current_physical = summary["physical_stock"]
            if current_physical < adj_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tồn kho thực tế hiện tại ({current_physical}) không đủ để đảo giảm {adj_item.quantity} cho sản phẩm '{adj_item.product_id}'. Sẽ làm âm kho!",
                )

            # Ghi nhận biến động đảo nhập kho
            record_stock_movement(
                db,
                product_id=adj_item.product_id,
                warehouse_id=receipt.warehouse_id,
                quantity_base=adj_item.quantity,
                movement_type=StockMovementType.IN_PURCHASE_REVERSAL,
                reference_code=f"DC-{receipt.receipt_code}",
                line_ref=f"REV-{target_receipt_item.id}",
                performer_id=current_user.id,
                note=data.reason.strip(),
                auto_commit=False,
            )

            target_receipt_item.adjusted_quantity = (target_receipt_item.adjusted_quantity or 0) + adj_item.quantity

        receipt.note = f"{receipt.note or ''}\n[Điều chỉnh giảm: {data.reason}]".strip()
        receipt.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(receipt)

    except Exception:
        db.rollback()
        raise

    return _map_to_response(db, receipt)


def cancel_stock_receipt(
    db: Session,
    receipt_id: int,
    current_user: User,
    reason: Optional[str] = None,
) -> StockReceiptResponse:
    """Hủy phiếu nhập kho (AC-5: Chỉ khi DRAFT)."""
    receipt = db.query(SupplierStockReceipt).filter(SupplierStockReceipt.id == receipt_id).first()
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

    return _map_to_response(db, receipt)


def get_stock_receipt(
    db: Session,
    receipt_id: int,
    current_user: Optional[User] = None,
) -> StockReceiptResponse:
    """Lấy thông tin chi tiết một phiếu nhập kho."""
    receipt = db.query(SupplierStockReceipt).filter(SupplierStockReceipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu nhập kho ID '{receipt_id}'.",
        )
    return _map_to_response(db, receipt)


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
    query = db.query(SupplierStockReceipt)

    if status_filter:
        query = query.filter(SupplierStockReceipt.status == status_filter.strip().upper())

    if warehouse_id is not None:
        query = query.filter(SupplierStockReceipt.warehouse_id == warehouse_id)

    if supplier_id:
        query = query.filter(SupplierStockReceipt.supplier_id == supplier_id)

    if search:
        kw = f"%{search.strip()}%"
        query = query.filter(SupplierStockReceipt.receipt_code.ilike(kw))

    total = query.count()
    items = query.order_by(desc(SupplierStockReceipt.created_at)).offset((page - 1) * size).limit(size).all()

    responses = [_map_to_response(db, r) for r in items]
    total_pages = max(1, (total + size - 1) // size)

    return StockReceiptListResponse(
        items=responses,
        total=total,
        page=page,
        size=size,
        total_pages=total_pages,
    )
