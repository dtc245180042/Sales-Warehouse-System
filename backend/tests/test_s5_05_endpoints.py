import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal, Base, engine, lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.stock_reservation import StockReservation
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.services.stock_ledger import record_stock_movement, StockMovementType
from main import app


@pytest.fixture(scope="module")
def client_setup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Dọn dẹp dữ liệu test cũ
    db.query(StockLedgerEntry).filter(StockLedgerEntry.product_id.in_(["PRD-LEDGER-EP-01", "PRD-LEDGER-EP-02"])).delete(synchronize_session=False)
    db.query(WarehouseStock).filter(WarehouseStock.product_id.in_(["PRD-LEDGER-EP-01", "PRD-LEDGER-EP-02"])).delete(synchronize_session=False)
    db.query(StockReservation).filter(StockReservation.product_id.in_(["PRD-LEDGER-EP-01", "PRD-LEDGER-EP-02"])).delete(synchronize_session=False)
    db.query(ProductStockProfile).filter(ProductStockProfile.product_id.in_(["PRD-LEDGER-EP-01", "PRD-LEDGER-EP-02"])).delete(synchronize_session=False)
    db.commit()

    # Tạo User Admin
    admin_user = db.query(User).filter(User.username == "admin_test_ledger_ep").first()
    if not admin_user:
        admin_user = User(
            username="admin_test_ledger_ep",
            email="admin_ledger_ep@example.com",
            hashed_password="hashed_secret",
            role=UserRole.ADMIN.value,
            full_name="Quản Trị Viên Ledger",
        )
        db.add(admin_user)
        db.commit()

    # Tạo 2 sản phẩm test
    p1 = db.query(Product).filter(Product.id == "PRD-LEDGER-EP-01").first()
    if not p1:
        p1 = Product(
            id="PRD-LEDGER-EP-01",
            sku="SKU-LEP-01",
            name="Nước Tăng Lực Bò Húc",
            category="Đồ uống",
            unit="lon",
            status="ACTIVE",
            is_active=True,
            stock=100,
            min_stock=20,
        )
        db.add(p1)
    else:
        p1.status = "ACTIVE"
        p1.min_stock = 20

    p2 = db.query(Product).filter(Product.id == "PRD-LEDGER-EP-02").first()
    if not p2:
        p2 = Product(
            id="PRD-LEDGER-EP-02",
            sku="SKU-LEP-02",
            name="Bánh Mì Sandwich Tươi",
            category="Bánh kẹo",
            unit="gói",
            status="ACTIVE",
            is_active=True,
            stock=10,
            min_stock=15,  # min > stock => low-stock
        )
        db.add(p2)
    else:
        p2.status = "ACTIVE"
        p2.min_stock = 15
    db.commit()

    # Nhập tồn kho qua record_stock_movement
    record_stock_movement(
        db,
        product_id=p1.id,
        warehouse_id=1,
        quantity_base=100,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code="PNK-EP-TEST-01",
        performer_id=admin_user.id,
        auto_commit=True,
    )

    record_stock_movement(
        db,
        product_id=p2.id,
        warehouse_id=1,
        quantity_base=10,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code="PNK-EP-TEST-02",
        performer_id=admin_user.id,
        auto_commit=True,
    )

    # Tạo giữ chỗ cho p1: 15 lon ở Kho 1
    res = StockReservation(
        order_id="ORD-EP-TEST-01",
        product_id=p1.id,
        sku=p1.sku,
        warehouse="Kho Tổng Hà Nội",
        reserved_quantity=15,
        status="active",
    )
    db.add(res)
    db.commit()

    app.dependency_overrides[lay_nguoi_dung_hien_tai] = lambda: admin_user

    test_client = TestClient(app)
    yield {
        "client": test_client,
        "db": db,
        "admin": admin_user,
        "p1": p1,
        "p2": p2,
    }

    app.dependency_overrides.clear()
    db.close()


def test_get_stock_balances_3_columns(client_setup):
    """
    S5-05: Kiểm tra API GET /api/v1/stock-ledger/balances:
    - 3 cột: physical_stock = 100, reserved_stock = 15, available_stock = 85.
    - Bộ lọc warehouse_id, search.
    """
    client = client_setup["client"]

    res = client.get("/api/v1/stock-ledger/balances?warehouse_id=1&search=Bò Húc")
    assert res.status_code == 200
    data = res.json()

    assert data["total"] >= 1
    item = next((i for i in data["items"] if i["product_id"] == "PRD-LEDGER-EP-01"), None)
    assert item is not None
    assert item["physical_stock"] == 100
    assert item["reserved_stock"] == 15
    assert item["available_stock"] == 85
    assert item["is_low_stock"] is False


def test_get_stock_balances_low_stock_filter(client_setup):
    """S5-05 & S5-09: Lọc danh sách tồn thấp stock_status=low_stock."""
    client = client_setup["client"]

    res = client.get("/api/v1/stock-ledger/balances?warehouse_id=1&stock_status=low_stock&search=Sandwich")
    assert res.status_code == 200
    data = res.json()

    # Sản phẩm p2 có available = 10 < min_stock = 15 => phải xuất hiện trong danh sách tồn thấp
    p2_item = next((i for i in data["items"] if i["product_id"] == "PRD-LEDGER-EP-02"), None)
    assert p2_item is not None
    assert p2_item["is_low_stock"] is True


def test_get_stock_ledger_entries(client_setup):
    """
    S5-05: Kiểm tra API GET /api/v1/stock-ledger/entries:
    - Xem sổ cái chi tiết từng giao dịch.
    - Có đầy đủ thông tin: movement_type, previous_physical, new_physical, performer_name, warehouse_name.
    """
    client = client_setup["client"]

    res = client.get("/api/v1/stock-ledger/entries?warehouse_id=1&movement_type=IN_PURCHASE")
    assert res.status_code == 200
    data = res.json()

    assert data["total"] >= 2
    entry = data["items"][0]
    assert entry["movement_type"] == "IN_PURCHASE"
    assert entry["warehouse_name"] == "Kho Tổng Hà Nội"
    assert entry["performer_name"] is not None
    assert entry["new_physical"] > 0


def test_get_product_stock_card(client_setup):
    """
    S5-05: Kiểm tra API GET /api/v1/stock-ledger/products/{id}/card:
    - Thẻ kho chi tiết cho một SKU.
    """
    client = client_setup["client"]
    p1 = client_setup["p1"]

    res = client.get(f"/api/v1/stock-ledger/products/{p1.id}/card?warehouse_id=1")
    assert res.status_code == 200
    data = res.json()

    assert data["product_id"] == p1.id
    assert data["sku"] == p1.sku
    assert len(data["balances"]) >= 1
    assert data["balances"][0]["physical_stock"] == 100
    assert data["balances"][0]["reserved_stock"] == 15
    assert data["entries"]["total"] >= 1

    # Kiểm tra sản phẩm không tồn tại -> 404
    res_404 = client.get("/api/v1/stock-ledger/products/PRD-NONEXISTENT/card")
    assert res_404.status_code == 404


def test_get_stock_drift(client_setup):
    """S5-05 & Pha 1.5: Kiểm tra API GET /api/v1/stock-ledger/drift."""
    client = client_setup["client"]

    res = client.get("/api/v1/stock-ledger/drift")
    assert res.status_code == 200
    data = res.json()
    assert "total_drifted_skus" in data
    assert isinstance(data["items"], list)
