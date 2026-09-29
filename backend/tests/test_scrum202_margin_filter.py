"""
Tests cho SCRUM-202 / SCRUM-313:
(Backend) Ẩn giá vốn và biên lợi nhuận theo vai trò Quản lý kinh doanh.

Yêu cầu nghiệp vụ:
- Thiết kế cơ chế kiểm tra vai trò và lọc dữ liệu để chỉ vai trò Quản lý kinh doanh (Sales Manager)
  và Admin được xem giá vốn (cost_price) và biên lợi nhuận (profit_margin).
- Các vai trò khác (Sales Rep, Warehouse, WH Manager, Accountant, Customer)
  hoàn toàn không nhận các trường dữ liệu này trong response.

Tuân thủ quy chuẩn §7 CODE_CONVENTION:
- Mẫu AAA (Arrange - Act - Assert)
- Quy ước đặt tên: test_<method>_<scenario>_<expected>
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_password_hash
from app.models.auth import User, UserRole
from app.services.product_service import (
    can_view_cost_and_margin,
    filter_product_margins,
    PRODUCT_CATALOG,
)
from main import app

# ---------------------------------------------------------------------------
# Setup Database & Test Client
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

TEST_PASSWORD = "Secret@1234"


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Khởi tạo database in-memory và tạo các tài khoản đại diện cho các vai trò."""
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    accounts = [
        ("test_sales_mgr_202", "mgr202@test.local", UserRole.SALES_MANAGER.value),
        ("test_admin_202", "admin202@test.local", UserRole.ADMIN.value),
        ("test_sales_rep_202", "rep202@test.local", UserRole.SALES_REP.value),
        ("test_warehouse_202", "wh202@test.local", UserRole.WAREHOUSE.value),
        ("test_customer_202", "cust202@test.local", UserRole.CUSTOMER.value),
        ("test_accountant_202", "acc202@test.local", UserRole.ACCOUNTANT.value),
    ]

    for username, email, role in accounts:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            user = User(
                username=username,
                email=email,
                hashed_password=get_password_hash(TEST_PASSWORD),
                role=role,
                is_active=True,
                token_version=1,
            )
            db.add(user)

    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture()
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def get_token_for(client: TestClient, username: str) -> str:
    """Đăng nhập để nhận token JWT hợp lệ từ endpoint chuẩn."""
    resp = client.post(
        "/api/auth/login",
        json={"username": username, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 200, f"Login failed for {username}: {resp.json()}"
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Test Cases theo chuẩn AAA
# ---------------------------------------------------------------------------

def test_get_products_when_sales_manager_returns_cost_and_margin(client):
    """Sales Manager gọi API danh sách sản phẩm -> Nhận đầy đủ cost_price và profit_margin."""
    # Arrange
    token = get_token_for(client, "test_sales_mgr_202")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/v1/products", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["can_view_margins"] is True
    assert body["total"] > 0
    for item in body["items"]:
        assert "cost_price" in item, f"Thiếu cost_price cho Sales Manager: {item['sku']}"
        assert "profit_margin" in item, f"Thiếu profit_margin cho Sales Manager: {item['sku']}"
        assert isinstance(item["cost_price"], (int, float))
        assert isinstance(item["profit_margin"], str)


def test_get_products_when_admin_returns_cost_and_margin(client):
    """Admin gọi API danh sách sản phẩm -> Nhận đầy đủ cost_price và profit_margin."""
    # Arrange
    token = get_token_for(client, "test_admin_202")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/v1/products", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["can_view_margins"] is True
    assert len(body["items"]) > 0
    for item in body["items"]:
        assert "cost_price" in item
        assert "profit_margin" in item


def test_get_products_when_sales_rep_omits_cost_and_margin(client):
    """Nhân viên bán hàng (Sales Rep) -> Hoàn toàn KHÔNG nhận cost_price và profit_margin."""
    # Arrange
    token = get_token_for(client, "test_sales_rep_202")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/v1/products", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["can_view_margins"] is False
    assert len(body["items"]) > 0
    for item in body["items"]:
        # Kiểm tra tính nhạy cảm: Tuyệt đối không được rò rỉ giá vốn & biên lợi nhuận
        assert "cost_price" not in item, f"Lỗi rò rỉ cost_price cho Sales Rep: {item}"
        assert "profit_margin" not in item, f"Lỗi rò rỉ profit_margin cho Sales Rep: {item}"
        # Các thông tin bán hàng công khai vẫn phải hiển thị
        assert "sku" in item
        assert "name" in item
        assert "selling_price" in item


def test_get_products_when_warehouse_omits_cost_and_margin(client):
    """Thủ kho (Warehouse) -> Hoàn toàn KHÔNG nhận cost_price và profit_margin."""
    # Arrange
    token = get_token_for(client, "test_warehouse_202")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/v1/products", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["can_view_margins"] is False
    for item in body["items"]:
        assert "cost_price" not in item
        assert "profit_margin" not in item


def test_get_products_when_customer_omits_cost_and_margin(client):
    """Khách hàng / Đại lý (Customer) -> Hoàn toàn KHÔNG nhận cost_price và profit_margin."""
    # Arrange
    token = get_token_for(client, "test_customer_202")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/v1/products", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["can_view_margins"] is False
    for item in body["items"]:
        assert "cost_price" not in item
        assert "profit_margin" not in item


def test_get_products_when_accountant_omits_cost_and_margin(client):
    """Kế toán (Accountant) -> Hoàn toàn KHÔNG nhận cost_price và profit_margin từ API sản phẩm."""
    # Arrange
    token = get_token_for(client, "test_accountant_202")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/v1/products", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["can_view_margins"] is False
    for item in body["items"]:
        assert "cost_price" not in item
        assert "profit_margin" not in item


def test_get_product_detail_when_sales_manager_returns_margin(client):
    """Xem chi tiết 1 sản phẩm với vai trò Sales Manager -> Thấy đầy đủ giá vốn và biên lợi nhuận."""
    # Arrange
    token = get_token_for(client, "test_sales_mgr_202")
    headers = {"Authorization": f"Bearer {token}"}
    sku = "SKU-BIA-SG-SPEC"

    # Act
    response = client.get(f"/api/v1/products/{sku}", headers=headers)

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["sku"] == sku
    assert data["cost_price"] == 10500.0
    assert data["profit_margin"] == "30.0%"
    assert data["selling_price"] == 15000.0


def test_get_product_detail_when_sales_rep_omits_margin(client):
    """Xem chi tiết 1 sản phẩm với vai trò Sales Rep -> Giá vốn và biên lợi nhuận bị ẩn hoàn toàn."""
    # Arrange
    token = get_token_for(client, "test_sales_rep_202")
    headers = {"Authorization": f"Bearer {token}"}
    sku = "SKU-BIA-SG-SPEC"

    # Act
    response = client.get(f"/api/v1/products/{sku}", headers=headers)

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["sku"] == sku
    assert data["selling_price"] == 15000.0
    assert "cost_price" not in data
    assert "profit_margin" not in data


def test_get_product_detail_when_sku_not_found_returns_404(client):
    """Tìm mã sản phẩm không tồn tại -> Trả về lỗi 404 Not Found."""
    # Arrange
    token = get_token_for(client, "test_sales_mgr_202")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/v1/products/SKU-KHONG-TON-TAI", headers=headers)

    # Assert
    assert response.status_code == 404
    assert "Không tìm thấy" in response.json()["detail"]


def test_get_products_when_unauthorized_returns_401(client):
    """Truy cập danh sách sản phẩm khi chưa đăng nhập -> Trả về lỗi 401 Unauthorized."""
    # Act
    response = client.get("/api/v1/products")

    # Assert
    assert response.status_code == 401


def test_search_products_filter_by_keyword(client):
    """Tìm kiếm sản phẩm theo từ khóa 'bia' -> Chỉ trả về các sản phẩm bia."""
    # Arrange
    token = get_token_for(client, "test_sales_mgr_202")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.get("/api/v1/products?search=bia", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert "Bia" in body["items"][0]["name"]


def test_filter_product_margins_helper_directly():
    """Unit test trực tiếp hàm logic lọc trường filter_product_margins."""
    # Arrange
    sample = {
        "sku": "SKU-TEST",
        "selling_price": 10000,
        "cost_price": 7000,
        "profit_margin": "30%",
    }

    # Act & Assert cho quyền xem (True)
    allowed = filter_product_margins(sample, can_view=True)
    assert "cost_price" in allowed
    assert "profit_margin" in allowed

    # Act & Assert cho không có quyền xem (False)
    forbidden = filter_product_margins(sample, can_view=False)
    assert "cost_price" not in forbidden
    assert "profit_margin" not in forbidden
    assert forbidden["sku"] == "SKU-TEST"
    assert forbidden["selling_price"] == 10000
