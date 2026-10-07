import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from main import app
from app.core.database import lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.order import Order

client = TestClient(app)


def _tao_headers(user: User) -> dict:
    token = tao_token_truy_cap({
        "sub": user.username,
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "token_version": user.token_version,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def db_session():
    generator = lay_phien_db()
    db = next(generator)
    try:
        yield db
    finally:
        try:
            next(generator)
        except StopIteration:
            pass


@pytest.fixture
def admin_user(db_session: Session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@warehouse.local",
            full_name="Quản Trị Viên",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Admin@123456"),
            is_active=True,
            token_version=1,
        )
        db_session.add(admin)
        db_session.commit()
        db_session.refresh(admin)
    return admin


@pytest.fixture
def regular_user(db_session: Session):
    uid = uuid.uuid4().hex[:6]
    user = User(
        username=f"staff_{uid}",
        email=f"staff_{uid}@test.local",
        full_name=f"Nhân Viên {uid}",
        role=UserRole.SALES_REP.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_non_admin_cannot_delete_user(regular_user: User):
    headers = _tao_headers(regular_user)
    res = client.delete(f"/api/v1/users/{regular_user.id}", headers=headers)
    assert res.status_code == 403


def test_can_delete_check_on_clean_user(admin_user: User, regular_user: User):
    headers = _tao_headers(admin_user)
    res = client.get(f"/api/v1/users/{regular_user.id}/can-delete", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["can_delete"] is True
    assert data["has_dependencies"] is False
    assert data["dependencies"]["orders_count"] == 0
    assert data["dependencies"]["stock_receipts_count"] == 0
    assert data["dependencies"]["price_lists_count"] == 0
    assert data["suggested_action"] == "delete"


def test_delete_clean_user_succeeds(admin_user: User, regular_user: User, db_session: Session):
    headers = _tao_headers(admin_user)
    target_id = regular_user.id

    res = client.delete(f"/api/v1/users/{target_id}", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["deleted_user_id"] == target_id

    # Xác nhận người dùng đã biến mất hoàn toàn khỏi DB
    db_session.expire_all()
    deleted = db_session.query(User).filter(User.id == target_id).first()
    assert deleted is None


def test_cannot_delete_self(admin_user: User):
    headers = _tao_headers(admin_user)
    res = client.delete(f"/api/v1/users/{admin_user.id}", headers=headers)
    assert res.status_code == 400
    assert "chính mình" in res.json()["detail"].lower()


def test_cannot_delete_root_admin(admin_user: User, db_session: Session):
    # Tạo một admin phụ
    uid = uuid.uuid4().hex[:6]
    sub_admin = User(
        username=f"admin_{uid}",
        email=f"admin_{uid}@test.local",
        full_name="Admin Phụ",
        role=UserRole.ADMIN.value,
        hashed_password=bam_mat_khau("Admin@1234"),
        is_active=True,
        token_version=1,
    )
    db_session.add(sub_admin)
    db_session.commit()
    db_session.refresh(sub_admin)

    headers = _tao_headers(sub_admin)
    # Thử xóa admin gốc
    res = client.delete(f"/api/v1/users/{admin_user.id}", headers=headers)
    assert res.status_code == 400
    assert "gốc" in res.json()["detail"].lower()


def test_user_with_orders_cannot_be_deleted(admin_user: User, regular_user: User, db_session: Session):
    # Tạo 1 đơn hàng gắn với nhân sự này
    uid = uuid.uuid4().hex[:6]
    order = Order(
        id=f"ORD-TEST-{uid}",
        code=f"DH-TEST-{uid}",
        customer_id="CUS-001",
        customer_name="Khách Hàng Test",
        staff_id=str(regular_user.id),
        staff_name=regular_user.full_name,
        subtotal=100000.0,
        total=100000.0,
        paid_amount=100000.0,
        status="pending",
    )
    db_session.add(order)
    db_session.commit()

    headers = _tao_headers(admin_user)

    # 1. Kiểm tra can-delete trả về False
    res_check = client.get(f"/api/v1/users/{regular_user.id}/can-delete", headers=headers)
    assert res_check.status_code == 200
    data_check = res_check.json()
    assert data_check["can_delete"] is False
    assert data_check["has_dependencies"] is True
    assert data_check["dependencies"]["orders_count"] >= 1
    assert data_check["suggested_action"] == "lock"

    # 2. Gọi DELETE bị từ chối với 409 Conflict
    res_del = client.delete(f"/api/v1/users/{regular_user.id}", headers=headers)
    assert res_del.status_code == 409
    assert "đơn hàng" in res_del.json()["detail"]
    assert "khóa tài khoản" in res_del.json()["detail"].lower()

    # Dọn dẹp đơn test
    db_session.delete(order)
    db_session.commit()
