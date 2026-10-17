# backend/tests/tvp/tvp_sprint8/test_scrum280_api.py
"""
Kiểm thử tích hợp API cho Story S8-09 (SCRUM-280) - Báo cáo Công nợ Quá hạn theo Tuổi nợ.

Kiểm tra trực tiếp qua FastAPI TestClient:
1. GET /api/v1/debt-aging-reports không có token -> 401 Unauthorized
2. GET /api/v1/debt-aging-reports với tài khoản Customer -> 403 Forbidden (chặn đại lý)
3. GET /api/v1/debt-aging-reports với tài khoản Admin -> 200 OK (đầy đủ cấu trúc)
4. GET /api/v1/debt-aging-reports với tài khoản Accountant -> 200 OK
5. GET /api/v1/debt-aging-reports với tài khoản SalesStaff -> 200 OK (phân quyền phạm vi phụ trách)
6. GET /api/v1/debt-aging-reports với bộ lọc query params: customer_id, sales_rep, region, as_of_date
7. GET /api/v1/debt-aging-reports/export với tài khoản Admin/Accountant -> 200 OK, trả về StreamingResponse Excel (.xlsx)
8. GET /api/v1/debt-aging-reports/export với tài khoản Customer -> 403 Forbidden
9. GET /api/debt-aging-reports -> 200 OK (tương thích ngược với prefix /api)
"""
from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap, bam_mat_khau
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus


def _tao_token_cho_user(user: User) -> str:
    """Tạo JWT Bearer token hợp lệ cho một User model."""
    token = tao_token_truy_cap({
        "sub": str(user.id),
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "token_version": user.token_version,
    })
    return f"Bearer {token}"


@pytest.fixture(scope="module")
def api_client():
    """Khởi tạo TestClient với Lifespan (seed users, tables)."""
    with TestClient(app) as client:
        yield client


