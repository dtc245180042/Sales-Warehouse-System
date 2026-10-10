import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_delivery_address import CustomerDeliveryAddress
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.customer_assignment import CustomerAssignment
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.price_list import PriceList, PriceListItem
from app.models.order import Order, OrderItem
from app.models.portal_idempotency import PortalIdempotencyRecord

client = TestClient(app)


def _get_headers_for_user(user: User, idempotency_key: str = None):
    token = tao_token_truy_cap({
        "sub": user.username,
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "token_version": user.token_version or 1
    })
    headers = {"Authorization": f"Bearer {token}"}
    if idempotency_key:
        headers["X-Idempotency-Key"] = idempotency_key
    return headers


@pytest.fixture
def portal_test_data():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]

    # 1. Tạo 2 đại lý (Customer A và Customer B)
    cust_a = Customer(
        id=f"CUST-A-{uid}",
        code=f"DL-A-{uid}",
        name=f"Đại Lý A {uid}",
        phone=f"0911{uid[:6]}",
        customer_group="WHOLESALE_A",
        status="active"
    )
    cust_b = Customer(
        id=f"CUST-B-{uid}",
        code=f"DL-B-{uid}",
        name=f"Đại Lý B {uid}",
        phone=f"0922{uid[:6]}",
        customer_group="WHOLESALE_B",
        status="active"
    )
    db.add_all([cust_a, cust_b])
    db.flush()

    # 2. Tạo User đăng nhập cho Đại lý A và Đại lý B
    user_a = User(
        username=f"cust_user_a_{uid}",
        email=f"user_a_{uid}@portal.local",
        hashed_password="pw",
        role=UserRole.CUSTOMER.value,
        customer_id=cust_a.id,
        token_version=1,
        is_active=True
    )
    user_b = User(
        username=f"cust_user_b_{uid}",
        email=f"user_b_{uid}@portal.local",
        hashed_password="pw",
        role=UserRole.CUSTOMER.value,
        customer_id=cust_b.id,
        token_version=1,
        is_active=True
    )
    db.add_all([user_a, user_b])
    db.flush()

    # 3. Tạo địa chỉ giao hàng cho A và B
    addr_a = CustomerDeliveryAddress(
        customer_id=cust_a.id,
        name="Kho Số 1 Đại Lý A",
        receiver_name="Nguyễn Văn A",
        phone="0911000111",
        address="123 Đường Số 1, Quận 1, TP. HCM",
        is_default=True,
        status="active"
    )
    addr_b = CustomerDeliveryAddress(
        customer_id=cust_b.id,
        name="Kho Chi Nhánh Đại Lý B",
        receiver_name="Trần Văn B",
        phone="0922000222",
        address="456 Đường Số 2, Quận 2, TP. HCM",
        is_default=True,
        status="active"
    )
    db.add_all([addr_a, addr_b])
    db.flush()

    # 4. Tạo hồ sơ công nợ cho A: Hạn mức 20,000,000 đ
    credit_a = CustomerCreditProfile(
        customer_id=cust_a.id,
        credit_limit=20000000,
        current_debt=0,
        max_debt_days=30,
        updated_by="system"
    )
    db.add(credit_a)
    db.flush()

    # 5. Tạo 2 sản phẩm: PRD-IN (có trong bảng giá), PRD-OUT (không có trong bảng giá)
    p_in = Product(
        name=f"Bia Lon Hà Nội {uid}",
        sku=f"BIA-IN-{uid}",
        unit="thùng",
        price=300000,
        status="active"
    )
    p_out = Product(
        name=f"Rượu Ngoại Cao Cấp {uid}",
        sku=f"RUOU-OUT-{uid}",
        unit="chai",
        price=2000000,
        status="active"
    )
    db.add_all([p_in, p_out])
    db.flush()

    # Tạo tồn kho
    sp_in = ProductStockProfile(product_id=p_in.id, sku=p_in.sku, stock=50, min_stock=10)
    sp_out = ProductStockProfile(product_id=p_out.id, sku=p_out.sku, stock=5, min_stock=2)
    db.add_all([sp_in, sp_out])
    db.flush()

    # 6. Tạo Bảng giá cho nhóm WHOLESALE_A: Chỉ chứa p_in với giá 250,000 đ
    now = datetime.now(timezone.utc)
    plist_a = PriceList(
        code=f"BG-WS-A-{uid}",
        name=f"Bảng Giá Bán Sỉ Nhóm A {uid}",
        customer_group="WHOLESALE_A",
        status="APPROVED",
        version=1,
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=365),
    )
    db.add(plist_a)
    db.flush()

    pli_in = PriceListItem(
        price_list_id=plist_a.id,
        product_id=str(p_in.id),
        product_sku=p_in.sku,
        product_name=p_in.name,
        unit=p_in.unit or "thùng",
        listed_price=300000.0,
        floor_price=200000.0,
        sale_price=250000.0,
    )
    db.add(pli_in)

    # 7. Phân công NVKD cho Đại lý A
    sales_rep = User(
        username=f"rep_{uid}",
        email=f"rep_{uid}@warehouse.local",
        hashed_password="pw",
        role=UserRole.SALES_REP.value,
        token_version=1
    )
    db.add(sales_rep)
    db.flush()

    assignment_a = CustomerAssignment(
        customer_id=cust_a.id,
        assigned_staff_id=sales_rep.id,
        assigned_by="system"
    )
    db.add(assignment_a)
    db.commit()

    yield {
        "cust_a": cust_a,
        "cust_b": cust_b,
        "user_a": user_a,
        "user_b": user_b,
        "addr_a": addr_a,
        "addr_b": addr_b,
        "credit_a": credit_a,
        "p_in": p_in,
        "p_out": p_out,
        "sales_rep": sales_rep,
    }

    db.close()


