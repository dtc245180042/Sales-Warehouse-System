import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.core.database import Base, lay_phien_db
from app.models.auth import User
from app.core.security import bam_mat_khau
from app.services.email_service import clear_mock_outbox, get_mock_outbox

# Database SQLite in-memory tách biệt dùng StaticPool để chia sẻ kết nối giữa các thread
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_lay_phien_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    clear_mock_outbox()
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    # Tạo sẵn người dùng mẫu để test
    db = TestingSessionLocal()
    mat_khau_goc = "CurrentPass2026"
    test_user = User(
        username="scrum200_user",
        email="scrum200_user@warehouse.local",
        full_name="Nguyễn Văn Nghiệp Vụ",
        hashed_password=bam_mat_khau(mat_khau_goc),
        role="Sales",
        is_active=True,
        token_version=1
    )
    db.add(test_user)
    db.commit()
    db.close()

    yield

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


client = TestClient(app)


def test_scrum295_forgot_password_sends_email_and_generates_30min_token():
    """SCRUM-295: Yêu cầu đặt lại mật khẩu gửi email và sinh token có hạn 30 phút."""
    clear_mock_outbox()

    res = client.post("/api/v1/auth/forgot-password", json={"email": "scrum200_user@warehouse.local"})
    assert res.status_code == 200
    assert "hướng dẫn đặt lại mật khẩu" in res.json()["message"]

    # 1. Kiểm tra email giả lập đã được gửi
    outbox = get_mock_outbox()
    assert len(outbox) == 1
    sent_email = outbox[0]
    assert sent_email["to_email"] == "scrum200_user@warehouse.local"
    assert "reset-password?token=" in sent_email["reset_link"]

    token = sent_email["token"]
    assert len(token) == 5 and token.isdigit()

    # 2. Kiểm tra dữ liệu được lưu đúng trong DB
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "scrum200_user@warehouse.local").first()
    assert user.reset_password_token == token
    assert user.reset_password_expires_at is not None

    # Thời hạn hiệu lực xấp xỉ 5 phút
    now_utc = datetime.now(timezone.utc)
    expiry = user.reset_password_expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    chenh_lech_phut = (expiry - now_utc).total_seconds() / 60
    assert 3 <= chenh_lech_phut <= 6
    db.close()


def test_scrum200_forgot_password_nonexistent_email_safe():
    """SCRUM-200: Email không tồn tại vẫn trả về cùng thông báo và không gửi email."""
    clear_mock_outbox()

    res = client.post("/api/v1/auth/forgot-password", json={"email": "nonexistent@warehouse.local"})
    assert res.status_code == 200
    assert "hướng dẫn đặt lại mật khẩu" in res.json()["message"]

    # Không được gửi email nào
    outbox = get_mock_outbox()
    assert len(outbox) == 0


def test_scrum200_verify_token_valid_and_expired():
    """SCRUM-200 / SCRUM-297: Xác thực token hợp lệ và phát hiện token quá 5 phút."""
    # 1. Yêu cầu token mới
    client.post("/api/v1/auth/forgot-password", json={"email": "scrum200_user@warehouse.local"})
    outbox = get_mock_outbox()
    token = outbox[0]["token"]

    # 2. Kiểm tra token hợp lệ
    res_valid = client.get(f"/api/v1/password-reset/verify?token={token}")
    assert res_valid.status_code == 200
    data_valid = res_valid.json()
    assert data_valid["valid"] is True
    assert data_valid["expires_in_minutes"] >= 3
    assert "s***r@warehouse.local" in data_valid["email"]

    # 3. Làm cho token hết hạn quá 30 phút
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "scrum200_user@warehouse.local").first()
    user.reset_password_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.commit()
    db.close()

    # 4. Kiểm tra token hết hạn
    res_expired = client.get(f"/api/v1/password-reset/verify?token={token}")
    assert res_expired.status_code == 200
    data_expired = res_expired.json()
    assert data_expired["valid"] is False
    assert "hết hạn" in data_expired["message"].lower()


def test_scrum298_reset_password_success_and_one_time_use():
    """SCRUM-298: Đổi mật khẩu thành công, token chỉ dùng 1 lần và thu hồi phiên cũ."""
    # 1. Sinh token
    client.post("/api/v1/auth/forgot-password", json={"email": "scrum200_user@warehouse.local"})
    token = get_mock_outbox()[0]["token"]

    db = TestingSessionLocal()
    old_version = db.query(User).filter(User.email == "scrum200_user@warehouse.local").first().token_version
    db.close()

    # 2. Đặt lại mật khẩu mới (chuẩn >= 8 ký tự, có cả chữ và số)
    res_reset = client.post("/api/v1/auth/reset-password", json={
        "token": token,
        "new_password": "BrandNewSecretPass2026"
    })
    assert res_reset.status_code == 200
    assert "thành công" in res_reset.json()["message"]

    # 3. Kiểm tra token bị xóa (chỉ dùng 1 lần) và token_version tăng lên
    db = TestingSessionLocal()
    updated_user = db.query(User).filter(User.email == "scrum200_user@warehouse.local").first()
    assert updated_user.reset_password_token is None
    assert updated_user.reset_password_expires_at is None
    assert updated_user.token_version == old_version + 1
    db.close()

    # 4. Thử dùng lại token cũ -> Bị từ chối
    res_reuse = client.post("/api/v1/auth/reset-password", json={
        "token": token,
        "new_password": "AnotherNewPass2026"
    })
    assert res_reuse.status_code == 400

    # 5. Đăng nhập bằng mật khẩu cũ -> Thất bại
    res_old_login = client.post("/api/v1/auth/login", json={
        "username": "scrum200_user",
        "password": "CurrentPass2026"
    })
    assert res_old_login.status_code == 401

    # 6. Đăng nhập bằng mật khẩu mới -> Thành công
    res_new_login = client.post("/api/v1/auth/login", json={
        "username": "scrum200_user",
        "password": "BrandNewSecretPass2026"
    })
    assert res_new_login.status_code == 200
    assert "access_token" in res_new_login.json()


def test_scrum298_password_validation_rules():
    """SCRUM-298: Kiểm tra quy chuẩn mật khẩu mới: tối thiểu 8 ký tự, gồm cả chữ và số."""
    client.post("/api/v1/auth/forgot-password", json={"email": "scrum200_user@warehouse.local"})
    token = get_mock_outbox()[0]["token"]

    # Dưới 8 ký tự -> Bị từ chối (422 Pydantic hoặc 400)
    res_short = client.post("/api/v1/auth/reset-password", json={
        "token": token,
        "new_password": "Pass1"
    })
    assert res_short.status_code in (400, 422)
    assert "8 ký tự" in str(res_short.json())

    # Chỉ có chữ, không có số
    res_no_num = client.post("/api/v1/auth/reset-password", json={
        "token": token,
        "new_password": "OnlyLettersPassword"
    })
    assert res_no_num.status_code in (400, 422)
    assert "chữ cái và một chữ số" in str(res_no_num.json()) or "chữ và số" in str(res_no_num.json())

    # Chỉ có số, không có chữ
    res_no_char = client.post("/api/v1/auth/reset-password", json={
        "token": token,
        "new_password": "1234567890123"
    })
    assert res_no_char.status_code in (400, 422)
    assert "chữ cái và một chữ số" in str(res_no_char.json()) or "chữ và số" in str(res_no_char.json())
