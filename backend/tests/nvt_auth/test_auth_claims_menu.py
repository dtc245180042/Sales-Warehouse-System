import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.services.seed_service import seed_all
from main import app

# Sử dụng in-memory SQLite database riêng biệt cho test
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    seed_all(db)
    db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_login_admin_claims_and_menus(client):
    """Kiểm tra đăng nhập Admin: Trả về Token, thông tin Kho/Địa bàn Toàn quốc và đầy đủ 8 nhóm menu."""
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Admin@123456"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    user = data["user"]
    assert user["username"] == "admin"
    assert "ADMIN" in user["roles"]
    assert user["region"] == "Toàn quốc"
    assert user["warehouse_name"] == "Kho Tổng"
    assert len(user["permissions"]) == 30

    # Admin thấy toàn bộ 8 nhóm menu
    menu_codes = [m["code"] for m in user["navigation_menus"]]
    assert len(menu_codes) == 8
    assert "system" in menu_codes
    assert "inventory" in menu_codes
    assert "orders" in menu_codes


def test_login_sales_user_claims_and_menus(client):
    """Kiểm tra đăng nhập Nhân viên bán hàng: Trả về địa bàn Hà Nội, kho Chi nhánh Hà Nội và menu bán hàng."""
    response = client.post(
        "/api/auth/login",
        json={"username": "sales_hn", "password": "Sales@123456"}
    )
    assert response.status_code == 200
    data = response.json()
    user = data["user"]

    assert user["username"] == "sales_hn"
    assert "SALES" in user["roles"]
    assert user["warehouse_id"] == 1
    assert user["warehouse_name"] == "Chi nhánh Hà Nội"
    assert user["region"] == "Hà Nội"

    # Menu được lọc: Thấy orders, customers, products; KHÔNG thấy system
    menu_codes = [m["code"] for m in user["navigation_menus"]]
    assert "dashboard" in menu_codes
    assert "orders" in menu_codes
    assert "customers" in menu_codes
    assert "system" not in menu_codes


def test_login_warehouse_user_claims_and_menus(client):
    """Kiểm tra đăng nhập Thủ kho: Trả về địa bàn Đà Nẵng, kho Miền Trung và menu kho (nhập, xuất, kiểm kê)."""
    response = client.post(
        "/api/auth/login",
        json={"username": "warehouse_dn", "password": "Warehouse@123456"}
    )
    assert response.status_code == 200
    data = response.json()
    user = data["user"]

    assert user["username"] == "warehouse_dn"
    assert "WAREHOUSE" in user["roles"]
    assert user["warehouse_id"] == 2
    assert user["warehouse_name"] == "Kho Miền Trung"
    assert user["region"] == "Đà Nẵng"

    # Menu được lọc: Thấy inventory, products, suppliers; KHÔNG thấy orders, system
    menu_codes = [m["code"] for m in user["navigation_menus"]]
    assert "dashboard" in menu_codes
    assert "inventory" in menu_codes
    assert "products" in menu_codes
    assert "orders" not in menu_codes
    assert "system" not in menu_codes


def test_login_invalid_credentials(client):
    """Kiểm tra đăng nhập thất bại khi sai mật khẩu hoặc tài khoản không tồn tại."""
    # Sai mật khẩu
    res1 = client.post("/api/auth/login", json={"username": "admin", "password": "WrongPassword"})
    assert res1.status_code == 401
    assert "không chính xác" in res1.json()["detail"]

    # Tài khoản không tồn tại
    res2 = client.post("/api/auth/login", json={"username": "not_found_user", "password": "AnyPassword"})
    assert res2.status_code == 401


def test_get_current_user_profile_me(client):
    """Kiểm tra API GET /api/auth/me với Bearer Token: Trả về đúng thông tin claims và menu người dùng."""
    # 1. Đăng nhập lấy token của sales_hn
    login_res = client.post(
        "/api/auth/login",
        json={"username": "sales_hn", "password": "Sales@123456"}
    )
    token = login_res.json()["access_token"]

    # 2. Gọi GET /api/auth/me
    headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    profile = me_res.json()

    assert profile["username"] == "sales_hn"
    assert profile["region"] == "Hà Nội"
    assert profile["warehouse_name"] == "Chi nhánh Hà Nội"
    assert "SALES" in profile["roles"]
    assert len(profile["navigation_menus"]) > 0


def test_get_current_user_unauthorized(client):
    """Kiểm tra API GET /api/auth/me bị từ chối nếu không truyền hoặc truyền sai Bearer Token."""
    # Không có header
    res1 = client.get("/api/auth/me")
    assert res1.status_code == 401

    # Token sai định dạng
    res2 = client.get("/api/auth/me", headers={"Authorization": "Bearer fake_token_abc"})
    assert res2.status_code == 401