# ==============================================================================
# NHÓM 1: KIỂM THỬ BẢO MẬT & PHÂN QUYỀN (SEC-01 -> SEC-06)
# ==============================================================================

def test_sec_01_default_deny_all_backoffice_routes_for_customer(portal_test_data):
    """SEC-01: Token Role Customer gọi các API backoffice nội bộ BẮT BUỘC nhận 403 Forbidden.
    Nhưng gọi /api/v1/auth/me và /api/v1/portal/* thì hợp lệ (200 OK).
    """
    user_a = portal_test_data["user_a"]
    headers = _get_headers_for_user(user_a)

    # 1. Thử gọi các endpoint backoffice
    res_orders = client.get("/api/v1/orders", headers=headers)
    assert res_orders.status_code == 403, f"Expected 403 for /orders but got {res_orders.status_code}"

    res_customers = client.get("/api/v1/customers", headers=headers)
    assert res_customers.status_code == 403, f"Expected 403 for /customers but got {res_customers.status_code}"

    res_users = client.get("/api/v1/users", headers=headers)
    assert res_users.status_code == 403, f"Expected 403 for /users but got {res_users.status_code}"

    # 2. Gọi API Portal & Auth hợp lệ
    res_portal_me = client.get("/api/v1/portal/me", headers=headers)
    assert res_portal_me.status_code == 200
    assert res_portal_me.json()["customer_id"] == portal_test_data["cust_a"].id


def test_sec_02_portal_idor_delivery_address_forbidden(portal_test_data):
    """SEC-02: Đại lý A cố tình dùng delivery_address_id của Đại lý B để tạo đơn
    -> Bị chặn ngay lập tức với HTTP 400 Bad Request.
    """
    user_a = portal_test_data["user_a"]
    addr_b = portal_test_data["addr_b"]
    p_in = portal_test_data["p_in"]

    headers = _get_headers_for_user(user_a, idempotency_key=f"IDEM-SEC02-{uuid.uuid4().hex[:8]}")
    payload = {
        "expected_total": 250000,
        "delivery_address_id": addr_b.id,  # Địa chỉ của đại lý B!
        "items": [{"product_id": str(p_in.id), "quantity": 1, "unit": "thùng"}]
    }

    res = client.post("/api/v1/portal/orders", headers=headers, json=payload)
    assert res.status_code == 400
    assert "Điểm giao hàng không hợp lệ" in res.json()["detail"]


