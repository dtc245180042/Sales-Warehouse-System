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
from app.models.invoice import Invoice, InvoiceItem, InvoiceSequence, InvoiceStatus
from app.models.payment import Payment, PaymentAllocation, PaymentSequence, PaymentMethod
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Payment S7-02
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
def setup_payment_test_database():
    """Tạo schema và dữ liệu người dùng trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_pay",
            email="admin_pay@test.local",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="accountant_pay",
            email="accountant_pay@test.local",
            role=UserRole.ACCOUNTANT.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="customer_pay_1",
            email="customer_pay_1@test.local",
            role=UserRole.CUSTOMER.value,
            customer_id="CUST-001",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=4,
            username="customer_pay_2",
            email="customer_pay_2@test.local",
            role=UserRole.CUSTOMER.value,
            customer_id="CUST-002",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)

    customers = [
        Customer(
            id="CUST-001",
            code="DL-001",
            name="Đại lý Dược Phẩm Hà Nội",
            address="123 Phố Huế, Hai Bà Trưng, Hà Nội",
            tax_code="0109988771",
            status="active",
        ),
        Customer(
            id="CUST-002",
            code="DL-002",
            name="Đại lý Dược Phẩm Sài Gòn",
            address="456 Nguyễn Huệ, Q1, TP.HCM",
            tax_code="0309988772",
            status="active",
        ),
    ]
    for c in customers:
        db.add(c)

    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def get_token_for(username: str, role: str, user_id: int, customer_id: str = None) -> str:
    data = {
        "sub": username,
        "role": role,
        "user_id": user_id,
        "token_version": 1,
    }
    if customer_id:
        data["customer_id"] = customer_id
    return tao_token_truy_cap(data)


def create_sample_invoices(db, customer_id="CUST-001", id_start=1):
    """Tạo các hóa đơn mẫu cho test đối trừ."""
    now_utc = datetime.now(timezone.utc)
    inv1 = Invoice(
        id=f"HD-2026-{id_start:07d}",
        customer_id=customer_id,
        customer_name=f"Đại lý {customer_id}",
        subtotal_amount=50_000_000,
        discount_amount=0,
        vat_amount=5_000_000,
        total_amount=55_000_000,
        paid_amount=0,
        remaining_amount=55_000_000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc - timedelta(days=10),
        due_date=now_utc + timedelta(days=20),
        issued_by=1,
    )
    inv2 = Invoice(
        id=f"HD-2026-{(id_start + 1):07d}",
        customer_id=customer_id,
        customer_name=f"Đại lý {customer_id}",
        subtotal_amount=30_000_000,
        discount_amount=0,
        vat_amount=3_000_000,
        total_amount=33_000_000,
        paid_amount=0,
        remaining_amount=33_000_000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc - timedelta(days=5),
        due_date=now_utc + timedelta(days=25),
        issued_by=1,
    )
    db.add(inv1)
    db.add(inv2)
    db.commit()
    return inv1, inv2


# ==============================================================================
# TEST CASES STORY S7-02: GHI NHẬN THANH TOÁN & ĐỐI TRỪ CÔNG NỢ
# ==============================================================================

def test_01_fifo_payment_full_and_partial(client):
    """
    Test 1: Thanh toán tự động FIFO (AC-1, AC-2, AC-3):
    - Khách có Inv1 (55M) và Inv2 (33M). Tổng nợ = 88M.
    - Thu 55M -> Inv1 được trả đủ (PAID, còn nợ 0), Inv2 giữ nguyên (UNPAID, còn nợ 33M).
    - Kiểm tra mã sinh theo dãy liên tục PT-2026-0000001.
    """
    db = TestingSessionLocal()
    inv1, inv2 = create_sample_invoices(db, "CUST-001")
    db.close()

    token = get_token_for("accountant_pay", UserRole.ACCOUNTANT.value, 2)
    resp = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 55_000_000,
            "payment_method": "BANK_TRANSFER",
            "reference_code": "VIB-99281726",
            "notes": "Thu tiền chuyển khoản đơn hàng tháng 10",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["id"] == "PT-2026-0000001"
    assert data["amount"] == 55_000_000
    assert data["payment_method"] == "BANK_TRANSFER"
    assert data["collector_id"] == 2
    assert len(data["allocations"]) == 1
    assert data["allocations"][0]["invoice_id"] == "HD-2026-0000001"
    assert data["allocations"][0]["allocated_amount"] == 55_000_000

    # Kiểm tra trạng thái hóa đơn trong database
    db = TestingSessionLocal()
    i1 = db.query(Invoice).filter(Invoice.id == "HD-2026-0000001").first()
    i2 = db.query(Invoice).filter(Invoice.id == "HD-2026-0000002").first()
    assert i1.status == InvoiceStatus.PAID.value
    assert i1.paid_amount == 55_000_000
    assert i1.remaining_amount == 0

    assert i2.status == InvoiceStatus.UNPAID.value
    assert i2.paid_amount == 0
    assert i2.remaining_amount == 33_000_000
    db.close()


def test_02_fifo_payment_spanning_multiple_invoices(client):
    """
    Test 2: Thanh toán FIFO dàn trải qua nhiều hóa đơn:
    - Khách có Inv1 (55M) và Inv2 (33M).
    - Thu 70M:
      + Inv1 được đối trừ 55M -> PAID (còn nợ 0).
      + Inv2 được đối trừ 15M -> PARTIALLY_PAID (còn nợ 18M).
    """
    db = TestingSessionLocal()
    create_sample_invoices(db, "CUST-001")
    db.close()

    token = get_token_for("accountant_pay", UserRole.ACCOUNTANT.value, 2)
    resp = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 70_000_000,
            "payment_method": "BANK_TRANSFER",
            "reference_code": "VCB-883719",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert len(data["allocations"]) == 2
    assert data["allocations"][0]["invoice_id"] == "HD-2026-0000001"
    assert data["allocations"][0]["allocated_amount"] == 55_000_000
    assert data["allocations"][1]["invoice_id"] == "HD-2026-0000002"
    assert data["allocations"][1]["allocated_amount"] == 15_000_000

    db = TestingSessionLocal()
    i1 = db.query(Invoice).filter(Invoice.id == "HD-2026-0000001").first()
    i2 = db.query(Invoice).filter(Invoice.id == "HD-2026-0000002").first()
    assert i1.status == InvoiceStatus.PAID.value
    assert i1.remaining_amount == 0

    assert i2.status == InvoiceStatus.PARTIALLY_PAID.value
    assert i2.paid_amount == 15_000_000
    assert i2.remaining_amount == 18_000_000
    db.close()


def test_03_manual_specific_invoice_allocation(client):
    """
    Test 3: Đối trừ thủ công vào hóa đơn cụ thể do người dùng chỉ định (AC-2):
    - Chỉ định đối trừ 20M vào Inv2 (bỏ qua Inv1 dù Inv1 cũ hơn).
    - Inv2 chuyển PARTIALLY_PAID (còn nợ 13M), Inv1 giữ nguyên UNPAID.
    """
    db = TestingSessionLocal()
    create_sample_invoices(db, "CUST-001")
    db.close()

    token = get_token_for("accountant_pay", UserRole.ACCOUNTANT.value, 2)
    resp = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 20_000_000,
            "payment_method": "CASH",
            "notes": "Đại lý nộp tiền mặt chỉ định thanh toán hóa đơn 2",
            "allocations": [
                {
                    "invoice_id": "HD-2026-0000002",
                    "allocated_amount": 20_000_000,
                }
            ],
        },
    )
    assert resp.status_code == 201, resp.text

    db = TestingSessionLocal()
    i1 = db.query(Invoice).filter(Invoice.id == "HD-2026-0000001").first()
    i2 = db.query(Invoice).filter(Invoice.id == "HD-2026-0000002").first()
    assert i1.status == InvoiceStatus.UNPAID.value
    assert i1.remaining_amount == 55_000_000

    assert i2.status == InvoiceStatus.PARTIALLY_PAID.value
    assert i2.paid_amount == 20_000_000
    assert i2.remaining_amount == 13_000_000
    db.close()


def test_04_overpayment_protection(client):
    """
    Test 4: Chặn thu tiền vượt tổng công nợ còn lại (AC-4):
    - Tổng nợ của khách là 88M (55M + 33M).
    - Cố tình thu 90M -> Trả về HTTP 400 Bad Request.
    """
    db = TestingSessionLocal()
    create_sample_invoices(db, "CUST-001")
    db.close()

    token = get_token_for("accountant_pay", UserRole.ACCOUNTANT.value, 2)
    resp = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 90_000_000,
            "payment_method": "BANK_TRANSFER",
        },
    )
    assert resp.status_code == 400
    assert "vượt quá tổng dư nợ" in resp.json()["detail"]


def test_05_manual_allocation_validation_errors(client):
    """
    Test 5: Các lỗi xác thực đối trừ thủ công:
    - Tổng phân bổ không khớp với số tiền thanh toán (HTTP 400).
    - Số tiền phân bổ vượt quá số nợ còn lại của hóa đơn chỉ định (HTTP 400).
    - Phân bổ vào hóa đơn của đại lý khác (HTTP 400).
    """
    db = TestingSessionLocal()
    create_sample_invoices(db, "CUST-001", id_start=1)
    create_sample_invoices(db, "CUST-002", id_start=3)
    db.close()

    token = get_token_for("accountant_pay", UserRole.ACCOUNTANT.value, 2)

    # 1. Tổng phân bổ không khớp amount
    resp = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 20_000_000,
            "allocations": [
                {"invoice_id": "HD-2026-0000001", "allocated_amount": 15_000_000}
            ],
        },
    )
    assert resp.status_code == 400
    assert "không khớp" in resp.json()["detail"]

    # 2. Phân bổ vượt quá số nợ còn lại của hóa đơn (HD1 còn nợ 55M, đòi phân bổ 60M)
    resp = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 60_000_000,
            "allocations": [
                {"invoice_id": "HD-2026-0000001", "allocated_amount": 60_000_000}
            ],
        },
    )
    assert resp.status_code == 400
    assert "vượt quá số nợ còn lại của hóa đơn" in resp.json()["detail"]

    # 3. Phân bổ vào hóa đơn của đại lý khác (HD-2026-0000003 thuộc CUST-002)
    resp3 = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 20_000_000,
            "allocations": [
                {"invoice_id": "HD-2026-0000003", "allocated_amount": 20_000_000}
            ],
        },
    )
    assert resp3.status_code == 400
    assert "không thuộc về khách hàng" in resp3.json()["detail"]


def test_06_idempotency_anti_double_click(client):
    """
    Test 6: Chống gửi trùng lặp qua client_request_id:
    - Gửi lần 1 với client_request_id -> Thành công tạo phiếu.
    - Gửi lần 2 với cùng client_request_id và cùng nội dung -> Trả về bản ghi cũ, không trừ nợ 2 lần.
    - Gửi lần 3 với cùng client_request_id nhưng khác amount -> Trả về HTTP 409 Conflict.
    """
    db = TestingSessionLocal()
    create_sample_invoices(db, "CUST-001")
    db.close()

    token = get_token_for("accountant_pay", UserRole.ACCOUNTANT.value, 2)
    payload_1 = {
        "client_request_id": "REQ-PAY-IDEM-001",
        "customer_id": "CUST-001",
        "amount": 30_000_000,
        "payment_method": "BANK_TRANSFER",
        "notes": "Thanh toán đợt 1",
    }

    # Lần 1
    resp1 = client.post("/api/v1/payments", headers={"Authorization": f"Bearer {token}"}, json=payload_1)
    assert resp1.status_code == 201
    pay_id_1 = resp1.json()["id"]

    # Lần 2 (trùng payload)
    resp2 = client.post("/api/v1/payments", headers={"Authorization": f"Bearer {token}"}, json=payload_1)
    assert resp2.status_code in [200, 201]
    assert resp2.json()["id"] == pay_id_1

    # Kiểm tra nợ trong DB chỉ bị trừ đúng 30M
    db = TestingSessionLocal()
    i1 = db.query(Invoice).filter(Invoice.id == "HD-2026-0000001").first()
    assert i1.paid_amount == 30_000_000
    assert i1.remaining_amount == 25_000_000
    db.close()

    # Lần 3 (cùng client_request_id nhưng đổi amount -> 409)
    payload_diff = dict(payload_1)
    payload_diff["amount"] = 35_000_000
    resp3 = client.post("/api/v1/payments", headers={"Authorization": f"Bearer {token}"}, json=payload_diff)
    assert resp3.status_code == 409


def test_07_immutability_put_delete_rejected(client):
    """
    Test 7: Tính bất biến - Từ chối PUT và DELETE trên phiếu thu (AC-5):
    - Đã ghi nhận thì không sửa, không xóa -> Trả về HTTP 405 Method Not Allowed.
    """
    token = get_token_for("admin_pay", UserRole.ADMIN.value, 1)
    resp_put = client.put(
        "/api/v1/payments/PT-2026-0000001",
        headers={"Authorization": f"Bearer {token}"},
        json={"amount": 100_000},
    )
    assert resp_put.status_code == 405

    resp_del = client.delete(
        "/api/v1/payments/PT-2026-0000001",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_del.status_code == 405


def test_08_gapless_sequence_and_rollback(client):
    """
    Test 8: Bộ đếm phiếu thu liên tục, rollback transaction không làm tiêu số:
    - Tạo thành công PT-2026-0000001.
    - Gửi request lỗi (thu quá hạn mức) -> Bị rollback, không tiêu số.
    - Gửi request hợp lệ tiếp theo -> Nhận chính xác PT-2026-0000002 không bị nhảy cóc.
    """
    db = TestingSessionLocal()
    create_sample_invoices(db, "CUST-001")
    db.close()

    token = get_token_for("accountant_pay", UserRole.ACCOUNTANT.value, 2)

    # 1. Tạo phiếu 1
    r1 = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 10_000_000,
        },
    )
    assert r1.status_code == 201
    assert r1.json()["id"] == "PT-2026-0000001"

    # 2. Gửi request lỗi
    r_err = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 999_999_999,  # Vượt quá nợ
        },
    )
    assert r_err.status_code == 400

    # 3. Tạo phiếu 2 hợp lệ
    r2 = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "customer_id": "CUST-001",
            "amount": 15_000_000,
        },
    )
    assert r2.status_code == 201
    assert r2.json()["id"] == "PT-2026-0000002"  # Không bị nhảy lên PT-2026-0000003


def test_09_customer_role_scope_anti_idor(client):
    """
    Test 9: Phân quyền Customer Scope (Chống IDOR):
    - Tạo 1 phiếu cho CUST-001 và 1 phiếu cho CUST-002.
    - User Customer 1 (thuộc CUST-001) chỉ thấy phiếu của CUST-001.
    - User Customer 1 truy cập xem trực tiếp phiếu của CUST-002 -> Bị 403 Forbidden.
    """
    db = TestingSessionLocal()
    create_sample_invoices(db, "CUST-001", id_start=1)
    create_sample_invoices(db, "CUST-002", id_start=3)
    db.close()

    admin_token = get_token_for("admin_pay", UserRole.ADMIN.value, 1)

    # Admin tạo phiếu cho CUST-001
    r1 = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"customer_id": "CUST-001", "amount": 10_000_000},
    )
    assert r1.status_code == 201
    pay1_id = r1.json()["id"]

    # Admin tạo phiếu cho CUST-002
    r2 = client.post(
        "/api/v1/payments",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"customer_id": "CUST-002", "amount": 12_000_000},
    )
    assert r2.status_code == 201
    pay2_id = r2.json()["id"]

    # Customer 1 xem danh sách
    cust1_token = get_token_for("customer_pay_1", UserRole.CUSTOMER.value, 3, "CUST-001")
    resp_list = client.get("/api/v1/payments", headers={"Authorization": f"Bearer {cust1_token}"})
    assert resp_list.status_code == 200
    items = resp_list.json()
    assert len(items) == 1
    assert items[0]["id"] == pay1_id

    # Customer 1 xem chi tiết phiếu của mình -> OK
    resp_detail_own = client.get(f"/api/v1/payments/{pay1_id}", headers={"Authorization": f"Bearer {cust1_token}"})
    assert resp_detail_own.status_code == 200

    # Customer 1 cố tình xem phiếu của Customer 2 -> 403 Forbidden
    resp_detail_other = client.get(f"/api/v1/payments/{pay2_id}", headers={"Authorization": f"Bearer {cust1_token}"})
    assert resp_detail_other.status_code == 403


def test_10_trang_hook_called_and_resilient(client):
    """
    Test 10: Extension hook cho Trang được gọi đúng 1 lần và an toàn:
    - Kể cả khi hook của Trang phát sinh ngoại lệ, transaction của phiếu thu vẫn hoàn tất.
    """
    db = TestingSessionLocal()
    create_sample_invoices(db, "CUST-001")
    db.close()

    token = get_token_for("accountant_pay", UserRole.ACCOUNTANT.value, 2)

    with patch("app.services.payment_service.hook_sau_khi_ghi_nhan_thanh_toan") as mock_hook:
        mock_hook.side_effect = Exception("Lỗi giả lập từ module công nợ của Trang")

        resp = client.post(
            "/api/v1/payments",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "customer_id": "CUST-001",
                "amount": 10_000_000,
                "notes": "Test resilient hook",
            },
        )
        assert resp.status_code == 201
        assert mock_hook.called
        assert mock_hook.call_count == 1
