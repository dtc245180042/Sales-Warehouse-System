from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.debt_reconciliation import (
    DebtReconciliationStatement,
    DebtReconciliationEntry,
    DebtStatementStatus,
    DebtDocType,
)
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Debt Reconciliation S7-06
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
def setup_debt_reconciliation_db():
    """Khởi tạo schema và tài khoản mẫu trước mỗi bài test."""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_test",
            email="admin_test@warehouse.local",
            role=UserRole.ADMIN.value,
            full_name="Quản Trị Viên",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="accountant_debt",
            email="accountant_debt@warehouse.local",
            role=UserRole.ACCOUNTANT.value,
            full_name="Đặng Thị Kế Toán Công Nợ",
            phone_number="0912888999",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="customer_user",
            email="daily_minhanh@warehouse.local",
            role=UserRole.CUSTOMER.value,
            full_name="Đại Diện Đại Lý Minh Anh",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)

    cust = Customer(
        id="CUST-MA-01",
        code="KH-MINHANH",
        name="Công Ty TNHH Thương Mại Minh Anh",
        phone="0908777666",
        tax_code="0312456789",
        address="Số 88 Đường Võ Văn Kiệt, Quận 1, TP. Hồ Chí Minh",
        status="active",
    )
    db.add(cust)

    # 1. Dữ liệu TRƯỚC KỲ (Tháng 8/2026): Hóa đơn 10,000,000đ - Đã trả 3,000,000đ -> Đầu kỳ nợ 7,000,000đ
    dt_aug_10 = datetime(2026, 8, 10, 10, 0, 0, tzinfo=timezone.utc)
    dt_aug_20 = datetime(2026, 8, 20, 14, 0, 0, tzinfo=timezone.utc)

    inv_prev = Invoice(
        id="HD-202608-0001",
        customer_id=cust.id,
        customer_name=cust.name,
        total_amount=10000000,
        subtotal_amount=10000000,
        status="PARTIALLY_PAID",
        due_date=dt_aug_10 + timedelta(days=30),
        issued_by=2,
        created_at=dt_aug_10,
    )
    db.add(inv_prev)

    pay_prev = Payment(
        id="PT-202608-0001",
        customer_id=cust.id,
        customer_name=cust.name,
        amount=3000000,
        collector_id=2,
        payment_date=dt_aug_20,
        created_at=dt_aug_20,
    )
    db.add(pay_prev)

    # 2. Dữ liệu TRONG KỲ ĐỐI CHIẾU (Tháng 9/2026: từ 2026-09-01 đến 2026-09-30)
    # Hóa đơn 1 (05/09): 15,000,000đ
    dt_sep_05 = datetime(2026, 9, 5, 9, 30, 0, tzinfo=timezone.utc)
    inv_sep1 = Invoice(
        id="HD-202609-0012",
        customer_id=cust.id,
        customer_name=cust.name,
        total_amount=15000000,
        subtotal_amount=15000000,
        status="UNPAID",
        due_date=dt_sep_05 + timedelta(days=30),
        issued_by=2,
        created_at=dt_sep_05,
    )
    db.add(inv_sep1)

    # Phiếu thu 1 (15/09): 5,000,000đ
    dt_sep_15 = datetime(2026, 9, 15, 11, 0, 0, tzinfo=timezone.utc)
    pay_sep1 = Payment(
        id="PT-202609-0005",
        customer_id=cust.id,
        customer_name=cust.name,
        amount=5000000,
        collector_id=2,
        payment_date=dt_sep_15,
        created_at=dt_sep_15,
    )
    db.add(pay_sep1)

    # Hóa đơn 2 (22/09): 8,000,000đ
    dt_sep_22 = datetime(2026, 9, 22, 15, 45, 0, tzinfo=timezone.utc)
    inv_sep2 = Invoice(
        id="HD-202609-0028",
        customer_id=cust.id,
        customer_name=cust.name,
        total_amount=8000000,
        subtotal_amount=8000000,
        status="UNPAID",
        due_date=dt_sep_22 + timedelta(days=30),
        issued_by=2,
        created_at=dt_sep_22,
    )
    db.add(inv_sep2)

    db.commit()
    db.close()

    yield

    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def auth_header(user_id: int, role: str) -> dict:
    token = tao_token_truy_cap(
        du_lieu={
            "sub": str(user_id),
            "user_id": user_id,
            "role": role,
            "token_version": 1,
        }
    )
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# TEST 1: TỔNG HỢP SỐ LIỆU CÔNG NỢ THEO KỲ VÀ SINH BIÊN BẢN (SUBTASK 10)
# ==============================================================================
def test_01_generate_debt_reconciliation_statement(client):
    headers = auth_header(2, UserRole.ACCOUNTANT.value)

    payload = {
        "customer_id": "CUST-MA-01",
        "period_from": "2026-09-01",
        "period_to": "2026-09-30",
        "representative": "Nguyễn Minh Anh (Giám đốc)",
        "notes": "Biên bản đối chiếu công nợ tháng 09/2026",
    }
    resp = client.post("/api/v1/debt-reconciliations/generate", headers=headers, json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    # Kiểm tra mã biên bản và thông tin khách hàng
    assert data["id"].startswith("BB-202609-")
    assert data["customer_id"] == "CUST-MA-01"
    assert data["customer_name"] == "Công Ty TNHH Thương Mại Minh Anh"
    assert data["customer_tax_code"] == "0312456789"

    # Kiểm tra 4 chỉ tiêu công nợ chính xác
    # Đầu kỳ: 10,000,000 - 3,000,000 = 7,000,000đ
    assert data["opening_balance"] == 7000000
    # Phát sinh tăng trong kỳ: 15,000,000 + 8,000,000 = 23,000,000đ
    assert data["period_increase"] == 23000000
    # Phát sinh giảm trong kỳ: 5,000,000đ
    assert data["period_decrease"] == 5000000
    # Cuối kỳ: 7,000,000 + 23,000,000 - 5,000,000 = 25,000,000đ
    assert data["closing_balance"] == 25000000
    assert data["status"] == DebtStatementStatus.SENT.value

    # Kiểm tra bảng chi tiết chứng từ (3 chứng từ trong kỳ)
    entries = data["entries"]
    assert len(entries) == 3
    # Entry 1: 05/09 Hóa đơn 15tr -> Dư nợ lũy kế: 7tr + 15tr = 22tr
    assert entries[0]["doc_number"] == "HD-202609-0012"
    assert entries[0]["increase_amount"] == 15000000
    assert entries[0]["running_balance"] == 22000000

    # Entry 2: 15/09 Phiếu thu 5tr -> Dư nợ lũy kế: 22tr - 5tr = 17tr
    assert entries[1]["doc_number"] == "PT-202609-0005"
    assert entries[1]["decrease_amount"] == 5000000
    assert entries[1]["running_balance"] == 17000000

    # Entry 3: 22/09 Hóa đơn 8tr -> Dư nợ lũy kế: 17tr + 8tr = 25tr
    assert entries[2]["doc_number"] == "HD-202609-0028"
    assert entries[2]["increase_amount"] == 8000000
    assert entries[2]["running_balance"] == 25000000


# ==============================================================================
# TEST 2: PHÁT TRIỂN CHỨC NĂNG XUẤT PDF BIÊN BẢN ĐỐI CHIẾU (SUBTASK 12)
# ==============================================================================
def test_02_export_pdf_statement(client):
    headers = auth_header(2, UserRole.ACCOUNTANT.value)

    # 1. Sinh biên bản
    gen_resp = client.post(
        "/api/v1/debt-reconciliations/generate",
        headers=headers,
        json={"customer_id": "CUST-MA-01", "period_from": "2026-09-01", "period_to": "2026-09-30"},
    )
    st_id = gen_resp.json()["id"]

    # 2. Xuất file PDF / HTML in ấn
    pdf_resp = client.get(f"/api/v1/debt-reconciliations/{st_id}/pdf", headers=headers)
    assert pdf_resp.status_code == 200, pdf_resp.text
    assert "text/html" in pdf_resp.headers.get("content-type", "")

    html_text = pdf_resp.text
    # Kiểm tra đầy đủ thông tin chuẩn mẫu in
    assert "BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ ĐỊNH KỲ" in html_text
    assert "BÊN A (BÊN BÁN HÀNG)" in html_text
    assert "BÊN B (ĐẠI LÝ / KHÁCH HÀNG)" in html_text
    assert "Công Ty TNHH Thương Mại Minh Anh" in html_text
    assert "HD-202609-0012" in html_text
    assert "PT-202609-0005" in html_text
    assert "KẾ TOÁN CÔNG NỢ" in html_text
    assert "KẾ TOÁN TRƯỞNG" in html_text
    assert "ĐẠI DIỆN ĐẠI LÝ (BÊN B)" in html_text


# ==============================================================================
# TEST 3: ĐẠI LÝ XÁC NHẬN ĐỒNG Ý KHỚP SỐ LIỆU TRÊN CỔNG ĐẠI LÝ (SUBTASK 8)
# ==============================================================================
def test_03_customer_portal_confirm_agreement(client):
    acc_headers = auth_header(2, UserRole.ACCOUNTANT.value)

    # 1. Kế toán sinh biên bản gửi đại lý
    gen_resp = client.post(
        "/api/v1/debt-reconciliations/generate",
        headers=acc_headers,
        json={"customer_id": "CUST-MA-01", "period_from": "2026-09-01", "period_to": "2026-09-30"},
    )
    st_id = gen_resp.json()["id"]

    # 2. Đại lý xem trên portal và bấm xác nhận đồng ý
    cust_headers = auth_header(3, UserRole.CUSTOMER.value)
    confirm_payload = {
        "feedback_notes": "Đã đối chiếu sổ sách kế toán đại lý, số dư 25,000,000đ hoàn toàn chính xác."
    }
    confirm_resp = client.put(
        f"/api/v1/debt-reconciliations/{st_id}/portal-confirm",
        headers=cust_headers,
        json=confirm_payload,
    )
    assert confirm_resp.status_code == 200, confirm_resp.text
    data = confirm_resp.json()

    assert data["status"] == DebtStatementStatus.CONFIRMED.value
    assert data["customer_confirmed_at"] is not None
    assert "hoàn toàn chính xác" in data["customer_feedback_notes"]


# ==============================================================================
# TEST 4: ĐẠI LÝ GỬI PHẢN HỒI LỆCH KÈM SỐ LIỆU VÀ LÝ DO (SUBTASK 8)
# ==============================================================================
def test_04_customer_portal_dispute_discrepancy(client):
    acc_headers = auth_header(2, UserRole.ACCOUNTANT.value)

    # 1. Kế toán sinh biên bản: số dư cuối kỳ là 25,000,000đ
    gen_resp = client.post(
        "/api/v1/debt-reconciliations/generate",
        headers=acc_headers,
        json={"customer_id": "CUST-MA-01", "period_from": "2026-09-01", "period_to": "2026-09-30"},
    )
    st_id = gen_resp.json()["id"]

    # 2. Đại lý phản hồi lệch: số dư đại lý tự tính chỉ là 22,000,000đ (Lệch 3,000,000đ)
    cust_headers = auth_header(3, UserRole.CUSTOMER.value)
    dispute_payload = {
        "customer_claimed_balance": 22000000,
        "dispute_reason": "Chưa ghi nhận phiếu thu tiền mặt ngày 28/09 số tiền 3,000,000đ do NVKD Tuấn thu",
        "feedback_notes": "Đã gửi ảnh chụp biên lai thu tiền qua Zalo cho kế toán kiểm tra lại.",
    }
    disp_resp = client.put(
        f"/api/v1/debt-reconciliations/{st_id}/portal-dispute",
        headers=cust_headers,
        json=dispute_payload,
    )
    assert disp_resp.status_code == 200, disp_resp.text
    data = disp_resp.json()

    assert data["status"] == DebtStatementStatus.DISPUTED.value
    assert data["customer_claimed_balance"] == 22000000
    assert data["discrepancy_amount"] == 3000000  # |25M - 22M| = 3M
    assert "phiếu thu tiền mặt ngày 28/09" in data["dispute_reason"]
    assert data["disputed_at"] is not None


# ==============================================================================
# TEST 5: DANH SÁCH VÀ BỘ LỌC BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ
# ==============================================================================
def test_05_list_and_filter_statements(client):
    acc_headers = auth_header(2, UserRole.ACCOUNTANT.value)

    # Tạo 2 biên bản cho 2 kỳ khác nhau
    client.post(
        "/api/v1/debt-reconciliations/generate",
        headers=acc_headers,
        json={"customer_id": "CUST-MA-01", "period_from": "2026-08-01", "period_to": "2026-08-31"},
    )
    client.post(
        "/api/v1/debt-reconciliations/generate",
        headers=acc_headers,
        json={"customer_id": "CUST-MA-01", "period_from": "2026-09-01", "period_to": "2026-09-30"},
    )

    # Truy vấn danh sách
    list_resp = client.get("/api/v1/debt-reconciliations?customer_id=CUST-MA-01", headers=acc_headers)
    assert list_resp.status_code == 200
    statements = list_resp.json()
    assert len(statements) == 2


# ==============================================================================
# TEST 6: RÀNG BUỘC NGHIỆP VỤ NGÀY KỲ ĐỐI CHIẾU HỢP LỆ
# ==============================================================================
def test_06_validation_period_from_greater_than_period_to(client):
    acc_headers = auth_header(2, UserRole.ACCOUNTANT.value)

    # Ngày bắt đầu lớn hơn ngày kết thúc -> Báo lỗi 400
    bad_payload = {
        "customer_id": "CUST-MA-01",
        "period_from": "2026-09-30",
        "period_to": "2026-09-01",
    }
    resp = client.post("/api/v1/debt-reconciliations/generate", headers=acc_headers, json=bad_payload)
    assert resp.status_code == 400
    assert "period_from" in resp.json()["detail"]