@pytest.fixture(scope="module")
def seed_test_data():
    """Tạo người dùng mẫu và hóa đơn mẫu cho kiểm thử API."""
    db = SessionLocal()
    try:
        # 1. Tìm hoặc tạo Admin
        admin = db.query(User).filter_by(username="admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@saleswarehouse.com",
                role=UserRole.ADMIN.value,
                hashed_password=bam_mat_khau("Admin@123456"),
                is_active=True,
                token_version=1,
            )
            db.add(admin)
            db.flush()

        # 2. Tìm hoặc tạo Accountant
        accountant = db.query(User).filter_by(username="accountant").first()
        if not accountant:
            accountant = User(
                username="accountant",
                email="accountant@warehouse.local",
                role=UserRole.ACCOUNTANT.value,
                hashed_password=bam_mat_khau("Accountant@1234"),
                is_active=True,
                token_version=1,
            )
            db.add(accountant)
            db.flush()

        # 3. Tìm hoặc tạo SalesStaff
        sales_rep = db.query(User).filter_by(username="sales_rep").first()
        if not sales_rep:
            sales_rep = User(
                username="sales_rep",
                email="sales_rep@warehouse.local",
                role="SalesStaff",
                full_name="Lê Thị Nhân Viên Kinh Doanh",
                hashed_password=bam_mat_khau("SalesRep@1234"),
                is_active=True,
                token_version=1,
            )
            db.add(sales_rep)
            db.flush()
        else:
            # Đảm bảo full_name đồng nhất
            sales_rep.full_name = "Lê Thị Nhân Viên Kinh Doanh"

        # 4. Tìm hoặc tạo Customer
        customer_user = db.query(User).filter_by(username="customer").first()
        if not customer_user:
            customer_user = User(
                username="customer",
                email="customer@warehouse.local",
                role=UserRole.CUSTOMER.value,
                hashed_password=bam_mat_khau("Customer@1234"),
                is_active=True,
                token_version=1,
            )
            db.add(customer_user)
            db.flush()

        # 5. Tạo 2 Customer đối tác và Hóa đơn mẫu
        cust1 = db.query(Customer).filter_by(id="TEST-CUST-01").first()
        if not cust1:
            cust1 = Customer(
                id="TEST-CUST-01",
                code="DL-TEST-01",
                name="Công ty TNHH Minh Khang (Test)",
                region="Miền Bắc",
                assigned_sales_rep=sales_rep.full_name,
            )
            db.add(cust1)

        cust2 = db.query(Customer).filter_by(id="TEST-CUST-02").first()
        if not cust2:
            cust2 = Customer(
                id="TEST-CUST-02",
                code="DL-TEST-02",
                name="Đại lý Nam Hải (Test)",
                region="Miền Nam",
                assigned_sales_rep="Nguyễn Văn Khác",
            )
            db.add(cust2)

        db.flush()

        # Hóa đơn cho CUST-01 (quá hạn 15 ngày: bucket 1-30)
        today = date.today()
        inv1 = db.query(Invoice).filter_by(id="HD-TEST-001").first()
        if not inv1:
            inv1 = Invoice(
                id="HD-TEST-001",
                customer_id="TEST-CUST-01",
                customer_name="Công ty TNHH Minh Khang (Test)",
                total_amount=30000000,
                paid_amount=10000000,
                remaining_amount=20000000,
                status=InvoiceStatus.PARTIALLY_PAID.value,
                issued_by=1,
                due_date=datetime.combine(today - timedelta(days=15), datetime.min.time(), tzinfo=timezone.utc),
            )
            db.add(inv1)

        # Hóa đơn cho CUST-02 (quá hạn 95 ngày: bucket >90)
        inv2 = db.query(Invoice).filter_by(id="HD-TEST-002").first()
        if not inv2:
            inv2 = Invoice(
                id="HD-TEST-002",
                customer_id="TEST-CUST-02",
                customer_name="Đại lý Nam Hải (Test)",
                total_amount=50000000,
                paid_amount=0,
                remaining_amount=50000000,
                status=InvoiceStatus.UNPAID.value,
                issued_by=1,
                due_date=datetime.combine(today - timedelta(days=95), datetime.min.time(), tzinfo=timezone.utc),
            )
            db.add(inv2)

        db.commit()

        tokens = {
            "admin": _tao_token_cho_user(admin),
            "accountant": _tao_token_cho_user(accountant),
            "sales_rep": _tao_token_cho_user(sales_rep),
            "customer_user": _tao_token_cho_user(customer_user),
            "sales_rep_name": sales_rep.full_name,
        }
        return tokens
    finally:
        db.close()


def test_api_unauthorized_without_token(api_client):
    """Kiểm tra gọi API khi không có token Bearer -> HTTP 401 Unauthorized."""
    res = api_client.get("/api/v1/debt-aging-reports")
    assert res.status_code == 401
    assert "detail" in res.json()


def test_api_customer_forbidden(api_client, seed_test_data):
    """Kiểm tra gọi API với vai trò Customer -> HTTP 403 Forbidden."""
    token = seed_test_data["customer_user"]
    res = api_client.get(
        "/api/v1/debt-aging-reports",
        headers={"Authorization": token},
    )
    assert res.status_code == 403


def test_api_admin_can_access(api_client, seed_test_data):
    """Kiểm tra Admin gọi API -> HTTP 200 OK với đầy đủ cấu trúc dữ liệu."""
    token = seed_test_data["admin"]
    res = api_client.get(
        "/api/v1/debt-aging-reports",
        headers={"Authorization": token},
    )
    assert res.status_code == 200
    data = res.json()
    assert "report_date" in data
    assert "total_customers_with_debt" in data
    assert "total_debt_amount" in data
    assert "total_overdue_amount" in data
    assert "bucket_summaries" in data
    assert len(data["bucket_summaries"]) == 5
    assert "customers" in data
    assert "top_risk_customers" in data
    assert "by_sales_rep" in data


