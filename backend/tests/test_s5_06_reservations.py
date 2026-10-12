import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, Base, engine
from app.models.auth import User, UserRole
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.stock_reservation import StockReservation
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.services.inventory_reservation_service import (
    reserve_stock_for_order,
    release_stock_reservations_for_order,
    fulfill_stock_reservations_for_order,
)
from app.services.stock_ledger import (
    record_stock_movement,
    StockMovementType,
    get_sku_ledger_summary,
    _sync_legacy_stock,
)
from fastapi import HTTPException


@pytest.fixture(scope="module")
def setup_s5_06_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Dọn dẹp dữ liệu test cũ để đảm bảo idempotency
    test_pids = ["PRD-S506-01", "PRD-S506-02"]
    db.query(StockReservation).filter(StockReservation.product_id.in_(test_pids)).delete(synchronize_session=False)
    db.query(StockLedgerEntry).filter(StockLedgerEntry.product_id.in_(test_pids)).delete(synchronize_session=False)
    db.query(WarehouseStock).filter(WarehouseStock.product_id.in_(test_pids)).delete(synchronize_session=False)
    db.query(ProductStockProfile).filter(ProductStockProfile.product_id.in_(test_pids)).delete(synchronize_session=False)
    db.query(OrderItem).filter(OrderItem.product_id.in_(test_pids)).delete(synchronize_session=False)
    db.query(Order).filter(Order.id.in_(["ORD-S506-01", "ORD-S506-02", "ORD-S506-03"])).delete(synchronize_session=False)
    db.commit()

    # Tạo User Staff & Admin
    staff = db.query(User).filter(User.username == "staff_s506").first()
    if not staff:
        staff = User(
            username="staff_s506",
            email="staff_s506@example.com",
            hashed_password="hashed_secret",
            role=UserRole.SALES_REP.value,
            full_name="Nhân Viên Kinh Doanh S5-06",
        )
        db.add(staff)
        db.commit()

    # Tạo Sản phẩm 1
    p1 = db.query(Product).filter(Product.id == "PRD-S506-01").first()
    if not p1:
        p1 = Product(
            id="PRD-S506-01",
            sku="SKU-S506-01",
            name="Sữa Chua Nếp Cẩm S5-06",
            category="Đồ uống",
            unit="hộp",
            status="ACTIVE",
            is_active=True,
            stock=100,
            min_stock=10,
        )
        db.add(p1)
    else:
        p1.status = "ACTIVE"
        p1.min_stock = 10
    db.commit()

    # Nhập tồn: Kho 1 = 100 hộp, Kho 2 = 50 hộp
    record_stock_movement(
        db,
        product_id=p1.id,
        warehouse_id=1,
        quantity_base=100,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code="PNK-S506-WH1",
        performer_id=staff.id,
        auto_commit=True,
    )
    record_stock_movement(
        db,
        product_id=p1.id,
        warehouse_id=2,
        quantity_base=50,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code="PNK-S506-WH2",
        performer_id=staff.id,
        auto_commit=True,
    )

    yield {
        "db": db,
        "staff": staff,
        "p1": p1,
    }

    db.close()


def test_s5_06_multi_warehouse_reservation_isolation(setup_s5_06_data):
    """
    S5-06: Giữ chỗ theo kho cụ thể (Warehouse Isolation):
    - Khi giữ chỗ 30 hộp tại Kho 1 ("Kho Tổng Hà Nội"):
      + Kho 1: physical = 100, reserved = 30, available = 70.
      + Kho 2: physical = 50, reserved = 0, available = 50 (hoàn toàn không bị ảnh hưởng).
    """
    db: Session = setup_s5_06_data["db"]
    p1: Product = setup_s5_06_data["p1"]
    staff: User = setup_s5_06_data["staff"]

    order = Order(
        id="ORD-S506-01",
        code="DH-S506-001",
        customer_id="CUST-S506-01",
        customer_name="Đại Lý Phố Huế",
        staff_id=str(staff.id),
        total=600000.0,
        status="pending",
    )
    order.items = [
        OrderItem(
            order_id=order.id,
            product_id=p1.id,
            sku=p1.sku,
            name=p1.name,
            quantity=30,
            price=20000.0,
            subtotal=600000.0,
        )
    ]
    db.add(order)
    db.commit()

    # Thực hiện giữ chỗ tại Kho 1
    reservations = reserve_stock_for_order(db, order, warehouse_name="Kho Tổng Hà Nội")
    assert len(reservations) == 1
    assert reservations[0].reserved_quantity == 30
    assert reservations[0].status == "active"
    db.commit()

    # Kiểm tra số dư 3 cột tại Kho 1
    wh1_sum = get_sku_ledger_summary(db, product_id=p1.id, warehouse_id=1)
    assert wh1_sum["physical_stock"] == 100
    assert wh1_sum["reserved_stock"] == 30
    assert wh1_sum["available_stock"] == 70

    # Kiểm tra số dư 3 cột tại Kho 2 (không bị suy suyển)
    wh2_sum = get_sku_ledger_summary(db, product_id=p1.id, warehouse_id=2)
    assert wh2_sum["physical_stock"] == 50
    assert wh2_sum["reserved_stock"] == 0
    assert wh2_sum["available_stock"] == 50


