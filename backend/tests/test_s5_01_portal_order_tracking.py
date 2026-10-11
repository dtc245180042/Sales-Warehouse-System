import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.order_delivery_profile import OrderDeliveryProfile

client = TestClient(app)


def _get_headers_for_user(user: User):
    token = tao_token_truy_cap({
        "sub": user.username,
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "token_version": user.token_version or 1
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def tracking_test_data():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]

    # 1. Tạo 2 đại lý riêng biệt: Customer 1 & Customer 2
    cust1 = Customer(
        id=f"CUST-TK1-{uid}",
        code=f"DL-TK1-{uid}",
        name=f"Đại Lý Alpha {uid}",
        phone=f"0981{uid[:6]}",
        customer_group="WHOLESALE",
        status="active"
    )
    cust2 = Customer(
        id=f"CUST-TK2-{uid}",
        code=f"DL-TK2-{uid}",
        name=f"Đại Lý Beta {uid}",
        phone=f"0982{uid[:6]}",
        customer_group="WHOLESALE",
        status="active"
    )
    db.add_all([cust1, cust2])
    db.flush()

    # 2. Tạo tài khoản User cho 2 đại lý
    user1 = User(
        username=f"cust_user1_{uid}",
        email=f"cust1_{uid}@test.local",
        hashed_password="hashed_dummy_password",
        role=UserRole.CUSTOMER.value,
        customer_id=cust1.id,
        is_active=True,
        token_version=1
    )
    user2 = User(
        username=f"cust_user2_{uid}",
        email=f"cust2_{uid}@test.local",
        hashed_password="hashed_dummy_password",
        role=UserRole.CUSTOMER.value,
        customer_id=cust2.id,
        is_active=True,
        token_version=1
    )
    db.add_all([user1, user2])
    db.flush()

    # 3. Tạo đơn hàng 1 cho Cust 1 (có giao thiếu)
    order1 = Order(
        id=f"ORD-TK1-{uid}",
        code=f"DH-TK1-{uid}",
        customer_id=cust1.id,
        customer_name=cust1.name,
        customer_phone=cust1.phone,
        status="shipping",
        subtotal=1500000.0,
        discount=50000.0,
        tax=0.0,
        total=1450000.0,
        payment_method="transfer",
        payment_status="partial",
        created_at=datetime.now(timezone.utc)
    )
    db.add(order1)
    db.flush()

    # Profile ngày giao dự kiến cho đơn 1
    prof1 = OrderDeliveryProfile(
        order_id=order1.id,
        delivery_receiver_name="Người nhận Alpha",
        delivery_phone=cust1.phone,
        delivery_address="123 Phố Huế, Hà Nội",
        expected_delivery_date="2026-10-25"
    )
    db.add(prof1)

    # Dòng hàng: Mặt hàng 1 đặt 10 giao đủ 10, Mặt hàng 2 đặt 5 nhưng thực giao 3 (Giao thiếu 2)
    item1_1 = OrderItem(
        order_id=order1.id,
        product_id=f"PRD-A-{uid}",
        sku="SKU-BIA-HN",
        name="Bia Hà Nội Lon",
        unit="thùng",
        price=300000.0,
        quantity=10,
        delivered_quantity=10,  # Đủ
        subtotal=3000000.0
    )
    item1_2 = OrderItem(
        order_id=order1.id,
        product_id=f"PRD-B-{uid}",
        sku="SKU-RUOU-VANG",
        name="Rượu Vang Đà Lạt",
        unit="chai",
        price=150000.0,
        quantity=5,
        delivered_quantity=3,  # Giao thiếu 2!
        subtotal=750000.0
    )
    db.add_all([item1_1, item1_2])

    # 4. Tạo đơn hàng 2 cho Cust 1 (trạng thái pending)
    order2 = Order(
        id=f"ORD-TK2-{uid}",
        code=f"DH-TK2-{uid}",
        customer_id=cust1.id,
        customer_name=cust1.name,
        customer_phone=cust1.phone,
        status="pending",
        subtotal=800000.0,
        total=800000.0,
        payment_method="cash",
        payment_status="unpaid",
        created_at=datetime.now(timezone.utc)
    )
    db.add(order2)
    db.flush()

    # 5. Tạo đơn hàng cho Cust 2 (Đại lý khác)
    order_cust2 = Order(
        id=f"ORD-TK3-{uid}",
        code=f"DH-TK3-{uid}",
        customer_id=cust2.id,
        customer_name=cust2.name,
        customer_phone=cust2.phone,
        status="completed",
        subtotal=2000000.0,
        total=2000000.0,
        payment_status="paid",
        created_at=datetime.now(timezone.utc)
    )
    db.add(order_cust2)

    db.commit()

    token1 = tao_token_truy_cap({
        "sub": user1.username,
        "user_id": user1.id,
        "username": user1.username,
        "role": user1.role,
        "token_version": user1.token_version or 1
    })
    token2 = tao_token_truy_cap({
        "sub": user2.username,
        "user_id": user2.id,
        "username": user2.username,
        "role": user2.role,
        "token_version": user2.token_version or 1
    })

    result = {
        "cust1_id": cust1.id,
        "cust2_id": cust2.id,
        "headers1": {"Authorization": f"Bearer {token1}"},
        "headers2": {"Authorization": f"Bearer {token2}"},
        "order1_id": order1.id,
        "order1_code": order1.code,
        "order2_id": order2.id,
        "order_cust2_id": order_cust2.id,
    }
    db.close()

    try:
        yield result
    finally:
        cleanup_db = SessionLocal()
        try:
            cleanup_db.query(OrderItem).filter(OrderItem.order_id.in_([order1.id, order2.id, order_cust2.id])).delete(synchronize_session=False)
            cleanup_db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id.in_([order1.id, order2.id, order_cust2.id])).delete(synchronize_session=False)
            cleanup_db.query(Order).filter(Order.id.in_([order1.id, order2.id, order_cust2.id])).delete(synchronize_session=False)
            cleanup_db.query(User).filter(User.id.in_([user1.id, user2.id])).delete(synchronize_session=False)
            cleanup_db.query(Customer).filter(Customer.id.in_([cust1.id, cust2.id])).delete(synchronize_session=False)
            cleanup_db.commit()
        except Exception:
            cleanup_db.rollback()
        finally:
            cleanup_db.close()


