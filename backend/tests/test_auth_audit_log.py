import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau
from app.models.auth import User, UserRole
from app.models.audit_log import AuditLog
from main import app

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
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    # Tạo user test
    user = User(
        username="test_audit_user",
        email="test_audit@warehouse.local",
        full_name="Nguyễn Văn Kiểm Toán",
        role=UserRole.ADMIN.value,
        hashed_password=bam_mat_khau("MatKhau@123"),
        is_active=True,
        token_version=1,
    )
    db.add(user)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


def test_ghi_nhat_ky_khi_dang_nhap_thanh_cong():
    client = TestClient(app)
    custom_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

    # Đăng nhập thành công
    res = client.post(
        "/api/auth/login",
        json={"username": "test_audit_user", "password": "MatKhau@123"},
        headers={"User-Agent": custom_ua, "X-Forwarded-For": "192.168.1.100"},
    )
    assert res.status_code == 200

    db = TestingSessionLocal()
    log = db.query(AuditLog).filter(AuditLog.action == "LOGIN", AuditLog.username == "test_audit_user").first()
    assert log is not None
    assert log.entity_type == "AUTH"
    assert log.status == "success"
    assert "Windows 10/11" in log.device
    assert "Chrome" in log.device
    assert log.ip_address == "192.168.1.100"
    assert "Đăng nhập thành công" in log.change_summary
    assert log.created_at is not None
    db.close()


def test_ghi_nhat_ky_khi_dang_nhap_that_bai():
    client = TestClient(app)
    mobile_ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"

    # Đăng nhập sai mật khẩu
    res = client.post(
        "/api/auth/login",
        json={"username": "test_audit_user", "password": "WrongPassword@123"},
        headers={"User-Agent": mobile_ua, "X-Forwarded-For": "10.0.0.50"},
    )
    assert res.status_code == 401

    db = TestingSessionLocal()
    log = db.query(AuditLog).filter(AuditLog.action == "LOGIN", AuditLog.status == "failed").first()
    assert log is not None
    assert "iOS" in log.device
    assert "Điện thoại" in log.device
    assert log.ip_address == "10.0.0.50"
    assert "Đăng nhập thất bại" in log.change_summary
    db.close()


def test_ghi_nhat_ky_khi_dang_xuat():
    client = TestClient(app)
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15"

    # Đăng nhập để lấy token
    login_res = client.post(
        "/api/auth/login",
        json={"username": "test_audit_user", "password": "MatKhau@123"},
        headers={"User-Agent": ua},
    )
    token = login_res.json()["access_token"]

    # Đăng xuất
    logout_res = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {token}", "User-Agent": ua, "X-Forwarded-For": "172.16.0.8"},
    )
    assert logout_res.status_code == 200

    db = TestingSessionLocal()
    logout_log = db.query(AuditLog).filter(AuditLog.action == "LOGOUT").first()
    assert logout_log is not None
    assert logout_log.status == "success"
    assert "macOS" in logout_log.device
    assert logout_log.ip_address == "172.16.0.8"
    assert "Đăng xuất khỏi hệ thống an toàn" in logout_log.change_summary
    assert logout_log.created_at is not None
    db.close()
