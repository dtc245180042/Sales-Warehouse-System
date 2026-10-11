from datetime import datetime, timezone, timedelta
import pytest
from fastapi import HTTPException

from app.core.database import SessionLocal, Base, engine
from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.stock_receipt import SupplierStockReceipt, SupplierStockReceiptItem
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.schemas.stock_receipt import (
    StockReceiptCreate,
    StockReceiptUpdate,
    StockReceiptItemCreate,
    StockReceiptAdjustmentRequest,
    StockReceiptAdjustmentItem,
)
from app.services.stock_receipt_service import (
    create_stock_receipt,
    update_stock_receipt,
    confirm_stock_receipt,
    adjust_stock_receipt,
    cancel_stock_receipt,
    get_stock_receipt,
    list_stock_receipts,
)
from app.services.stock_ledger import get_sku_ledger_summary


from sqlalchemy import text


@pytest.fixture(scope="module")
def setup_db():
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS supplier_stock_receipt_items"))
        conn.execute(text("DROP TABLE IF EXISTS supplier_stock_receipts"))
        conn.execute(text("DELETE FROM stock_ledger_entries WHERE product_id IN ('PRD-RECEIPT-TEST', 'PRD-RECEIPT-NODATE')"))
        conn.execute(text("DELETE FROM warehouse_stocks WHERE product_id IN ('PRD-RECEIPT-TEST', 'PRD-RECEIPT-NODATE')"))
        conn.commit()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

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

    # Tạo Sản phẩm test (ngành Sữa -> quản lý theo date AC-3)
    prod = db.query(Product).filter(Product.id == "PRD-RECEIPT-TEST").first()
    if not prod:
        prod = Product(
            id="PRD-RECEIPT-TEST",
            sku="SKU-RCP-01",
            name="Sữa Tươi Tiệt Trùng Ba Vì",
            category="Sữa & Đồ uống",
            unit="hộp",
            status="ACTIVE",
            is_active=True,
            stock=0,
            min_stock=5,
        )
        db.add(prod)
        db.commit()

    # Sản phẩm phụ kiện (không quản lý theo date)
    prod_nodate = db.query(Product).filter(Product.id == "PRD-RECEIPT-NODATE").first()
    if not prod_nodate:
        prod_nodate = Product(
            id="PRD-RECEIPT-NODATE",
            sku="SKU-RCP-NODATE",
            name="Khay Nhựa Đựng Hàng",
            category="Vật tư",
            unit="chiếc",
            status="ACTIVE",
            is_active=True,
            stock=0,
            min_stock=5,
        )
        db.add(prod_nodate)
        db.commit()

    yield {
        "db": db,
        "admin": admin_user,
        "worker": wh_user,
        "supplier": sup,
        "product": prod,
        "product_nodate": prod_nodate,
    }
    db.close()


def test_unit_conversion_and_draft_does_not_change_stock(setup_db):
    """
    AC-2 & AC-4:
    - 10 thùng x 24 = 240 đơn vị cơ sở (quantity_base do server tự tính).
    - Tạo DRAFT không làm thay đổi tồn kho vật lý.
    """
    db = setup_db["db"]
    admin = setup_db["admin"]
    prod = setup_db["product"]

    summary_before = get_sku_ledger_summary(db, product_id=prod.id, warehouse_id=1)
    initial_physical = summary_before["physical_stock"]

    req = StockReceiptCreate(
        supplier_id="SUP-TEST-RECEIPT-01",
        warehouse_id=1,
        note="TEST-RECEIPT Nhập 10 thùng quy đổi 240 hộp",
        items=[
            StockReceiptItemCreate(
                product_id=prod.id,
                input_quantity=10,
                input_unit="thùng",
                conversion_rate=24,
                lot_number="LOT-2026-X24",
                expiry_date=datetime.now(timezone.utc) + timedelta(days=90),
            )
        ],
    )
    receipt_resp = create_stock_receipt(db, req, admin)

    assert receipt_resp.status == "DRAFT"
    assert receipt_resp.total_quantity == 240  # 10 * 24 = 240
    assert receipt_resp.items[0].quantity_base == 240
    assert receipt_resp.items[0].input_quantity == 10
    assert receipt_resp.items[0].conversion_rate == 24

    # Kiểm tra tồn kho thực tế: KHÔNG ĐỔI
    summary_after = get_sku_ledger_summary(db, product_id=prod.id, warehouse_id=1)
    assert summary_after["physical_stock"] == initial_physical


