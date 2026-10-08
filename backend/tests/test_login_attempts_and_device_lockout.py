import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau
from app.models.auth import User, UserRole
from app.models.device_lockout import DeviceLockout
from app.services.device_lockout_service import khoa_thiet_bi, kiem_tra_thiet_bi_bi_khoa
from main import app

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
client = TestClient(app)


@pytest.fixture(autouse=True)
def thiet_lap_database():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[lay_phien_db] = ghi_de_lay_phien_db
    phien_db = SessionLocalKiemThu()
    user = User(
        username="testuser",
        email="testuser@warehouse.local",
        hashed_password=bam_mat_khau("ValidPass123"),
        role=UserRole.CUSTOMER.value,
        failed_login_attempts=0,
        locked_until=None,
        token_version=1,
        is_active=True
    )
    phien_db.add(user)
    phien_db.commit()
    phien_db.close()
    yield
    Base.metadata.drop_all(bind=engine)



def test_bao_so_lan_con_lai_khi_sai_mat_khau():
    """Kiểm tra báo số lần thử còn lại chính xác khi nhập sai mật khẩu."""
    db = SessionLocalKiemThu()
    user = db.query(User).filter(User.username == "testuser").first()
    if user:
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()
    db.close()

    # Lần 1: Sai mật khẩu -> còn 4 lần
    res1 = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "WrongPassword"})
    assert res1.status_code == 401
    assert "còn 4 lần thử" in res1.json()["detail"].lower()
    assert "tạm khóa 15 phút" in res1.json()["detail"].lower()

    # Lần 2: Sai mật khẩu -> còn 3 lần
    res2 = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "WrongPassword"})
    assert res2.status_code == 401
    assert "còn 3 lần thử" in res2.json()["detail"].lower()

    # Lần 3: Sai mật khẩu -> còn 2 lần
    res3 = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "WrongPassword"})
    assert res3.status_code == 401
    assert "còn 2 lần thử" in res3.json()["detail"].lower()

    # Lần 4: Sai mật khẩu -> còn 1 lần
    res4 = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "WrongPassword"})
    assert res4.status_code == 401
    assert "còn 1 lần thử" in res4.json()["detail"].lower()

    # Lần 5: Sai mật khẩu -> Quá 5 lần, khóa tài khoản và thiết bị 15 phút (HTTP 403)
    res5 = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "WrongPassword"})
    assert res5.status_code == 403
    assert "tài khoản tạm thời bị khóa trong 15 phút" in res5.json()["detail"].lower()
    assert "thiết bị" in res5.json()["detail"].lower()

    # Dù gõ đúng mật khẩu sau đó, tài khoản vẫn bị khóa 15 phút
    res6 = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "ValidPass123"})
    assert res6.status_code == 403
    assert "tài khoản tạm thời bị khóa trong 15 phút" in res6.json()["detail"].lower()

    # Dọn dẹp sau test
    db = SessionLocalKiemThu()
    user = db.query(User).filter(User.username == "testuser").first()
    if user:
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()
    db.close()


def test_khoa_thiet_bi_va_tu_dong_mo_khi_het_han():
    """Kiểm tra model DeviceLockout và tính năng chặn theo thiết bị."""
    db = SessionLocalKiemThu()
    test_ip = "192.168.100.200"

    # Xóa bản ghi cũ nếu có
    db.query(DeviceLockout).filter(DeviceLockout.ip_address == test_ip).delete()
    db.commit()

    # Tạo thiết bị bị khóa
    now = datetime.now(timezone.utc)
    lockout = DeviceLockout(
        ip_address=test_ip,
        device_summary="Chrome trên Windows 11",
        user_agent="Mozilla/5.0 Test",
        failed_attempts=5,
        locked_until=now + timedelta(minutes=15),
        lock_reason="Nhập sai mật khẩu 5 lần",
    )
    db.add(lockout)
    db.commit()

    # Kiểm tra trạng thái khóa
    assert lockout.da_bi_khoa() is True

    # Giả lập hết hạn khóa sau 16 phút
    lockout.locked_until = now - timedelta(minutes=1)
    db.commit()
    assert lockout.da_bi_khoa() is False

    # Dọn dẹp
    db.query(DeviceLockout).filter(DeviceLockout.ip_address == test_ip).delete()
    db.commit()
    db.close()
