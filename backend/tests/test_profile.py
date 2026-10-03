import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.schemas.profile import validate_and_normalize_vn_phone
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test profile
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
def setup_profile_test_database():
    """Tạo schema và dữ liệu người dùng kiểm thử trước mỗi test case."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    # Tạo user mẫu cho vai trò Warehouse
    wh_user = User(
        username="wh_staff_scrum210",
        email="wh_staff@warehouse.local",
        full_name="Nguyễn Văn Kho Vận",
        phone_number="0912345678",
        role=UserRole.WAREHOUSE.value,
        assigned_warehouse="Kho Tổng Hà Nội",
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    db.add(wh_user)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


client = TestClient(app)


def _get_headers_for(username: str = "wh_staff_scrum210", user_id: int = 1, role: str = "Warehouse") -> dict:
    """Tạo Authorization Bearer header cho user chỉ định."""
    token = tao_token_truy_cap({
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "role": role,
        "token_version": 1,
    })
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# 1. TEST SCRUM-358: KIỂM TRA VÀ CHUẨN HÓA SỐ ĐIỆN THOẠI VIỆT NAM
# ==============================================================================

def test_vn_phone_normalization_unit():
    """Kiểm tra logic chuẩn hóa số điện thoại Việt Nam ở tầng schema."""
    # Các định dạng hợp lệ cần chuẩn hóa về 0xxxxxxxxx
    assert validate_and_normalize_vn_phone("0987654321") == "0987654321"
    assert validate_and_normalize_vn_phone("+84 987 654 321") == "0987654321"
    assert validate_and_normalize_vn_phone("84987654321") == "0987654321"
    assert validate_and_normalize_vn_phone("0912.345.678") == "0912345678"
    assert validate_and_normalize_vn_phone("070-123-4567") == "0701234567"
    assert validate_and_normalize_vn_phone("(039) 888 9999") == "0398889999"

    # None hoặc rỗng
    assert validate_and_normalize_vn_phone(None) is None
    assert validate_and_normalize_vn_phone("   ") is None

    # Các trường hợp không hợp lệ phải raise ValueError
    invalid_cases = [
        "0123456789",    # Đầu số 012 cũ không còn hợp lệ
        "098765432",     # 9 số (thiếu)
        "09876543210",   # 11 số (thừa)
        "0987abc321",    # Chứa chữ
        "+841234567890", # Sai độ dài
        "0012345678",    # Đầu số lạ
    ]
    for bad_phone in invalid_cases:
        with pytest.raises(ValueError):
            validate_and_normalize_vn_phone(bad_phone)


# ==============================================================================
# 2. TEST SCRUM-357: API LẤY VÀ CẬP NHẬT HỒ SƠ CÁ NHÂN
# ==============================================================================

def test_get_profile_me_unauthorized():
    """Chưa đăng nhập gọi GET /api/v1/profile/me phải trả về 401 Unauthorized."""
    res = client.get("/api/v1/profile/me")
    assert res.status_code == 401


def test_get_profile_me_success():
    """Đăng nhập hợp lệ lấy được đúng hồ sơ cá nhân của mình."""
    headers = _get_headers_for("wh_staff_scrum210")
    for prefix in ["/api/profile/me", "/api/v1/profile/me"]:
        res = client.get(prefix, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["username"] == "wh_staff_scrum210"
        assert data["email"] == "wh_staff@warehouse.local"
        assert data["full_name"] == "Nguyễn Văn Kho Vận"
        assert data["phone_number"] == "0912345678"
        assert data["role"] == UserRole.WAREHOUSE.value
        assert data["assigned_warehouse"] == "Kho Tổng Hà Nội"


def test_update_profile_me_success():
    """Cập nhật họ tên và số điện thoại thành công và chuẩn hóa SĐT."""
    headers = _get_headers_for("wh_staff_scrum210")
    payload = {
        "full_name": "Trần Thị Cẩm Tú",
        "phone_number": "+84 987 111 222",
    }
    res = client.put("/api/v1/profile/me", headers=headers, json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["full_name"] == "Trần Thị Cẩm Tú"
    assert data["phone_number"] == "0987111222"  # Đã chuẩn hóa về 0xxxxxxxxx

    # Kiểm tra lại qua GET
    res_get = client.get("/api/v1/profile/me", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["full_name"] == "Trần Thị Cẩm Tú"
    assert res_get.json()["phone_number"] == "0987111222"


def test_update_profile_only_full_name():
    """Chỉ cập nhật họ tên, giữ nguyên số điện thoại cũ."""
    headers = _get_headers_for("wh_staff_scrum210")
    res = client.put("/api/v1/profile/me", headers=headers, json={"full_name": "Lê Văn Tiến"})
    assert res.status_code == 200
    data = res.json()
    assert data["full_name"] == "Lê Văn Tiến"
    assert data["phone_number"] == "0912345678"  # Giữ nguyên


def test_update_profile_invalid_phone_fails():
    """Cập nhật số điện thoại sai định dạng phải trả về 422 Unprocessable Entity."""
    headers = _get_headers_for("wh_staff_scrum210")
    invalid_phones = [
        "12345",
        "098765432",
        "09876543210",
        "0123456789",
        "phone_number",
    ]
    for bad_phone in invalid_phones:
        res = client.put(
            "/api/v1/profile/me",
            headers=headers,
            json={"phone_number": bad_phone},
        )
        assert res.status_code == 422, f"Expected 422 for phone {bad_phone}, got {res.status_code}"


def test_update_profile_empty_full_name_fails():
    """Họ tên để khoảng trắng rỗng phải trả về 422."""
    headers = _get_headers_for("wh_staff_scrum210")
    res = client.put(
        "/api/v1/profile/me",
        headers=headers,
        json={"full_name": "   "},
    )
    assert res.status_code == 422


# ==============================================================================
# 3. TEST SCRUM-360: RÀNG BUỘC THUỘC TÍNH BẤT BIẾN (CHỐNG LEO QUYỀN / ĐỔI KHO)
# ==============================================================================

@pytest.mark.parametrize("forbidden_field,forbidden_value", [
    ("role", "ADMIN"),
    ("username", "hacked_admin"),
    ("assigned_warehouse", "Kho Trộm"),
    ("is_active", False),
    ("email", "hacker@evil.com"),
    ("password", "newpass123"),
])
def test_update_profile_forbidden_attributes_rejected(forbidden_field, forbidden_value):
    """Client cố tình truyền thuộc tính bị cấm phải bị Pydantic chặn (422 Extra forbidden)."""
    headers = _get_headers_for("wh_staff_scrum210")
    payload = {
        "full_name": "Hacker Name",
        forbidden_field: forbidden_value,
    }
    res = client.put("/api/v1/profile/me", headers=headers, json=payload)
    assert res.status_code == 422, (
        f"Thuộc tính cấm '{forbidden_field}' phải bị từ chối với HTTP 422, thực tế nhận {res.status_code}"
    )

    # Đảm bảo dữ liệu trong DB không bị thay đổi ngầm
    res_get = client.get("/api/v1/profile/me", headers=headers)
    data = res_get.json()
    assert data["role"] == UserRole.WAREHOUSE.value
    assert data["username"] == "wh_staff_scrum210"
    assert data["assigned_warehouse"] == "Kho Tổng Hà Nội"