def test_date_managed_product_validation(setup_db):
    """
    AC-3: Bắt buộc lot_number và expiry_date đối với sản phẩm quản lý theo date.
    """
    db = setup_db["db"]
    admin = setup_db["admin"]
    prod_date = setup_db["product"]
    prod_nodate = setup_db["product_nodate"]

    # 1. Hàng date thiếu lot_number -> Bị từ chối HTTP 400
    with pytest.raises(HTTPException) as exc1:
        create_stock_receipt(
            db,
            StockReceiptCreate(
                warehouse_id=1,
                note="TEST-RECEIPT Thiếu lot",
                items=[
                    StockReceiptItemCreate(
                        product_id=prod_date.id,
                        input_quantity=5,
                        expiry_date=datetime.now(timezone.utc) + timedelta(days=30),
                    )
                ],
            ),
            admin,
        )
    assert exc1.value.status_code == 400
    assert "lot_number" in exc1.value.detail

    # 2. Hàng date thiếu expiry_date -> Bị từ chối HTTP 400
    with pytest.raises(HTTPException) as exc2:
        create_stock_receipt(
            db,
            StockReceiptCreate(
                warehouse_id=1,
                note="TEST-RECEIPT Thiếu expiry",
                items=[
                    StockReceiptItemCreate(
                        product_id=prod_date.id,
                        input_quantity=5,
                        lot_number="LOT-NOLOT",
                    )
                ],
            ),
            admin,
        )
    assert exc2.value.status_code == 400
    assert "expiry_date" in exc2.value.detail

    # 3. Hàng không quản lý theo date (Vật tư) -> Cho phép không cần lot/expiry
    res_nodate = create_stock_receipt(
        db,
        StockReceiptCreate(
            warehouse_id=1,
            note="TEST-RECEIPT Hàng vật tư",
            items=[StockReceiptItemCreate(product_id=prod_nodate.id, input_quantity=20)],
        ),
        admin,
    )
    assert res_nodate.status == "DRAFT"


def test_confirm_increases_stock_and_prevents_duplicate_confirm(setup_db):
    """
    AC-4 & AC-5:
    - Xác nhận phiếu tăng tồn kho bằng quantity_base.
    - Chặn xác nhận hai lần (HTTP 409 Conflict).
    """
    db = setup_db["db"]
    admin = setup_db["admin"]
    prod = setup_db["product"]

    # Làm sạch dữ liệu để test độc lập tuyệt đối
    from app.models.product_stock_profile import ProductStockProfile
    db.query(ProductStockProfile).filter(ProductStockProfile.product_id == prod.id).delete()
    db.query(StockLedgerEntry).filter(StockLedgerEntry.product_id == prod.id).delete()
    db.query(WarehouseStock).filter(WarehouseStock.product_id == prod.id).delete()
    db.commit()

    req = StockReceiptCreate(
        supplier_id="SUP-TEST-RECEIPT-01",
        warehouse_id=1,
        note="TEST-RECEIPT Xác nhận 10 thùng = 240",
        items=[
            StockReceiptItemCreate(
                product_id=prod.id,
                input_quantity=10,
                conversion_rate=24,
                lot_number="LOT-2026-CONFIRM",
                expiry_date=datetime.now(timezone.utc) + timedelta(days=120),
            )
        ],
    )
    draft = create_stock_receipt(db, req, admin)

    # 1. Xác nhận lần 1: thành công
    confirmed = confirm_stock_receipt(db, draft.id, admin)
    assert confirmed.status == "CONFIRMED"

    summary = get_sku_ledger_summary(db, product_id=prod.id, warehouse_id=1)
    assert summary["physical_stock"] == 240

    # 2. Xác nhận lần 2: Bị chặn với HTTP 409 Conflict
    with pytest.raises(HTTPException) as exc_dup:
        confirm_stock_receipt(db, draft.id, admin)
    assert exc_dup.value.status_code == 409


