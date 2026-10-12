import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User
from app.models.customer import Customer
from app.models.customer_assignment import CustomerAssignment
from app.models.product import Product
from app.models.order import Order, OrderItem

client = TestClient(app)


def _get_auth_headers(username="sales_rep_s404", role="SalesRep", user_id=9876):
    db = SessionLocal()
    user = db.query(User).filter_by(username=username).first()
    if not user:
        user = User(
            id=user_id,
            username=username,
            email=f"{username}@example.com",
            hashed_password="pw",
            role=role,
            is_active=True,
            token_version=1
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    tv = user.token_version
    uid = user.id
    db.close()
    token = tao_token_truy_cap({
        "sub": str(uid),
        "user_id": uid,
        "username": username,
        "role": role,
        "token_version": tv
    })
    return {"Authorization": f"Bearer {token}"}, uid


@pytest.fixture
def s4_04_fixtures():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # 1. Tạo đại lý
    customer = Customer(
        id=f"CUS-S404-{uid}",
        code=f"DL-S404-{uid}",
        name=f"Đại Lý Phụ Kiện S404 {uid}",
        phone=f"0977{uid[:4]}",
        status="active",
        total_spent=0.0,
        total_orders=0
    )
    db.add(customer)

    # 2. Tạo sản phẩm công nghệ
    prod1 = Product(
        id=f"PRD-S404-{uid}-1",
        sku=f"SKU-S404-{uid}-1",
        name="Cáp sạc Baseus Type-C 100W",
        category="Củ sạc, Cáp sạc & Trạm sạc",
        unit="Chiếc",
        price=150000.0,
        status="active"
    )
    prod2 = Product(
        id=f"PRD-S404-{uid}-2",
        sku=f"SKU-S404-{uid}-2",
        name="Củ sạc nhanh Anker 65W GaN",
        category="Củ sạc, Cáp sạc & Trạm sạc",
        unit="Chiếc",
        price=650000.0,
        status="active"
    )
    db.add_all([prod1, prod2])
    db.commit()

    # 3. Tạo đơn hàng 1 (cách đây 20 ngày, hợp lệ trong 90 ngày)
    order1 = Order(
        id=f"ORD-S404-{uid}-1",
        code=f"DH-S404-{uid}-1",
        customer_id=customer.id,
        customer_name=customer.name,
        customer_phone=customer.phone,
        total=1500000.0,
        status="confirmed",
        created_at=now - timedelta(days=20)
    )
    db.add(order1)
    db.flush()

    item1_1 = OrderItem(
        order_id=order1.id,
        product_id=prod1.id,
        sku=prod1.sku,
        name=prod1.name,
        unit="Chiếc",
        price=150000.0,
        quantity=10,
        discount=0.0,
        subtotal=1500000.0
    )
    db.add(item1_1)

    # 4. Tạo đơn hàng 2 (cách đây 40 ngày, hợp lệ trong 90 ngày)
    order2 = Order(
        id=f"ORD-S404-{uid}-2",
        code=f"DH-S404-{uid}-2",
        customer_id=customer.id,
        customer_name=customer.name,
        customer_phone=customer.phone,
        total=1300000.0,
        status="completed",
        created_at=now - timedelta(days=40)
    )
    db.add(order2)
    db.flush()

    item2_1 = OrderItem(
        order_id=order2.id,
        product_id=prod1.id,
        sku=prod1.sku,
        name=prod1.name,
        unit="Chiếc",
        price=150000.0,
        quantity=20,
        discount=0.0,
        subtotal=3000000.0
    )
    item2_2 = OrderItem(
        order_id=order2.id,
        product_id=prod2.id,
        sku=prod2.sku,
        name=prod2.name,
        unit="Chiếc",
        price=650000.0,
        quantity=5,
        discount=0.0,
        subtotal=3250000.0
    )
    db.add_all([item2_1, item2_2])

    # 5. Tạo đơn hàng 3 (cách đây 120 ngày > 90 ngày, KHÔNG ĐƯỢC TÍNH)
    order3_old = Order(
        id=f"ORD-S404-{uid}-OLD",
        code=f"DH-S404-{uid}-OLD",
        customer_id=customer.id,
        customer_name=customer.name,
        customer_phone=customer.phone,
        total=500000.0,
        status="completed",
        created_at=now - timedelta(days=120)
    )
    db.add(order3_old)
    db.commit()

    cust_id = str(customer.id)
    p1_id = str(prod1.id)
    p1_sku = str(prod1.sku)
    p2_id = str(prod2.id)
    p2_sku = str(prod2.sku)

    db.close()

    yield {
        "customer_id": cust_id,
        "prod1_id": p1_id,
        "prod1_sku": p1_sku,
        "prod2_id": p2_id,
        "prod2_sku": p2_sku,
        "now": now
    }

    # Cleanup
    db_clean = SessionLocal()
    db_clean.query(OrderItem).filter(OrderItem.order_id.in_([f"ORD-S404-{uid}-1", f"ORD-S404-{uid}-2", f"ORD-S404-{uid}-OLD"])).delete()
    db_clean.query(Order).filter(Order.customer_id == customer.id).delete()
    db_clean.query(CustomerAssignment).filter(CustomerAssignment.customer_id == customer.id).delete()
    db_clean.query(Product).filter(Product.id.in_([prod1.id, prod2.id])).delete()
    db_clean.query(Customer).filter(Customer.id == customer.id).delete()
    db_clean.commit()
    db_clean.close()


def test_s4_04_suggestions_within_90_days_and_avg_quantity(s4_04_fixtures):
    """
    AC-1: Hiển thị các mặt hàng đại lý đã mua trong 3 tháng gần nhất kèm số lượng bình quân (avg_quantity).
    - Sản phẩm 1 mua 2 lần: lần 1 (10 cái), lần 2 (20 cái) -> Tổng = 30, Số đơn = 2 -> Bình quân = 15.0
    - Sản phẩm 2 mua 1 lần: 5 cái -> Bình quân = 5.0
    - Đơn cách đây 120 ngày không được tính vào kết quả.
    """
    cust_id = s4_04_fixtures["customer_id"]
    headers, staff_id = _get_auth_headers(username="rep_assigned", role="SalesRep")

    # Phân công đại lý cho staff này (AC-3)
    db = SessionLocal()
    assign = CustomerAssignment(
        customer_id=cust_id,
        assigned_staff_id=staff_id
    )
    db.add(assign)
    db.commit()
    db.close()

    res = client.get(f"/api/v1/orders/suggestions/{cust_id}", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["customer_id"] == cust_id
    assert data["time_window_days"] == 90
    assert data["total_orders_in_window"] == 2  # 2 đơn trong 90 ngày, bỏ qua đơn 120 ngày
    assert data["has_purchase_history"] is True

    items = data["items"]
    assert len(items) == 2

    prod1_stat = next((it for it in items if it["sku"] == s4_04_fixtures["prod1_sku"]), None)
    assert prod1_stat is not None
    assert prod1_stat["total_quantity"] == 30
    assert prod1_stat["order_count"] == 2
    assert prod1_stat["avg_quantity"] == 15.0

    prod2_stat = next((it for it in items if it["sku"] == s4_04_fixtures["prod2_sku"]), None)
    assert prod2_stat is not None
    assert prod2_stat["total_quantity"] == 5
    assert prod2_stat["order_count"] == 1
    assert prod2_stat["avg_quantity"] == 5.0


def test_s4_04_scope_guard_unassigned_sales_rep_blocked(s4_04_fixtures):
    """
    AC-3: Sales Rep chỉ xem được lịch sử của đại lý mình phụ trách.
    Nếu không được phân công -> Chặn 403 Forbidden.
    """
    cust_id = s4_04_fixtures["customer_id"]
    headers, _ = _get_auth_headers(username="rep_unassigned", role="SalesRep", user_id=9999)

    res = client.get(f"/api/v1/orders/suggestions/{cust_id}", headers=headers)
    assert res.status_code == 403
    assert "không được phân công" in res.json()["detail"]


def test_s4_04_merge_items_anti_duplicate(s4_04_fixtures):
    """
    AC-2: Thêm nhanh nhóm hàng vào đơn mới, áp dụng quy tắc chống trùng dòng (anti-duplicate).
    Nếu sản phẩm đã có trong đơn, cộng dồn số lượng.
    """
    p1_id = s4_04_fixtures["prod1_id"]
    p1_sku = s4_04_fixtures["prod1_sku"]
    p2_id = s4_04_fixtures["prod2_id"]
    p2_sku = s4_04_fixtures["prod2_sku"]

    merge_payload = {
        "current_items": [
            {
                "product_id": p1_id,
                "sku": p1_sku,
                "name": "Cáp Baseus",
                "price": 150000.0,
                "quantity": 2,
                "discount": 0.0,
                "subtotal": 300000.0
            }
        ],
        "items_to_add": [
            {
                "product_id": p1_id,
                "sku": p1_sku,
                "name": "Cáp Baseus",
                "price": 150000.0,
                "quantity": 15,  # Bình quân
                "discount": 0.0,
                "subtotal": 2250000.0
            },
            {
                "product_id": p2_id,
                "sku": p2_sku,
                "name": "Củ sạc Anker",
                "price": 650000.0,
                "quantity": 5,
                "discount": 0.0,
                "subtotal": 3250000.0
            }
        ],
        "strategy": "merge"
    }

    res = client.post("/api/v1/orders/suggestions/merge-items", json=merge_payload)
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["merged_count"] == 1  # p1 được cộng dồn
    assert data["added_count"] == 1   # p2 được thêm mới
    items = data["items"]
    assert len(items) == 2

    p1_res = next(i for i in items if str(i["product_id"]) == str(p1_id))
    assert p1_res["quantity"] == 17  # 2 + 15 = 17
    assert p1_res["subtotal"] == 17 * 150000.0
