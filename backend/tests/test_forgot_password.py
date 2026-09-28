from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import verify_password, get_password_hash
from app.models.auth import User, PasswordResetToken
from app.services.auth_service import GENERIC_FORGOT_PASSWORD_MESSAGE
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

    app.dependency_overrides[lay_phien_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def sample_user(db_session):
    """Tạo user mẫu để kiểm thử."""
    user = db_session.query(User).filter(User.email == "tester@saleswarehouse.com").first()
    if not user:
        user = User(
            username="tester",
            email="tester@saleswarehouse.com",
            hashed_password=get_password_hash("OldPassword@123"),
            full_name="Test User",
            is_active=True
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    return user


def test_forgot_password_user_exists(client, db_session, sample_user):
    """Kiểm tra khi email tồn tại: Trả về thông báo chung, tạo token và hạn dùng hợp lệ."""
    response = client.post(
        "/api/auth/forgot-password",
        json={"email": sample_user.email}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == GENERIC_FORGOT_PASSWORD_MESSAGE

    # Kiểm tra token đã được lưu vào CSDL
    token_record = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == sample_user.id,
        PasswordResetToken.is_used == False
    ).order_by(PasswordResetToken.id.desc()).first()

    assert token_record is not None
    assert len(token_record.token) > 20
    assert token_record.expires_at > datetime.now(timezone.utc).replace(tzinfo=None)


def test_forgot_password_user_not_exists_returns_generic_message(client, db_session):
    """BẢO MẬT: Khi email KHÔNG tồn tại, vẫn phải trả về đúng thông báo chung (chống dò email)."""
    non_existent_email = "nobody_exists_12345@domain.com"
    count_before = db_session.query(PasswordResetToken).count()

    response = client.post(
        "/api/auth/forgot-password",
        json={"email": non_existent_email}
    )
    assert response.status_code == 200
    data = response.json()
    # Thông báo phải y hệt như khi user tồn tại
    assert data["message"] == GENERIC_FORGOT_PASSWORD_MESSAGE

    # Không sinh token mới trong database
    count_after = db_session.query(PasswordResetToken).count()
    assert count_before == count_after


def test_forgot_password_invalid_email_format(client):
    """Kiểm tra validation định dạng email không hợp lệ."""
    response = client.post(
        "/api/auth/forgot-password",
        json={"email": "invalid-email-address"}
    )
    assert response.status_code == 422


def test_reset_password_success(client, db_session, sample_user):
    """Kiểm tra đặt lại mật khẩu thành công khi dùng token hợp lệ."""
    # 1. Tạo token hợp lệ
    token_str = "valid_test_token_1234567890"
    db_token = PasswordResetToken(
        user_id=sample_user.id,
        token=token_str,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=15),
        is_used=False
    )
    db_session.add(db_token)
    db_session.commit()

    # 2. Gửi request đặt lại mật khẩu mới
    new_pass = "NewStrongPassword@2026"
    response = client.post(
        "/api/auth/reset-password",
        json={"token": token_str, "new_password": new_pass}
    )
    assert response.status_code == 200
    assert "thành công" in response.json()["message"]

    # 3. Kiểm tra token đã được đánh dấu is_used = True
    db_session.refresh(db_token)
    assert db_token.is_used is True

    # 4. Kiểm tra user đã được cập nhật mật khẩu mới
    db_session.refresh(sample_user)
    assert verify_password(new_pass, sample_user.hashed_password) is True


def test_reset_password_invalid_token(client):
    """Kiểm tra khi gửi token không tồn tại trong hệ thống."""
    response = client.post(
        "/api/auth/reset-password",
        json={"token": "completely_fake_token", "new_password": "NewPassword123"}
    )
    assert response.status_code == 400
    assert "không hợp lệ hoặc đã hết hạn" in response.json()["detail"]


def test_reset_password_expired_token(client, db_session, sample_user):
    """Kiểm tra khi gửi token đã hết hạn."""
    expired_token_str = "expired_token_test_123"
    db_token = PasswordResetToken(
        user_id=sample_user.id,
        token=expired_token_str,
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5),  # Đã hết hạn 5 phút trước
        is_used=False
    )
    db_session.add(db_token)
    db_session.commit()

    response = client.post(
        "/api/auth/reset-password",
        json={"token": expired_token_str, "new_password": "NewPassword123"}
    )
    assert response.status_code == 400
    assert "không hợp lệ hoặc đã hết hạn" in response.json()["detail"]


def test_multiple_requests_invalidates_previous_token(client, db_session, sample_user):
    """Kiểm tra: Nếu user gửi yêu cầu lần 2 thì token cũ của lần 1 sẽ tự động bị vô hiệu hóa."""
    # Yêu cầu lần 1
    client.post("/api/auth/forgot-password", json={"email": sample_user.email})
    token1 = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == sample_user.id,
        PasswordResetToken.is_used == False
    ).first()
    assert token1 is not None

    # Yêu cầu lần 2
    client.post("/api/auth/forgot-password", json={"email": sample_user.email})
    db_session.refresh(token1)
    assert token1.is_used is True  # Token 1 đã bị vô hiệu hóa

    # Token 2 mới đang active
    token2 = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == sample_user.id,
        PasswordResetToken.is_used == False
    ).first()
    assert token2 is not None
    assert token2.token != token1.token
