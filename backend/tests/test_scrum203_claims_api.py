"""
Tests cho SCRUM-203: GET /api/auth/me/claims
Kiểm tra API cung cấp claims đầy đủ (roles, permissions, navigation_menus)
sau khi đăng nhập, phục vụ FE render Sidebar và guard route.

Tuân thủ quy chuẩn §7:
- AAA Pattern (Arrange / Act / Assert)
- Tên test: test_<method>_<scenario>_<expected>
- Coverage: happy path, edge cases, bảo mật
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_password_hash
from app.models.auth import User, Role, Permission, UserRole, user_roles, role_permissions
from app.services.menu_service import seed_menus
from main import app

# ---------------------------------------------------------------------------
# Hằng số test
# ---------------------------------------------------------------------------
MIN_ADMIN_PERMISSION_COUNT = 5
EXPECTED_ADMIN_MENU_GROUPS = {"dashboard", "orders", "inventory", "system"}

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Khởi tạo schema, seed menu và tạo user test."""
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    # Seed menu điều hướng
    seed_menus(db)

    # Tạo permission mẫu
    perm_codes = [
        ("order:view", "Xem đơn hàng", "orders"),
        ("order:create", "Tạo đơn hàng", "orders"),
        ("inventory:view", "Xem tồn kho", "inventory"),
        ("stock_in:create", "Tạo phiếu nhập", "inventory"),
        ("user:view", "Xem người dùng", "system"),
        ("role:view", "Xem vai trò", "system"),
        ("customer:view", "Xem khách hàng", "customers"),
    ]
    perms = {}
    for code, name, module in perm_codes:
        p = db.query(Permission).filter(Permission.code == code).first()
        if not p:
            p = Permission(code=code, name=name, module=module)
            db.add(p)
            db.flush()
        perms[code] = p

    # Tạo role ADMIN với toàn bộ permissions
    admin_role = db.query(Role).filter(Role.name == "ADMIN").first()
    if not admin_role:
        admin_role = Role(name="ADMIN", display_name="Quản trị viên")
        db.add(admin_role)
        db.flush()
        for p in perms.values():
            admin_role.permissions.append(p)

    # Tạo role SALES với permissions giới hạn
    sales_role = db.query(Role).filter(Role.name == "SALES").first()
    if not sales_role:
        sales_role = Role(name="SALES", display_name="Nhân viên bán hàng")
        db.add(sales_role)
        db.flush()
        for code in ("order:view", "order:create", "customer:view"):
            sales_role.permissions.append(perms[code])

    db.commit()

    # Tạo user admin test
    admin_user = db.query(User).filter(User.username == "test_admin").first()
    if not admin_user:
        admin_user = User(
            username="test_admin",
            email="test_admin@warehouse.local",
            hashed_password=get_password_hash("Admin@Test123"),
            role=UserRole.ADMIN.value,
            is_active=True,
            token_version=1,
            warehouse_name="Kho Tổng",
            warehouse_id=None,
            region="Toàn quốc",
        )
        db.add(admin_user)
        db.flush()
        admin_user.roles.append(admin_role)

    # Tạo user sales test
    sales_user = db.query(User).filter(User.username == "test_sales").first()
    if not sales_user:
        sales_user = User(
            username="test_sales",
            email="test_sales@warehouse.local",
            hashed_password=get_password_hash("Sales@Test123"),
            role=UserRole.SALES_REP.value,
            is_active=True,
            token_version=1,
            warehouse_name="Chi nhánh Hà Nội",
            warehouse_id=1,
            region="Hà Nội",
        )
        db.add(sales_user)
        db.flush()
        sales_user.roles.append(sales_role)

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


@pytest.fixture()
def admin_token(client) -> str:
    """Lấy access token của admin test."""
    resp = client.post(
        "/api/auth/login",
        json={"username": "test_admin", "password": "Admin@Test123"},
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.json()}"
    return resp.json()["access_token"]


@pytest.fixture()
def sales_token(client) -> str:
    """Lấy access token của sales test."""
    resp = client.post(
        "/api/auth/login",
        json={"username": "test_sales", "password": "Sales@Test123"},
    )
    assert resp.status_code == 200, f"Sales login failed: {resp.json()}"
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Test cases — GET /api/auth/me/claims (SCRUM-203)
# ---------------------------------------------------------------------------

