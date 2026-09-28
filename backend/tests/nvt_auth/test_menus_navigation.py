import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.models.navigation import MenuItem
from app.services.seed_service import seed_all
from app.services.menu_service import get_user_navigation_menu
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


def test_seed_menus_count_and_structure(db_session):
    """Kiểm tra cây menu mặc định được seed đủ 8 nhóm menu gốc và các mục con."""
    root_menus = db_session.query(MenuItem).filter(MenuItem.parent_id == None).all()
    assert len(root_menus) == 8

    root_codes = {m.code for m in root_menus}
    expected_roots = {"dashboard", "orders", "customers", "inventory", "products", "suppliers", "reports", "system"}
    assert expected_roots.issubset(root_codes)

    # Kiểm tra menu con của orders
    orders_root = db_session.query(MenuItem).filter(MenuItem.code == "orders").first()
    assert orders_root is not None
    assert len(orders_root.children) == 2
    child_codes = {c.code for c in orders_root.children}
    assert "orders_list" in child_codes
    assert "orders_create" in child_codes


def test_admin_role_sees_all_menus(db_session):
    """Kiểm tra role ADMIN nhìn thấy toàn bộ các menu."""
    admin_menus = get_user_navigation_menu(db=db_session, role_name="ADMIN")
    assert len(admin_menus) == 8
    menu_codes = {m.code for m in admin_menus}
    assert "system" in menu_codes
    assert "inventory" in menu_codes
    assert "orders" in menu_codes


def test_sales_role_sees_only_sales_menus(db_session):
    """Kiểm tra vai trò SALES: chỉ thấy menu bán hàng, khách hàng, sản phẩm, doanh thu; không thấy cấu hình hệ thống."""
    sales_menus = get_user_navigation_menu(db=db_session, role_name="SALES")
    menu_codes = {m.code for m in sales_menus}

    # Được phép thấy
    assert "dashboard" in menu_codes
    assert "orders" in menu_codes
    assert "customers" in menu_codes
    assert "products" in menu_codes
    assert "reports" in menu_codes

    # Không được phép thấy
    assert "system" not in menu_codes

    # Trong nhóm reports, SALES chỉ thấy reports_revenue, không thấy reports_inventory
    reports_menu = next(m for m in sales_menus if m.code == "reports")
    report_children = {c.code for c in reports_menu.children}
    assert "reports_revenue" in report_children
    assert "reports_inventory" not in report_children


def test_warehouse_role_sees_only_warehouse_menus(db_session):
    """Kiểm tra vai trò WAREHOUSE: chỉ thấy kho, sản phẩm, nhà cung cấp, báo cáo kho; không thấy quản lý đơn hàng."""
    wh_menus = get_user_navigation_menu(db=db_session, role_name="WAREHOUSE")
    menu_codes = {m.code for m in wh_menus}

    # Được phép thấy
    assert "dashboard" in menu_codes
    assert "inventory" in menu_codes
    assert "products" in menu_codes
    assert "suppliers" in menu_codes
    assert "reports" in menu_codes

    # Không được phép thấy
    assert "system" not in menu_codes
    assert "orders" not in menu_codes  # Thủ kho không có quyền xem đơn hàng bán


def test_api_get_all_menus(client):
    """Kiểm tra API GET /api/menus trả về danh sách tất cả các menu."""
    response = client.get("/api/menus")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 8
    codes = [m["code"] for m in data]
    assert "dashboard" in codes
    assert "orders" in codes


def test_api_get_user_menus_by_role(client):
    """Kiểm tra API GET /api/menus/user?role=SALES."""
    response = client.get("/api/menus/user?role=SALES")
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "SALES"
    menu_codes = [m["code"] for m in data["menus"]]
    assert "dashboard" in menu_codes
    assert "orders" in menu_codes
    assert "system" not in menu_codes


def test_api_crud_menu_item(client, db_session):
    """Kiểm tra API thêm, cập nhật và xóa mục menu điều hướng."""
    # 1. Thêm mới menu
    create_payload = {
        "code": "promotions",
        "title": "Chương trình Khuyến mãi",
        "path": "/promotions",
        "icon": "Gift",
        "order": 99,
        "is_active": True,
        "required_permission_code": "order:create"
    }
    create_res = client.post("/api/menus", json=create_payload)
    assert create_res.status_code == 201
    created_menu = create_res.json()
    menu_id = created_menu["id"]
    assert created_menu["code"] == "promotions"

    # 2. Cập nhật menu
    update_payload = {"title": "Khuyến mãi & Giảm giá"}
    update_res = client.put(f"/api/menus/{menu_id}", json=update_payload)
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Khuyến mãi & Giảm giá"

    # 3. Xóa menu
    delete_res = client.delete(f"/api/menus/{menu_id}")
    assert delete_res.status_code == 204

    # Kiểm tra menu đã bị xóa
    deleted_item = db_session.query(MenuItem).filter(MenuItem.id == menu_id).first()
    assert deleted_item is None