def test_sec_03_zero_trust_payload_client_cannot_tamper_price(portal_test_data):
    """SEC-03: Client cố tình chèn trường lạ (price=1000, status='completed') vào body
    -> Bị Pydantic extra='forbid' chặn 422 Unprocessable Entity.
    """
    user_a = portal_test_data["user_a"]
    addr_a = portal_test_data["addr_a"]
    p_in = portal_test_data["p_in"]

    headers = _get_headers_for_user(user_a, idempotency_key=f"IDEM-SEC03-{uuid.uuid4().hex[:8]}")
    payload = {
        "expected_total": 250000,
        "delivery_address_id": addr_a.id,
        "hacked_price": 1000,  # Trường lạ
        "status": "completed",  # Cố tình đổi status
        "items": [{"product_id": str(p_in.id), "quantity": 1, "unit": "thùng"}]
    }

    res = client.post("/api/v1/portal/orders", headers=headers, json=payload)
    assert res.status_code == 422


def test_sec_04_idempotency_concurrent_retry_returns_same_order(portal_test_data):
    """SEC-04: Gửi 2 request với cùng X-Idempotency-Key và cùng nội dung
    -> Chỉ có duy nhất 1 Order trong CSDL, request 2 trả về HTTP 200 kèm cùng order ID.
    """
    user_a = portal_test_data["user_a"]
    addr_a = portal_test_data["addr_a"]
    p_in = portal_test_data["p_in"]
    idem_key = f"IDEM-RETRY-{uuid.uuid4().hex[:8]}"

    headers = _get_headers_for_user(user_a, idempotency_key=idem_key)
    payload = {
        "expected_total": 250000,
        "delivery_address_id": addr_a.id,
        "items": [{"product_id": str(p_in.id), "quantity": 1, "unit": "thùng"}]
    }

    # Request 1: Tạo mới thành công 201
    res1 = client.post("/api/v1/portal/orders", headers=headers, json=payload)
    assert res1.status_code == 201
    order1 = res1.json()

    # Request 2: Retry gửi lại cùng key -> Trả về kết quả cũ 200
    res2 = client.post("/api/v1/portal/orders", headers=headers, json=payload)
    assert res2.status_code == 200
    order2 = res2.json()

    assert order1["id"] == order2["id"]
    assert order1["code"] == order2["code"]

    # Đảm bảo chỉ có duy nhất 1 bản ghi trong DB
    db = SessionLocal()
    order_count = db.query(Order).filter(Order.id == order1["id"]).count()
    db.close()
    assert order_count == 1


def test_sec_05_idempotency_different_payload_same_key_rejected(portal_test_data):
    """SEC-05: Cùng X-Idempotency-Key nhưng thay đổi số lượng mặt hàng trong payload
    -> Trả về HTTP 422 Unprocessable Entity.
    """
    user_a = portal_test_data["user_a"]
    addr_a = portal_test_data["addr_a"]
    p_in = portal_test_data["p_in"]
    idem_key = f"IDEM-TAMPER-{uuid.uuid4().hex[:8]}"

    headers = _get_headers_for_user(user_a, idempotency_key=idem_key)
    payload1 = {
        "expected_total": 250000,
        "delivery_address_id": addr_a.id,
        "items": [{"product_id": str(p_in.id), "quantity": 1, "unit": "thùng"}]
    }
    res1 = client.post("/api/v1/portal/orders", headers=headers, json=payload1)
    assert res1.status_code == 201

    payload2 = {
        "expected_total": 500000,
        "delivery_address_id": addr_a.id,
        "items": [{"product_id": str(p_in.id), "quantity": 2, "unit": "thùng"}]
    }
    res2 = client.post("/api/v1/portal/orders", headers=headers, json=payload2)
    assert res2.status_code == 422
    assert "nội dung đơn hàng khác" in res2.json()["detail"]


