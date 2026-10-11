from datetime import datetime, timezone, timedelta
import pytest
from fastapi import HTTPException

from app.core.database import SessionLocal, Base, engine
from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.stock_receipt import StockReceipt, StockReceiptItem
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.schemas.stock_receipt import (
    StockReceiptCreate,
    StockReceiptUpdate,
    StockReceiptItemCreate,
)
from app.services.stock_receipt_service import (
    create_stock_receipt,
    update_stock_receipt,
    confirm_stock_receipt,
    cancel_stock_receipt,
    get_stock_receipt,
    list_stock_receipts,
)
from app.services.stock_ledger import get_sku_ledger_summary


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Dọn dẹp dữ liệu test cũ
    db.query(StockReceiptItem).filter(StockReceiptItem.product_id == "PRD-RECEIPT-TEST").delete(synchronize_session=False)
    db.query(StockReceipt).filter(StockReceipt.note.like("%TEST-RECEIPT%")).delete(synchronize_session=False)
    db.query(StockLedgerEntry).filter(StockLedgerEntry.product_id == "PRD-RECEIPT-TEST").delete(synchronize_session=False)
    db.query(WarehouseStock).filter(WarehouseStock.product_id == "PRD-RECEIPT-TEST").delete(synchronize_session=False)
    db.commit()

    # Tạo User Admin và User Warehouse (Thủ kho)
    admin_user = db.query(User).filter(User.username == "test_admin_receipt").first()
    if not admin_user:
        admin_user = User(
            username="test_admin_receipt",
            email="admin_receipt@example.com",
            hashed_password="hashed_secret",
            role=UserRole.ADMIN.value,
            full_name="Quản Trị Viên Kho",
        )
        db.add(admin_user)
        db.commit()

    wh_user = db.query(User).filter(User.username == "test_wh_worker").first()
    if not wh_user:
        wh_user = User(
            username="test_wh_worker",
            email="wh_worker@example.com",
            hashed_password="hashed_secret",
            role=UserRole.WAREHOUSE.value,
            full_name="Nhân Viên Thủ Kho",
        )
        db.add(wh_user)
        db.commit()

    # Tạo Nhà cung cấp test
    sup = db.query(Supplier).filter(Supplier.id == "SUP-TEST-RECEIPT-01").first()
    if not sup:
        sup = Supplier(
            id="SUP-TEST-RECEIPT-01",
            code="NCC-TEST-01",
            name="Nhà Cung Cấp Sữa Ba Vì",
            tax_code="0109998887",
            status="active",
            total_imports=0,
            total_spent=0.0,
        )
        db.add(sup)
        db.commit()

    # Tạo Sản phẩm test
    prod = db.query(Product).filter(Product.id == "PRD-RECEIPT-TEST").first()
    if not prod:
        prod = Product(
            id="PRD-RECEIPT-TEST",
            sku="SKU-RCP-01",
            name="Sữa Tươi Nhập Khẩu Test",
            category="Đồ uống",
            unit="thùng",
            status="ACTIVE",
            is_active=True,
            stock=0,
            min_stock=5,
        )
        db.add(prod)
        db.commit()

    yield {
        "db": db,
        "admin": admin_user,
        "worker": wh_user,
        "supplier": sup,
        "product": prod,
    }
    db.close()


def test_create_draft_receipt_does_not_change_stock(setup_db):
    """AC-4: Tạo phiếu nhập DRAFT không làm thay đổi số tồn kho vật lý."""
    db = setup_db["db"]
    admin = setup_db["admin"]
    prod = setup_db["product"]

    # Khởi tạo tồn kho ban đầu = 0
    summary_before = get_sku_ledger_summary(db, product_id=prod.id, warehouse_id=1)
    initial_physical = summary_before["physical_stock"]

    req = StockReceiptCreate(
        supplier_id="SUP-TEST-RECEIPT-01",
        warehouse_id=1,
        note="TEST-RECEIPT Phiếu nhập kho thử nghiệm DRAFT",
        items=[
            StockReceiptItemCreate(
                product_id=prod.id,
                quantity=100,
                cost_price=250000.0,
                lot_number="LOT-2026-A1",
                expiry_date=datetime.now(timezone.utc) + timedelta(days=180),
            )
        ],
    )
    receipt_resp = create_stock_receipt(db, req, admin)

    assert receipt_resp.status == "DRAFT"
    assert receipt_resp.receipt_code.startswith("PNK-")
    assert receipt_resp.total_quantity == 100
    assert receipt_resp.total_cost_amount == 25000000.0

    # Kiểm tra tồn kho vật lý sau khi tạo DRAFT: TUYỆT ĐỐI KHÔNG ĐỔI
    summary_after = get_sku_ledger_summary(db, product_id=prod.id, warehouse_id=1)
    assert summary_after["physical_stock"] == initial_physical


