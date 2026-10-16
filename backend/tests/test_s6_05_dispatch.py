from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.order import Order, OrderItem
from app.models.order_status import OrderStatus
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.stock_reservation import StockReservation
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, StockDispatchLot, DispatchStatus
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Dispatch S6-05
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_lay_phien_db():
    phien_db = TestingSessionLocal()
    try:
        yield phien_db
    finally:
        phien_db.close()


@pytest.fixture(autouse=True)
def setup_dispatch_test_database():
    """Tạo schema và dữ liệu người dùng trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_disp",
            email="admin_disp@test.local",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="wh_mgr_disp",
            email="wh_mgr_disp@test.local",
            role=UserRole.WH_MANAGER.value,
            assigned_warehouse="Kho Tổng Hà Nội",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="wh_staff_disp",
            email="wh_staff_disp@test.local",
            role=UserRole.WAREHOUSE.value,
            assigned_warehouse="Kho Tổng Hà Nội",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)
    db.commit()
    db.close()

    yield

    db = TestingSessionLocal()
    Base.metadata.drop_all(bind=test_engine)
    db.close()
    app.dependency_overrides.pop(lay_phien_db, None)


@pytest.fixture
def client():
    return TestClient(app)


def auth_header(user_id: int, username: str, role: str) -> dict:
    token = tao_token_truy_cap(du_lieu={
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "role": role,
        "token_version": 1,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    return auth_header(1, "admin_disp", UserRole.ADMIN.value)


@pytest.fixture
def wh_staff_headers():
    return auth_header(3, "wh_staff_disp", UserRole.WAREHOUSE.value)


def seed_test_data(db):
    """Seed sản phẩm, kho, tồn kho, lô hàng và đơn hàng mẫu."""
    # 1. Sản phẩm quản lý theo lô
    prod_lot = Product(
        id="PRD-LOT-01",
        sku="SKU-LOT-01",
        name="iPhone 15 Pro Max",
        category="Điện thoại",
        stock=50,
        min_stock=5,
        manage_by_lot=True,
        near_expiry_threshold_days=30,
    )
    # 2. Sản phẩm KHÔNG quản lý theo lô
    prod_non_lot = Product(
        id="PRD-NON-LOT-02",
        sku="SKU-NON-LOT-02",
        name="Cáp Sạc Type-C",
        category="Phụ kiện",
        stock=100,
        min_stock=10,
        manage_by_lot=False,
    )
    db.add(prod_lot)
    db.add(prod_non_lot)

    # 3. Tồn kho vật lý tại Kho Tổng Hà Nội (warehouse_id=1)
    ws_1 = WarehouseStock(product_id="PRD-LOT-01", warehouse_id=1, physical_stock=50, min_stock=5)
    ws_2 = WarehouseStock(product_id="PRD-NON-LOT-02", warehouse_id=1, physical_stock=100, min_stock=10)
    db.add(ws_1)
    db.add(ws_2)

    # 4. Các lô cho PRD-LOT-01 tại Kho 1
    # Lot A: hạn sớm hơn (20 ngày nữa) -> FEFO gợi ý trước
    today = date.today()
    lot_a = ProductLot(
        id=10,
        product_id="PRD-LOT-01",
        lot_number="LOT-EARLY-01",
        warehouse_id=1,
        mfg_date=today - timedelta(days=60),
        exp_date=today + timedelta(days=20),
        initial_quantity=20,
        remaining_quantity=20,
    )
    # Lot B: hạn muộn hơn (90 ngày nữa)
    lot_b = ProductLot(
        id=20,
        product_id="PRD-LOT-01",
        lot_number="LOT-LATER-02",
        warehouse_id=1,
        mfg_date=today - timedelta(days=30),
        exp_date=today + timedelta(days=90),
        initial_quantity=30,
        remaining_quantity=30,
    )
    # Lot C: hết hạn (hết hạn 5 ngày trước)
    lot_expired = ProductLot(
        id=30,
        product_id="PRD-LOT-01",
        lot_number="LOT-EXPIRED-03",
        warehouse_id=1,
        mfg_date=today - timedelta(days=120),
        exp_date=today - timedelta(days=5),
        initial_quantity=10,
        remaining_quantity=10,
    )
    db.add(lot_a)
    db.add(lot_b)
    db.add(lot_expired)

    # 5. Đơn hàng đã duyệt (APPROVED)
    order = Order(
        id="ORD-TEST-001",
        code="ORD-TEST-001",
        customer_id="CUST-001",
        customer_name="Đại lý Minh Anh",
        customer_address="123 Phố Huế, Hà Nội",
        status=OrderStatus.APPROVED.value,
        subtotal=10000000,
        total=10000000,
        paid_amount=0,
    )
    db.add(order)

    # Dòng đơn: 15 cái PRD-LOT-01 và 20 cái PRD-NON-LOT-02
    oi_1 = OrderItem(
        order_id="ORD-TEST-001",
        product_id="PRD-LOT-01",
        sku="SKU-LOT-01",
        name="iPhone 15 Pro Max",
        quantity=15,
        price=600000,
        subtotal=9000000,
    )
    oi_2 = OrderItem(
        order_id="ORD-TEST-001",
        product_id="PRD-NON-LOT-02",
        sku="SKU-NON-LOT-02",
        name="Cáp Sạc Type-C",
        quantity=20,
        price=50000,
        subtotal=1000000,
    )
    db.add(oi_1)
    db.add(oi_2)

    # 6. Giữ chỗ StockReservation (Kho Tổng Hà Nội)
    res_1 = StockReservation(
        order_id="ORD-TEST-001",
        order_code="ORD-TEST-001",
        product_id="PRD-LOT-01",
        sku="SKU-LOT-01",
        warehouse="Kho Tổng Hà Nội",
        reserved_quantity=15,
        status="active",
    )
    res_2 = StockReservation(
        order_id="ORD-TEST-001",
        order_code="ORD-TEST-001",
        product_id="PRD-NON-LOT-02",
        sku="SKU-NON-LOT-02",
        warehouse="Kho Tổng Hà Nội",
        reserved_quantity=20,
        status="active",
    )
    db.add(res_1)
    db.add(res_2)

    db.commit()


# ==============================================================================
# 1. TEST TẠO VÀ XÁC NHẬN PHIẾU XUẤT TRONG MỘT BƯỚC (CONFIRMED)
# ==============================================================================
def test_01_create_and_confirm_dispatch_full_success(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    payload = {
        "client_request_id": "REQ-DISPATCH-001",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "notes": "Xuất đủ đơn hàng",
        "items": [
            {
                "product_id": "PRD-LOT-01",
                "dispatched_quantity": 15,
                # Không truyền lots -> Tự động FEFO lấy từ Lot A (20 có sẵn, lấy 15)
                "lots": [],
            },
            {
                "product_id": "PRD-NON-LOT-02",
                "dispatched_quantity": 20,
                "lots": [],
            }
        ]
    }

    resp = client.post("/api/v1/dispatches", json=payload, headers=admin_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    # Kiểm tra trạng thái phiếu duy nhất là CONFIRMED
    assert data["status"] == "CONFIRMED"
    assert data["id"].startswith("PXK-")
    assert data["client_request_id"] == "REQ-DISPATCH-001"
    assert data["total_dispatched_quantity"] == 35
    assert data["is_partial"] is False
    assert data["has_shortfall"] is False
    assert len(data["items"]) == 2

    # Kiểm tra dữ liệu DB
    db = TestingSessionLocal()
    # 1. Lô hàng Lot A bị trừ từ 20 -> 5
    lot_a = db.query(ProductLot).filter(ProductLot.id == 10).first()
    assert lot_a.remaining_quantity == 5

    # 2. Tồn kho vật lý WarehouseStock bị trừ
    ws_1 = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PRD-LOT-01", WarehouseStock.warehouse_id == 1).first()
    assert ws_1.physical_stock == 35  # 50 - 15

    ws_2 = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PRD-NON-LOT-02", WarehouseStock.warehouse_id == 1).first()
    assert ws_2.physical_stock == 80  # 100 - 20

    # 3. Giữ chỗ chuyển thành fulfilled
    res_1 = db.query(StockReservation).filter(StockReservation.order_id == "ORD-TEST-001", StockReservation.product_id == "PRD-LOT-01").first()
    assert res_1.status == "fulfilled"

    # 4. Trạng thái đơn hàng chuyển sang EXPORTED
    order = db.query(Order).filter(Order.id == "ORD-TEST-001").first()
    assert order.status == "EXPORTED"

    # 5. Sổ cái StockLedger ghi nhận OUT_SALE
    entries = db.query(StockLedgerEntry).filter(StockLedgerEntry.reference_code == data["id"]).all()
    assert len(entries) == 2
    for e in entries:
        assert e.movement_type == "OUT_SALE"
    # Lô product có lot_id trong sổ cái
    entry_lot = [e for e in entries if e.product_id == "PRD-LOT-01"][0]
    assert entry_lot.lot_id == 10

    db.close()


# ==============================================================================
# 2. TEST KIỂM TRA PHYSICAL_STOCK VÀ AVAILABLE_STOCK (KHÔNG BỊ TRỪ TRÙNG KHẢ DỤNG)
# ==============================================================================
def test_02_verify_physical_and_available_stock_no_double_deduction(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    # Trước xuất kho:
    # PRD-LOT-01: physical = 50, reserved = 15 -> available = 35
    payload = {
        "client_request_id": "REQ-DISPATCH-002",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [
            {"product_id": "PRD-LOT-01", "dispatched_quantity": 15, "lots": []},
            {"product_id": "PRD-NON-LOT-02", "dispatched_quantity": 20, "lots": []}
        ]
    }
    resp = client.post("/api/v1/dispatches", json=payload, headers=admin_headers)
    assert resp.status_code == 201

    db = TestingSessionLocal()
    ws = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PRD-LOT-01", WarehouseStock.warehouse_id == 1).first()
    assert ws.physical_stock == 35  # Tồn vật lý giảm 15

    # Đếm tồn giữ chỗ active còn lại trong bảng stock_reservations
    active_res = db.query(StockReservation).filter(
        StockReservation.product_id == "PRD-LOT-01",
        StockReservation.status == "active"
    ).all()
    total_active_reserved = sum(r.reserved_quantity for r in active_res)
    assert total_active_reserved == 0  # Toàn bộ 15 đã chuyển sang fulfilled

    # Tồn khả dụng mới = physical - active_reserved = 35 - 0 = 35 (Không bị trừ lùi 2 lần thành 20!)
    calculated_available = ws.physical_stock - total_active_reserved
    assert calculated_available == 35
    db.close()


# ==============================================================================
# 3. TEST TỪ CHỐI PUT VÀ DELETE PHIẾU XUẤT (AC-4)
# ==============================================================================
def test_03_put_and_delete_rejected_405(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    create_resp = client.post("/api/v1/dispatches", json={
        "client_request_id": "REQ-03",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{"product_id": "PRD-NON-LOT-02", "dispatched_quantity": 5}]
    }, headers=admin_headers)
    assert create_resp.status_code == 201
    dsp_id = create_resp.json()["id"]

    # Thử PUT cập nhật -> Bị từ chối HTTP 405
    put_resp = client.put(f"/api/v1/dispatches/{dsp_id}", json={"notes": "Sửa ghi chú"}, headers=admin_headers)
    assert put_resp.status_code == 405

    # Thử DELETE xóa -> Bị từ chối HTTP 405
    del_resp = client.delete(f"/api/v1/dispatches/{dsp_id}", headers=admin_headers)
    assert del_resp.status_code == 405


# ==============================================================================
# 4. TEST CHỐNG BẤM HAI LẦN QUA CLIENT_REQUEST_ID
# ==============================================================================
def test_04_anti_double_click_client_request_id(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    payload = {
        "client_request_id": "UNIQUE-REQ-ID-12345",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{"product_id": "PRD-NON-LOT-02", "dispatched_quantity": 5}]
    }

    # Bấm lần 1: Thành công 201
    resp1 = client.post("/api/v1/dispatches", json=payload, headers=admin_headers)
    assert resp1.status_code == 201

    # Bấm lần 2 cùng client_request_id: Bị chặn 409 Conflict
    resp2 = client.post("/api/v1/dispatches", json=payload, headers=admin_headers)
    assert resp2.status_code == 409
    assert "trùng lặp" in resp2.json()["detail"].lower()


# ==============================================================================
# 5. TEST ROLLBACK TOÀN BỘ TRANSACTION KHI CÓ 1 DÒNG BỊ LỖI
# ==============================================================================
def test_05_rollback_when_one_item_fails(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    # Dòng 1 hợp lệ (PRD-LOT-01: 5 cái), dòng 2 không hợp lệ (PRD-NON-LOT-02: 500 cái - vượt tồn/vượt đặt)
    payload = {
        "client_request_id": "FAIL-REQ-001",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [
            {"product_id": "PRD-LOT-01", "dispatched_quantity": 5, "lots": []},
            {"product_id": "PRD-NON-LOT-02", "dispatched_quantity": 500, "lots": []}
        ]
    }

    resp = client.post("/api/v1/dispatches", json=payload, headers=admin_headers)
    assert resp.status_code == 400

    # Kiểm tra toàn bộ dữ liệu phải được rollback sạch sẽ
    db = TestingSessionLocal()
    # 1. Không có phiếu xuất nào được sinh
    assert db.query(StockDispatch).count() == 0
    # 2. Lô hàng không bị trừ
    lot_a = db.query(ProductLot).filter(ProductLot.id == 10).first()
    assert lot_a.remaining_quantity == 20
    # 3. Tồn vật lý không bị đổi
    ws_1 = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PRD-LOT-01", WarehouseStock.warehouse_id == 1).first()
    assert ws_1.physical_stock == 50
    # 4. Sổ cái không ghi nhận bút toán rác
    assert db.query(StockLedgerEntry).count() == 0
    db.close()


# ==============================================================================
# 6. TEST CHẶN XUẤT VƯỢT SỐ LƯỢNG CÒN LẠI CỦA ĐƠN HÀNG
# ==============================================================================
def test_06_block_dispatch_exceeding_remaining_quantity(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    # Đợt 1: Xuất 10 trên 15 cái của PRD-LOT-01
    resp1 = client.post("/api/v1/dispatches", json={
        "client_request_id": "BATCH-1",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{"product_id": "PRD-LOT-01", "dispatched_quantity": 10, "lots": []}]
    }, headers=admin_headers)
    assert resp1.status_code == 201

    # Đợt 2: Yêu cầu xuất 8 cái -> Vượt quá số lượng còn lại (15 - 10 = 5) -> Chặn 400
    resp2 = client.post("/api/v1/dispatches", json={
        "client_request_id": "BATCH-2",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{"product_id": "PRD-LOT-01", "dispatched_quantity": 8, "lots": []}]
    }, headers=admin_headers)
    assert resp2.status_code == 400
    assert "vượt quá số lượng còn lại chưa giao" in resp2.json()["detail"].lower()


# ==============================================================================
# 7. TEST XUẤT NHIỀU ĐỢT VÀ ENDPOINT ĐƠN CÒN NỢ (PENDING-ORDERS)
# ==============================================================================
def test_07_multi_batch_dispatch_and_pending_orders_endpoint(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    # Ban đầu chưa xuất gì -> Đơn nằm trong pending-orders
    pending_resp = client.get("/api/v1/dispatches/pending-orders", headers=admin_headers)
    assert pending_resp.status_code == 200
    p_data = pending_resp.json()
    assert len(p_data) == 1
    assert p_data[0]["order_id"] == "ORD-TEST-001"
    assert p_data[0]["total_ordered"] == 35  # 15 + 20
    assert p_data[0]["total_shortfall"] == 35

    # Đợt 1: Xuất 10 PRD-LOT-01 và 10 PRD-NON-LOT-02 (Xuất một phần)
    batch1_resp = client.post("/api/v1/dispatches", json={
        "client_request_id": "BATCH-PARTIAL-1",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [
            {"product_id": "PRD-LOT-01", "dispatched_quantity": 10, "lots": []},
            {"product_id": "PRD-NON-LOT-02", "dispatched_quantity": 10, "lots": []}
        ]
    }, headers=admin_headers)
    assert batch1_resp.status_code == 201
    assert batch1_resp.json()["is_partial"] is True
    assert batch1_resp.json()["has_shortfall"] is True

    # Kiểm tra pending-orders: Đơn vẫn còn nợ 15 cái (5 lot + 10 non-lot)
    pending_resp2 = client.get("/api/v1/dispatches/pending-orders", headers=admin_headers)
    p_data2 = pending_resp2.json()
    assert len(p_data2) == 1
    assert p_data2[0]["total_dispatched"] == 20
    assert p_data2[0]["total_shortfall"] == 15

    # Đợt 2: Xuất hết phần còn lại (5 PRD-LOT-01 và 10 PRD-NON-LOT-02)
    batch2_resp = client.post("/api/v1/dispatches", json={
        "client_request_id": "BATCH-PARTIAL-2",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [
            {"product_id": "PRD-LOT-01", "dispatched_quantity": 5, "lots": []},
            {"product_id": "PRD-NON-LOT-02", "dispatched_quantity": 10, "lots": []}
        ]
    }, headers=admin_headers)
    assert batch2_resp.status_code == 201
    assert batch2_resp.json()["is_partial"] is False
    assert batch2_resp.json()["has_shortfall"] is False

    # Đã xuất đủ 100% -> Đơn biến mất khỏi pending-orders
    pending_resp3 = client.get("/api/v1/dispatches/pending-orders", headers=admin_headers)
    assert len(pending_resp3.json()) == 0


# ==============================================================================
# 8. TEST TỰ ĐỘNG FEFO & CHẶN NẾU FEFO KHÔNG ĐỦ HÀNG
# ==============================================================================
def test_08_auto_fefo_when_no_lots_provided_and_block_if_insufficient(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    # Giảm tồn Lot A và Lot B xuống tổng cộng chỉ còn 10 cái (trong khi đơn cần 15)
    lot_a = db.query(ProductLot).filter(ProductLot.id == 10).first()
    lot_b = db.query(ProductLot).filter(ProductLot.id == 20).first()
    lot_a.remaining_quantity = 4
    lot_b.remaining_quantity = 6
    db.commit()
    db.close()

    # Yêu cầu xuất 15 cái mà không truyền danh sách lô -> FEFO tìm chỉ được 10 -> Chặn 400
    payload = {
        "client_request_id": "FEFO-INSUFFICIENT",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{"product_id": "PRD-LOT-01", "dispatched_quantity": 15, "lots": []}]
    }
    resp = client.post("/api/v1/dispatches", json=payload, headers=admin_headers)
    assert resp.status_code == 400
    assert "không đủ tồn các lô còn hạn" in resp.json()["detail"].lower()
    assert "thiếu 5 cái" in resp.json()["detail"].lower()


# ==============================================================================
# 9. TEST BẮT BUỘC LOT_OVERRIDE_REASON KHI TẬP LÔ KHÁC GỢI Ý FEFO
# ==============================================================================
def test_09_mandatory_lot_override_reason_when_deviating_from_fefo(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    # FEFO gợi ý lấy từ Lot A (id=10, exp sớm hơn). Nhưng thủ kho cố tình chọn Lot B (id=20)
    # A. Không truyền lot_override_reason -> Bị từ chối 400
    payload_no_reason = {
        "client_request_id": "OVERRIDE-NO-REASON",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{
            "product_id": "PRD-LOT-01",
            "dispatched_quantity": 10,
            "lot_override_reason": None,
            "lots": [{"lot_id": 20, "quantity": 10}]
        }]
    }
    resp_fail = client.post("/api/v1/dispatches", json=payload_no_reason, headers=admin_headers)
    assert resp_fail.status_code == 400
    assert "lot_override_reason" in resp_fail.json()["detail"]

    # B. Có truyền lot_override_reason -> Thành công 201
    payload_with_reason = {
        "client_request_id": "OVERRIDE-WITH-REASON",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{
            "product_id": "PRD-LOT-01",
            "dispatched_quantity": 10,
            "lot_override_reason": "Khách hàng yêu cầu lô date xa hơn cho đơn đi tỉnh",
            "lots": [{"lot_id": 20, "quantity": 10}]
        }]
    }
    resp_ok = client.post("/api/v1/dispatches", json=payload_with_reason, headers=admin_headers)
    assert resp_ok.status_code == 201
    assert resp_ok.json()["items"][0]["lot_override_reason"] == "Khách hàng yêu cầu lô date xa hơn cho đơn đi tỉnh"


# ==============================================================================
# 10. TEST LÔ HẾT HẠN VÀ PHÂN QUYỀN USER_ROLE
# ==============================================================================
def test_10_expired_lot_rbac(client, wh_staff_headers, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    # Lot 30 đã hết hạn (LOT-EXPIRED-03)
    # A. Nhân viên kho (wh_staff) xuất lô hết hạn -> Bị chặn 400
    staff_payload = {
        "client_request_id": "EXP-STAFF",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{
            "product_id": "PRD-LOT-01",
            "dispatched_quantity": 5,
            "lot_override_reason": "Thử xuất lô cũ",
            "lots": [{"lot_id": 30, "quantity": 5, "expiry_override_reason": "Thử"}]
        }]
    }
    resp_staff = client.post("/api/v1/dispatches", json=staff_payload, headers=wh_staff_headers)
    assert resp_staff.status_code == 400
    assert "chỉ quản trị viên (admin) hoặc quản lý kho (wh manager)" in resp_staff.json()["detail"].lower()

    # B. Admin xuất lô hết hạn CÓ lý do -> Thành công 201
    admin_payload = {
        "client_request_id": "EXP-ADMIN",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{
            "product_id": "PRD-LOT-01",
            "dispatched_quantity": 5,
            "lot_override_reason": "Xuất hàng mẫu theo phê duyệt",
            "lots": [{"lot_id": 30, "quantity": 5, "expiry_override_reason": "Xuất hàng kiểm định đặc biệt"}]
        }]
    }
    resp_admin = client.post("/api/v1/dispatches", json=admin_payload, headers=admin_headers)
    assert resp_admin.status_code == 201
    assert resp_admin.json()["items"][0]["lots"][0]["expiry_override_reason"] == "Xuất hàng kiểm định đặc biệt"


# ==============================================================================
# 11. TEST SKU KHÔNG QUẢN LÝ LÔ
# ==============================================================================
def test_11_unmanaged_sku_does_not_accept_lots(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)
    db.close()

    # Truyền lô cho SKU manage_by_lot=False -> Bị từ chối 400
    payload_invalid = {
        "client_request_id": "UNMANAGED-LOT",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 1,
        "items": [{
            "product_id": "PRD-NON-LOT-02",
            "dispatched_quantity": 5,
            "lots": [{"lot_id": 10, "quantity": 5}]
        }]
    }
    resp = client.post("/api/v1/dispatches", json=payload_invalid, headers=admin_headers)
    assert resp.status_code == 400
    assert "không quản lý theo lô" in resp.json()["detail"].lower()


# ==============================================================================
# 12. TEST XỬ LÝ GIỮ CHỖ KHI XUẤT KHÁC KHO HOẶC ĐƠN KHÔNG CÓ GIỮ CHỖ
# ==============================================================================
def test_12_reservation_different_warehouse_or_missing(client, admin_headers):
    db = TestingSessionLocal()
    seed_test_data(db)

    # Thêm tồn kho tại Kho Đà Nẵng (warehouse_id=2)
    ws_dn = WarehouseStock(product_id="PRD-NON-LOT-02", warehouse_id=2, physical_stock=50, min_stock=5)
    db.add(ws_dn)
    db.commit()
    db.close()

    # Đơn có giữ chỗ tại Kho Tổng Hà Nội (warehouse=Kho Tổng Hà Nội), nhưng xuất từ Kho Đà Nẵng (warehouse_id=2)
    payload_dn = {
        "client_request_id": "DIFF-WH-DISPATCH",
        "order_id": "ORD-TEST-001",
        "warehouse_id": 2,
        "items": [{"product_id": "PRD-NON-LOT-02", "dispatched_quantity": 10, "lots": []}]
    }
    resp = client.post("/api/v1/dispatches", json=payload_dn, headers=admin_headers)
    assert resp.status_code == 201

    db = TestingSessionLocal()
    # 1. Tồn Kho Đà Nẵng bị trừ từ 50 -> 40
    ws_check = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PRD-NON-LOT-02", WarehouseStock.warehouse_id == 2).first()
    assert ws_check.physical_stock == 40

    # 2. Giữ chỗ tại Kho Hà Nội được nhả (status="released")
    res_hn = db.query(StockReservation).filter(
        StockReservation.order_id == "ORD-TEST-001",
        StockReservation.product_id == "PRD-NON-LOT-02"
    ).first()
    assert res_hn.status == "released"
    assert "xuất từ kho id 2" in res_hn.note.lower()

    db.close()