def test_stock_receipt_adjustment_ac5(setup_db):
    """
    AC-5: Lập phiếu điều chỉnh / đảo ngược phiếu nhập:
    - Bắt buộc lý do (reason).
    - Không đảo vượt số lượng đã nhập.
    - Không làm âm kho thực tế.
    - Đảo thành công giảm tồn và ghi thẻ kho IN_PURCHASE_REVERSAL.
    """
    db = setup_db["db"]
    admin = setup_db["admin"]
    prod = setup_db["product"]

    # Phiếu nhập đã có tồn 240 ở test trước.
    receipt = db.query(SupplierStockReceipt).filter(
        SupplierStockReceipt.note == "TEST-RECEIPT Xác nhận 10 thùng = 240"
    ).first()
    assert receipt is not None

    # 1. Thiếu lý do (rỗng/khoảng trắng) -> Bị từ chối HTTP 400
    with pytest.raises(HTTPException) as exc1:
        adjust_stock_receipt(
            db,
            receipt.id,
            StockReceiptAdjustmentRequest.model_construct(
                reason="   ",
                items=[StockReceiptAdjustmentItem(product_id=prod.id, quantity=40)],
            ),
            admin,
        )
    assert exc1.value.status_code == 400
    assert "lý do" in exc1.value.detail

    # 2. Đảo vượt số lượng đã nhập (ví dụ đảo 500 trong khi nhập 240) -> Bị từ chối HTTP 400
    with pytest.raises(HTTPException) as exc2:
        adjust_stock_receipt(
            db,
            receipt.id,
            StockReceiptAdjustmentRequest(
                reason="Xuất trả nhà cung cấp do lỗi",
                items=[StockReceiptAdjustmentItem(product_id=prod.id, quantity=500)],
            ),
            admin,
        )
    assert exc2.value.status_code == 400
    assert "vượt quá số lượng" in exc2.value.detail

    # 3. Đảo hợp lệ: Xuất trả 40 đơn vị cơ sở
    res_adj = adjust_stock_receipt(
        db,
        receipt.id,
        StockReceiptAdjustmentRequest(
            reason="Xuất trả nhà cung cấp do bao bì rách",
            items=[StockReceiptAdjustmentItem(product_id=prod.id, quantity=40)],
        ),
        admin,
    )
    assert res_adj.items[0].adjusted_quantity == 40

    # Kiểm tra tồn kho giảm từ 240 xuống 200
    summary = get_sku_ledger_summary(db, product_id=prod.id, warehouse_id=1)
    assert summary["physical_stock"] == 200

    # Kiểm tra sổ cái có bản ghi IN_PURCHASE_REVERSAL
    rev_entry = db.query(StockLedgerEntry).filter(
        StockLedgerEntry.reference_code == f"DC-{receipt.receipt_code}",
        StockLedgerEntry.movement_type == "IN_PURCHASE_REVERSAL",
    ).first()
    assert rev_entry is not None
    assert rev_entry.quantity_base == 40


def test_cost_price_absent_from_receipt_response(setup_db):
    """Quyết định 5: Giá vốn (cost_price, total_cost_amount) không có trong response."""
    db = setup_db["db"]
    worker = setup_db["worker"]
    admin = setup_db["admin"]
    prod_nodate = setup_db["product_nodate"]

    receipt = db.query(SupplierStockReceipt).first()
    if not receipt:
        receipt = create_stock_receipt(
            db,
            StockReceiptCreate(
                warehouse_id=1,
                note="TEST-RECEIPT Giá vốn",
                items=[StockReceiptItemCreate(product_id=prod_nodate.id, input_quantity=5)],
            ),
            admin,
        )

    resp = get_stock_receipt(db, receipt.id, current_user=worker)
    # Kiểm tra các trường giá vốn đã bị loại bỏ hoàn toàn khỏi schema
    assert not hasattr(resp, "total_cost_amount")
    assert not hasattr(resp.items[0], "cost_price")


