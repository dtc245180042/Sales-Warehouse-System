"""
Tests cho SCRUM-205:
(Backend) Tạo API quản trị tài khoản: tạo mới, cập nhật và lấy danh sách có phân trang.

Yêu cầu nghiệp vụ:
- Xây dựng các endpoint cho quản trị viên để tạo tài khoản, chỉnh sửa thông tin tài khoản
  và truy vấn danh sách người dùng.
- Hỗ trợ phân trang mặc định 20 dòng và trả về dữ liệu phục vụ màn hình quản trị.
- Bắt lỗi trùng username, email kèm thông báo cụ thể.
- Ràng buộc vai trò kho và ngăn Admin tự thu hồi quyền quản trị của chính mình.

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
from app.models.auth import User, Role, UserRole
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

TEST_PASSWORD = "Admin@Test1234"


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Khởi tạo database in-memory và seed dữ liệu ban đầu."""
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    # 1. Tạo tài khoản Admin
    admin = User(
        username="scrum205_admin",
        email="admin205@test.local",
        full_name="Quản Trị Viên 205",
        phone_number="0901234567",
        hashed_password=get_password_hash(TEST_PASSWORD),
        role=UserRole.ADMIN.value,
        is_active=True,
        token_version=1,
    )
    db.add(admin)

    # 2. Tạo tài khoản Sales Rep
    sales = User(
        username="scrum205_sales",
        email="sales205@test.local",
        full_name="Nhân Viên Kinh Doanh 205",
        phone_number="0988776655",
        hashed_password=get_password_hash(TEST_PASSWORD),
        role=UserRole.SALES_REP.value,
        is_active=True,
        token_version=1,
    )
    db.add(sales)

    # 3. Tạo sẵn 25 tài khoản mẫu để kiểm tra phân trang 20 dòng
    for i in range(1, 26):
        sample_user = User(
            username=f"page_user_{i:02d}",
            email=f"page_user_{i:02d}@test.local",
            full_name=f"Người Dùng Phân Trang {i}",
            phone_number=f"09110000{i:02d}",
            hashed_password=get_password_hash(TEST_PASSWORD),
            role=UserRole.CUSTOMER.value,
            is_active=True,
            token_version=1,
        )
        db.add(sample_user)

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
    """Đăng nhập để nhận token cho tài khoản Admin."""
    resp = client.post(
        "/api/auth/login",
        json={"username": "scrum205_admin", "password": TEST_PASSWORD},
    )
    assert resp.status_code == 200, f"Login failed: {resp.json()}"
    return resp.json()["access_token"]


@pytest.fixture()
def sales_token(client) -> str:
    """Đăng nhập để nhận token cho tài khoản Sales Rep."""
    resp = client.post(
        "/api/auth/login",
        json={"username": "scrum205_sales", "password": TEST_PASSWORD},
    )
    assert resp.status_code == 200, f"Login failed: {resp.json()}"
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Test Cases theo chuẩn AAA (§7)
# ---------------------------------------------------------------------------

def test_create_user_when_valid_data_returns_201_created(client, admin_token):
    """Admin tạo tài khoản mới hợp lệ -> Thành công với HTTP 201 Created."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "username": "new_customer_205",
        "email": "new_customer_205@test.local",
        "full_name": "Khách Hàng Mới 205",
        "phone_number": "0933112233",
        "role": UserRole.CUSTOMER.value,
        "password": "Password@123",
    }

    # Act
    response = client.post("/api/v1/users", headers=headers, json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "new_customer_205"
    assert data["email"] == "new_customer_205@test.local"
    assert data["full_name"] == "Khách Hàng Mới 205"
    assert data["role"] == UserRole.CUSTOMER.value
    assert data["id"] is not None


def test_create_user_when_duplicate_username_returns_400_with_message(client, admin_token):
    """Tạo tài khoản với username đã tồn tại -> Bị từ chối 400 kèm thông báo rõ ràng."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "username": "scrum205_admin",
        "email": "unique_email_123@test.local",
        "role": UserRole.CUSTOMER.value,
    }

    # Act
    response = client.post("/api/v1/users", headers=headers, json=payload)

    # Assert
    assert response.status_code == 400
    assert "Tên đăng nhập 'scrum205_admin' đã tồn tại" in response.json()["detail"]