def test_confirm_receipt_increases_stock_and_updates_supplier(setup_db):
    """AC-4, AC-5: Xác nhận phiếu nhập cộng tồn thực tế, ghi sổ cái, và cập nhật chỉ số NCC."""
    db = setup_db["db"]
    admin = setup_db["admin"]
    prod = setup_db["product"]
    sup = setup_db["supplier"]

    imports_before = sup.total_imports or 0
    spent_before = sup.total_spent or 0.0

    # Tạo phiếu DRAFT mới
    req = StockReceiptCreate(
        supplier_id=sup.id,
        warehouse_id=1,
        note="TEST-RECEIPT Nhập thực tế",
        items=[
            StockReceiptItemCreate(
                product_id=prod.id,
                quantity=60,
                cost_price=100000.0,
                lot_number="LOT-2026-CONFIRM",
            )
        ],
    )
    draft = create_stock_receipt(db, req, admin)

    # Xác nhận phiếu
    confirmed = confirm_stock_receipt(db, draft.id, admin)
    assert confirmed.status == "CONFIRMED"
    assert confirmed.confirmed_by_id == admin.id
    assert confirmed.confirmed_at is not None

    # Kiểm tra tồn kho vật lý đã tăng 60
    summary = get_sku_ledger_summary(db, product_id=prod.id, warehouse_id=1)
    assert summary["physical_stock"] == 60

    # Kiểm tra sổ cái có bản ghi IN_PURCHASE
    entry = db.query(StockLedgerEntry).filter(
        StockLedgerEntry.reference_code == confirmed.receipt_code,
        StockLedgerEntry.movement_type == "IN_PURCHASE",
    ).first()
    assert entry is not None
    assert entry.quantity_base == 60

    # Kiểm tra NCC được cập nhật
    db.refresh(sup)
    assert sup.total_imports == imports_before + 1
    assert sup.total_spent == spent_before + 6000000.0
    assert sup.has_receipts is True


def test_confirmed_receipt_is_immutable(setup_db):
    """AC-5: Phiếu đã CONFIRMED là bất biến, từ chối sửa, hủy và xác nhận lại."""
    db = setup_db["db"]
    admin = setup_db["admin"]
    prod = setup_db["product"]

    req = StockReceiptCreate(
        warehouse_id=1,
        note="TEST-RECEIPT Bất biến",
        items=[StockReceiptItemCreate(product_id=prod.id, quantity=10, cost_price=50000.0)],
    )
    draft = create_stock_receipt(db, req, admin)
    confirmed = confirm_stock_receipt(db, draft.id, admin)

    # 1. Thử sửa phiếu CONFIRMED -> 400
    with pytest.raises(HTTPException) as exc1:
        update_stock_receipt(db, confirmed.id, StockReceiptUpdate(note="Sửa thử"), admin)
    assert exc1.value.status_code == 400

    # 2. Thử hủy phiếu CONFIRMED -> 400
    with pytest.raises(HTTPException) as exc2:
        cancel_stock_receipt(db, confirmed.id, admin, reason="Muốn hủy")
    assert exc2.value.status_code == 400

    # 3. Thử xác nhận lại phiếu CONFIRMED -> 400
    with pytest.raises(HTTPException) as exc3:
        confirm_stock_receipt(db, confirmed.id, admin)
    assert exc3.value.status_code == 400


def test_cost_price_security_for_warehouse_worker(setup_db):
    """Bảo mật giá vốn: Nhân viên Thủ kho không được nhìn thấy giá vốn."""
    db = setup_db["db"]
    admin = setup_db["admin"]
    worker = setup_db["worker"]
    prod = setup_db["product"]

    req = StockReceiptCreate(
        warehouse_id=1,
        note="TEST-RECEIPT Bảo mật chi phí",
        items=[StockReceiptItemCreate(product_id=prod.id, quantity=20, cost_price=88888.0)],
    )
    receipt = create_stock_receipt(db, req, admin)

    # Admin xem -> Có giá vốn
    admin_view = get_stock_receipt(db, receipt.id, current_user=admin)
    assert admin_view.total_cost_amount == 20 * 88888.0
    assert admin_view.items[0].cost_price == 88888.0

    # Thủ kho xem -> Giá vốn bị ẩn thành None
    worker_view = get_stock_receipt(db, receipt.id, current_user=worker)
    assert worker_view.total_cost_amount is None
    assert worker_view.items[0].cost_price is None


def test_cancel_draft_receipt(setup_db):
    """Hủy phiếu DRAFT hợp lệ."""
    db = setup_db["db"]
    admin = setup_db["admin"]
    prod = setup_db["product"]

    req = StockReceiptCreate(
        warehouse_id=1,
        note="TEST-RECEIPT Phiếu sẽ bị hủy",
        items=[StockReceiptItemCreate(product_id=prod.id, quantity=15, cost_price=10000.0)],
    )
    draft = create_stock_receipt(db, req, admin)
    cancelled = cancel_stock_receipt(db, draft.id, admin, reason="Đặt nhầm nhà cung cấp")

    assert cancelled.status == "CANCELLED"
    assert "Đặt nhầm nhà cung cấp" in cancelled.note
