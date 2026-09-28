import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import Role, Permission, User, UserRole
from app.services.seed_service import seed_all
from main import app

# Database SQLite in-memory tách biệt cho test suite SCRUM
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
def setup_scrum_test_database():
    """Tạo schema và dữ liệu sạch trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db
    db = TestingSessionLocal()
    seed_all(db)

    # Tạo các tài khoản chuẩn cho từng vai trò
    admin_user = User(
        username="admin_scrum",
        email="admin_scrum@warehouse.local",
        hashed_password=bam_mat_khau("Admin@1234"),
        role=UserRole.ADMIN.value,
        is_active=True,
        token_version=1
    )
    sales_mgr = User(
        username="sales_mgr_scrum",
        email="sales_mgr_scrum@warehouse.local",
        hashed_password=bam_mat_khau("SalesMgr@1234"),
        role=UserRole.SALES_MANAGER.value,
        is_active=True,
        token_version=1
    )
    sales_rep = User(
        username="sales_rep_scrum",
        email="sales_rep_scrum@warehouse.local",
        hashed_password=bam_mat_khau("SalesRep@1234"),
        role=UserRole.SALES_REP.value,
        full_name="Nguyễn Văn Bán Hàng",
        phone_number="0988776655",
        is_active=True,
        token_version=1
    )
    warehouse_user = User(
        username="wh_scrum",
        email="wh_scrum@warehouse.local",
        hashed_password=bam_mat_khau("Warehouse@1234"),
        role=UserRole.WAREHOUSE.value,
        assigned_warehouse="Kho Hà Nội",
        is_active=True,
        token_version=1
    )
    customer_user = User(
        username="cust_scrum",
        email="cust_scrum@warehouse.local",
        hashed_password=bam_mat_khau("Cust@1234"),
        role=UserRole.CUSTOMER.value,
        is_active=True,
        token_version=1
    )

    db.add_all([admin_user, sales_mgr, sales_rep, warehouse_user, customer_user])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.pop(lay_phien_db, None)


client = TestClient(app)


def lay_token_dang_nhap(username: str, role: str, user_id: int = 1, token_version: int = 1) -> str:
    """Tạo JWT token trực tiếp cho test."""
    return tao_token_truy_cap({
        "sub": username,
        "user_id": user_id,
        "role": role,
        "token_version": token_version
    })


# =========================================================================
# 1. TEST SCRUM-199: Duy trì phiên và Đăng xuất an toàn
# =========================================================================

def test_scrum_199_dang_xuat_vo_hieu_hoa_phien_tren_server():
    """Đăng xuất làm mất hiệu lực phiên ngay lập tức phía server."""
    db = TestingSessionLocal()
    user = db.query(User).filter(User.username == "cust_scrum").first()
    token = lay_token_dang_nhap(user.username, user.role, user.id, user.token_version)

    # 1. Gọi /me trước khi đăng xuất -> Thành công
    res_before = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_before.status_code == 200

    # 2. Gọi logout -> Tăng token_version
    res_logout = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert res_logout.status_code == 200

    # 3. Dùng lại token cũ gọi /me -> Bị từ chối 401 vì token_version phía server đã thay đổi
    res_after = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_after.status_code == 401


def test_scrum_199_gia_han_phien_tu_dong():
    """Phiên được gia hạn tự động khi còn hoạt động."""
    db = TestingSessionLocal()
    user = db.query(User).filter(User.username == "cust_scrum").first()
    token = lay_token_dang_nhap(user.username, user.role, user.id, user.token_version)

    res_refresh = client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert res_refresh.status_code == 200
    data = res_refresh.json()
    assert "access_token" in data
    assert data["user"]["username"] == "cust_scrum"


# =========================================================================
# 2. TEST SCRUM-200: Quên mật khẩu và đặt lại mật khẩu qua email
# =========================================================================

def test_scrum_200_quen_mat_khau_email_khong_ton_tai_van_hien_thong_bao_chung():
    """Email không tồn tại vẫn hiển thị cùng thông báo chung (chống enumeration)."""
    res = client.post("/api/v1/auth/forgot-password", json={"email": "nonexistent@warehouse.local"})
    assert res.status_code == 200
    assert "hướng dẫn đặt lại mật khẩu" in res.json()["message"]


def test_scrum_200_quen_mat_khau_va_dat_lai_thanh_cong():
    """Quy trình quên mật khẩu: tạo token 30 phút, đặt lại mật khẩu và hủy token."""
    res_forgot = client.post("/api/v1/auth/forgot-password", json={"email": "cust_scrum@warehouse.local"})
    assert res_forgot.status_code == 200

    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "cust_scrum@warehouse.local").first()
    token_reset = user.reset_password_token
    assert token_reset is not None

    # Đặt lại mật khẩu mới (>= 8 ký tự, có cả chữ và số)
    res_reset = client.post("/api/v1/auth/reset-password", json={
        "token": token_reset,
        "new_password": "NewSecretPass2026"
    })
    assert res_reset.status_code == 200

    # Token chỉ dùng được 1 lần: Gọi lại phải thất bại 400
    res_reuse = client.post("/api/v1/auth/reset-password", json={
        "token": token_reset,
        "new_password": "AnotherPass2026"
    })
    assert res_reuse.status_code == 400


# =========================================================================
# 3. TEST SCRUM-202: Phân quyền giá vốn & biên lợi nhuận
# =========================================================================

def test_scrum_202_gia_von_chi_lo_voi_quan_ly_kinh_doanh():
    """Giá vốn và biên lợi nhuận chỉ lộ ra với vai trò Quản lý kinh doanh."""
    db = TestingSessionLocal()
    mgr = db.query(User).filter(User.username == "sales_mgr_scrum").first()
    wh = db.query(User).filter(User.username == "wh_scrum").first()

    token_mgr = lay_token_dang_nhap(mgr.username, mgr.role, mgr.id)
    token_wh = lay_token_dang_nhap(wh.username, wh.role, wh.id)

    # 1. Sales Manager truy cập -> Được phép 200 OK
    res_mgr = client.get("/api/v1/auth/financial/cost-and-margin", headers={"Authorization": f"Bearer {token_mgr}"})
    assert res_mgr.status_code == 200
    assert len(res_mgr.json()["data"]) > 0

    # 2. Thủ kho truy cập -> Bị từ chối 403 Forbidden
    res_wh = client.get("/api/v1/auth/financial/cost-and-margin", headers={"Authorization": f"Bearer {token_wh}"})
    assert res_wh.status_code == 403


# =========================================================================
# 4. TEST SCRUM-205: Tạo, sửa, tìm kiếm và phân trang tài khoản
# =========================================================================

def test_scrum_205_tao_tai_khoan_trung_bi_tu_choi():
    """Tài khoản trùng username/email bị từ chối kèm thông báo cụ thể."""
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.username == "admin_scrum").first()
    token_admin = lay_token_dang_nhap(admin.username, admin.role, admin.id)

    # Trùng username
    res_dup_user = client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"username": "cust_scrum", "email": "unique@warehouse.local", "role": "Customer"}
    )
    assert res_dup_user.status_code == 400
    assert "Tên đăng nhập 'cust_scrum' đã tồn tại" in res_dup_user.json()["detail"]

    # Trùng email
    res_dup_email = client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"username": "unique_user", "email": "cust_scrum@warehouse.local", "role": "Customer"}
    )
    assert res_dup_email.status_code == 400
    assert "Địa chỉ email 'cust_scrum@warehouse.local' đã được đăng ký" in res_dup_email.json()["detail"]


def test_scrum_205_tim_kiem_va_phan_trang_20_dong():
    """Tìm kiếm theo tên, tài khoản, SĐT và phân trang mặc định 20 dòng."""
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.username == "admin_scrum").first()
    token_admin = lay_token_dang_nhap(admin.username, admin.role, admin.id)

    # Tìm kiếm theo tên / số điện thoại của sales_rep
    res_search = client.get(
        "/api/v1/users?q=0988776655",
        headers={"Authorization": f"Bearer {token_admin}"}
    )
    assert res_search.status_code == 200
    items = res_search.json()["items"]
    assert len(items) == 1
    assert items[0]["username"] == "sales_rep_scrum"
    assert res_search.json()["page_size"] == 20


# =========================================================================
# 5. TEST SCRUM-206: Ràng buộc vai trò kho và ngăn tự thu hồi quyền Admin
# =========================================================================

def test_scrum_206_vai_tro_kho_bat_buoc_gan_kho_cu_the():
    """Người dùng thuộc vai trò kho phải gắn với ít nhất một kho cụ thể."""
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.username == "admin_scrum").first()
    token_admin = lay_token_dang_nhap(admin.username, admin.role, admin.id)

    # Tạo thủ kho nhưng không gắn kho -> Phải bị từ chối 400
    res_no_wh = client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={
            "username": "thukho_moi",
            "email": "thukho_moi@warehouse.local",
            "role": "Warehouse",
            "assigned_warehouse": None
        }
    )
    assert res_no_wh.status_code == 400
    assert "gắn với ít nhất một kho" in res_no_wh.json()["detail"]

    # Gắn kho cụ thể -> Thành công 201
    res_valid_wh = client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={
            "username": "thukho_hop_le",
            "email": "thukho_hop_le@warehouse.local",
            "role": "Warehouse",
            "assigned_warehouse": "Kho Miền Trung"
        }
    )
    assert res_valid_wh.status_code == 201
    assert res_valid_wh.json()["assigned_warehouse"] == "Kho Miền Trung"


def test_scrum_206_ngan_quan_tri_vien_tu_thu_hoi_vai_tro_chinh_minh():
    """Không thể tự thu hồi vai trò quản trị của chính mình."""
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.username == "admin_scrum").first()
    token_admin = lay_token_dang_nhap(admin.username, admin.role, admin.id)

    # Admin tự sửa vai trò của chính mình thành Customer
    res = client.put(
        f"/api/v1/users/{admin.id}",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"role": "Customer"}
    )
    assert res.status_code == 400
    assert "Không thể tự thu hồi vai trò quản trị viên" in res.json()["detail"]


# =========================================================================
# 6. TEST SCRUM-207: Khóa/Mở khóa tài khoản, lý do khóa và cảnh báo bàn giao
# =========================================================================

def test_scrum_207_khoa_tai_khoan_thu_hoi_phien_va_canh_bao_ban_giao():
    """Khóa tài khoản yêu cầu lý do, thu hồi phiên ngay lập tức và cảnh báo bàn giao đại lý."""
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.username == "admin_scrum").first()
    sales_rep = db.query(User).filter(User.username == "sales_rep_scrum").first()

    token_admin = lay_token_dang_nhap(admin.username, admin.role, admin.id)
    token_rep = lay_token_dang_nhap(sales_rep.username, sales_rep.role, sales_rep.id, sales_rep.token_version)

    # 1. Khóa tài khoản nhân viên kinh doanh
    res_lock = client.post(
        f"/api/v1/users/{sales_rep.id}/lock",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"reason": "Nhân viên nghỉ việc từ 01/10/2026"}
    )
    assert res_lock.status_code == 200
    data_lock = res_lock.json()
    assert data_lock["session_revoked"] is True
    assert "bàn giao" in data_lock["handover_warning"].lower()

    # 2. Token cũ của nhân viên bị khóa ngay lập tức (từ chối 401 hoặc 403)
    res_rep_call = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_rep}"})
    assert res_rep_call.status_code in [401, 403]

    # 3. Nhân viên cố đăng nhập lại -> Bị chặn 403
    res_relogin = client.post(
        "/api/v1/auth/login",
        json={"username": "sales_rep_scrum", "password": "SalesRep@1234"}
    )
    assert res_relogin.status_code == 403

    # 4. Mở khóa tài khoản -> Đăng nhập lại được
    res_unlock = client.post(
        f"/api/v1/users/{sales_rep.id}/unlock",
        headers={"Authorization": f"Bearer {token_admin}"}
    )
    assert res_unlock.status_code == 200

    res_login_again = client.post(
        "/api/v1/auth/login",
        json={"username": "sales_rep_scrum", "password": "SalesRep@1234"}
    )
    assert res_login_again.status_code == 200