def test_s5_06_block_over_reservation(setup_s5_06_data):
    """
    S5-06: Chặn giữ chỗ vượt quá tồn khả dụng (Over-reservation prevention):
    - Kho 1 hiện chỉ còn available = 70.
    - Đặt đơn hàng 80 -> Bị chặn với HTTP 400 Bad Request kèm số lượng tối đa còn đặt được.
    """
    db: Session = setup_s5_06_data["db"]
    p1: Product = setup_s5_06_data["p1"]
    staff: User = setup_s5_06_data["staff"]

    order_overflow = Order(
        id="ORD-S506-02",
        code="DH-S506-002",
        customer_id="CUST-S506-02",
        customer_name="Đại Lý Hoàn Kiếm",
        staff_id=str(staff.id),
        total=1600000.0,
        status="pending",
    )
    order_overflow.items = [
        OrderItem(
            order_id=order_overflow.id,
            product_id=p1.id,
            sku=p1.sku,
            name=p1.name,
            quantity=80,  # Vượt quá available 70
            price=20000.0,
            subtotal=1600000.0,
        )
    ]
    db.add(order_overflow)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        reserve_stock_for_order(db, order_overflow, warehouse_name="Kho Tổng Hà Nội")

    assert exc_info.value.status_code == 400
    assert "không đủ tồn khả dụng" in exc_info.value.detail
    assert "Số lượng tối đa còn có thể đặt: 70" in exc_info.value.detail


def test_s5_06_release_reservation_on_cancellation(setup_s5_06_data):
    """
    S5-06: Nhả giữ chỗ khi hủy đơn hàng (Cancellation Lifecycle):
    - Đơn ORD-S506-01 đang giữ 30 hộp tại Kho 1.
    - Gọi release_stock_reservations_for_order:
      + status chuyển sang 'released'.
      + reserved_stock tại Kho 1 giảm về 0.
      + available_stock tại Kho 1 hồi phục về 100.
    """
    db: Session = setup_s5_06_data["db"]
    p1: Product = setup_s5_06_data["p1"]

    release_stock_reservations_for_order(db, order_id="ORD-S506-01")
    db.commit()

    # Kiểm tra reservation đã đổi trạng thái
    res = db.query(StockReservation).filter(StockReservation.order_id == "ORD-S506-01").first()
    assert res.status == "released"

    # Kiểm tra 3 cột tại Kho 1 đã hoàn trả
    wh1_sum = get_sku_ledger_summary(db, product_id=p1.id, warehouse_id=1)
    assert wh1_sum["physical_stock"] == 100
    assert wh1_sum["reserved_stock"] == 0
    assert wh1_sum["available_stock"] == 100


def test_s5_06_fulfill_reservation_and_ledger_out_sale(setup_s5_06_data):
    """
    S5-06: Xuất kho giao hàng & ghi sổ cái (Dispatch Lifecycle & Sổ thẻ kho):
    - Giữ chỗ 25 hộp cho đơn ORD-S506-03 tại Kho 1.
    - Xuất kho qua fulfill_stock_reservations_for_order:
      + status chuyển sang 'fulfilled'.
      + physical_stock tại Kho 1 giảm từ 100 -> 75.
      + reserved_stock về 0.
      + available_stock = 75.
      + Bút toán StockLedgerEntry(OUT_SALE) được ghi vào sổ cái.
      + Đồng bộ _sync_legacy_stock không làm sống lại tồn ma (No ghost stock).
    """
    db: Session = setup_s5_06_data["db"]
    p1: Product = setup_s5_06_data["p1"]
    staff: User = setup_s5_06_data["staff"]

    order = Order(
        id="ORD-S506-03",
        code="DH-S506-003",
        customer_id="CUST-S506-03",
        customer_name="Đại Lý Ba Đình",
        staff_id=str(staff.id),
        total=500000.0,
        status="pending",
    )
    order.items = [
        OrderItem(
            order_id=order.id,
            product_id=p1.id,
            sku=p1.sku,
            name=p1.name,
            quantity=25,
            price=20000.0,
            subtotal=500000.0,
        )
    ]
    db.add(order)
    db.commit()

    # 1. Giữ chỗ
    reserve_stock_for_order(db, order, warehouse_name="Kho Tổng Hà Nội")
    db.commit()

    # 2. Hoàn tất xuất kho giao hàng
    fulfill_stock_reservations_for_order(db, order_id=order.id, performer_id=staff.id)
    db.commit()

    # 3. Kiểm tra trạng thái reservation
    res = db.query(StockReservation).filter(StockReservation.order_id == order.id).first()
    assert res.status == "fulfilled"

    # 4. Kiểm tra tồn kho thực tế và khả dụng đã giảm
    wh1_sum = get_sku_ledger_summary(db, product_id=p1.id, warehouse_id=1)
    assert wh1_sum["physical_stock"] == 75
    assert wh1_sum["reserved_stock"] == 0
    assert wh1_sum["available_stock"] == 75

    # 5. Kiểm tra bút toán OUT_SALE trong sổ cái StockLedgerEntry
    ledger_entry = (
        db.query(StockLedgerEntry)
        .filter(
            StockLedgerEntry.product_id == p1.id,
            StockLedgerEntry.movement_type == "OUT_SALE",
            StockLedgerEntry.reference_code == f"ORD-{order.id}",
        )
        .first()
    )
    assert ledger_entry is not None
    assert ledger_entry.quantity_base == 25
    assert ledger_entry.previous_physical == 100
    assert ledger_entry.new_physical == 75

    # 6. Kiểm tra không bị hồi sinh tồn ma khi gọi lại _sync_legacy_stock
    tot_phys, tot_res, tot_avail = _sync_legacy_stock(db, p1.id)
    # Kho 1 = 75, Kho 2 = 50 => Tổng = 125
    assert tot_phys == 125
    assert tot_res == 0
    assert tot_avail == 125
