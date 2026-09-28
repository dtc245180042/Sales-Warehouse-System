import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.models.auth import Role, Permission, User
from app.services.seed_service import seed_all
from main import app

# Sử dụng in-memory SQLite database riêng biệt cho testing
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


def test_seed_permissions_count(db_session):
    """Kiểm tra số lượng quyền được tạo đúng theo thiết kế (30 quyền)."""
    permissions = db_session.query(Permission).all()
    assert len(permissions) == 30
    modules = {p.module for p in permissions}
    assert "users" in modules
    assert "roles" in modules
    assert "products" in modules
    assert "categories" in modules
    assert "orders" in modules
    assert "inventory" in modules
    assert "warehouse" in modules
    assert "customers" in modules
    assert "suppliers" in modules
    assert "reports" in modules


def test_seed_roles_and_mappings(db_session):
    """Kiểm tra các vai trò và số lượng quyền được gán cho từng vai trò."""
    roles = {r.name: r for r in db_session.query(Role).all()}
    assert "ADMIN" in roles
    assert "MANAGER" in roles
    assert "SALES" in roles
    assert "WAREHOUSE" in roles
    assert "ACCOUNTANT" in roles

    # ADMIN: toàn quyền
    assert len(roles["ADMIN"].permissions) == 30
    # MANAGER: 24 quyền
    assert len(roles["MANAGER"].permissions) == 24
    # SALES: 10 quyền
    assert len(roles["SALES"].permissions) == 10
    # WAREHOUSE: 11 quyền
    assert len(roles["WAREHOUSE"].permissions) == 11
    # ACCOUNTANT: 6 quyền
    assert len(roles["ACCOUNTANT"].permissions) == 6


def test_user_permission_checking(db_session):
    """Kiểm tra các hàm kiểm tra quyền has_permission và has_role của User."""
    admin = db_session.query(User).filter(User.username == "admin").first()
    assert admin is not None
    assert admin.has_role("ADMIN")
    assert admin.has_permission("user:delete")
    assert admin.has_permission("order:create")

    # Tạo user nhân viên bán hàng thử nghiệm
    sales_role = db_session.query(Role).filter(Role.name == "SALES").first()
    sales_user = User(
        username="sales_demo",
        email="sales_demo@test.com",
        hashed_password="dummy_hash",
        is_active=True
    )
    sales_user.roles.append(sales_role)
    db_session.add(sales_user)
    db_session.commit()

    assert sales_user.has_role("SALES")
    assert sales_user.has_permission("order:create")
    assert not sales_user.has_permission("user:delete")  # SALES không có quyền xóa user


def test_api_get_permissions(client):
    """Kiểm tra API GET /api/permissions và lọc theo module."""
    response = client.get("/api/permissions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 30

    # Lọc module orders
    response_orders = client.get("/api/permissions?module=orders")
    assert response_orders.status_code == 200
    orders_data = response_orders.json()
    assert len(orders_data) == 4
    for item in orders_data:
        assert item["module"] == "orders"


def test_api_get_roles(client):
    """Kiểm tra API GET /api/roles."""
    response = client.get("/api/roles")
    assert response.status_code == 200
    roles = response.json()
    assert len(roles) >= 5
    role_names = [r["name"] for r in roles]
    assert "ADMIN" in role_names
    assert "SALES" in role_names


def test_api_assign_permissions_to_role(client, db_session):
    """Kiểm tra API cập nhật danh sách quyền cho vai trò."""
    # Tạo role tạm
    test_role = Role(name="TESTER", display_name="Kiểm thử viên")
    db_session.add(test_role)
    db_session.commit()
    db_session.refresh(test_role)

    # Gán 2 quyền
    payload = {"permission_codes": ["product:view", "inventory:view"]}
    res = client.post(f"/api/roles/{test_role.id}/permissions", json=payload)
    assert res.status_code == 200
    updated_role = res.json()
    assigned_codes = [p["code"] for p in updated_role["permissions"]]
    assert "product:view" in assigned_codes
    assert "inventory:view" in assigned_codes
    assert len(assigned_codes) == 2