def test_sec_06_idempotency_key_isolated_between_customers(portal_test_data):
    """SEC-06: Đại lý A và Đại lý B vô tình dùng trùng X-Idempotency-Key
    -> Không bị ảnh hưởng lẫn nhau, mỗi đại lý tạo được đơn riêng của mình.
    """
    user_a = portal_test_data["user_a"]
    user_b = portal_test_data["user_b"]
    addr_a = portal_test_data["addr_a"]
    addr_b = portal_test_data["addr_b"]
    p_in = portal_test_data["p_in"]
    shared_key = f"IDEM-SHARED-{uuid.uuid4().hex[:8]}"

    # Cấp thêm hạn mức cho B
    db = SessionLocal()
    credit_b = CustomerCreditProfile(customer_id=portal_test_data["cust_b"].id, credit_limit=50000000)
    db.add(credit_b)
    # Bảng giá cho B
    now = datetime.now(timezone.utc)
    plist_b = PriceList(
        code=f"BG-B-{uuid.uuid4().hex[:6]}",
        name="Bảng giá B",
        customer_group="WHOLESALE_B",
        status="APPROVED",
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=365),
    )
    db.add(plist_b)
    db.flush()
    db.add(PriceListItem(
        price_list_id=plist_b.id,
        product_id=str(p_in.id),
        product_sku=p_in.sku,
        product_name=p_in.name,
        unit=p_in.unit or "thùng",
        listed_price=300000.0,
        floor_price=200000.0,
        sale_price=250000.0,
    ))
    db.commit()
    db.close()

    headers_a = _get_headers_for_user(user_a, idempotency_key=shared_key)
    payload_a = {
        "expected_total": 250000,
        "delivery_address_id": addr_a.id,
        "items": [{"product_id": str(p_in.id), "quantity": 1, "unit": "thùng"}]
    }
    res_a = client.post("/api/v1/portal/orders", headers=headers_a, json=payload_a)
    assert res_a.status_code == 201

    headers_b = _get_headers_for_user(user_b, idempotency_key=shared_key)
    payload_b = {
        "expected_total": 250000,
        "delivery_address_id": addr_b.id,
        "items": [{"product_id": str(p_in.id), "quantity": 1, "unit": "thùng"}]
    }
    res_b = client.post("/api/v1/portal/orders", headers=headers_b, json=payload_b)
    assert res_b.status_code == 201

    assert res_a.json()["id"] != res_b.json()["id"]


# ==============================================================================
# NHÓM 2: KIỂM THỬ NGHIỆP VỤ & CÔNG NỢ TOÀN VẸN (BIZ-01 -> BIZ-07)
# ==============================================================================

def test_biz_01_pricing_excluded_if_not_in_price_list(portal_test_data):
    """BIZ-01: Sản phẩm không có trong bảng giá nhóm của đại lý bị ẨN HOÀN TOÀN trong danh mục,
    và nếu cố tình gửi tính giỏ hàng thì server trả về 400 Bad Request.
    """
    user_a = portal_test_data["user_a"]
    p_in = portal_test_data["p_in"]
    p_out = portal_test_data["p_out"]
    headers = _get_headers_for_user(user_a)

    # 1. Kiểm tra danh mục Portal: p_in có mặt, p_out bị ẩn
    res_prods = client.get("/api/v1/portal/products", headers=headers)
    assert res_prods.status_code == 200
    prod_ids = [item["id"] for item in res_prods.json()["items"]]
    assert str(p_in.id) in prod_ids
    assert str(p_out.id) not in prod_ids

    # 2. Cố tình gửi p_out vào tính giỏ hàng -> Bị từ chối 400
    res_calc = client.post(
        "/api/v1/portal/cart/calculate",
        headers=headers,
        json={"items": [{"product_id": str(p_out.id), "quantity": 1, "unit": "chai"}]}
    )
    assert res_calc.status_code == 400
    assert "không có trong bảng giá" in res_calc.json()["detail"]


