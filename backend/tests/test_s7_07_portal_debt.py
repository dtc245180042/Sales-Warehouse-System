from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
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
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.services.portal_service import doc_so_tien_tieng_viet
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Portal Debt S7-07
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
def setup_portal_debt_test_database():
    """Tạo schema và dữ liệu người dùng / đại lý trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_debt",
            email="admin_debt@test.local",
            role=UserRole.ADMIN.value,
            full_name="Quản Trị Viên",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="accountant_debt",
            email="accountant_debt@test.local",
            role=UserRole.ACCOUNTANT.value,
            full_name="Võ Kế Toán",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="cust_alpha",
            email="cust_alpha@test.local",
            role=UserRole.CUSTOMER.value,
            full_name="Đại Lý Tuấn Phương",
            customer_id="CUS-001",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=4,
            username="cust_beta",
            email="cust_beta@test.local",
            role=UserRole.CUSTOMER.value,
            full_name="Đại Lý Minh Anh",
            customer_id="CUS-002",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)

    customers = [
        Customer(
            id="CUS-001",
            code="CUS-001",
            name="Đại Lý Tuấn Phương",
            email="cust_alpha@test.local",
            phone="0901111111",
            address="123 Trần Phú, Hà Đông, Hà Nội",
            tax_code="0101112223",
            customer_group="WHOLESALE",
            status="active",
        ),
        Customer(
            id="CUS-002",
            code="CUS-002",
            name="Đại Lý Minh Anh",
            email="cust_beta@test.local",
            phone="0902222222",
            address="456 Lê Lợi, Quận 1, TP.HCM",
            tax_code="0303334445",
            customer_group="WHOLESALE",
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
    with TestClient(app) as test_client:
        yield test_client


def make_auth_header(user_id: int, role: str, customer_id: str = None) -> dict:
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "username": f"user_{user_id}",
        "role": role,
        "token_version": 1,
    }
    if customer_id:
        payload["customer_id"] = customer_id
    token = tao_token_truy_cap(du_lieu=payload)
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# TEST SUITE: S7-07 (SCRUM-753, SCRUM-754, SCRUM-756)
# ==============================================================================

def test_01_portal_debt_overview_metrics_calculation(client):
    """
    Test 01 (SCRUM-753): Xem công nợ tổng quan và danh sách hoá đơn của chính đại lý.
    - Hạn mức: 50.000.000 VNĐ, số ngày nợ: 30 ngày.
    - Hoá đơn 1: 15.000.000, đã trả 5.000.000, còn nợ 10.000.000 (PARTIALLY_PAID, chưa quá hạn).
    - Hoá đơn 2: 20.000.000, đã trả 20.000.000, còn nợ 0 (PAID).
    - Kết quả mong đợi:
      + total_debt = 10.000.000
      + available_credit = 40.000.000 (hạn mức còn lại để lấy hàng)
      + overdue_debt = 0, has_overdue = False
      + total_invoices_count = 2, unpaid_invoices_count = 1
    """
    db = TestingSessionLocal()
    profile = CustomerCreditProfile(
        customer_id="CUS-001",
        credit_limit=50000000,
        max_debt_days=30,
        current_debt=0,
    )
    db.add(profile)

    now_utc = datetime.now(timezone.utc)
    future_due = now_utc + timedelta(days=15)

    inv1 = Invoice(
        id="HD-2026-0000001",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        subtotal_amount=15000000,
        discount_amount=0,
        vat_amount=0,
        total_amount=15000000,
        paid_amount=5000000,
        remaining_amount=10000000,
        status=InvoiceStatus.PARTIALLY_PAID.value,
        issued_at=now_utc - timedelta(days=2),
        due_date=future_due,
        issued_by=2,
        notes="Hóa đơn giao đợt 1",
    )
    inv2 = Invoice(
        id="HD-2026-0000002",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        subtotal_amount=20000000,
        discount_amount=0,
        vat_amount=0,
        total_amount=20000000,
        paid_amount=20000000,
        remaining_amount=0,
        status=InvoiceStatus.PAID.value,
        issued_at=now_utc - timedelta(days=10),
        due_date=now_utc + timedelta(days=20),
        issued_by=2,
        notes="Hóa đơn thanh toán xong",
    )
    db.add(inv1)
    db.add(inv2)
    db.commit()
    db.close()

    headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    resp = client.get("/api/v1/portal/debt", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["customer_id"] == "CUS-001"
    assert data["customer_name"] == "Đại Lý Tuấn Phương"
    assert data["credit_limit"] == 50000000
    assert data["total_debt"] == 10000000
    assert data["available_credit"] == 40000000
    assert data["max_debt_days"] == 30
    assert data["overdue_debt"] == 0
    assert data["has_overdue"] is False
    assert data["total_invoices_count"] == 2
    assert data["unpaid_invoices_count"] == 1
    assert data["overdue_invoices_count"] == 0

    assert len(data["invoices"]) == 2
    item1 = next(it for it in data["invoices"] if it["id"] == "HD-2026-0000001")
    assert item1["remaining_amount"] == 10000000
    assert item1["is_overdue"] is False
    assert item1["days_overdue"] == 0


def test_02_portal_debt_overview_with_overdue_invoice(client):
    """
    Test 02 (SCRUM-753): Cảnh báo hoá đơn quá hạn và số ngày quá hạn.
    - Hoá đơn có hạn thanh toán cách đây 7 ngày, còn nợ 8.000.000 VNĐ.
    - Kết quả: has_overdue = True, overdue_debt = 8.000.000, overdue_invoices_count = 1.
    """
    db = TestingSessionLocal()
    profile = CustomerCreditProfile(
        customer_id="CUS-001",
        credit_limit=30000000,
        max_debt_days=15,
        current_debt=0,
    )
    db.add(profile)

    now_utc = datetime.now(timezone.utc)
    past_due = now_utc - timedelta(days=7)

    inv = Invoice(
        id="HD-2026-0000003",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        subtotal_amount=8000000,
        discount_amount=0,
        vat_amount=0,
        total_amount=8000000,
        paid_amount=0,
        remaining_amount=8000000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc - timedelta(days=22),
        due_date=past_due,
        issued_by=2,
    )
    db.add(inv)
    db.commit()
    db.close()

    headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    resp = client.get("/api/v1/portal/debt", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["has_overdue"] is True
    assert data["overdue_debt"] == 8000000
    assert data["overdue_invoices_count"] == 1

    inv_item = data["invoices"][0]
    assert inv_item["id"] == "HD-2026-0000003"
    assert inv_item["is_overdue"] is True
    assert inv_item["days_overdue"] >= 6


def test_03_portal_debt_filter_by_status_and_pagination(client):
    """
    Test 03 (SCRUM-753): Bộ lọc trạng thái (ALL, UNPAID, PAID, OVERDUE) và phân trang.
    """
    db = TestingSessionLocal()
    now_utc = datetime.now(timezone.utc)

    # 1 hoá đơn PAID
    db.add(Invoice(
        id="HD-PAGE-01",
        customer_id="CUS-001",
        total_amount=1000000,
        paid_amount=1000000,
        remaining_amount=0,
        status=InvoiceStatus.PAID.value,
        issued_at=now_utc - timedelta(days=5),
        due_date=now_utc + timedelta(days=10),
        issued_by=2,
    ))
    # 1 hoá đơn UNPAID chưa quá hạn
    db.add(Invoice(
        id="HD-PAGE-02",
        customer_id="CUS-001",
        total_amount=2000000,
        paid_amount=0,
        remaining_amount=2000000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc - timedelta(days=1),
        due_date=now_utc + timedelta(days=10),
        issued_by=2,
    ))
    # 1 hoá đơn OVERDUE
    db.add(Invoice(
        id="HD-PAGE-03",
        customer_id="CUS-001",
        total_amount=3000000,
        paid_amount=0,
        remaining_amount=3000000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc - timedelta(days=20),
        due_date=now_utc - timedelta(days=5),
        issued_by=2,
    ))
    db.commit()
    db.close()

    headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")

    # Lọc OVERDUE
    resp_ov = client.get("/api/v1/portal/debt?status=OVERDUE", headers=headers)
    assert resp_ov.status_code == 200
    assert resp_ov.json()["total"] == 1
    assert resp_ov.json()["invoices"][0]["id"] == "HD-PAGE-03"

    # Lọc PAID
    resp_paid = client.get("/api/v1/portal/debt?status=PAID", headers=headers)
    assert resp_paid.status_code == 200
    assert resp_paid.json()["total"] == 1
    assert resp_paid.json()["invoices"][0]["id"] == "HD-PAGE-01"

    # Phân trang: limit = 2
    resp_p1 = client.get("/api/v1/portal/debt?limit=2&page=1", headers=headers)
    assert resp_p1.status_code == 200
    d_p1 = resp_p1.json()
    assert d_p1["total"] == 3
    assert len(d_p1["invoices"]) == 2
    assert d_p1["total_pages"] == 2


def test_04_portal_invoices_list_endpoint(client):
    """
    Test 04 (SCRUM-753): Endpoint danh sách hoá đơn chuyên biệt GET /api/v1/portal/invoices.
    """
    db = TestingSessionLocal()
    now_utc = datetime.now(timezone.utc)
    db.add(Invoice(
        id="HD-LIST-01",
        customer_id="CUS-001",
        total_amount=5000000,
        paid_amount=0,
        remaining_amount=5000000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc,
        due_date=now_utc + timedelta(days=15),
        issued_by=2,
    ))
    db.commit()
    db.close()

    headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    resp = client.get("/api/v1/portal/invoices", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == "HD-LIST-01"


def test_05_portal_invoice_detail_success(client):
    """
    Test 05 (SCRUM-756): Tra cứu chi tiết hoá đơn đã phát hành kèm các dòng sản phẩm.
    """
    db = TestingSessionLocal()
    now_utc = datetime.now(timezone.utc)
    inv = Invoice(
        id="HD-DETAIL-01",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        customer_address="123 Trần Phú, Hà Đông",
        customer_tax_code="0101112223",
        subtotal_amount=10000000,
        discount_amount=500000,
        vat_amount=950000,
        total_amount=10450000,
        paid_amount=0,
        remaining_amount=10450000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc,
        due_date=now_utc + timedelta(days=30),
        issued_by=2,
        notes="Giao hàng đợt đầu tháng 10",
    )
    db.add(inv)

    item1 = InvoiceItem(
        id=1,
        invoice_id=inv.id,
        dispatch_id="PXK-01",
        dispatch_item_id=11,
        order_id="ORD-01",
        product_id="PRD-01",
        sku="SKU-IP15",
        product_name="iPhone 15 Pro",
        unit="chiếc",
        quantity=5,
        unit_price=2000000,
        discount_amount=100000,
        vat_amount=190000,
        subtotal=2090000,
    )
    db.add(item1)
    db.commit()
    db.close()

    headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    resp = client.get("/api/v1/portal/invoices/HD-DETAIL-01", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == "HD-DETAIL-01"
    assert data["customer_id"] == "CUS-001"
    assert data["customer_name"] == "Đại Lý Tuấn Phương"
    assert data["total_amount"] == 10450000
    assert len(data["items"]) == 1
    assert data["items"][0]["sku"] == "SKU-IP15"
    assert data["items"][0]["quantity"] == 5


def test_06_customer_idor_protection_for_debt_and_invoices(client):
    """
    Test 06 (SCRUM-754): Áp dụng kiểm soát truy cập chống IDOR:
    - Đại lý B không được xem hoá đơn của Đại lý A (403 Forbidden).
    - Đại lý B không được tải hoá đơn của Đại lý A (403 Forbidden).
    - Đại lý B cố truyền query customer_id=CUS-001 để xem công nợ Đại lý A (403 Forbidden).
    - Đại lý B gọi /portal/debt -> chỉ thấy dữ liệu của chính CUS-002.
    """
    db = TestingSessionLocal()
    now_utc = datetime.now(timezone.utc)
    inv_a = Invoice(
        id="HD-SECRET-A",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=99000000,
        paid_amount=0,
        remaining_amount=99000000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc,
        due_date=now_utc + timedelta(days=10),
        issued_by=2,
    )
    inv_b = Invoice(
        id="HD-PUBLIC-B",
        customer_id="CUS-002",
        customer_name="Đại Lý Minh Anh",
        total_amount=5000000,
        paid_amount=0,
        remaining_amount=5000000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc,
        due_date=now_utc + timedelta(days=10),
        issued_by=2,
    )
    db.add(inv_a)
    db.add(inv_b)
    db.commit()
    db.close()

    headers_b = make_auth_header(4, UserRole.CUSTOMER.value, customer_id="CUS-002")

    # 1. Đại lý B xem chi tiết hoá đơn của Đại lý A -> 403 Forbidden
    resp1 = client.get("/api/v1/portal/invoices/HD-SECRET-A", headers=headers_b)
    assert resp1.status_code == 403
    assert "không có quyền" in resp1.json()["detail"].lower()

    # 2. Đại lý B tải file hoá đơn của Đại lý A -> 403 Forbidden
    resp2 = client.get("/api/v1/portal/invoices/HD-SECRET-A/download", headers=headers_b)
    assert resp2.status_code == 403

    # 3. Đại lý B gọi debt với customer_id của Đại lý A -> 403 Forbidden
    resp3 = client.get("/api/v1/portal/debt?customer_id=CUS-001", headers=headers_b)
    assert resp3.status_code == 403

    # 4. Đại lý B gọi portal/debt chuẩn -> chỉ thấy hoá đơn HD-PUBLIC-B, không thấy HD-SECRET-A
    resp4 = client.get("/api/v1/portal/debt", headers=headers_b)
    assert resp4.status_code == 200
    d4 = resp4.json()
    assert d4["customer_id"] == "CUS-002"
    assert d4["total_debt"] == 5000000
    assert len(d4["invoices"]) == 1
    assert d4["invoices"][0]["id"] == "HD-PUBLIC-B"


def test_07_portal_invoice_download_html(client):
    """
    Test 07 (SCRUM-756): Tải lại hoá đơn đã phát hành dưới dạng file in ấn chuẩn A4.
    - Trả về header Content-Disposition: attachment; filename="HoaDon_...html"
    - Nội dung chứa tiêu đề HÓA ĐƠN BÁN HÀNG, thông tin công ty, đại lý, số tiền bằng chữ, watermark.
    """
    db = TestingSessionLocal()
    now_utc = datetime.now(timezone.utc)
    inv = Invoice(
        id="HD-2026-DOWN01",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        customer_address="123 Trần Phú, Hà Đông",
        customer_tax_code="0101112223",
        subtotal_amount=15000000,
        discount_amount=0,
        vat_amount=0,
        total_amount=15000000,
        paid_amount=15000000,
        remaining_amount=0,
        status=InvoiceStatus.PAID.value,
        issued_at=now_utc,
        due_date=now_utc + timedelta(days=15),
        issued_by=2,
    )
    db.add(inv)
    db.commit()
    db.close()

    headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    resp = client.get("/api/v1/portal/invoices/HD-2026-DOWN01/download", headers=headers)
    assert resp.status_code == 200
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert "HoaDon_HD-2026-DOWN01.html" in resp.headers.get("content-disposition", "")

    html_text = resp.text
    assert "HÓA ĐƠN BÁN HÀNG" in html_text
    assert "Đại Lý Tuấn Phương" in html_text
    assert "HD-2026-DOWN01" in html_text
    assert "Mười lăm triệu đồng chẵn" in html_text
    assert "ĐÃ THANH TOÁN" in html_text


def test_08_portal_invoice_print_html_preview(client):
    """
    Test 08 (SCRUM-756): Xem trước mẫu in hoá đơn dạng HTML để in trực tiếp từ trình duyệt.
    """
    db = TestingSessionLocal()
    now_utc = datetime.now(timezone.utc)
    inv = Invoice(
        id="HD-2026-PRINT01",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        subtotal_amount=25000000,
        discount_amount=0,
        vat_amount=0,
        total_amount=25000000,
        paid_amount=0,
        remaining_amount=25000000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc,
        due_date=now_utc + timedelta(days=15),
        issued_by=2,
    )
    db.add(inv)
    db.commit()
    db.close()

    headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    resp = client.get("/api/v1/portal/invoices/HD-2026-PRINT01/print", headers=headers)
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")
    html_text = resp.text
    assert "CHƯA THANH TOÁN" in html_text
    assert "Hai mươi lăm triệu đồng chẵn" in html_text


def test_09_download_via_invoices_endpoint_customer_scope(client):
    """
    Test 09: Tải qua endpoint /api/v1/invoices/{id}/download:
    - Customer A tải hoá đơn của chính mình -> Thành công 200.
    - Customer B tải hoá đơn của Customer A -> Bị từ chối 403 Forbidden.
    """
    db = TestingSessionLocal()
    now_utc = datetime.now(timezone.utc)
    inv = Invoice(
        id="HD-SHARED-01",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=5000000,
        paid_amount=0,
        remaining_amount=5000000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc,
        due_date=now_utc + timedelta(days=15),
        issued_by=2,
    )
    db.add(inv)
    db.commit()
    db.close()

    headers_a = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    headers_b = make_auth_header(4, UserRole.CUSTOMER.value, customer_id="CUS-002")

    # 1. Customer A tải -> 200
    resp_a = client.get("/api/v1/invoices/HD-SHARED-01/download", headers=headers_a)
    assert resp_a.status_code == 200

    # 2. Customer B tải -> 403
    resp_b = client.get("/api/v1/invoices/HD-SHARED-01/download", headers=headers_b)
    assert resp_b.status_code == 403


def test_10_doc_so_tien_tieng_viet_helper():
    """
    Test 10: Kiểm thử hàm đọc số tiền tiếng Việt phục vụ xuất hoá đơn chuẩn xác.
    """
    assert doc_so_tien_tieng_viet(0) == "Không đồng"
    assert doc_so_tien_tieng_viet(1000000) == "Một triệu đồng chẵn"
    assert doc_so_tien_tieng_viet(10000000) == "Mười triệu đồng chẵn"
    assert doc_so_tien_tieng_viet(25000000) == "Hai mươi lăm triệu đồng chẵn"
    assert doc_so_tien_tieng_viet(500000) == "Năm trăm nghìn đồng chẵn"


def test_11_invoice_not_found_returns_404(client):
    """
    Test 11: Tra cứu hoá đơn không tồn tại trả về 404 Not Found.
    """
    headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    resp_detail = client.get("/api/v1/portal/invoices/HD-404", headers=headers)
    assert resp_detail.status_code == 404

    resp_down = client.get("/api/v1/portal/invoices/HD-404/download", headers=headers)
    assert resp_down.status_code == 404
