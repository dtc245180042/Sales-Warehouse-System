import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from main import app

# Database SQLite in-memory tách biệt cho test validation email
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

    admin_user = User(
        username="admin_test_email",
        email="admin_test@warehouse.local",
        hashed_password=bam_mat_khau("Admin@1234"),
        role=UserRole.ADMIN.value,
        is_active=True,
        token_version=1,
    )
    db.add(admin_user)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.pop(lay_phien_db, None)


client = TestClient(app)


def test_forgot_password_invalid_email_format():
    """Kiểm tra API POST /api/v1/auth/forgot-password bắt lỗi định dạng email chuẩn Pydantic (HTTP 422)."""
    invalid_emails = [
        "not-an-email",
        "plainaddress",
        "@missingusername.com",
        "username@.com",
        "username@missingtld",
    ]

    for pfx in ["/api", "/api/v1"]:
        for bad_email in invalid_emails:
            res = client.post(f"{pfx}/auth/forgot-password", json={"email": bad_email})
            assert res.status_code == 422, f"Expected 422 for '{bad_email}' on {pfx}, got {res.status_code}: {res.text}"
            data = res.json()
            assert "detail" in data


def test_forgot_password_valid_email_format():
    """Kiểm tra API POST /api/v1/auth/forgot-password thành công (HTTP 200) với email đúng định dạng."""
    valid_emails = [
        "user@example.com",
        "test.user+tag@company.vn",
        "admin@warehouse.local",
    ]

    for pfx in ["/api", "/api/v1"]:
        for email in valid_emails:
            res = client.post(f"{pfx}/auth/forgot-password", json={"email": email})
            assert res.status_code == 200, f"Expected 200 for '{email}' on {pfx}, got {res.status_code}: {res.text}"
            data = res.json()
            assert "message" in data


def test_create_user_invalid_email_format():
    """Kiểm tra API POST /api/v1/users bắt lỗi định dạng email chuẩn Pydantic (HTTP 422)."""
    token = tao_token_truy_cap({"sub": "1", "user_id": 1, "username": "admin_test_email", "role": "Admin", "token_version": 1})
    headers = {"Authorization": f"Bearer {token}"}

    invalid_emails = [
        "invalid-email-format",
        "user@",
        "@example.com",
        "no_at_sign.com",
    ]

    for pfx in ["/api", "/api/v1"]:
        for bad_email in invalid_emails:
            payload = {
                "username": f"user_bad_{bad_email.replace('@', '_').replace('.', '_')}",
                "email": bad_email,
                "role": "Customer",
                "full_name": "Người Dùng Test Email",
            }
            res = client.post(f"{pfx}/users", json=payload, headers=headers)
            assert res.status_code == 422, f"Expected 422 for email '{bad_email}' on {pfx}, got {res.status_code}: {res.text}"


def test_create_user_valid_email_format():
    """Kiểm tra API POST /api/v1/users tạo thành công (HTTP 201) khi email hợp lệ."""
    token = tao_token_truy_cap({"sub": "1", "user_id": 1, "username": "admin_test_email", "role": "Admin", "token_version": 1})
    headers = {"Authorization": f"Bearer {token}"}

    valid_payload = {
        "username": "user_valid_email_test",
        "email": "valid.user@warehouse.local",
        "role": "Customer",
        "full_name": "Người Dùng Email Chuẩn",
    }
    res = client.post("/api/v1/users", json=valid_payload, headers=headers)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    assert res.json()["email"] == "valid.user@warehouse.local"