def test_subtask_3_and_5_portal_orders_isolation(tracking_test_data):
    """
    Subtask 3 & 5: Đại lý chỉ thấy danh sách đơn hàng của chính mình (chống IDOR).
    Không thấy đơn của đại lý khác.
    """
    headers1 = tracking_test_data["headers1"]

    res = client.get("/api/v1/portal/orders", headers=headers1)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert data["total"] >= 2

    # Tất cả đơn trả về đều phải thuộc cust1
    for o in data["items"]:
        assert o["customer_id"] == tracking_test_data["cust1_id"]

    # Đơn của cust2 không được xuất hiện
    order_ids = [o["id"] for o in data["items"]]
    assert tracking_test_data["order_cust2_id"] not in order_ids


def test_subtask_3_fields_status_expected_date_total(tracking_test_data):
    """
    Subtask 3: Danh sách đơn hiển thị đầy đủ trạng thái, ngày giao dự kiến và tổng tiền.
    """
    headers1 = tracking_test_data["headers1"]

    res = client.get("/api/v1/portal/orders", headers=headers1)
    assert res.status_code == 200
    items = res.json()["items"]

    # Tìm đơn 1
    ord1_data = next((x for x in items if x["id"] == tracking_test_data["order1_id"]), None)
    assert ord1_data is not None
    assert ord1_data["status"] == "shipping"
    assert ord1_data["expected_delivery_date"] == "2026-10-25"
    assert ord1_data["total"] == 1450000.0
    assert ord1_data["items_count"] == 2
    assert ord1_data["has_short_delivery"] is True


def test_subtask_1_detail_with_short_delivery(tracking_test_data):
    """
    Subtask 1: Chi tiết đơn hàng trả về chi tiết dòng hàng, đối chiếu số lượng đặt vs thực giao.
    Nhận diện chính xác trường hợp giao thiếu.
    """
    headers1 = tracking_test_data["headers1"]
    ord1_id = tracking_test_data["order1_id"]

    res = client.get(f"/api/v1/portal/orders/{ord1_id}", headers=headers1)
    assert res.status_code == 200
    detail = res.json()

    assert detail["id"] == ord1_id
    assert detail["code"] == tracking_test_data["order1_code"]
    assert detail["status"] == "shipping"
    assert detail["expected_delivery_date"] == "2026-10-25"
    assert detail["total"] == 1450000.0
    assert detail["has_short_delivery"] is True
    assert len(detail["items"]) == 2

    # Kiểm tra dòng 1: Giao đủ 10/10
    item1 = next((i for i in detail["items"] if i["sku"] == "SKU-BIA-HN"), None)
    assert item1 is not None
    assert item1["quantity"] == 10
    assert item1["delivered_quantity"] == 10
    assert item1["is_short_delivered"] is False
    assert item1["short_delivered_quantity"] == 0

    # Kiểm tra dòng 2: Giao thiếu (đặt 5, giao 3, thiếu 2)
    item2 = next((i for i in detail["items"] if i["sku"] == "SKU-RUOU-VANG"), None)
    assert item2 is not None
    assert item2["quantity"] == 5
    assert item2["delivered_quantity"] == 3
    assert item2["is_short_delivered"] is True
    assert item2["short_delivered_quantity"] == 2


def test_subtask_5_anti_idor_detail_forbidden(tracking_test_data):
    """
    Subtask 5: Đại lý 1 cố tình xem chi tiết đơn của Đại lý 2 -> Bị từ chối 403 Forbidden.
    """
    headers1 = tracking_test_data["headers1"]
    ord_cust2_id = tracking_test_data["order_cust2_id"]

    # Cust 1 cố gắng xem đơn của Cust 2
    res = client.get(f"/api/v1/portal/orders/{ord_cust2_id}", headers=headers1)
    assert res.status_code == 403
    assert "không có quyền" in res.json()["detail"].lower()


def test_status_filter_and_pagination(tracking_test_data):
    """
    Kiểm tra lọc theo trạng thái và phân trang danh sách đơn hàng.
    """
    headers1 = tracking_test_data["headers1"]

    # 1. Lọc chỉ đơn 'shipping'
    res_ship = client.get("/api/v1/portal/orders?status=shipping", headers=headers1)
    assert res_ship.status_code == 200
    for o in res_ship.json()["items"]:
        assert o["status"] == "shipping"

    # 2. Lọc chỉ đơn 'pending'
    res_pend = client.get("/api/v1/portal/orders?status=pending", headers=headers1)
    assert res_pend.status_code == 200
    for o in res_pend.json()["items"]:
        assert o["status"] == "pending"

    # 3. Phân trang
    res_page = client.get("/api/v1/portal/orders?page=1&limit=1", headers=headers1)
    assert res_page.status_code == 200
    assert len(res_page.json()["items"]) == 1
    assert res_page.json()["limit"] == 1
