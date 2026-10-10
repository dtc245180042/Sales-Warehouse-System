import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_assignment import CustomerAssignment
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.order import Order, OrderItem
from app.schemas.order import OrderItemCreate
from app.services.order_service import merge_items_anti_duplicate

client = TestClient(app)


def _get_headers_for_user(username: str, role: str, user_id: int):
    db = SessionLocal()
    user = db.query(User).filter_by(username=username).first()
    tv = user.token_version if user else 1
    db.close()
    token = tao_token_truy_cap({
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "role": role,
        "token_version": tv
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum236_fixture():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]

    # 1. Tạo 2 Sales Reps
    rep_assigned = User(
        username=f"rep_assigned_{uid}",
        email=f"assigned_{uid}@system.com",
        role=UserRole.SALES_REP.value,
        full_name=f"Sales Rep Phụ Trách {uid}",
        hashed_password="hashed_dummy_pw",
        is_active=True,
        token_version=1
    )
    rep_unassigned = User(
        username=f"rep_other_{uid}",
        email=f"other_{uid}@system.com",
        role=UserRole.SALES_REP.value,
        full_name=f"Sales Rep Khác {uid}",
        hashed_password="hashed_dummy_pw",
        is_active=True,
        token_version=1
    )
    admin_user = User(
        username=f"admin_{uid}",
        email=f"admin_{uid}@system.com",
        role=UserRole.ADMIN.value,
        full_name=f"Admin {uid}",
        hashed_password="hashed_dummy_pw",
        is_active=True,
        token_version=1
    )
    db.add_all([rep_assigned, rep_unassigned, admin_user])
    db.commit()
    db.refresh(rep_assigned)
    db.refresh(rep_unassigned)
    db.refresh(admin_user)


    # 2. Tạo Customer
    customer = Customer(
        id=f"CUS-236-{uid}",
        code=f"DL-236-{uid}",
        name=f"Đại Lý Bia Nước Ngọt {uid}",
        phone=f"0987{uid[:4]}",
        status="active",
        total_spent=50000000.0,
        total_orders=5
    )
    db.add(customer)
    db.commit()

    # 3. Phân công đại lý cho rep_assigned
    assignment = CustomerAssignment(
        customer_id=customer.id,
        assigned_staff_id=rep_assigned.id,
        assigned_by="admin"
    )
    db.add(assignment)
    db.commit()

    # 4. Tạo Sản phẩm thuộc 2 nhóm hàng khác nhau
    # Nhóm "Nước giải khát"
    prod_coke = Product(
        sku=f"SKU-COKE-{uid}",
        name="Nước ngọt Coca-Cola 330ml",
        category="Nước giải khát",
        unit="thùng",
        price=210000.0,
        cost_price=180000.0,
        status="ACTIVE"
    )
    prod_pepsi = Product(
        sku=f"SKU-PEPSI-{uid}",
        name="Nước ngọt Pepsi 330ml",
        category="Nước giải khát",
        unit="thùng",
        price=205000.0,
        cost_price=175000.0,
        status="ACTIVE"
    )
    # Nhóm "Bánh kẹo"
    prod_snack = Product(
        sku=f"SKU-SNACK-{uid}",
        name="Bánh Snack Oishi Tôm Cay",
        category="Bánh kẹo",
        unit="gói",
        price=12000.0,
        cost_price=8000.0,
        status="ACTIVE"
    )
    db.add_all([prod_coke, prod_pepsi, prod_snack])
    db.commit()
    db.refresh(prod_coke)
    db.refresh(prod_pepsi)
    db.refresh(prod_snack)

    # Tồn kho
    sp1 = ProductStockProfile(product_id=prod_coke.id, sku=prod_coke.sku, stock=150)
    sp2 = ProductStockProfile(product_id=prod_pepsi.id, sku=prod_pepsi.sku, stock=200)
    sp3 = ProductStockProfile(product_id=prod_snack.id, sku=prod_snack.sku, stock=500)
    db.add_all([sp1, sp2, sp3])
    db.commit()

    # 5. Tạo đơn hàng:
    now = datetime.now(timezone.utc)

    # Đơn 1: 10 ngày trước (trong 90 ngày) - Coke 10 thùng, Pepsi 5 thùng
    ord1 = Order(
        id=f"ORD-236-1-{uid}",
        code=f"DH-236-01-{uid}",
        customer_id=customer.id,
        customer_name=customer.name,
        subtotal=3125000.0,
        total=3125000.0,
        status="completed",
        created_at=now - timedelta(days=10)
    )
    db.add(ord1)
    db.flush()
    itm1_1 = OrderItem(order_id=ord1.id, product_id=str(prod_coke.id), sku=prod_coke.sku, name=prod_coke.name, unit="thùng", price=210000.0, quantity=10, subtotal=2100000.0)
    itm1_2 = OrderItem(order_id=ord1.id, product_id=str(prod_pepsi.id), sku=prod_pepsi.sku, name=prod_pepsi.name, unit="thùng", price=205000.0, quantity=5, subtotal=1025000.0)
    db.add_all([itm1_1, itm1_2])

    # Đơn 2: 30 ngày trước (trong 90 ngày) - Coke 20 thùng, Snack 50 gói
    ord2 = Order(
        id=f"ORD-236-2-{uid}",
        code=f"DH-236-02-{uid}",
        customer_id=customer.id,
        customer_name=customer.name,
        subtotal=4800000.0,
        total=4800000.0,
        status="confirmed",
        created_at=now - timedelta(days=30)
    )
    db.add(ord2)
    db.flush()
    itm2_1 = OrderItem(order_id=ord2.id, product_id=str(prod_coke.id), sku=prod_coke.sku, name=prod_coke.name, unit="thùng", price=210000.0, quantity=20, subtotal=4200000.0)
    itm2_2 = OrderItem(order_id=ord2.id, product_id=str(prod_snack.id), sku=prod_snack.sku, name=prod_snack.name, unit="gói", price=12000.0, quantity=50, subtotal=600000.0)
    db.add_all([itm2_1, itm2_2])

    # Đơn 3: Đã hủy (status = cancelled, 5 ngày trước) -> KHÔNG ĐƯỢC TÍNH VÀO LỊCH SỬ
    ord_cancelled = Order(
        id=f"ORD-236-C-{uid}",
        code=f"DH-236-C-{uid}",
        customer_id=customer.id,
        customer_name=customer.name,
        subtotal=2100000.0,
        total=2100000.0,
        status="cancelled",
        created_at=now - timedelta(days=5)
    )
    db.add(ord_cancelled)
    db.flush()
    itm_c = OrderItem(order_id=ord_cancelled.id, product_id=str(prod_coke.id), sku=prod_coke.sku, name=prod_coke.name, unit="thùng", price=210000.0, quantity=99, subtotal=20790000.0)
    db.add(itm_c)

    # Đơn 4: Đơn nháp (status = draft, 2 ngày trước) -> KHÔNG ĐƯỢC TÍNH VÀO LỊCH SỬ
    ord_draft = Order(
        id=f"ORD-236-D-{uid}",
        code=f"DH-236-D-{uid}",
        customer_id=customer.id,
        customer_name=customer.name,
        subtotal=2100000.0,
        total=2100000.0,
        status="draft",
        created_at=now - timedelta(days=2)
    )
    db.add(ord_draft)
    db.flush()
    itm_d = OrderItem(order_id=ord_draft.id, product_id=str(prod_coke.id), sku=prod_coke.sku, name=prod_coke.name, unit="thùng", price=210000.0, quantity=50, subtotal=10500000.0)
    db.add(itm_d)

    # Đơn 5: Đơn quá hạn 90 ngày (120 ngày trước) -> KHÔNG ĐƯỢC TÍNH VÀO LỊCH SỬ 90 NGÀY
    ord_old = Order(
        id=f"ORD-236-OLD-{uid}",
        code=f"DH-236-OLD-{uid}",
        customer_id=customer.id,
        customer_name=customer.name,
        subtotal=2100000.0,
        total=2100000.0,
        status="completed",
        created_at=now - timedelta(days=120)
    )
    db.add(ord_old)
    db.flush()
    itm_old = OrderItem(order_id=ord_old.id, product_id=str(prod_coke.id), sku=prod_coke.sku, name=prod_coke.name, unit="thùng", price=210000.0, quantity=80, subtotal=16800000.0)
    db.add(itm_old)

    db.commit()

    yield {
        "uid": uid,
        "rep_assigned": rep_assigned,
        "rep_unassigned": rep_unassigned,
        "admin_user": admin_user,
        "customer": customer,
        "prod_coke": prod_coke,
        "prod_pepsi": prod_pepsi,
        "prod_snack": prod_snack,
    }

    db.close()


def test_scope_guard_unassigned_sales_rep_forbidden(scrum236_fixture):
    """Subtask 8 & 22: Sales Rep không được phân công bị chặn 403 Forbidden."""
    unassigned = scrum236_fixture["rep_unassigned"]
    cust = scrum236_fixture["customer"]

    headers = _get_headers_for_user(unassigned.username, UserRole.SALES_REP.value, unassigned.id)
    res = client.get(f"/api/v1/orders/suggestions/{cust.id}", headers=headers)
    assert res.status_code == 403
    assert "không được phân công quản lý" in res.json()["detail"]


def test_scope_guard_assigned_sales_rep_allowed(scrum236_fixture):
    """Subtask 8: Sales Rep được phân công đại lý xem thành công gợi ý lịch sử mua hàng."""
    assigned = scrum236_fixture["rep_assigned"]
    cust = scrum236_fixture["customer"]

    headers = _get_headers_for_user(assigned.username, UserRole.SALES_REP.value, assigned.id)
    res = client.get(f"/api/v1/orders/suggestions/{cust.id}", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["customerId"] == cust.id
    assert data["hasPurchaseHistory"] is True
    assert data["totalOrdersInWindow"] == 2  # Chỉ có 2 đơn hợp lệ trong 90 ngày (đơn 1 và đơn 2)


def test_admin_can_view_suggestions_for_any_customer(scrum236_fixture):
    """Admin có quyền xem gợi ý lịch sử của bất kỳ đại lý nào."""
    admin = scrum236_fixture["admin_user"]
    cust = scrum236_fixture["customer"]

    headers = _get_headers_for_user(admin.username, UserRole.ADMIN.value, admin.id)
    res = client.get(f"/api/v1/orders/suggestions/{cust.id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["customerId"] == cust.id


def test_90_days_filter_and_excluded_status(scrum236_fixture):
    """Subtask 12: Đơn quá 90 ngày, đơn hủy và đơn nháp bị loại bỏ khỏi thống kê."""
    assigned = scrum236_fixture["rep_assigned"]
    cust = scrum236_fixture["customer"]
    coke = scrum236_fixture["prod_coke"]

    headers = _get_headers_for_user(assigned.username, UserRole.SALES_REP.value, assigned.id)
    res = client.get(f"/api/v1/orders/suggestions/{cust.id}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    # Tìm sản phẩm Coke
    coke_sug = next(i for i in data["items"] if str(i["productId"]) == str(coke.id))
    # Coke chỉ xuất hiện trong 2 đơn hợp lệ (10 thùng ở đơn 1, 20 thùng ở đơn 2)
    # Không tính 99 thùng đơn hủy, 50 thùng đơn nháp, 80 thùng đơn 120 ngày trước!
    assert coke_sug["totalQuantity"] == 30
    assert coke_sug["orderCount"] == 2


def test_average_quantity_calculation(scrum236_fixture):
    """Subtask 16: Tính số lượng bình quân avg_quantity = round(total_qty / total_orders, 1)."""
    assigned = scrum236_fixture["rep_assigned"]
    cust = scrum236_fixture["customer"]
    coke = scrum236_fixture["prod_coke"]
    pepsi = scrum236_fixture["prod_pepsi"]
    snack = scrum236_fixture["prod_snack"]

    headers = _get_headers_for_user(assigned.username, UserRole.SALES_REP.value, assigned.id)
    res = client.get(f"/api/v1/orders/suggestions/{cust.id}", headers=headers)
    assert res.status_code == 200
    items = {str(i["productId"]): i for i in res.json()["items"]}

    # Coke: 30 thùng trong 2 đơn -> avg = 30 / 2 = 15.0 thùng
    assert items[str(coke.id)]["avgQuantity"] == 15.0
    assert items[str(coke.id)]["lastQuantity"] == 10  # Đơn gần nhất (10 ngày trước) là 10 thùng

    # Pepsi: 5 thùng trong 1 đơn -> avg = 5.0
    assert items[str(pepsi.id)]["avgQuantity"] == 5.0
    assert items[str(pepsi.id)]["lastQuantity"] == 5

    # Snack: 50 gói trong 1 đơn -> avg = 50.0
    assert items[str(snack.id)]["avgQuantity"] == 50.0


def test_category_grouping_structure(scrum236_fixture):
    """Subtask 12: Gom nhóm theo danh mục sản phẩm (groups by category)."""
    assigned = scrum236_fixture["rep_assigned"]
    cust = scrum236_fixture["customer"]

    headers = _get_headers_for_user(assigned.username, UserRole.SALES_REP.value, assigned.id)
    res = client.get(f"/api/v1/orders/suggestions/{cust.id}", headers=headers)
    assert res.status_code == 200
    groups = res.json()["groups"]

    group_names = [g["category"] for g in groups]
    assert "Nước giải khát" in group_names
    assert "Bánh kẹo" in group_names

    drink_group = next(g for g in groups if g["category"] == "Nước giải khát")
    # Nước giải khát có 2 sản phẩm: Coke và Pepsi
    assert drink_group["itemCount"] == 2
    # Tổng suggested quantity = 15.0 (Coke) + 5.0 (Pepsi) = 20.0
    assert drink_group["totalSuggestedQuantity"] == 20.0

    snack_group = next(g for g in groups if g["category"] == "Bánh kẹo")
    assert snack_group["itemCount"] == 1
    assert snack_group["totalSuggestedQuantity"] == 50.0


def test_last_order_summary(scrum236_fixture):
    """Kiểm tra thông tin đơn hàng gần nhất (Last Order) để hỗ trợ tính năng 'Thêm lại đơn gần nhất'."""
    assigned = scrum236_fixture["rep_assigned"]
    cust = scrum236_fixture["customer"]

    headers = _get_headers_for_user(assigned.username, UserRole.SALES_REP.value, assigned.id)
    res = client.get(f"/api/v1/orders/suggestions/{cust.id}", headers=headers)
    assert res.status_code == 200
    last_order = res.json()["lastOrder"]
    assert last_order is not None
    assert "DH-236-01" in last_order["code"]  # Đơn 10 ngày trước
    assert len(last_order["items"]) == 2


def test_anti_duplicate_merging_service_and_endpoint(scrum236_fixture):
    """Subtask 10: Quy tắc chống trùng dòng khi thêm sản phẩm/nhóm hàng vào đơn hiện tại."""
    coke = scrum236_fixture["prod_coke"]
    pepsi = scrum236_fixture["prod_pepsi"]

    current_items = [
        OrderItemCreate(
            product_id=str(coke.id),
            sku=coke.sku,
            name=coke.name,
            unit="thùng",
            price=210000.0,
            quantity=5,
            subtotal=1050000.0
        )
    ]

    items_to_add = [
        OrderItemCreate(
            product_id=str(coke.id),
            sku=coke.sku,
            name=coke.name,
            unit="thùng",
            price=210000.0,
            quantity=15,  # Bình quân là 15
            subtotal=3150000.0
        ),
        OrderItemCreate(
            product_id=str(pepsi.id),
            sku=pepsi.sku,
            name=pepsi.name,
            unit="thùng",
            price=205000.0,
            quantity=5,
            subtotal=1025000.0
        )
    ]

    # Test hàm service trực tiếp (merge strategy: cộng dồn)
    merged = merge_items_anti_duplicate(current_items, items_to_add, strategy="merge")
    assert len(merged) == 2  # Không bị 3 dòng! Vẫn chỉ có 2 dòng
    coke_merged = next(i for i in merged if str(i.product_id) == str(coke.id))
    assert coke_merged.quantity == 20  # 5 + 15 = 20
    assert coke_merged.subtotal == 4200000.0

    # Test qua endpoint POST /api/v1/orders/suggestions/merge-items
    payload = {
        "current_items": [i.model_dump() for i in current_items],
        "items_to_add": [i.model_dump() for i in items_to_add],
        "strategy": "merge"
    }
    res = client.post("/api/v1/orders/suggestions/merge-items", json=payload)
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["merged_count"] == 1  # 1 dòng Coke được hợp nhất
    assert res_data["added_count"] == 1   # 1 dòng Pepsi được thêm mới
    assert len(res_data["items"]) == 2
