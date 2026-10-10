import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_delivery_address import CustomerDeliveryAddress
from app.models.customer_assignment import CustomerAssignment
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
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
def copy_test_data():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]

    # 1. Tạo users
    admin_user = User(
        username=f"admin_copy_{uid}",
        email=f"admin_copy_{uid}@example.com",
        hashed_password="pw",
        full_name=f"Admin Copy {uid}",
        role=UserRole.ADMIN.value,
        token_version=1
    )
    sales_rep_1 = User(
        username=f"rep1_copy_{uid}",
        email=f"rep1_copy_{uid}@example.com",
        hashed_password="pw",
        full_name=f"Sales Rep 1 {uid}",
        role=UserRole.SALES_REP.value,
        token_version=1
    )
    sales_rep_2 = User(
        username=f"rep2_copy_{uid}",
        email=f"rep2_copy_{uid}@example.com",
        hashed_password="pw",
        full_name=f"Sales Rep 2 {uid}",
        role=UserRole.SALES_REP.value,
        token_version=1
    )
    warehouse_user = User(
        username=f"wh_copy_{uid}",
        email=f"wh_copy_{uid}@example.com",
        hashed_password="pw",
        full_name=f"Warehouse Staff {uid}",
        role=UserRole.WAREHOUSE.value,
        token_version=1
    )
    db.add_all([admin_user, sales_rep_1, sales_rep_2, warehouse_user])
    db.commit()

    # 2. Khách hàng đại lý
    customer = Customer(
        id=f"CUS-CPY-{uid}",
        code=f"DL-CPY-{uid}",
        name=f"Đại Lý Copy {uid}",
        phone=f"0988{uid[:4]}",
        status="active",
        total_spent=0.0,
        total_orders=0
    )
    db.add(customer)
    db.commit()

    # Phân công đại lý cho sales_rep_1 (nhưng KHÔNG cho sales_rep_2)
    assign = CustomerAssignment(
        customer_id=customer.id,
        assigned_staff_id=sales_rep_1.id
    )
    from app.models.customer_credit_profile import CustomerCreditProfile
    credit_prof = CustomerCreditProfile(
        customer_id=customer.id,
        credit_limit=50_000_000,
        current_debt=0,
        max_debt_days=30
    )
    db.add_all([assign, credit_prof])
    db.commit()

    # 3. Sản phẩm
    prod1 = Product(
        name=f"Sản Phẩm A {uid}",
        sku=f"SKU-A-{uid}",
        price=100000.0,
        unit="hộp",
        status="active"
    )
    prod2 = Product(
        name=f"Sản Phẩm B {uid}",
        sku=f"SKU-B-{uid}",
        price=200000.0,
        unit="thùng",
        status="active"
    )
    db.add_all([prod1, prod2])
    db.commit()

    # Tồn kho
    sp1 = ProductStockProfile(product_id=prod1.id, sku=prod1.sku, stock=50, min_stock=5)
    sp2 = ProductStockProfile(product_id=prod2.id, sku=prod2.sku, stock=50, min_stock=5)
    db.add_all([sp1, sp2])
    db.commit()

    # 4. Đơn hàng gốc đã hoàn tất
    source_order_id = f"ORD-SRC-{uid}"
    source_order_code = f"DH-SRC-{uid}"
    source_order = Order(
        id=source_order_id,
        code=source_order_code,
        customer_id=customer.id,
        customer_name=customer.name,
        customer_phone=customer.phone,
        customer_address="123 Nguyễn Huệ, Q1, TP.HCM",
        subtotal=400000.0,
        discount=0.0,
        total=400000.0,
        paid_amount=400000.0,
        change_amount=0.0,
        payment_method="transfer",
        payment_status="paid",
        status="completed",
        staff_id=str(sales_rep_1.id),
        staff_name=sales_rep_1.full_name,
        note="Giao vào buổi sáng",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    item1 = OrderItem(
        order_id=source_order_id,
        product_id=str(prod1.id),
        sku=prod1.sku,
        name=prod1.name,
        unit="hộp",
        price=100000.0,
        quantity=2,
        discount=0.0,
        subtotal=200000.0
    )
    item2 = OrderItem(
        order_id=source_order_id,
        product_id=str(prod2.id),
        sku=prod2.sku,
        name=prod2.name,
        unit="thùng",
        price=200000.0,
        quantity=1,
        discount=0.0,
        subtotal=200000.0
    )
    source_order.items.extend([item1, item2])
    db.add(source_order)
    db.commit()

    # Profile giao hàng của đơn gốc
    del_prof = OrderDeliveryProfile(
        order_id=source_order.id,
        delivery_address="123 Nguyễn Huệ, Q1, TP.HCM",
        delivery_receiver_name="Người nhận A",
        delivery_phone="0911223344",
        delivery_notes="Giao trước 11h",
        expected_delivery_date="2026-01-01"
    )
    db.add(del_prof)
    db.commit()

    data = {
        "admin_user": admin_user,
        "sales_rep_1": sales_rep_1,
        "sales_rep_2": sales_rep_2,
        "warehouse_user": warehouse_user,
        "customer": customer,
        "prod1": prod1,
        "prod2": prod2,
        "sp1": sp1,
        "sp2": sp2,
        "source_order": source_order,
    }
    yield data
    db.close()


def test_copy_order_success_as_draft(copy_test_data):
    """SCRUM-621, 624, 625: Sao chép đơn thành công sang đơn nháp mới, reset thanh toán và không trừ kho."""
    headers = _get_headers_for_user(copy_test_data["sales_rep_1"])
    order_id = copy_test_data["source_order"].id

    initial_stock_1 = copy_test_data["sp1"].stock
    initial_stock_2 = copy_test_data["sp2"].stock

    res = client.post(f"/api/v1/orders/{order_id}/copy", headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()

    assert "order" in data
    order = data["order"]

    # 1. Bản sao ở trạng thái draft
    assert order["status"] == "draft"

    # 2. Sinh mã mới và id mới khác đơn cũ
    assert order["id"] != order_id
    assert order["code"] != copy_test_data["source_order"].code

    # 3. Reset thanh toán
    assert order["paidAmount"] == 0.0
    assert order["paymentStatus"] == "unpaid"

    # 4. Truy vết đơn gốc
    assert order["copiedFromOrderId"] == order_id
    assert "[Sao chép từ đơn" in order["note"]

    # 5. Profile giao hàng độc lập, reset expectedDeliveryDate
    assert order["expectedDeliveryDate"] is None
    assert order["deliveryReceiverName"] == "Người nhận A"

    # 6. Không trừ tồn kho khi sao chép
    db = SessionLocal()
    sp1 = db.query(ProductStockProfile).filter_by(product_id=copy_test_data["prod1"].id).first()
    sp2 = db.query(ProductStockProfile).filter_by(product_id=copy_test_data["prod2"].id).first()
    assert sp1.stock == initial_stock_1
    assert sp2.stock == initial_stock_2
    db.close()


def test_copy_order_repricing(copy_test_data):
    """SCRUM-622: Giá đơn cũ 100k, cập nhật giá sản phẩm lên 150k -> đơn sao chép tính giá 150k."""
    db = SessionLocal()
    prod1 = db.query(Product).filter_by(id=copy_test_data["prod1"].id).first()
    prod1.price = 150000.0  # Tăng giá từ 100k lên 150k
    db.commit()
    db.close()

    headers = _get_headers_for_user(copy_test_data["sales_rep_1"])
    order_id = copy_test_data["source_order"].id

    res = client.post(f"/api/v1/orders/{order_id}/copy", headers=headers)
    assert res.status_code == 201
    order = res.json()["order"]

    # Tìm item sản phẩm 1 trong đơn mới
    item1 = next(it for it in order["items"] if it["productId"] == str(copy_test_data["prod1"].id))
    assert item1["price"] == 150000.0
    assert item1["quantity"] == 2
    assert item1["subtotal"] == 300000.0  # 150k * 2


def test_copy_order_filters_inactive_product(copy_test_data):
    """Sản phẩm ngừng bán (inactive) bị loại bỏ khỏi đơn nháp mới kèm warnings."""
    db = SessionLocal()
    prod2 = db.query(Product).filter_by(id=copy_test_data["prod2"].id).first()
    prod2.status = "inactive"  # Ngừng kinh doanh
    db.commit()
    db.close()

    headers = _get_headers_for_user(copy_test_data["sales_rep_1"])
    order_id = copy_test_data["source_order"].id

    res = client.post(f"/api/v1/orders/{order_id}/copy", headers=headers)
    assert res.status_code == 201
    data = res.json()

    order = data["order"]
    warnings = data["warnings"]

    # Đơn chỉ còn sản phẩm A
    assert len(order["items"]) == 1
    assert order["items"][0]["productId"] == str(copy_test_data["prod1"].id)

    # Có cảnh báo cho sản phẩm B
    assert len(warnings) > 0
    assert copy_test_data["prod2"].name in warnings[0]


def test_copy_order_fails_when_all_products_inactive(copy_test_data):
    """Nếu tất cả sản phẩm đều ngừng kinh doanh -> trả 400."""
    db = SessionLocal()
    prod1 = db.query(Product).filter_by(id=copy_test_data["prod1"].id).first()
    prod2 = db.query(Product).filter_by(id=copy_test_data["prod2"].id).first()
    prod1.status = "inactive"
    prod2.status = "inactive"
    db.commit()
    db.close()

    headers = _get_headers_for_user(copy_test_data["sales_rep_1"])
    order_id = copy_test_data["source_order"].id

    res = client.post(f"/api/v1/orders/{order_id}/copy", headers=headers)
    assert res.status_code == 400
    assert "ngừng kinh doanh" in res.json()["detail"]


def test_copy_order_rbac_and_customer_scope(copy_test_data):
    """Kiểm tra phân quyền: Warehouse bị 403, Sales Rep ngoài phạm vi đại lý bị 403."""
    order_id = copy_test_data["source_order"].id

    # 1. Role Warehouse gọi copy -> 403
    wh_headers = _get_headers_for_user(copy_test_data["warehouse_user"])
    res_wh = client.post(f"/api/v1/orders/{order_id}/copy", headers=wh_headers)
    assert res_wh.status_code == 403

    # 2. Sales Rep 2 không được phân công đại lý này -> 403
    rep2_headers = _get_headers_for_user(copy_test_data["sales_rep_2"])
    res_rep2 = client.post(f"/api/v1/orders/{order_id}/copy", headers=rep2_headers)
    assert res_rep2.status_code == 403

    # 3. Admin sao chép đơn -> thành công
    admin_headers = _get_headers_for_user(copy_test_data["admin_user"])
    res_admin = client.post(f"/api/v1/orders/{order_id}/copy", headers=admin_headers)
    assert res_admin.status_code == 201


def test_submit_copied_draft_order_deducts_stock(copy_test_data):
    """Sau khi sao chép sang draft, khi NVKD bấm Submit chốt đơn thì mới trừ kho."""
    headers = _get_headers_for_user(copy_test_data["sales_rep_1"])
    order_id = copy_test_data["source_order"].id

    res_copy = client.post(f"/api/v1/orders/{order_id}/copy", headers=headers)
    assert res_copy.status_code == 201
    new_draft_id = res_copy.json()["order"]["id"]

    # Chốt đơn nháp
    res_submit = client.post(f"/api/v1/orders/{new_draft_id}/submit", headers=headers)
    assert res_submit.status_code == 200
    submitted_order = res_submit.json()
    assert submitted_order["status"] == "pending"

    # Kiểm tra kho đã được trừ
    db = SessionLocal()
    sp1 = db.query(ProductStockProfile).filter_by(product_id=copy_test_data["prod1"].id).first()
    assert sp1.stock == 48  # 50 - 2
    db.close()
