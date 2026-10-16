from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.order import Order, OrderItem
from app.models.order_status import OrderStatus
from app.models.product import Product
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, DispatchStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceSequence, InvoiceStatus
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Invoice S7-01
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
def setup_invoice_test_database():
    """Tạo schema và dữ liệu người dùng trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_inv",
            email="admin_inv@test.local",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="accountant_inv",
            email="accountant_inv@test.local",
            role=UserRole.ACCOUNTANT.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="wh_staff_inv",
            email="wh_staff_inv@test.local",
            role=UserRole.WAREHOUSE.value,
            assigned_warehouse="Kho Tổng Hà Nội",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=4,
            username="customer_inv_1",
            email="customer1@test.local",
            role=UserRole.CUSTOMER.value,
            customer_id="CUST-001",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=5,
            username="customer_inv_2",
            email="customer2@test.local",
            role=UserRole.CUSTOMER.value,
            customer_id="CUST-002",
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
def accountant_headers():
    return auth_header(2, "accountant_inv", UserRole.ACCOUNTANT.value)


@pytest.fixture
def admin_headers():
    return auth_header(1, "admin_inv", UserRole.ADMIN.value)


@pytest.fixture
def wh_staff_headers():
    return auth_header(3, "wh_staff_inv", UserRole.WAREHOUSE.value)


@pytest.fixture
def customer_1_headers():
    return auth_header(4, "customer_inv_1", UserRole.CUSTOMER.value)


@pytest.fixture
def customer_2_headers():
    return auth_header(5, "customer_inv_2", UserRole.CUSTOMER.value)


def seed_invoice_test_data(db):
    """Seed khách hàng, đơn hàng và phiếu xuất kho mẫu."""
    # Khách hàng 1 & 2
    c1 = Customer(id="CUST-001", code="CUST-001", name="Công ty TNHH Minh Anh", address="15 Lê Duẩn, Hà Nội", tax_code="0109988776")
    c2 = Customer(id="CUST-002", code="CUST-002", name="Đại lý Điện Máy Toàn Thắng", address="88 Nguyễn Trãi, TP.HCM", tax_code="0301122334")
    db.add(c1)
    db.add(c2)

    # Hồ sơ hạn mức nợ
    cr1 = CustomerCreditProfile(customer_id="CUST-001", credit_limit=500000000, max_debt_days=45, current_debt=0)
    cr2 = CustomerCreditProfile(customer_id="CUST-002", credit_limit=200000000, max_debt_days=15, current_debt=0)
    db.add(cr1)
    db.add(cr2)

    # Đơn hàng ORD-001 của CUST-001 (Đặt 15 cái iPhone, giá 1,000,000 VND; Chiết khấu 50,000; Thuế 10%)
    ord_1 = Order(
        id="ORD-001",
        code="ORD-001",
        customer_id="CUST-001",
        customer_name="Công ty TNHH Minh Anh",
        subtotal=15000000,
        discount=50000,
        tax=1495000,  # 10% sau chiết khấu
        total=16445000,
        status=OrderStatus.EXPORTED.value,
    )
    db.add(ord_1)

    oi_1 = OrderItem(
        order_id="ORD-001",
        product_id="PRD-IP15",
        sku="IP15-128",
        name="iPhone 15 128GB",
        price=1000000.0,
        quantity=15,
        discount=50000.0,
        subtotal=14950000.0,
    )
    db.add(oi_1)

    # Phiếu xuất đợt 1 (Xuất thiếu: chỉ xuất 10 cái, nợ 5 cái)
    dsp_1 = StockDispatch(
        id="PXK-20261016-0001",
        order_id="ORD-001",
        customer_id="CUST-001",
        customer_name="Công ty TNHH Minh Anh",
        warehouse_id=1,
        warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value,
        total_items=1,
        total_dispatched_quantity=10,
        is_partial=True,
        has_shortfall=True,
        dispatched_by=1,
        dispatched_at=datetime.now(timezone.utc),
    )
    db.add(dsp_1)

    dsp_item_1 = StockDispatchItem(
        id=101,
        dispatch_id="PXK-20261016-0001",
        product_id="PRD-IP15",
        sku="IP15-128",
        product_name="iPhone 15 128GB",
        ordered_quantity=15,
        dispatched_quantity=10,  # Thực xuất 10 cái
        shortfall_quantity=5,
    )
    db.add(dsp_item_1)

    # Phiếu xuất đợt 2 của CUST-001 (Xuất nốt 5 cái còn lại)
    dsp_2 = StockDispatch(
        id="PXK-20261016-0002",
        order_id="ORD-001",
        customer_id="CUST-001",
        customer_name="Công ty TNHH Minh Anh",
        warehouse_id=1,
        warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value,
        total_items=1,
        total_dispatched_quantity=5,
        is_partial=False,
        has_shortfall=False,
        dispatched_by=1,
        dispatched_at=datetime.now(timezone.utc),
    )
    db.add(dsp_2)

    dsp_item_2 = StockDispatchItem(
        id=102,
        dispatch_id="PXK-20261016-0002",
        product_id="PRD-IP15",
        sku="IP15-128",
        product_name="iPhone 15 128GB",
        ordered_quantity=15,
        dispatched_quantity=5,  # Thực xuất 5 cái
        shortfall_quantity=0,
    )
    db.add(dsp_item_2)

    # Phiếu xuất của CUST-002
    dsp_c2 = StockDispatch(
        id="PXK-20261016-0003",
        order_id="ORD-002",
        customer_id="CUST-002",
        customer_name="Đại lý Điện Máy Toàn Thắng",
        warehouse_id=1,
        warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value,
        total_items=1,
        total_dispatched_quantity=8,
        dispatched_by=1,
        dispatched_at=datetime.now(timezone.utc),
    )
    db.add(dsp_c2)

    dsp_item_c2 = StockDispatchItem(
        id=103,
        dispatch_id="PXK-20261016-0003",
        product_id="PRD-IP15",
        sku="IP15-128",
        product_name="iPhone 15 128GB",
        ordered_quantity=8,
        dispatched_quantity=8,
        shortfall_quantity=0,
    )
    db.add(dsp_item_c2)

    db.commit()


# ==============================================================================
# 1. TEST TÍNH TIỀN THEO THỰC XUẤT KHI ĐƠN CÒN NỢ (AC-1)
# ==============================================================================
def test_01_create_invoice_from_partial_dispatch_bills_actual_dispatched_quantity(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    # Phiếu đợt 1 chỉ xuất 10 cái (trong khi đơn đặt 15 cái)
    payload = {
        "client_request_id": "REQ-INV-001",
        "dispatch_ids": ["PXK-20261016-0001"],
        "notes": "Hóa đơn đợt 1 tính theo số lượng thực xuất"
    }

    resp = client.post("/api/v1/invoices", json=payload, headers=accountant_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    # Kiểm tra số lượng tính tiền đúng bằng 10, không phải 15
    assert data["items"][0]["quantity"] == 10
    # Đơn giá = 1,000,000 VND
    assert data["items"][0]["unit_price"] == 1000000
    # Subtotal dòng = 10 * 1,000,000 = 10,000,000 (trừ chiết khấu dòng nếu có)
    assert data["items"][0]["subtotal"] > 0
    # Tổng tiền hóa đơn khớp với thực xuất 10 cái
    assert data["status"] == "UNPAID"
    assert data["remaining_amount"] == data["total_amount"]
    assert data["customer_id"] == "CUST-001"
    # Kiểm tra mã hóa đơn sinh chuẩn
    assert data["id"].startswith("HD-")


# ==============================================================================
# 2. TEST MÃ HÓA ĐƠN LIÊN TỤC & ROLLBACK KHÔNG TIÊU SỐ (AC-2)
# ==============================================================================
def test_02_invoice_sequence_counter_and_rollback_preserves_sequence(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    # Hóa đơn 1 tạo thành công
    resp1 = client.post("/api/v1/invoices", json={
        "client_request_id": "SEQ-01",
        "dispatch_ids": ["PXK-20261016-0001"]
    }, headers=accountant_headers)
    assert resp1.status_code == 201
    id1 = resp1.json()["id"]
    year_str = str(datetime.now().year)
    assert id1 == f"HD-{year_str}-0000001"

    # Lập hóa đơn 2 bị lỗi (truyền mã phiếu xuất không tồn tại) -> Transaction rollback
    resp_fail = client.post("/api/v1/invoices", json={
        "client_request_id": "SEQ-FAIL",
        "dispatch_ids": ["PXK-NON-EXISTENT"]
    }, headers=accountant_headers)
    assert resp_fail.status_code == 404

    # Hóa đơn 3 tạo thành công tiếp theo: Phải nhận mã 0000002 (Không bị tiêu số, không nhảy cóc sang 0000003!)
    resp2 = client.post("/api/v1/invoices", json={
        "client_request_id": "SEQ-02",
        "dispatch_ids": ["PXK-20261016-0002"]
    }, headers=accountant_headers)
    assert resp2.status_code == 201
    id2 = resp2.json()["id"]
    assert id2 == f"HD-{year_str}-0000002"


# ==============================================================================
# 3. TEST RÀNG BUỘC UNIQUE DISPATCH_ITEM_ID: CHẶN LẬP TRÙNG HÓA ĐƠN
# ==============================================================================
def test_03_unique_dispatch_item_id_blocks_duplicate_invoicing(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    # Lần 1: Lập hóa đơn cho phiếu PXK-20261016-0001 -> Thành công
    resp1 = client.post("/api/v1/invoices", json={
        "client_request_id": "FIRST-INV",
        "dispatch_ids": ["PXK-20261016-0001"]
    }, headers=accountant_headers)
    assert resp1.status_code == 201

    # Lần 2: Cố tình lập hóa đơn tiếp cho chính phiếu PXK-20261016-0001 -> Bị từ chối HTTP 400
    resp2 = client.post("/api/v1/invoices", json={
        "client_request_id": "SECOND-INV",
        "dispatch_ids": ["PXK-20261016-0001"]
    }, headers=accountant_headers)
    assert resp2.status_code == 400
    assert "đã được lập hóa đơn trước đó" in resp2.json()["detail"].lower()


# ==============================================================================
# 4. TEST CLIENT_REQUEST_ID IDEMPOTENCY (TRÙNG NỘI DUNG TRẢ BẢN CŨ, KHÁC NỘI DUNG TRẢ 409)
# ==============================================================================
def test_04_idempotent_client_request_id_returns_same_or_conflict(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    req_id = "UNIQUE-IDEMPOTENT-001"
    payload = {
        "client_request_id": req_id,
        "dispatch_ids": ["PXK-20261016-0001"],
        "notes": "Lập lần đầu"
    }

    # Bấm lần 1 -> 201 Created
    resp1 = client.post("/api/v1/invoices", json=payload, headers=accountant_headers)
    assert resp1.status_code == 201
    created_id = resp1.json()["id"]

    # Bấm lần 2 cùng client_request_id và CÙNG dispatch_ids -> Trả về bản cũ (Idempotent)
    resp2 = client.post("/api/v1/invoices", json=payload, headers=accountant_headers)
    assert resp2.status_code in [200, 201]
    assert resp2.json()["id"] == created_id

    # Bấm lần 3 cùng client_request_id nhưng KHÁC dispatch_ids -> Bị chặn 409 Conflict
    diff_payload = {
        "client_request_id": req_id,
        "dispatch_ids": ["PXK-20261016-0002"]
    }
    resp3 = client.post("/api/v1/invoices", json=diff_payload, headers=accountant_headers)
    assert resp3.status_code == 409
    assert "trùng lặp" in resp3.json()["detail"].lower()


# ==============================================================================
# 5. TEST GỘP NHIỀU PHIẾU XUẤT CỦA CÙNG ĐẠI LÝ (AC-3)
# ==============================================================================
def test_05_merge_multiple_dispatches_same_customer_succeeds(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    # Gộp phiếu đợt 1 (10 cái) và phiếu đợt 2 (5 cái) của cùng CUST-001
    payload = {
        "client_request_id": "MERGE-CUST-1",
        "dispatch_ids": ["PXK-20261016-0001", "PXK-20261016-0002"],
        "notes": "Gộp 2 phiếu xuất trong kỳ"
    }

    resp = client.post("/api/v1/invoices", json=payload, headers=accountant_headers)
    assert resp.status_code == 201
    data = resp.json()

    assert data["customer_id"] == "CUST-001"
    # Có 2 dòng tương ứng 2 dòng phiếu xuất
    assert len(data["items"]) == 2
    total_billed_qty = sum(it["quantity"] for it in data["items"])
    assert total_billed_qty == 15  # 10 + 5


# ==============================================================================
# 6. TEST CHẶN GỘP PHIẾU XUẤT CỦA 2 ĐẠI LÝ KHÁC NHAU
# ==============================================================================
def test_06_block_merge_dispatches_of_different_customers(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    # Phiếu 1 của CUST-001, Phiếu 3 của CUST-002 -> Chặn HTTP 400
    payload = {
        "client_request_id": "CROSS-CUST-FAIL",
        "dispatch_ids": ["PXK-20261016-0001", "PXK-20261016-0003"]
    }

    resp = client.post("/api/v1/invoices", json=payload, headers=accountant_headers)
    assert resp.status_code == 400
    assert "nhiều đại lý khác nhau" in resp.json()["detail"].lower()


# ==============================================================================
# 7. TEST TỪ CHỐI PUT VÀ DELETE HÓA ĐƠN ĐÃ PHÁT HÀNH (AC-4)
# ==============================================================================
def test_07_put_and_delete_rejected_405(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    resp = client.post("/api/v1/invoices", json={
        "client_request_id": "INV-IMMUTABLE",
        "dispatch_ids": ["PXK-20261016-0001"]
    }, headers=accountant_headers)
    assert resp.status_code == 201
    inv_id = resp.json()["id"]

    # Thử PUT -> 405 Method Not Allowed
    put_resp = client.put(f"/api/v1/invoices/{inv_id}", json={"notes": "Sửa"}, headers=accountant_headers)
    assert put_resp.status_code == 405

    # Thử DELETE -> 405 Method Not Allowed
    del_resp = client.delete(f"/api/v1/invoices/{inv_id}", headers=accountant_headers)
    assert del_resp.status_code == 405


# ==============================================================================
# 8. TEST LÀM TRÒN TIỀN VNĐ VÀ KHẤU TRỪ CHIẾT KHẤU / VAT
# ==============================================================================
def test_08_rounding_discount_and_vat_calculation(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    resp = client.post("/api/v1/invoices", json={
        "client_request_id": "ROUNDING-TEST",
        "dispatch_ids": ["PXK-20261016-0001"]
    }, headers=accountant_headers)
    assert resp.status_code == 201
    data = resp.json()

    # Đơn đặt 15 cái có chiết khấu 50,000 VND -> Xuất 10 cái thì chiết khấu được phân bổ làm tròn: 50,000 * 10 / 15 = 33,333 VND
    item = data["items"][0]
    assert item["unit_price"] == 1000000
    assert isinstance(item["discount_amount"], int)
    assert isinstance(item["subtotal"], int)
    assert data["total_amount"] == data["subtotal_amount"] - data["discount_amount"] + data["vat_amount"]


# ==============================================================================
# 9. TEST PHÂN QUYỀN CUSTOMER SCOPE (CHỐNG IDOR)
# ==============================================================================
def test_09_customer_role_scope_isolation_anti_idor(client, accountant_headers, customer_1_headers, customer_2_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    # Kế toán tạo 1 hóa đơn cho CUST-001 và 1 hóa đơn cho CUST-002
    inv1_resp = client.post("/api/v1/invoices", json={"dispatch_ids": ["PXK-20261016-0001"]}, headers=accountant_headers)
    inv2_resp = client.post("/api/v1/invoices", json={"dispatch_ids": ["PXK-20261016-0003"]}, headers=accountant_headers)
    id1 = inv1_resp.json()["id"]
    id2 = inv2_resp.json()["id"]

    # Customer 1 (CUST-001) xem chi tiết hóa đơn của mình -> 200 OK
    resp_c1 = client.get(f"/api/v1/invoices/{id1}", headers=customer_1_headers)
    assert resp_c1.status_code == 200

    # Customer 1 cố tình truy cập hóa đơn của Customer 2 (id2) -> Bị từ chối 403 Forbidden
    resp_hack = client.get(f"/api/v1/invoices/{id2}", headers=customer_1_headers)
    assert resp_hack.status_code == 403

    # Customer 1 gọi danh sách GET /invoices -> Chỉ nhìn thấy đúng hóa đơn của mình
    list_c1 = client.get("/api/v1/invoices", headers=customer_1_headers)
    assert list_c1.status_code == 200
    items = list_c1.json()
    assert len(items) == 1
    assert items[0]["id"] == id1


# ==============================================================================
# 10. TEST HOOK CHO TRANG ĐƯỢC GỌI ĐÚNG 1 LẦN VÀ KHÔNG LÀM HỎNG TRANSACTION KHI LỖI
# ==============================================================================
def test_10_trang_hook_called_safely_on_invoice_creation(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    # Giả lập hàm của Trang bị lỗi (raise Exception)
    with patch("app.services.invoice_service.hook_sau_khi_lap_hoa_don") as mock_hook:
        mock_hook.side_effect = Exception("Giả lập lỗi từ module của Trang")

        # Phát hành hóa đơn
        resp = client.post("/api/v1/invoices", json={
            "client_request_id": "HOOK-SAFE-TEST",
            "dispatch_ids": ["PXK-20261016-0001"]
        }, headers=accountant_headers)

        # Hóa đơn vẫn được phát hành thành công 201
        assert resp.status_code == 201
        # Hook được gọi đúng 1 lần
        assert mock_hook.call_count == 1


# ==============================================================================
# 11. TEST ENDPOINT /PRINT TRẢ VỀ DỮ LIỆU IN ẤN ĐẦY ĐỦ (AC-5)
# ==============================================================================
def test_11_print_template_endpoint_satisfies_ac5(client, accountant_headers):
    db = TestingSessionLocal()
    seed_invoice_test_data(db)
    db.close()

    resp = client.post("/api/v1/invoices", json={
        "client_request_id": "PRINT-TEST",
        "dispatch_ids": ["PXK-20261016-0001"]
    }, headers=accountant_headers)
    inv_id = resp.json()["id"]

    # Gọi endpoint /print
    print_resp = client.get(f"/api/v1/invoices/{inv_id}/print", headers=accountant_headers)
    assert print_resp.status_code == 200
    p_data = print_resp.json()

    # Kiểm tra đầy đủ thông tin pháp lý phục vụ Thủy (S7-09)
    assert p_data["invoice_id"] == inv_id
    assert p_data["company_name"] != ""
    assert p_data["customer_name"] == "Công ty TNHH Minh Anh"
    assert len(p_data["items"]) == 1
    assert "đồng" in p_data["total_amount_in_words"].lower()
    assert p_data["created_by_name"] != ""
