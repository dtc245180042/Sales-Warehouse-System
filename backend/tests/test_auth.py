import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau
from app.models.user import User, UserRole
from main import app

# Sử dụng database SQLite in-memory tách biệt để test
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SessionLocalKiemThu = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def ghi_de_lay_phien_db():
    phien_db = SessionLocalKiemThu()
    try:
        yield phien_db
    finally:
        phien_db.close()


app.dependency_overrides[lay_phien_db] = ghi_de_lay_phien_db


@pytest.fixture(autouse=True)
def thiet_lap_database():
    """Tạo lại schema DB sạch trước mỗi test case."""
    Base.metadata.create_all(bind=engine)
    phien_db = SessionLocalKiemThu()
    
    # Tạo user test
    nguoi_dung_test = User(
        username="testuser",
        email="testuser@warehouse.local",
        hashed_password=bam_mat_khau("ValidPass123"),
        role=UserRole.CUSTOMER.value,
        failed_login_attempts=0,
        locked_until=None,
        token_version=1,
        is_active=True
    )
    nguoi_dung_admin = User(
        username="adminuser",
        email="admin@warehouse.local",
        hashed_password=bam_mat_khau("AdminPass123"),
        role=UserRole.ADMIN.value,
        failed_login_attempts=0,
        locked_until=None,
        token_version=1,
        is_active=True
    )
    nguoi_dung_sales_mgr = User(
        username="salesmgr",
        email="salesmgr@warehouse.local",
        hashed_password=bam_mat_khau("SalesMgrPass123"),
        role=UserRole.SALES_MANAGER.value,
        failed_login_attempts=0,
        locked_until=None,
        token_version=1,
        is_active=True
    )
    phien_db.add_all([nguoi_dung_test, nguoi_dung_admin, nguoi_dung_sales_mgr])
    phien_db.commit()
    phien_db.close()
    
    yield
    
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


# =========================================================================
# TEST TASK 1: API /auth/login & Khóa tài khoản 15 phút (SCRUM-287)
# =========================================================================

def test_dang_nhap_thanh_cong_bang_username():
    """Đăng nhập thành công với username hợp lệ."""
    phan_hoi = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "ValidPass123"}
    )
    assert phan_hoi.status_code == 200
    du_lieu = phan_hoi.json()
    assert "access_token" in du_lieu
    assert du_lieu["token_type"] == "bearer"
    assert du_lieu["user"]["username"] == "testuser"
    assert du_lieu["user"]["role"] == "Customer"


def test_dang_nhap_thanh_cong_bang_email():
    """Đăng nhập thành công với email hợp lệ."""
    phan_hoi = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser@warehouse.local", "password": "ValidPass123"}
    )
    assert phan_hoi.status_code == 200
    assert "access_token" in phan_hoi.json()


def test_dang_nhap_that_bai_khi_sai_mat_khau():
    """Đăng nhập sai mật khẩu trả về 401 với thông báo chung."""
    phan_hoi = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "WrongPassword99"}
    )
    assert phan_hoi.status_code == 401
    assert "Tên đăng nhập hoặc mật khẩu không chính xác" in phan_hoi.json()["detail"]


def test_dang_nhap_tai_khoan_khong_ton_tai():
    """Đăng nhập tài khoản không tồn tại cũng trả về thông báo chung (chống enumeration)."""
    phan_hoi = client.post(
        "/api/v1/auth/login",
        json={"username": "ghost_user", "password": "WrongPassword99"}
    )
    assert phan_hoi.status_code == 401
    assert "Tên đăng nhập hoặc mật khẩu không chính xác" in phan_hoi.json()["detail"]


def test_khoa_tai_khoan_sau_5_lan_dang_nhap_sai():
    """Đăng nhập sai liên tiếp 5 lần kích hoạt khóa tài khoản 15 phút."""
    # 4 lần đầu tiên: 401 Unauthorized
    for lan_thu in range(4):
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "testuser", "password": "WrongPassword99"}
        )
        assert res.status_code == 401, f"Lần thứ {lan_thu + 1} phải là 401"

    # Lần thứ 5: Khóa tài khoản và trả về 403 Forbidden
    res5 = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "WrongPassword99"}
    )
    assert res5.status_code == 403
    assert "Tài khoản tạm thời bị khóa trong 15 phút" in res5.json()["detail"]

    # Lần thứ 6 (kể cả gõ đúng mật khẩu): Vẫn bị khóa 403
    res6 = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "ValidPass123"}
    )
    assert res6.status_code == 403
    assert "Tài khoản tạm thời bị khóa trong 15 phút" in res6.json()["detail"]


# =========================================================================
# TEST TASK 2: API Đổi mật khẩu & Thu hồi phiên đăng nhập (SCRUM-307)
# =========================================================================

