from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.inventory import StockReceipt, StockReceiptItem, InventoryHistory
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.schemas.inventory import StockReceiptCreate
from app.services.product_service import ensure_seed_products


def _get_or_create_stock_profile(db: Session, product: Product, default_stock: int = 0) -> ProductStockProfile:
    profile = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == product.id).first()
    if not profile:
        profile = ProductStockProfile(
            product_id=product.id,
            sku=product.sku,
            stock=default_stock,
            min_stock=10,
            warehouse="Kho Tổng Hà Nội"
        )
        db.add(profile)
        db.flush()
    return profile


def get_stock_in_receipts(db: Session) -> List[StockReceipt]:
    return db.query(StockReceipt).filter(StockReceipt.type == "in").order_by(StockReceipt.created_at.desc()).all()


def get_stock_out_receipts(db: Session) -> List[StockReceipt]:
    return db.query(StockReceipt).filter(StockReceipt.type == "out").order_by(StockReceipt.created_at.desc()).all()


def create_stock_in_receipt(db: Session, receipt_in: StockReceiptCreate) -> StockReceipt:
    ensure_seed_products(db)
    count = db.query(StockReceipt).filter(StockReceipt.type == "in").count() + 1
    receipt_id = f"STK-IN-{str(count).zfill(3)}"
    code = f"PNK-2026-{str(count).zfill(3)}"

    total_items = sum(item.quantity for item in receipt_in.items)

    receipt = StockReceipt(
        id=receipt_id,
        code=code,
        type="in",
        supplier_id=receipt_in.supplier_id,
        supplier_name=receipt_in.supplier_name,
        warehouse=receipt_in.warehouse,
        reason=receipt_in.reason or "Nhập kho mua hàng từ nhà cung cấp",
        total_items=total_items,
        total_amount=receipt_in.total_amount,
        created_by=receipt_in.created_by or "Thủ kho",
        note=receipt_in.note,
        status="completed"
    )

    now = datetime.now(timezone.utc)
    for itm in receipt_in.items:
        receipt.items.append(StockReceiptItem(**itm.model_dump()))

        # Tăng tồn kho sản phẩm
        prod = None
        str_pid = str(itm.product_id).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        if not prod and itm.sku:
            prod = db.query(Product).filter(Product.sku == itm.sku).first()

        new_balance = itm.quantity
        if prod:
            stock_profile = _get_or_create_stock_profile(db, prod, default_stock=0)
            stock_profile.stock += itm.quantity
            new_balance = stock_profile.stock
            if stock_profile.stock > stock_profile.min_stock:
                prod.status = "active"
            elif stock_profile.stock > 0:
                prod.status = "low_stock"

        # Ghi thẻ kho (Inventory History)
        hist_id = f"HIST-{int(now.timestamp() * 1000)}-{itm.product_id}"
        history_record = InventoryHistory(
            id=hist_id,
            code=code,
            type="in",
            product_id=itm.product_id,
            product_name=itm.name,
            sku=itm.sku,
            quantity=itm.quantity,
            balance_after=new_balance,
            warehouse=receipt_in.warehouse,
            performer=receipt_in.created_by or "Thủ kho",
            note=receipt_in.note or f"Nhập kho theo phiếu {code}"
        )
        db.add(history_record)

    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return receipt


def create_stock_out_receipt(db: Session, receipt_in: StockReceiptCreate) -> StockReceipt:
    ensure_seed_products(db)
    # Kiểm tra tồn kho trước khi xuất
    for itm in receipt_in.items:
        prod = None
        str_pid = str(itm.product_id).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        if not prod and itm.sku:
            prod = db.query(Product).filter(Product.sku == itm.sku).first()

        if prod:
            stock_profile = _get_or_create_stock_profile(db, prod, default_stock=100)
            if stock_profile.stock < itm.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sản phẩm '{prod.name}' không đủ tồn kho để xuất (Còn {stock_profile.stock}, yêu cầu {itm.quantity})."
                )

    count = db.query(StockReceipt).filter(StockReceipt.type == "out").count() + 1
    receipt_id = f"STK-OUT-{str(count).zfill(3)}"
    code = f"PXK-2026-{str(count).zfill(3)}"

    total_items = sum(item.quantity for item in receipt_in.items)

    receipt = StockReceipt(
        id=receipt_id,
        code=code,
        type="out",
        customer_id=receipt_in.customer_id,
        customer_name=receipt_in.customer_name,
        warehouse=receipt_in.warehouse,
        target_warehouse=receipt_in.target_warehouse,
        reason=receipt_in.reason or "Xuất kho bán lẻ",
        total_items=total_items,
        total_amount=receipt_in.total_amount,
        created_by=receipt_in.created_by or "Thủ kho",
        note=receipt_in.note,
        status="completed"
    )

    now = datetime.now(timezone.utc)
    for itm in receipt_in.items:
        receipt.items.append(StockReceiptItem(**itm.model_dump()))

        # Giảm tồn kho sản phẩm
        prod = None
        str_pid = str(itm.product_id).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        if not prod and itm.sku:
            prod = db.query(Product).filter(Product.sku == itm.sku).first()

        new_balance = 0
        if prod:
            stock_profile = _get_or_create_stock_profile(db, prod, default_stock=100)
            stock_profile.stock = max(0, stock_profile.stock - itm.quantity)
            new_balance = stock_profile.stock
            if stock_profile.stock == 0:
                prod.status = "out_of_stock"
            elif stock_profile.stock <= stock_profile.min_stock:
                prod.status = "low_stock"

        # Ghi thẻ kho (Inventory History)
        hist_id = f"HIST-{int(now.timestamp() * 1000)}-{itm.product_id}"
        history_record = InventoryHistory(
            id=hist_id,
            code=code,
            type="out" if not receipt_in.target_warehouse else "transfer",
            product_id=itm.product_id,
            product_name=itm.name,
            sku=itm.sku,
            quantity=-itm.quantity,
            balance_after=new_balance,
            warehouse=receipt_in.warehouse,
            performer=receipt_in.created_by or "Thủ kho",
            note=receipt_in.note or f"Xuất kho theo phiếu {code}"
        )
        db.add(history_record)

    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return receipt


def get_all_inventory_history(db: Session) -> List[InventoryHistory]:
    return db.query(InventoryHistory).order_by(InventoryHistory.created_at.desc()).all()