def test_api_accountant_can_access(api_client, seed_test_data):
    """Kiểm tra Accountant gọi API -> HTTP 200 OK."""
    token = seed_test_data["accountant"]
    res = api_client.get(
        "/api/v1/debt-aging-reports",
        headers={"Authorization": token},
    )
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data["customers"], list)


def test_api_sales_rep_scoped_access(api_client, seed_test_data):
    """Kiểm tra SalesStaff gọi API -> HTTP 200 OK và chỉ thấy khách hàng mình phụ trách."""
    token = seed_test_data["sales_rep"]
    res = api_client.get(
        "/api/v1/debt-aging-reports",
        headers={"Authorization": token},
    )
    assert res.status_code == 200
    data = res.json()
    # Nhân viên chỉ thấy đại lý mình phụ trách (TEST-CUST-01)
    for c in data["customers"]:
        assert c["assigned_sales_rep"] == seed_test_data["sales_rep_name"]


def test_api_filter_by_customer_id(api_client, seed_test_data):
    """Kiểm tra lọc theo customer_id qua query params."""
    token = seed_test_data["admin"]
    res = api_client.get(
        "/api/v1/debt-aging-reports?customer_id=TEST-CUST-01",
        headers={"Authorization": token},
    )
    assert res.status_code == 200
    data = res.json()
    for c in data["customers"]:
        assert c["customer_id"] == "TEST-CUST-01"


def test_api_filter_by_region(api_client, seed_test_data):
    """Kiểm tra lọc theo region qua query params."""
    token = seed_test_data["admin"]
    res = api_client.get(
        "/api/v1/debt-aging-reports?region=Miền Bắc",
        headers={"Authorization": token},
    )
    assert res.status_code == 200
    data = res.json()
    for c in data["customers"]:
        assert c["region"] == "Miền Bắc"


def test_api_filter_by_sales_rep(api_client, seed_test_data):
    """Kiểm tra lọc theo sales_rep qua query params."""
    token = seed_test_data["admin"]
    res = api_client.get(
        "/api/v1/debt-aging-reports?sales_rep=Minh Khang",
        headers={"Authorization": token},
    )
    assert res.status_code == 200


def test_api_filter_by_as_of_date(api_client, seed_test_data):
    """Kiểm tra lọc theo ngày lập báo cáo as_of_date."""
    token = seed_test_data["admin"]
    target_date = "2026-10-16"
    res = api_client.get(
        f"/api/v1/debt-aging-reports?as_of_date={target_date}",
        headers={"Authorization": token},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["report_date"] == "16/10/2026"


def test_api_export_excel_success(api_client, seed_test_data):
    """Kiểm tra xuất Excel qua GET /api/v1/debt-aging-reports/export -> HTTP 200 OK."""
    token = seed_test_data["accountant"]
    res = api_client.get(
        "/api/v1/debt-aging-reports/export",
        headers={"Authorization": token},
    )
    assert res.status_code == 200
    assert res.headers["Content-Type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "Content-Disposition" in res.headers
    assert "BaoCaoCongNoQuaHan" in res.headers["Content-Disposition"]
    assert ".xlsx" in res.headers["Content-Disposition"]
    # Kiểm tra nội dung trả về là file nhị phân không rỗng
    assert len(res.content) > 1000


def test_api_export_excel_customer_forbidden(api_client, seed_test_data):
    """Kiểm tra Customer không thể xuất Excel -> HTTP 403 Forbidden."""
    token = seed_test_data["customer_user"]
    res = api_client.get(
        "/api/v1/debt-aging-reports/export",
        headers={"Authorization": token},
    )
    assert res.status_code == 403


def test_api_prefix_backward_compatibility(api_client, seed_test_data):
    """Kiểm tra API tự động nạp vào cả tiền tố /api/debt-aging-reports."""
    token = seed_test_data["admin"]
    res = api_client.get(
        "/api/debt-aging-reports",
        headers={"Authorization": token},
    )
    assert res.status_code == 200
    data = res.json()
    assert "report_date" in data