def test_biz_02_pending_leak_hard_block_committed_debt(portal_test_data):
    """BIZ-02: Bịt hoàn toàn lỗ hổng Pending Leak!
    - Hạn mức: 20,000,000 đ.
    - Đơn Pending hiện tại: 16,000,000 đ.
    - Hạn mức còn lại thực tế: 4,000,000 đ.
    - Đại lý gửi tiếp đơn mới 5,000,000 đ -> BỊ CHẶN CỨNG HTTP 400!
    """
    user_a = portal_test_data["user_a"]
    cust_a = portal_test_data["cust_a"]
    addr_a = portal_test_data["addr_a"]
    p_in = portal_test_data["p_in"]

    db = SessionLocal()
    # Tạo một đơn đang ở trạng thái 'pending' trị giá 16,000,000 đ (64 thùng * 250,000 đ)
    pending_order = Order(
        id=f"ORD-PEND-{uuid.uuid4().hex[:6]}",
        code=f"DH-PEND-{uuid.uuid4().hex[:4]}",
        customer_id=cust_a.id,
        customer_name=cust_a.name,
        source="portal",
        status="pending",
        total=16000000,
        paid_amount=0,
    )
    db.add(pending_order)
    db.commit()
    db.close()

    headers = _get_headers_for_user(user_a, idempotency_key=f"IDEM-LEAK-{uuid.uuid4().hex[:8]}")

    # Kiểm tra API credit trả đúng nợ cam kết
    res_credit = client.get("/api/v1/portal/credit", headers=headers)
    assert res_credit.status_code == 200
    cred_data = res_credit.json()
    assert cred_data["committed_debt"] == 16000000
    assert cred_data["available_credit"] == 4000000

    # Đại lý gửi đơn mới 20 thùng * 250,000 đ = 5,000,000 đ (> 4,000,000 đ còn lại)
    payload = {
        "expected_total": 5000000,
        "delivery_address_id": addr_a.id,
        "items": [{"product_id": str(p_in.id), "quantity": 20, "unit": "thùng"}]
    }
    res_order = client.post("/api/v1/portal/orders", headers=headers, json=payload)
    assert res_order.status_code == 400
    assert "vượt hạn mức công nợ khả dụng" in res_order.json()["detail"].lower()


def test_biz_03_paid_amount_deduction_in_debt_calculation(portal_test_data):
    """BIZ-03: Đơn hàng trị giá 20M nhưng đã trả trước 15M (paid_amount=15M)
    -> Nợ cam kết chỉ tính phần chưa trả: 5M thay vì 20M.
    """
    user_a = portal_test_data["user_a"]
    cust_a = portal_test_data["cust_a"]

    db = SessionLocal()
    order_partially_paid = Order(
        id=f"ORD-PAID-{uuid.uuid4().hex[:6]}",
        code=f"DH-PAID-{uuid.uuid4().hex[:4]}",
        customer_id=cust_a.id,
        customer_name=cust_a.name,
        source="portal",
        status="pending",
        total=20000000,
        paid_amount=15000000,  # Đã trả 15M
    )
    db.add(order_partially_paid)
    db.commit()
    db.close()

    headers = _get_headers_for_user(user_a)
    res_credit = client.get("/api/v1/portal/credit", headers=headers)
    assert res_credit.status_code == 200
    # Committed debt chỉ được tính là 5M
    assert res_credit.json()["committed_debt"] == 5000000


def test_biz_04_cancelled_order_releases_committed_debt(portal_test_data):
    """BIZ-04: Đơn Pending bị hủy (status='cancelled')
    -> Ngay lập tức giải phóng nợ cam kết, available_credit tăng trở lại.
    """
    user_a = portal_test_data["user_a"]
    cust_a = portal_test_data["cust_a"]

    db = SessionLocal()
    order_to_cancel = Order(
        id=f"ORD-CANCEL-{uuid.uuid4().hex[:6]}",
        code=f"DH-CANCEL-{uuid.uuid4().hex[:4]}",
        customer_id=cust_a.id,
        customer_name=cust_a.name,
        source="portal",
        status="pending",
        total=8000000,
        paid_amount=0,
    )
    db.add(order_to_cancel)
    db.commit()

    headers = _get_headers_for_user(user_a)
    res1 = client.get("/api/v1/portal/credit", headers=headers)
    assert res1.json()["committed_debt"] == 8000000

    # Hủy đơn
    order_to_cancel.status = "cancelled"
    db.commit()
    db.close()

    res2 = client.get("/api/v1/portal/credit", headers=headers)
    assert res2.json()["committed_debt"] == 0
    assert res2.json()["available_credit"] == 20000000