def test_create_user_when_duplicate_email_returns_400_with_message(client, admin_token):
    """Tạo tài khoản với email đã đăng ký -> Bị từ chối 400 kèm thông báo rõ ràng."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "username": "brand_new_username",
        "email": "admin205@test.local",
        "role": UserRole.CUSTOMER.value,
    }

    # Act
    response = client.post("/api/v1/users", headers=headers, json=payload)

    # Assert
    assert response.status_code == 400
    assert "Địa chỉ email 'admin205@test.local' đã được đăng ký" in response.json()["detail"]


def test_create_user_when_no_password_generates_temp_password(client, admin_token):
    """Không truyền mật khẩu -> Hệ thống tự cấp mật khẩu tạm và yêu cầu đổi mật khẩu."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "username": "temp_pass_user",
        "email": "temp_pass@test.local",
        "role": UserRole.CUSTOMER.value,
    }

    # Act
    response = client.post("/api/v1/users", headers=headers, json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["must_change_password"] is True


def test_create_user_when_warehouse_role_without_assigned_warehouse_returns_400(client, admin_token):
    """Tạo người dùng vai trò kho nhưng không gắn kho -> Bị từ chối 400 (SCRUM-206)."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "username": "wh_no_location",
        "email": "wh_no_loc@test.local",
        "role": UserRole.WAREHOUSE.value,
        "assigned_warehouse": None,
    }

    # Act
    response = client.post("/api/v1/users", headers=headers, json=payload)

    # Assert
    assert response.status_code == 400
    assert "phải được gắn với ít nhất một kho" in response.json()["detail"]


def test_list_users_when_default_pagination_returns_20_per_page(client, admin_token):
    """Danh sách người dùng mặc định phân trang 20 dòng trên 1 trang (SCRUM-205)."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    response = client.get("/api/v1/users", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["page_size"] == 20
    assert len(body["items"]) == 20
    assert body["total"] >= 25
    assert body["total_pages"] >= 2


def test_list_users_when_page_2_returns_remaining_records(client, admin_token):
    """Truy vấn trang 2 -> Nhận các bản ghi tiếp theo."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    response = client.get("/api/v1/users?page=2&page_size=20", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 2
    assert len(body["items"]) > 0


def test_list_users_when_search_by_query_filters_matching_users(client, admin_token):
    """Tìm kiếm theo số điện thoại '0988776655' -> Trả về chính xác nhân viên sales."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    response = client.get("/api/v1/users?q=0988776655", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["username"] == "scrum205_sales"


def test_list_users_when_filter_by_role_returns_only_matching_role(client, admin_token):
    """Lọc theo vai trò 'Admin' -> Chỉ trả về các tài khoản có vai trò Admin."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    response = client.get(f"/api/v1/users?role={UserRole.ADMIN.value}", headers=headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    for item in body["items"]:
        assert item["role"] == UserRole.ADMIN.value


def test_get_user_by_id_when_exists_returns_user(client, admin_token, db_session):
    """Lấy chi tiết tài khoản theo ID -> Trả về 200 OK với thông tin người dùng."""
    # Arrange
    admin_user = db_session.query(User).filter(User.username == "scrum205_admin").first()
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    response = client.get(f"/api/v1/users/{admin_user.id}", headers=headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["username"] == "scrum205_admin"


def test_get_user_by_id_when_not_found_returns_404(client, admin_token):
    """Lấy ID không tồn tại -> Báo lỗi 404 Not Found."""
    # Arrange
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Act
    response = client.get("/api/v1/users/999999", headers=headers)

    # Assert
    assert response.status_code == 404
    assert "Không tìm thấy người dùng" in response.json()["detail"]


def test_update_user_when_valid_data_updates_successfully(client, admin_token, db_session):
    """Cập nhật thông tin họ tên và số điện thoại người dùng -> Thành công 200 OK."""
    # Arrange
    sales_user = db_session.query(User).filter(User.username == "scrum205_sales").first()
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "full_name": "Lê Văn Kinh Doanh Đã Đổi Tên",
        "phone_number": "0999888777",
    }

    # Act
    response = client.put(f"/api/v1/users/{sales_user.id}", headers=headers, json=payload)

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == "Lê Văn Kinh Doanh Đã Đổi Tên"
    assert data["phone_number"] == "0999888777"


def test_update_user_when_admin_revokes_own_admin_role_returns_400(client, admin_token, db_session):
    """Quản trị viên tự thu hồi quyền Admin của chính mình -> Bị từ chối 400 (SCRUM-206)."""
    # Arrange
    admin_user = db_session.query(User).filter(User.username == "scrum205_admin").first()
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {"role": UserRole.CUSTOMER.value}

    # Act
    response = client.put(f"/api/v1/users/{admin_user.id}", headers=headers, json=payload)

    # Assert
    assert response.status_code == 400
    assert "Không thể tự thu hồi vai trò quản trị viên" in response.json()["detail"]


def test_user_management_when_non_admin_returns_403(client, sales_token):
    """Tài khoản không phải Admin (Sales Rep) gọi API quản trị -> Bị từ chối 403 Forbidden."""
    # Arrange
    headers = {"Authorization": f"Bearer {sales_token}"}

    # Act
    response = client.get("/api/v1/users", headers=headers)

    # Assert
    assert response.status_code == 403
    assert "Bạn không có quyền" in response.json()["detail"]


def test_user_management_when_unauthenticated_returns_401(client):
    """Chưa đăng nhập mà gọi API quản trị -> Bị từ chối 401 Unauthorized."""
    # Act
    response = client.get("/api/v1/users")

    # Assert
    assert response.status_code == 401
