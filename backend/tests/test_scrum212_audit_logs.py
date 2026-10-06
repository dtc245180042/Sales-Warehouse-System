import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.customer import Customer
from app.models.order import Order
from app.models.audit_log import AuditLog
from app.models.customer_debt_profile import CustomerDebtProfile
from app.models.product_stock_profile import ProductStockProfile
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test nhật ký kiểm toán
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
def setup_audit_test_database():
    """Tạo schema và dữ liệu mẫu kiểm thử trước mỗi test case."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()

    # 1. Admin (Quản trị hệ thống)
    admin_user = User(
        username="admin_audit",
        email="admin_audit@warehouse.local",
        full_name="Quản Trị Viên Hệ Thống",
        role=UserRole.ADMIN.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    # 2. Thủ kho (Warehouse)
    wh_user = User(
        username="warehouse_user",
        email="wh@warehouse.local",
        full_name="Nguyễn Văn Thủ Kho",
        role=UserRole.WAREHOUSE.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    # 3. Nhân viên bán hàng (Sales Rep)
    sales_user = User(
        username="sales_user",
        email="sales@warehouse.local",
        full_name="Trần Thị Bán Hàng",
        role=UserRole.SALES_REP.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )

    # 4. Sản phẩm mẫu để kiểm kê lệch kho
    prod = Product(
        sku="SKU-BIA-HN",
        name="Bia Hà Nội Lon 330ml",
        category="Đồ uống",
        unit="lon",
        packaging_spec="24 lon/thùng",
        cost_price=10000.0,
        price=12000.0,
        status="ACTIVE",
    )
    db.add(prod)
    db.flush()

    # Tạo tồn kho ban đầu = 100 lon
    stock_prof = ProductStockProfile(
        product_id=prod.id,
        sku=prod.sku,
        stock=100,
        min_stock=10,
        warehouse="Kho Tổng Hà Nội",
    )
    db.add(stock_prof)

    # 5. Khách hàng mẫu để điều chỉnh hạn mức nợ
    cust = Customer(
        id="CUST-TEST-001",
        code="KH-DAI-LY-01",
        name="Đại lý Bia Toàn Thắng",
        phone="0912345678",
        customer_group="WHOLESALE",
        status="active",
    )

    # 6. Đơn hàng mẫu
    ord1 = Order(
        id="ORD-TEST-001",
        code="DH-2026-001",
        customer_id="CUST-TEST-001",
        customer_name="Đại lý Bia Toàn Thắng",
        subtotal=1200000.0,
        total=1200000.0,
        status="completed",
    )

    db.add_all([admin_user, wh_user, sales_user, cust, ord1])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


client = TestClient(app)


def lay_token(username: str, role: str) -> str:
    db = TestingSessionLocal()
    u = db.query(User).filter(User.username == username).first()
    db.close()
    return tao_token_truy_cap(
        {
            "user_id": u.id,
            "sub": str(u.id),
            "token_version": u.token_version,
            "role": role,
        }
    )


def test_sc212_stock_adjustment_when_inventory_mismatch():
    """
    Kịch bản chính SC212:
    Quản trị viên hoặc Thủ kho điều chỉnh tồn kho khi cuối tháng kiểm kê phát hiện lệch (100 -> 88).
    Hệ thống phải:
    1. Cập nhật tồn kho sản phẩm về 88
    2. Tự động ghi nhận Audit Log có snapshot old_values và new_values
    3. Ghi lại người thực hiện và lý do lệch kiểm kê
    """
    token = lay_token("admin_audit", "Admin")
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "product_id": "SKU-BIA-HN",
        "actual_stock": 88,
        "reason": "Lệch 12 lon do vỡ hỏng trong kho đợt kiểm kê cuối tháng 9",
        "warehouse": "Kho Tổng Hà Nội",
    }

    res = client.post("/api/v1/audit-logs/stock-adjustment", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["entity_type"] == "INVENTORY"
    assert data["action"] == "ADJUST_STOCK"
    assert data["old_values"]["stock"] == 100
    assert data["new_values"]["stock"] == 88
    assert data["new_values"]["delta"] == -12
    assert "admin_audit" in data["username"]
    assert "vỡ hỏng trong kho" in data["reason"]

    # Kiểm tra tồn kho sản phẩm trong CSDL đã cập nhật
    db = TestingSessionLocal()
    stock_prof = db.query(ProductStockProfile).filter(ProductStockProfile.sku == "SKU-BIA-HN").first()
    assert stock_prof.stock == 88
    db.close()


def test_sc212_debt_limit_adjustment():
    """
    Kiểm tra điều chỉnh hạn mức công nợ khách hàng và tự động lưu vết Audit Log:
    - Giá trị trước: 0đ
    - Giá trị sau: 50.000.000đ
    """
    token = lay_token("admin_audit", "Admin")
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "customer_id": "CUST-TEST-001",
        "new_credit_limit": 50000000.0,
        "reason": "Nâng hạn mức tín dụng cho đại lý cấp 1 đạt doanh số quý 3",
    }

    res = client.post("/api/v1/audit-logs/debt-limit-adjustment", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["entity_type"] == "DEBT"
    assert data["entity_id"] == "CUST-TEST-001"
    assert data["action"] == "ADJUST_DEBT_LIMIT"
    assert data["old_values"]["credit_limit"] == 0.0
    assert data["new_values"]["credit_limit"] == 50000000.0
    assert "admin_audit" in data["username"]
    assert "Nâng hạn mức tín dụng" in data["reason"]

    # Kiểm tra bảng profile công nợ 1-1
    db = TestingSessionLocal()
    debt_profile = db.query(CustomerDebtProfile).filter(CustomerDebtProfile.customer_id == "CUST-TEST-001").first()
    assert debt_profile is not None
    assert debt_profile.credit_limit == 50000000.0
    db.close()


def test_sc212_price_and_invoice_adjustment():
    """Kiểm tra ghi vết điều chỉnh giá và trạng thái hoá đơn."""
    token = lay_token("admin_audit", "Admin")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Ghi vết thay đổi giá
    res_price = client.post(
        "/api/v1/audit-logs/price-adjustment",
        json={
            "entity_id": "SKU-BIA-HN",
            "entity_name": "Bia Hà Nội Lon 330ml",
            "old_price": 12000.0,
            "new_price": 13500.0,
            "reason": "Tăng giá bán lẻ theo thông báo từ nhà sản xuất",
        },
        headers=headers,
    )
    assert res_price.status_code == 201
    assert res_price.json()["entity_type"] == "PRICE"
    assert res_price.json()["old_values"]["price"] == 12000.0
    assert res_price.json()["new_values"]["price"] == 13500.0

    # 2. Ghi vết thay đổi hoá đơn
    res_inv = client.post(
        "/api/v1/audit-logs/invoice-adjustment",
        json={
            "order_id": "ORD-TEST-001",
            "old_status": "completed",
            "new_status": "cancelled",
            "reason": "Khách hàng hoàn đơn do giao nhầm quy cách",
        },
        headers=headers,
    )
    assert res_inv.status_code == 201
    assert res_inv.json()["entity_type"] == "INVOICE"
    assert res_inv.json()["old_values"]["status"] == "completed"
    assert res_inv.json()["new_values"]["status"] == "cancelled"


def test_sc212_get_audit_logs_pagination_and_filter():
    """
    Kiểm tra API tra cứu nhật ký thao tác:
    - Phân trang (page, page_size, total_pages)
    - Bộ lọc theo entity_type (INVENTORY, DEBT, PRICE, INVOICE)
    - Bộ lọc theo username
    - Tìm kiếm từ khóa tổng hợp (search)
    """
    token = lay_token("admin_audit", "Admin")
    headers = {"Authorization": f"Bearer {token}"}

    # Tạo 3 bản ghi
    client.post(
        "/api/v1/audit-logs/stock-adjustment",
        json={"product_id": "SKU-BIA-HN", "actual_stock": 95, "reason": "Kiểm kê đột xuất đợt 1"},
        headers=headers,
    )
    client.post(
        "/api/v1/audit-logs/debt-limit-adjustment",
        json={"customer_id": "CUST-TEST-001", "new_credit_limit": 20000000.0, "reason": "Cấp hạn mức khởi điểm"},
        headers=headers,
    )
    client.post(
        "/api/v1/audit-logs/price-adjustment",
        json={"entity_id": "SKU-BIA-HN", "old_price": 10000.0, "new_price": 11000.0, "reason": "Chỉnh giá đại lý"},
        headers=headers,
    )

    # 1. Test tra cứu tất cả với phân trang
    res_all = client.get("/api/v1/audit-logs?page=1&page_size=2", headers=headers)
    assert res_all.status_code == 200
    data_all = res_all.json()
    assert data_all["total"] == 3
    assert len(data_all["items"]) == 2
    assert data_all["total_pages"] == 2

    # 2. Test lọc theo entity_type = INVENTORY
    res_inv = client.get("/api/v1/audit-logs?entity_type=INVENTORY", headers=headers)
    assert res_inv.status_code == 200
    data_inv = res_inv.json()
    assert data_inv["total"] == 1
    assert data_inv["items"][0]["entity_type"] == "INVENTORY"

    # 3. Test lọc theo entity_type = DEBT
    res_debt = client.get("/api/v1/audit-logs?entity_type=DEBT", headers=headers)
    assert res_debt.status_code == 200
    assert res_debt.json()["total"] == 1
    assert res_debt.json()["items"][0]["entity_type"] == "DEBT"

    # 4. Test tìm kiếm từ khóa
    res_search = client.get("/api/v1/audit-logs?search=đột xuất", headers=headers)
    assert res_search.status_code == 200
    assert res_search.json()["total"] == 1
    assert "đột xuất" in res_search.json()["items"][0]["reason"]


def test_sc212_get_audit_log_detail():
    """Kiểm tra API xem chi tiết một bản ghi nhật ký theo ID."""
    token = lay_token("admin_audit", "Admin")
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post(
        "/api/v1/audit-logs/stock-adjustment",
        json={"product_id": "SKU-BIA-HN", "actual_stock": 70, "reason": "Kiểm kê định kỳ tháng 10"},
        headers=headers,
    )
    log_id = create_res.json()["id"]

    res = client.get(f"/api/v1/audit-logs/{log_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["id"] == log_id
    assert res.json()["entity_type"] == "INVENTORY"

    # Test không tìm thấy
    res_404 = client.get("/api/v1/audit-logs/99999", headers=headers)
    assert res_404.status_code == 404


def test_sc212_role_permissions():
    """Kiểm tra phân quyền: Nhân viên bán hàng không có quyền điều chỉnh tồn kho / hạn mức công nợ."""
    sales_token = lay_token("sales_user", "Sales Rep")
    sales_headers = {"Authorization": f"Bearer {sales_token}"}

    # Sales Rep không có quyền điều chỉnh tồn kho -> 403 Forbidden
    res_stock = client.post(
        "/api/v1/audit-logs/stock-adjustment",
        json={"product_id": "SKU-BIA-HN", "actual_stock": 50, "reason": "Tự ý chỉnh kho"},
        headers=sales_headers,
    )
    assert res_stock.status_code == 403

    # Sales Rep không có quyền điều chỉnh hạn mức nợ -> 403 Forbidden
    res_debt = client.post(
        "/api/v1/audit-logs/debt-limit-adjustment",
        json={"customer_id": "CUST-TEST-001", "new_credit_limit": 100000000.0, "reason": "Tự ý tăng hạn mức"},
        headers=sales_headers,
    )
    assert res_debt.status_code == 403