def test_biz_05_dispatching_order_maintains_total_debt_constant(portal_test_data):
    """BIZ-05: Đơn chuyển từ 'pending' sang 'shipping' (xuất kho):
    Nợ cam kết giảm đi X, Dư nợ đã xuất tăng lên đúng X -> Tổng chiếm dụng không đổi.
    """
    user_a = portal_test_data["user_a"]
    cust_a = portal_test_data["cust_a"]

    db = SessionLocal()
    order = Order(
        id=f"ORD-DISP-{uuid.uuid4().hex[:6]}",
        code=f"DH-DISP-{uuid.uuid4().hex[:4]}",
        customer_id=cust_a.id,
        customer_name=cust_a.name,
        source="portal",
        status="pending",
        total=7000000,
        paid_amount=0,
    )
    db.add(order)
    db.commit()

    headers = _get_headers_for_user(user_a)
    res1 = client.get("/api/v1/portal/credit", headers=headers)
    assert res1.json()["committed_debt"] == 7000000
    assert res1.json()["dispatched_debt"] == 0
    assert res1.json()["total_used_credit"] == 7000000

    # Chuyển sang shipping
    order.status = "shipping"
    db.commit()
    db.close()

    res2 = client.get("/api/v1/portal/credit", headers=headers)
    assert res2.json()["committed_debt"] == 0
    assert res2.json()["dispatched_debt"] == 7000000
    assert res2.json()["total_used_credit"] == 7000000


def test_biz_06_price_drift_returns_409_conflict(portal_test_data):
    """BIZ-06: expected_total gửi lên không khớp với giá tính toán của server
    -> Trả về HTTP 409 Conflict yêu cầu tải lại giỏ hàng.
    """
    user_a = portal_test_data["user_a"]
    addr_a = portal_test_data["addr_a"]
    p_in = portal_test_data["p_in"]

    headers = _get_headers_for_user(user_a, idempotency_key=f"IDEM-409-{uuid.uuid4().hex[:8]}")
    payload = {
        "expected_total": 240000,  # Sai lệch với giá thật 250,000 đ
        "delivery_address_id": addr_a.id,
        "items": [{"product_id": str(p_in.id), "quantity": 1, "unit": "thùng"}]
    }

    res = client.post("/api/v1/portal/orders", headers=headers, json=payload)
    assert res.status_code == 409
    assert "Giá đơn hàng đã thay đổi" in res.json()["detail"]


def test_biz_07_unassigned_flag_and_assigned_sales_rep(portal_test_data):
    """BIZ-07:
    - Đại lý A có NVKD phụ trách -> Đơn gán staff_id, is_unassigned=False.
    - Đại lý B chưa có NVKD phụ trách -> Đơn gán is_unassigned=True.
    """
    user_a = portal_test_data["user_a"]
    addr_a = portal_test_data["addr_a"]
    p_in = portal_test_data["p_in"]

    # 1. Đặt đơn cho A (đã có phân công sales rep)
    headers_a = _get_headers_for_user(user_a, idempotency_key=f"IDEM-ASSIGN-{uuid.uuid4().hex[:8]}")
    res_a = client.post(
        "/api/v1/portal/orders",
        headers=headers_a,
        json={
            "expected_total": 250000,
            "delivery_address_id": addr_a.id,
            "items": [{"product_id": str(p_in.id), "quantity": 1, "unit": "thùng"}]
        }
    )
    assert res_a.status_code == 201
    assert res_a.json()["is_unassigned"] is False
    assert res_a.json()["status"] == "pending"
    assert res_a.json()["source"] == "portal"
