from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.order_status import OrderStatus, OrderStatusHistory
from app.models.order_delivery_profile import OrderDeliveryProfile
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, DispatchStatus
from app.models.delivery_tracking import OrderDeliveryMilestone
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Delivery Tracking S6-09
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
def setup_tracking_test_database():
    """Tạo schema và dữ liệu người dùng / đại lý trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_track",
            email="admin_track@test.local",
            role=UserRole.ADMIN.value,
            full_name="Quản Trị Viên",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="wh_staff_track",
            email="wh_staff_track@test.local",
            role=UserRole.WAREHOUSE.value,
            full_name="Hoàng Thủ Kho",
            assigned_warehouse="Kho Tổng Hà Nội",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="customer_a",
            email="customer_a@test.local",
            role=UserRole.CUSTOMER.value,
            full_name="Đại Lý Tuấn Phương",
            customer_id="CUS-001",
            phone_number="0901111111",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=4,
            username="customer_b",
            email="customer_b@test.local",
            role=UserRole.CUSTOMER.value,
            full_name="Đại Lý Minh Anh",
            customer_id="CUS-002",
            phone_number="0902222222",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)

    customers = [
        Customer(
            id="CUS-001",
            code="CUS-001",
            name="Đại Lý Tuấn Phương",
            phone="0901111111",
            email="customer_a@test.local",
            address="123 Phố Huế, Hai Bà Trưng, Hà Nội",
            status="active",
        ),
        Customer(
            id="CUS-002",
            code="CUS-002",
            name="Đại Lý Minh Anh",
            phone="0902222222",
            email="customer_b@test.local",
            address="456 Trần Phú, Đà Nẵng",
            status="active",
        ),
    ]
    for c in customers:
        db.add(c)

    db.commit()
    db.close()

    yield

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def make_auth_header(user_id: int, role: str) -> dict:
    token = tao_token_truy_cap(du_lieu={"user_id": user_id, "sub": str(user_id), "role": role, "token_version": 1})
    return {"Authorization": f"Bearer {token}"}



@pytest.fixture
def client():
    return TestClient(app)


# ==============================================================================
# TEST CASES CHO SCRUM-694: DELIVERY TIMELINE API
# ==============================================================================

def test_get_delivery_timeline_approved_order(client):
    """
    Test 1: Lấy timeline cho đơn hàng vừa được phê duyệt (APPROVED).
    - Mốc 1 'APPROVED' hoàn tất (COMPLETED).
    - Mốc 2 'PACKING' đang chuẩn bị (IN_PROGRESS).
    - Các mốc sau ở trạng thái PENDING.
    """
    db = TestingSessionLocal()
    order = Order(
        id="ORD-20261016-0001",
        code="ORD-20261016-0001",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        status="approved",
        total=5000000.0,
        subtotal=5000000.0,
    )
    db.add(order)
    db.add(OrderStatusHistory(
        order_id=order.id,
        from_status="pending",
        to_status="approved",
        changed_by="Quản lý kinh doanh",
        changed_at=datetime.now(timezone.utc),
        note="Duyệt đơn hàng thành công"
    ))
    db.add(OrderDeliveryProfile(
        order_id=order.id,
        delivery_receiver_name="Nguyễn Văn A",
        delivery_phone="0901111111",
        delivery_address="123 Phố Huế, Hà Nội",
        expected_delivery_date="2026-10-18",
    ))
    db.commit()
    db.close()

    admin_headers = make_auth_header(1, UserRole.ADMIN.value)
    resp = client.get("/api/v1/delivery-tracking/ORD-20261016-0001", headers=admin_headers)

    assert resp.status_code == 200
    data = resp.json()

    assert data["order_id"] == "ORD-20261016-0001"
    assert data["current_status"] == "approved"
    assert data["current_stage"] == "Đã duyệt"
    assert data["receiver_name"] == "Nguyễn Văn A"
    assert data["expected_delivery_date"] == "2026-10-18"

    milestones = data["milestones"]
    assert len(milestones) == 5

    # Mốc 1: Đã duyệt
    assert milestones[0]["code"] == "APPROVED"
    assert milestones[0]["name"] == "Đã duyệt"
    assert milestones[0]["status"] == "COMPLETED"
    assert milestones[0]["updated_at"] is not None

    # Mốc 2: Đang soạn
    assert milestones[1]["code"] == "PACKING"
    assert milestones[1]["status"] == "IN_PROGRESS"

    # Mốc 3, 4, 5: PENDING
    assert milestones[2]["code"] == "EXPORTED"
    assert milestones[2]["status"] == "PENDING"
    assert milestones[3]["code"] == "DELIVERING"
    assert milestones[3]["status"] == "PENDING"
    assert milestones[4]["code"] == "DELIVERED"
    assert milestones[4]["status"] == "PENDING"


def test_get_delivery_timeline_exported_with_dispatch(client):
    """
    Test 2: Lấy timeline cho đơn hàng đã xuất kho theo phiếu xuất kho S6-05.
    - Mốc 1 (APPROVED) và Mốc 2 (PACKING) hoàn tất.
    - Mốc 3 (EXPORTED) hoàn tất và chứa dispatch_id (PXK-...).
    - Mốc 4 (DELIVERING) đang tiến hành (IN_PROGRESS).
    """
    db = TestingSessionLocal()
    order = Order(
        id="ORD-20261016-0002",
        code="ORD-20261016-0002",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        status="exported",
        total=12000000.0,
    )
    db.add(order)

    # Thêm phiếu xuất kho S6-05
    now = datetime.now(timezone.utc)
    dispatch = StockDispatch(
        id="PXK-20261016-0001",
        client_request_id="REQ-001",
        order_id=order.id,
        customer_id="CUS-001",
        warehouse_id=1,
        warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value,
        dispatched_by=2,
        dispatched_at=now,
        notes="Xuất kho nguyên kiện",
    )
    db.add(dispatch)
    db.commit()
    db.close()

    admin_headers = make_auth_header(1, UserRole.ADMIN.value)
    resp = client.get("/api/v1/delivery-tracking/ORD-20261016-0002", headers=admin_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["current_status"] == "exported"
    assert data["current_stage"] == "Đã xuất"
    assert data["dispatch_id"] == "PXK-20261016-0001"

    milestones = data["milestones"]
    assert milestones[0]["status"] == "COMPLETED"
    assert milestones[1]["status"] == "COMPLETED"
    assert milestones[2]["code"] == "EXPORTED"
    assert milestones[2]["status"] == "COMPLETED"
    assert milestones[2]["dispatch_id"] == "PXK-20261016-0001"
    assert milestones[3]["code"] == "DELIVERING"
    assert milestones[3]["status"] == "IN_PROGRESS"


def test_update_delivery_milestone_to_delivering(client):
    """
    Test 3: Thủ kho / Quản lý cập nhật mốc 'DELIVERING' (Đang giao).
    - Cập nhật thông tin tài xế và biển số xe.
    - Đơn hàng tự động cập nhật trạng thái sang 'shipping'.
    """
    db = TestingSessionLocal()
    order = Order(
        id="ORD-20261016-0003",
        code="ORD-20261016-0003",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        status="exported",
        total=8000000.0,
    )
    db.add(order)
    db.commit()
    db.close()

    wh_headers = make_auth_header(2, UserRole.WAREHOUSE.value)
    payload = {
        "milestone_code": "DELIVERING",
        "status": "IN_PROGRESS",
        "driver_name": "Nguyễn Văn Tài (Tài xế)",
        "driver_phone": "0988777666",
        "license_plate": "29C-123.45",
        "notes": "Xe tải 2.5 tấn đã xuất bến và đang giao",
    }
    resp = client.patch(
        "/api/v1/delivery-tracking/ORD-20261016-0003/milestones",
        json=payload,
        headers=wh_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["current_status"] == "shipping"
    assert data["current_stage"] == "Đang giao"

    delivering_m = next(m for m in data["milestones"] if m["code"] == "DELIVERING")
    assert delivering_m["status"] == "IN_PROGRESS"
    assert delivering_m["driver_name"] == "Nguyễn Văn Tài (Tài xế)"
    assert delivering_m["driver_phone"] == "0988777666"
    assert delivering_m["license_plate"] == "29C-123.45"
    assert delivering_m["notes"] == "Xe tải 2.5 tấn đã xuất bến và đang giao"


def test_update_delivery_milestone_to_delivered(client):
    """
    Test 4: Xác nhận hoàn thành mốc 'DELIVERED' (Đã giao).
    - Tất cả 5 mốc đều hoàn thành (COMPLETED).
    - Đơn hàng chuyển sang trạng thái 'delivered'.
    """
    db = TestingSessionLocal()
    order = Order(
        id="ORD-20261016-0004",
        code="ORD-20261016-0004",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        status="shipping",
        total=8000000.0,
    )
    db.add(order)
    db.commit()
    db.close()

    admin_headers = make_auth_header(1, UserRole.ADMIN.value)
    payload = {
        "milestone_code": "DELIVERED",
        "status": "COMPLETED",
        "notes": "Đại lý đã nhận đủ hàng và ký biên bản giao nhận",
    }
    resp = client.patch(
        "/api/v1/delivery-tracking/ORD-20261016-0004/milestones",
        json=payload,
        headers=admin_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["current_status"] == "delivered"
    assert data["current_stage"] == "Đã giao"

    delivered_m = next(m for m in data["milestones"] if m["code"] == "DELIVERED")
    assert delivered_m["status"] == "COMPLETED"
    assert delivered_m["notes"] == "Đại lý đã nhận đủ hàng và ký biên bản giao nhận"


def test_customer_idor_protection(client):
    """
    Test 5: Bảo mật chống IDOR - Đại lý B không được xem timeline của Đại lý A.
    - Customer B gọi API xem đơn của Customer A -> HTTP 403 Forbidden.
    - Customer A gọi API xem đơn của chính mình -> HTTP 200 OK.
    """
    db = TestingSessionLocal()
    order = Order(
        id="ORD-20261016-0005",
        code="ORD-20261016-0005",
        customer_id="CUS-001",  # Đơn của Đại lý A
        customer_name="Đại Lý Tuấn Phương",
        status="approved",
        total=3000000.0,
    )
    db.add(order)
    db.commit()
    db.close()

    cust_a_headers = make_auth_header(3, UserRole.CUSTOMER.value)
    cust_b_headers = make_auth_header(4, UserRole.CUSTOMER.value)

    # Customer B truy cập đơn của Customer A qua Portal API -> Bị chặn 403
    resp_b = client.get("/api/v1/portal/orders/ORD-20261016-0005/timeline", headers=cust_b_headers)
    assert resp_b.status_code == 403
    assert "quyền" in resp_b.json()["detail"].lower()

    # Customer A truy cập đơn của chính mình qua Portal API -> Thành công 200
    resp_a = client.get("/api/v1/portal/orders/ORD-20261016-0005/timeline", headers=cust_a_headers)
    assert resp_a.status_code == 200
    assert resp_a.json()["customer_id"] == "CUS-001"


def test_order_not_found(client):
    """
    Test 6: Kiểm tra xử lý lỗi khi đơn hàng không tồn tại -> HTTP 404 Not Found.
    """
    admin_headers = make_auth_header(1, UserRole.ADMIN.value)
    resp = client.get("/api/v1/delivery-tracking/ORD-NONEXISTENT", headers=admin_headers)
    assert resp.status_code == 404
    assert "không tìm thấy" in resp.json()["detail"].lower()


def test_customer_cannot_update_milestones(client):
    """
    Test 7: Đại lý (Customer) không có quyền cập nhật mốc giao hàng -> HTTP 403 Forbidden.
    """
    cust_a_headers = make_auth_header(3, UserRole.CUSTOMER.value)
    payload = {
        "milestone_code": "DELIVERED",
        "status": "COMPLETED",
        "notes": "Khách hàng tự nhận hàng",
    }
    resp = client.patch(
        "/api/v1/delivery-tracking/ORD-20261016-0001/milestones",
        json=payload,
        headers=cust_a_headers,
    )
    assert resp.status_code == 403


def test_invalid_milestone_code(client):
    """
    Test 8: Cập nhật với mã mốc không hợp lệ -> HTTP 400 Bad Request.
    """
    db = TestingSessionLocal()
    order = Order(
        id="ORD-20261016-0006",
        code="ORD-20261016-0006",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        status="approved",
        total=1000000.0,
    )
    db.add(order)
    db.commit()
    db.close()

    admin_headers = make_auth_header(1, UserRole.ADMIN.value)
    payload = {
        "milestone_code": "INVALID_STEP",
        "status": "COMPLETED",
    }
    resp = client.patch(
        "/api/v1/delivery-tracking/ORD-20261016-0006/milestones",
        json=payload,
        headers=admin_headers,
    )
    assert resp.status_code == 400
    assert "không hợp lệ" in resp.json()["detail"].lower()


def test_portal_order_timeline_endpoint(client):
    """
    Test 9: Endpoint dành cho Cổng Đại Lý GET /api/v1/portal/orders/{order_id}/timeline.
    - Đại lý xem tiến trình đơn hàng của chính mình.
    """
    db = TestingSessionLocal()
    order = Order(
        id="ORD-20261016-0007",
        code="ORD-20261016-0007",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        status="approved",
        total=4500000.0,
    )
    db.add(order)
    db.commit()
    db.close()

    cust_a_headers = make_auth_header(3, UserRole.CUSTOMER.value)
    resp = client.get("/api/v1/portal/orders/ORD-20261016-0007/timeline", headers=cust_a_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["order_id"] == "ORD-20261016-0007"
    assert len(data["milestones"]) == 5