def test_dispatch_order_stock_bridge_no_ghost_stock(setup_db):
    """
    Nối cầu L452 & Chống hồi sinh tồn ma (No Ghost Stock Resurrection):
    - Đơn xuất kho hoàn tất -> Trừ tồn kho vật lý và ghi sổ OUT_SALE.
    - Lần _sync_legacy_stock sau đó KHÔNG làm tồn tăng ngược trở lại (không hồi sinh tồn ma).
    - check_ledger_drift(db) báo 0 drift.
    """
    db = setup_db["db"]
    from app.models.order import Order
    from app.models.stock_reservation import StockReservation
    from app.models.product_stock_profile import ProductStockProfile
    from app.services.inventory_reservation_service import fulfill_stock_reservations_for_order
    from app.services.stock_ledger import record_stock_movement, _sync_legacy_stock, check_ledger_drift, StockMovementType

    # 1. Chuẩn bị sản phẩm test có 50 đơn vị tồn ở Kho 1
    prod_id = "PRD-TEST-DISPATCH"
    prod = db.query(Product).filter(Product.id == prod_id).first()
    if not prod:
        prod = Product(
            id=prod_id,
            sku="SKU-DISPATCH-01",
            name="Nước Suối Đóng Thùng Test Dispatch",
            category="Đồ uống",
            unit="thùng",
            status="ACTIVE",
            is_active=True,
            stock=50,
            min_stock=5,
        )
        db.add(prod)
        db.commit()

    # Dọn dẹp dữ liệu cũ của sản phẩm này
    db.query(StockLedgerEntry).filter(StockLedgerEntry.product_id == prod_id).delete()
    db.query(WarehouseStock).filter(WarehouseStock.product_id == prod_id).delete()
    db.query(StockReservation).filter(StockReservation.product_id == prod_id).delete()
    db.query(ProductStockProfile).filter(ProductStockProfile.product_id == prod_id).delete()
    db.commit()

    # Nhập ban đầu 50 vào Kho 1
    record_stock_movement(
        db,
        product_id=prod_id,
        warehouse_id=1,
        quantity_base=50,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code="PNK-INIT-DISPATCH",
        performer_id=1,
        auto_commit=True,
    )

    # 2. Tạo đơn hàng và bản ghi giữ chỗ 10 đơn vị ở "Kho Tổng Hà Nội"
    order_id = "ORD-TEST-DISP-01"
    db.query(Order).filter(Order.id == order_id).delete()
    db.commit()

    ord_test = Order(
        id=order_id,
        code="DH-DISP-001",
        customer_id="KH-001",
        customer_name="Đại Lý Test",
        staff_id="1",
        status="confirmed",
        total=500000.0,
    )
    db.add(ord_test)

    res = StockReservation(
        order_id=order_id,
        product_id=prod_id,
        sku="SKU-DISPATCH-01",
        warehouse="Kho Tổng Hà Nội",  # Sẽ map ra warehouse_id = 1
        reserved_quantity=10,
        status="active",
    )
    db.add(res)
    db.commit()

    # 3. Thực hiện dispatch / fulfill giữ chỗ
    fulfill_stock_reservations_for_order(db, order_id=order_id, performer_id=1)
    db.commit()

    # Kiểm tra: tồn kho vật lý tại Kho 1 phải giảm từ 50 xuống 40
    wh_stock = db.query(WarehouseStock).filter(
        WarehouseStock.product_id == prod_id,
        WarehouseStock.warehouse_id == 1,
    ).first()
    assert wh_stock is not None
    assert wh_stock.physical_stock == 40

    # Kiểm tra: Sổ cái có bút toán OUT_SALE
    entry = db.query(StockLedgerEntry).filter(
        StockLedgerEntry.reference_code == f"ORD-{order_id}",
        StockLedgerEntry.movement_type == "OUT_SALE",
    ).first()
    assert entry is not None
    assert entry.quantity_base == 10

    # 4. Chống hồi sinh tồn ma: Chạy _sync_legacy_stock kế tiếp
    _sync_legacy_stock(db, prod_id)
    db.commit()

    # Profile physical_stock và stock phải đúng bằng 40, KHÔNG ĐƯỢC tăng lại 50!
    prof = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == prod_id).first()
    assert prof.physical_stock == 40
    assert prof.stock == 40

    # 5. Kiểm tra check_ledger_drift: phải hoàn toàn khớp (0 drift)
    drifts = check_ledger_drift(db)
    prod_drift = [d for d in drifts if d["product_id"] == prod_id]
    assert len(prod_drift) == 0


def test_dispatch_order_error_rolls_back_entirely(setup_db):
    """Nếu dispatch gặp lỗi (ví dụ không xác định được kho hoặc thiếu tồn), toàn bộ transaction phải rollback."""
    db = setup_db["db"]
    from app.models.stock_reservation import StockReservation
    from app.services.inventory_reservation_service import fulfill_stock_reservations_for_order

    prod_id = "PRD-TEST-DISPATCH"
    order_id = "ORD-TEST-FAIL-01"

    # Tạo giữ chỗ với tên kho không tồn tại
    res_fail = StockReservation(
        order_id=order_id,
        product_id=prod_id,
        sku="SKU-DISPATCH-01",
        warehouse="Kho Không Có Thực",
        reserved_quantity=5,
        status="active",
    )
    db.add(res_fail)
    db.commit()

    physical_before = get_sku_ledger_summary(db, product_id=prod_id, warehouse_id=1)["physical_stock"]

    # Gọi fulfill -> Phải bị từ chối với HTTPException
    with pytest.raises(HTTPException) as exc:
        fulfill_stock_reservations_for_order(db, order_id=order_id, performer_id=1)
    assert exc.value.status_code == 400

    db.rollback()

    # Kiểm tra sau khi rollback: Tồn kho giữ nguyên 100%
    physical_after = get_sku_ledger_summary(db, product_id=prod_id, warehouse_id=1)["physical_stock"]
    assert physical_after == physical_before