def test_get_me_claims_when_admin_returns_full_permissions_and_menus(client, admin_token):
    """SCRUM-203: Admin nhận đầy đủ permissions và toàn bộ cây menu."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    response = client.get("/api/auth/me/claims", headers=headers)

    # Assert
    assert response.status_code == 200
    claims = response.json()
    assert claims["username"] == "test_admin"
    assert "ADMIN" in claims["roles"]
    assert len(claims["permissions"]) >= MIN_ADMIN_PERMISSION_COUNT

    menu_codes = {m["code"] for m in claims["navigation_menus"]}
    assert EXPECTED_ADMIN_MENU_GROUPS.issubset(menu_codes), (
        f"Admin phải thấy các menu: {EXPECTED_ADMIN_MENU_GROUPS}, thực tế: {menu_codes}"
    )


def test_get_me_claims_when_sales_returns_filtered_menus_without_system(client, sales_token):
    """SCRUM-203: Sales Rep nhận menu lọc theo quyền — không thấy 'system'."""
    # Arrange
    headers = {"Authorization": f"Bearer {sales_token}"}

    # Act
    response = client.get("/api/auth/me/claims", headers=headers)

    # Assert
    assert response.status_code == 200
    claims = response.json()
    assert claims["username"] == "test_sales"

    menu_codes = {m["code"] for m in claims["navigation_menus"]}
    assert "orders" in menu_codes, "Sales phải thấy menu orders"
    assert "system" not in menu_codes, "Sales KHÔNG được thấy menu system"


def test_get_me_claims_when_admin_returns_warehouse_context(client, admin_token):
    """SCRUM-203: Claims trả về đúng thông tin kho/địa bàn của user."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    response = client.get("/api/auth/me/claims", headers=headers)

    # Assert
    assert response.status_code == 200
    claims = response.json()
    assert claims["warehouse_name"] == "Kho Tổng"
    assert claims["region"] == "Toàn quốc"


def test_get_me_claims_when_sales_returns_warehouse_context(client, sales_token):
    """SCRUM-203: Sales Rep nhận đúng warehouse_id, warehouse_name, region."""
    # Arrange
    headers = {"Authorization": f"Bearer {sales_token}"}

    # Act
    response = client.get("/api/auth/me/claims", headers=headers)

    # Assert
    assert response.status_code == 200
    claims = response.json()
    assert claims["warehouse_id"] == 1
    assert claims["warehouse_name"] == "Chi nhánh Hà Nội"
    assert claims["region"] == "Hà Nội"


def test_get_me_claims_when_no_token_returns_401(client):
    """BẢO MẬT: Endpoint /me/claims từ chối khi không có Bearer token."""
    # Act
    response = client.get("/api/auth/me/claims")

    # Assert
    assert response.status_code == 401


def test_get_me_claims_when_invalid_token_returns_401(client):
    """BẢO MẬT: Endpoint /me/claims từ chối khi token giả mạo."""
    # Arrange
    headers = {"Authorization": "Bearer this_is_a_fake_token_xyz"}

    # Act
    response = client.get("/api/auth/me/claims", headers=headers)

    # Assert
    assert response.status_code == 401


def test_get_me_claims_response_schema_has_required_fields(client, admin_token):
    """SCRUM-203: Response có đủ các field bắt buộc mà FE cần để render Sidebar và guard route."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}
    required_fields = {
        "id", "username", "email", "role",
        "roles", "permissions", "navigation_menus",
        "warehouse_id", "warehouse_name", "region",
    }

    # Act
    response = client.get("/api/auth/me/claims", headers=headers)

    # Assert
    assert response.status_code == 200
    claims = response.json()
    missing = required_fields - set(claims.keys())
    assert not missing, f"Response thiếu các field bắt buộc: {missing}"


def test_get_me_claims_menus_have_correct_structure(client, admin_token):
    """SCRUM-203: Mỗi node menu trong navigation_menus có đủ các field cần thiết cho FE."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}
    required_menu_fields = {"id", "code", "title", "path", "icon", "order", "children"}

    # Act
    response = client.get("/api/auth/me/claims", headers=headers)

    # Assert
    assert response.status_code == 200
    menus = response.json()["navigation_menus"]
    assert len(menus) > 0, "Admin phải có ít nhất 1 menu"

    for menu in menus:
        missing = required_menu_fields - set(menu.keys())
        assert not missing, f"Menu '{menu.get('code')}' thiếu fields: {missing}"


def test_get_me_matches_get_me_claims_response(client, admin_token):
    """SCRUM-301 vs SCRUM-203: /me và /me/claims phải trả về dữ liệu nhất quán."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    me_resp = client.get("/api/auth/me", headers=headers)
    claims_resp = client.get("/api/auth/me/claims", headers=headers)

    # Assert
    assert me_resp.status_code == 200
    assert claims_resp.status_code == 200

    me_data = me_resp.json()
    claims_data = claims_resp.json()

    assert me_data["username"] == claims_data["username"]
    assert me_data["roles"] == claims_data["roles"]
    assert me_data["permissions"] == claims_data["permissions"]
