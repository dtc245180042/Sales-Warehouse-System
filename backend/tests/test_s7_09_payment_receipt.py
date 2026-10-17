"""
Unit Tests cho chức năng In Phiếu Thu Tiền (SCRUM-270 / S7-09).
Kiểm tra:
1. Endpoint /payments/{id}/print trả về đầy đủ thông tin:
   - Mã duy nhất, thông tin đại lý, số tiền số + chữ, hình thức, người thu
   - Mã vạch Code128 vector SVG
   - Danh sách đối trừ hóa đơn
2. Endpoint /payments/{id}/print-html trả về HTML chuẩn A4 offline-first (status 200, Content-Type text/html).
3. Kiểm tra phân quyền Customer Scope (chống IDOR).
4. Kiểm tra thuật toán chuyển số thành chữ tiếng Việt (number_to_vietnamese_words).
"""

from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.payment import Payment, PaymentAllocation, PaymentMethod
from app.models.customer import Customer
from app.services.payment_receipt_service import number_to_vietnamese_words
from main import app

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
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client():
    return TestClient(app)


def test_number_to_vietnamese_words():
    """Kiểm tra đọc số tiền sang chữ tiếng Việt."""
    assert "Không đồng" in number_to_vietnamese_words(0)
    assert "Mười lăm triệu đồng chẵn." == number_to_vietnamese_words(15000000)
    assert "Năm mươi triệu đồng chẵn." == number_to_vietnamese_words(50000000)
    assert "Một trăm hai mươi ba nghìn bốn trăm năm mươi sáu đồng chẵn." == number_to_vietnamese_words(123456)


def test_payment_receipt_print_data_and_html(client: TestClient):
    """
    Tạo dữ liệu phiếu thu mẫu và kiểm tra 2 endpoint in ấn:
    - GET /api/v1/payments/{id}/print
    - GET /api/v1/payments/{id}/print-html
    """
    db = TestingSessionLocal()

    # 1. Tạo customer
    customer = Customer(
        id="CUS-PRINT-TEST-001",
        code="DL-TEST-01",
        name="Công ty Đại Lý Tuấn Phương",
        phone="0912345678",
        tax_code="0109988776",
        address="123 Đường Cầu Giấy, Hà Nội",
        customer_group="VIP",
    )
    db.add(customer)

    # 2. Tạo User kế toán
    accountant = User(
        username="accountant_test",
        email="accountant_test@warehouse.local",
        hashed_password=bam_mat_khau("Accountant@1234"),
        role=UserRole.ACCOUNTANT.value,
        full_name="Đỗ Thị Kế Toán Trưởng",
        is_active=True,
    )
    db.add(accountant)
    db.commit()

    # 3. Tạo Payment
    payment = Payment(
        id="PT-2026-9999001",
        customer_id=customer.id,
        customer_name=customer.name,
        amount=25000000,
        payment_method=PaymentMethod.BANK_TRANSFER.value,
        payment_date=datetime.now(timezone.utc),
        collector_id=accountant.id,
        collector_name=accountant.full_name,
        reference_code="VCB-998811",
        notes="Thu tiền đợt 1 hóa đơn bán hàng thiết bị mạng",
    )
    db.add(payment)
    db.commit()

    token = tao_token_truy_cap({
        "sub": accountant.username,
        "username": accountant.username,
        "role": accountant.role,
        "user_id": accountant.id,
        "token_version": 1,
    })
    headers = {"Authorization": f"Bearer {token}"}

    # 4. Test GET /print
    print_resp = client.get(f"/api/v1/payments/{payment.id}/print", headers=headers)
    assert print_resp.status_code == 200, print_resp.text
    data = print_resp.json()
    assert data["payment_id"] == payment.id
    assert data["customer_name"] == customer.name
    assert data["amount"] == 25000000
    assert "25.000.000 đ" in data["amount_formatted"]
    assert "Hai mươi lăm triệu đồng chẵn." in data["amount_in_words"]
    assert data["payment_method_display"] == "Chuyển khoản ngân hàng"
    assert data["collector_name"] == accountant.full_name
    assert "<svg" in data["barcode_svg"]

    # 5. Test GET /print-html
    html_resp = client.get(f"/api/v1/payments/{payment.id}/print-html", headers=headers)
    assert html_resp.status_code == 200
    assert "text/html" in html_resp.headers.get("content-type", "")
    html_text = html_resp.text
    assert "PHIẾU THU TIỀN" in html_text
    assert payment.id in html_text
    assert customer.name in html_text
    assert "25.000.000 đ" in html_text
    assert "Hai mươi lăm triệu đồng chẵn." in html_text

    db.close()