def test_rang_buoc_do_manh_mat_khau_moi():
    """Kiểm tra validation mật khẩu mới (tối thiểu 8 ký tự, có chữ và số)."""
    # Đăng nhập lấy token
    phan_hoi_login = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "ValidPass123"}
    )
    token = phan_hoi_login.json()["access_token"]
    tieu_de_xac_thuc = {"Authorization": f"Bearer {token}"}

    # Quá ngắn (< 8 ký tự)
    res_ngan = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "ValidPass123", "new_password": "Pass1"},
        headers=tieu_de_xac_thuc
    )
    assert res_ngan.status_code == 422

    # Toàn chữ cái, không có số
    res_khong_so = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "ValidPass123", "new_password": "OnlyLettersHere"},
        headers=tieu_de_xac_thuc
    )
    assert res_khong_so.status_code == 422

    # Toàn số, không có chữ
    res_khong_chu = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "ValidPass123", "new_password": "1234567890"},
        headers=tieu_de_xac_thuc
    )
    assert res_khong_chu.status_code == 422


def test_doi_mat_khau_va_thu_hoi_cac_phien_cu():
    """Đổi mật khẩu thành công và kiểm tra thu hồi phiên (token cũ lập tức vô hiệu)."""
    # 1. Đăng nhập lấy token 1
    phan_hoi_login = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "ValidPass123"}
    )
    token_cu = phan_hoi_login.json()["access_token"]
    headers_cu = {"Authorization": f"Bearer {token_cu}"}

    # 2. Đổi mật khẩu bằng token_cu
    phan_hoi_doi_mk = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "ValidPass123", "new_password": "BrandNewPass88"},
        headers=headers_cu
    )
    assert phan_hoi_doi_mk.status_code == 200
    assert "Đổi mật khẩu thành công" in phan_hoi_doi_mk.json()["message"]

    # 3. Dùng token cũ gọi /auth/me -> Phải bị từ chối 401 vì token_version đã tăng
    phan_hoi_me_cu = client.get("/api/v1/auth/me", headers=headers_cu)
    assert phan_hoi_me_cu.status_code == 401
    assert "bị thu hồi" in phan_hoi_me_cu.json()["detail"]

    # 4. Đăng nhập lại bằng mật khẩu cũ -> Thất bại 401
    phan_hoi_that_bai = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "ValidPass123"}
    )
    assert phan_hoi_that_bai.status_code == 401

    # 5. Đăng nhập lại bằng mật khẩu mới -> Thành công 200
    phan_hoi_moi = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "BrandNewPass88"}
    )
    assert phan_hoi_moi.status_code == 200
    token_moi = phan_hoi_moi.json()["access_token"]

    # 6. Dùng token mới gọi /auth/me -> Thành công 200
    phan_hoi_me_moi = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_moi}"})
    assert phan_hoi_me_moi.status_code == 200
    assert phan_hoi_me_moi.json()["username"] == "testuser"


# =========================================================================
# TEST TASK 3: Middleware/Guard kiểm quyền tầng server (SCRUM-310)
# =========================================================================

def test_tu_choi_truy_cap_khi_khong_co_token():
    """Mặc định từ chối truy cập nếu không có token (Deny by default)."""
    phan_hoi = client.get("/api/v1/auth/demo/sales-manager-or-admin")
    assert phan_hoi.status_code == 401


def test_chan_quyen_khi_khong_dung_vai_tro():
    """Người dùng có role Customer bị từ chối 403 khi vào vùng Sales Manager/Admin."""
    phan_hoi_login = client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "ValidPass123"}
    )
    token = phan_hoi_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    phan_hoi = client.get("/api/v1/auth/demo/sales-manager-or-admin", headers=headers)
    assert phan_hoi.status_code == 403
    assert "Bạn không có quyền thực hiện hành động này" in phan_hoi.json()["detail"]


def test_cho_phep_sales_manager_truy_cap():
    """Sales Manager được phép truy cập vào vùng Sales Manager/Admin."""
    phan_hoi_login = client.post(
        "/api/v1/auth/login",
        json={"username": "salesmgr", "password": "SalesMgrPass123"}
    )
    token = phan_hoi_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    phan_hoi = client.get("/api/v1/auth/demo/sales-manager-or-admin", headers=headers)
    assert phan_hoi.status_code == 200
    assert "Sales Manager" in phan_hoi.json()["message"]


def test_cho_phep_admin_truy_cap():
    """Admin được phép truy cập vào vùng Sales Manager/Admin."""
    phan_hoi_login = client.post(
        "/api/v1/auth/login",
        json={"username": "adminuser", "password": "AdminPass123"}
    )
    token = phan_hoi_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    phan_hoi = client.get("/api/v1/auth/demo/sales-manager-or-admin", headers=headers)
    assert phan_hoi.status_code == 200
    assert "Admin" in phan_hoi.json()["message"]
