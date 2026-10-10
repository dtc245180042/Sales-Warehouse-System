import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.order import Order
from app.models.order_delivery_profile import OrderDeliveryProfile

client = TestClient(app)


def _get_auth_headers(username="admin", role="Admin", user_id=1):
    db = SessionLocal()
    user = db.query(User).filter_by(username=username).first()
    tv = user.token_version if user else 1
    db.close()
    token = tao_token_truy_cap({
        "sub": username,
        "user_id": user_id,
        "username": username,
        "role": role,
        "token_version": tv
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def s4_test_setup():
    """Tạo bộ dữ liệu test độc lập cho S4-02: Sản phẩm có sẵn, Khách hàng, Credit Profile."""
    headers = _get_auth_headers()
    # Lấy sản phẩm có sẵn trong DB
    res_p = client.get("/api/v1/products", headers=headers).json()
    items = res_p.get("items", res_p) if isinstance(res_p, dict) else res_p
    assert len(items) > 0, "Cần có ít nhất 1 sản phẩm trong hệ thống"
    prod = items[0]
    prod_id = str(prod["id"])
    sku = prod.get("sku") or "SKU-TEST"
    prod_name = prod.get("name") or "Sản phẩm Test"

    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]

    # Tạo khách hàng đại lý
    customer = Customer(
        id=f"CUS-S4-{uid}",
        code=f"DL-S4-{uid}",
        name=f"Đại Lý S4-02 {uid}",
        phone=f"0988{uid[:4]}",
        status="active",
        total_spent=0.0,
        total_orders=0
    )
    db.add(customer)
    db.commit()

    # Tạo hồ sơ hạn mức công nợ: Hạn mức 50,000,000 VND, tối đa nợ 30 ngày
    credit_profile = CustomerCreditProfile(
        customer_id=customer.id,
        credit_limit=50000000,
        max_debt_days=30,
        updated_by="admin"
    )
    db.add(credit_profile)
    db.commit()
    db.refresh(credit_profile)

    # Đảm bảo sản phẩm có đủ tồn kho phục vụ kiểm thử
    stock_prof = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == prod_id).first()
    if not stock_prof:
        stock_prof = ProductStockProfile(product_id=prod_id, stock=1000, min_stock=5)
        db.add(stock_prof)
    else:
        stock_prof.stock = 1000
    db.commit()

    cust_id = customer.id
    db.close()

    yield {
        "uid": uid,
        "product_id": prod_id,
        "sku": sku,
        "product_name": prod_name,
        "customer_id": cust_id,
        "credit_limit": 50000000.0,
        "max_debt_days": 30,
    }

    # Dọn dẹp sau test
    db_clean = SessionLocal()
    orders = db_clean.query(Order).filter(Order.customer_id == cust_id).all()
    for o in orders:
        db_clean.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == o.id).delete()
        db_clean.delete(o)
    db_clean.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == cust_id).delete()
    db_clean.query(Customer).filter(Customer.id == cust_id).delete()
    db_clean.commit()
    db_clean.close()


def test_scrum499_api_credit_summary_and_profile_returns_expected_fields(s4_test_setup):
    """
    SCRUM-499: Cung cấp API lấy công nợ hiện tại, hạn mức và phần còn lại cho màn hình tạo đơn.
    Kiểm tra cả endpoint /credit-profile và /credit-summary.
    """
    headers = _get_auth_headers()
    cust_id = s4_test_setup["customer_id"]

    # 1. Gọi /credit-profile
    res = client.get(f"/api/v1/customers/{cust_id}/credit-profile", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["customerId"] == cust_id
    assert data["creditLimit"] == 50000000.0
    assert data["maxDebtDays"] == 30
    assert data["currentDebt"] == 0.0
    assert data["availableCredit"] == 50000000.0
    assert data["hasOverdue"] is False
    assert data["overdueDays"] == 0
    assert data["isBlocked"] is False

    # 2. Gọi alias /credit-summary
    res_summary = client.get(f"/api/v1/customers/{cust_id}/credit-summary", headers=headers)
    assert res_summary.status_code == 200
    data_summary = res_summary.json()
    assert data_summary["customerId"] == cust_id
    assert data_summary["creditLimit"] == 50000000.0
    assert data_summary["availableCredit"] == 50000000.0


def test_scrum496_create_order_within_credit_limit_success(s4_test_setup):
    """
    SCRUM-496: Tạo đơn hàng trong hạn mức công nợ thành công (status='pending', requires_approval=False).
    """
    headers = _get_auth_headers()
    cust_id = s4_test_setup["customer_id"]
    prod_id = s4_test_setup["product_id"]

    payload = {
        "customer_id": cust_id,
        "customer_name": "Đại lý Test",
        "customer_phone": "0988111222",
        "items": [
            {
                "product_id": prod_id,
                "sku": s4_test_setup["sku"],
                "name": s4_test_setup["product_name"],
                "price": 5000000.0,
                "quantity": 2,
                "discount": 0.0,
                "subtotal": 10000000.0
            }
        ],
        "subtotal": 10000000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 10000000.0,
        "paid_amount": 0.0,  # Ghi nợ 10tr (nằm trong hạn mức 50tr)
        "payment_method": "debt",
        "payment_status": "unpaid",
        "status": "pending"
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 201
    order = res.json()
    assert order["status"] == "pending"
    assert order["requiresApproval"] is False
    assert order["approvalReason"] is None


def test_scrum498_create_order_exceeding_credit_limit_requires_approval(s4_test_setup):
    """
    SCRUM-498: Xác định và lưu trạng thái đơn cần duyệt khi vượt hạn mức công nợ (status='pending_approval').
    Hạn mức: 50tr. Đơn hàng: 75tr ghi nợ -> Vượt hạn mức -> Cần phê duyệt.
    """
    headers = _get_auth_headers()
    cust_id = s4_test_setup["customer_id"]
    prod_id = s4_test_setup["product_id"]

    payload = {
        "customer_id": cust_id,
        "customer_name": "Đại lý Test Vượt Hạn Mức",
        "customer_phone": "0988111222",
        "items": [
            {
                "product_id": prod_id,
                "sku": s4_test_setup["sku"],
                "name": s4_test_setup["product_name"],
                "price": 15000000.0,
                "quantity": 5,
                "discount": 0.0,
                "subtotal": 75000000.0
            }
        ],
        "subtotal": 75000000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 75000000.0,
        "paid_amount": 0.0,  # Ghi nợ 75tr > Hạn mức 50tr
        "payment_method": "debt",
        "payment_status": "unpaid",
        "status": "pending"
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 201
    order = res.json()
    # Kiểm tra đơn bị đánh dấu pending_approval
    assert order["status"] == "pending_approval"
    assert order["requiresApproval"] is True
    assert order["approvalReason"] is not None
    assert "vượt hạn mức" in order["approvalReason"].lower()


def test_scrum496_fully_paid_order_allowed_even_above_credit_limit(s4_test_setup):
    """
    Nếu đơn hàng thanh toán 100% ngay (tiền mặt / chuyển khoản), không tính vào nợ mới
    nên đơn được tạo bình thường (không yêu cầu duyệt công nợ).
    """
    headers = _get_auth_headers()
    cust_id = s4_test_setup["customer_id"]
    prod_id = s4_test_setup["product_id"]

    payload = {
        "customer_id": cust_id,
        "customer_name": "Đại lý Test Trả Đủ",
        "customer_phone": "0988111222",
        "items": [
            {
                "product_id": prod_id,
                "sku": s4_test_setup["sku"],
                "name": s4_test_setup["product_name"],
                "price": 15000000.0,
                "quantity": 5,
                "discount": 0.0,
                "subtotal": 75000000.0
            }
        ],
        "subtotal": 75000000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 75000000.0,
        "paid_amount": 75000000.0,  # Thanh toán 100% -> unpaid = 0
        "payment_method": "transfer",
        "payment_status": "paid",
        "status": "pending"
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 201
    order = res.json()
    assert order["status"] == "pending"
    assert order["requiresApproval"] is False


def test_scrum497_create_order_blocked_when_customer_has_overdue_debt(s4_test_setup):
    """
    SCRUM-497: Thiết kế nghiệp vụ kiểm tra công nợ và số ngày quá hạn khi tạo/chốt đơn.
    Đại lý có khoản quá hạn quá số ngày cho phép (max_debt_days=30) -> Chặn tạo đơn hoàn toàn.
    """
    headers = _get_auth_headers()
    cust_id = s4_test_setup["customer_id"]
    prod_id = s4_test_setup["product_id"]

    # Tạo 1 đơn nợ cũ đã xuất kho từ 45 ngày trước (quá hạn 15 ngày so với max_debt_days=30)
    db = SessionLocal()
    overdue_date = datetime.now(timezone.utc) - timedelta(days=45)
    old_order = Order(
        id=f"TEST-OLD-{s4_test_setup['uid']}",
        code=f"DH-OVERDUE-{s4_test_setup['uid']}",
        customer_id=cust_id,
        customer_name="Đại lý Test",
        customer_phone="0988111222",
        subtotal=15000000.0,
        total=15000000.0,
        paid_amount=0.0,  # Chưa trả đồng nào
        payment_status="unpaid",
        status="shipping",  # Đã xuất kho giao hàng
        created_at=overdue_date
    )
    db.add(old_order)
    db.commit()
    db.close()

    # Bây giờ đại lý tạo đơn mới có ghi nợ -> Phải bị chặn tuyệt đối (HTTP 400)
    payload = {
        "customer_id": cust_id,
        "customer_name": "Đại lý Test Bị Chặn Quá Hạn",
        "customer_phone": "0988111222",
        "items": [
            {
                "product_id": prod_id,
                "sku": s4_test_setup["sku"],
                "name": s4_test_setup["product_name"],
                "price": 1000000.0,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": 1000000.0
            }
        ],
        "subtotal": 1000000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 1000000.0,
        "paid_amount": 0.0,
        "payment_method": "debt",
        "payment_status": "unpaid",
        "status": "pending"
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 400
    err_detail = res.json().get("detail", "")
    assert "quá hạn" in err_detail.lower() or "chặn" in err_detail.lower()


def test_scrum496_and_498_submit_draft_order_exceeding_credit_limit(s4_test_setup):
    """
    Chốt đơn nháp (draft submit) khi tổng nợ vượt hạn mức:
    Đơn hàng chuyển từ draft sang pending_approval (SCRUM-496 + SCRUM-498).
    """
    headers = _get_auth_headers()
    cust_id = s4_test_setup["customer_id"]
    prod_id = s4_test_setup["product_id"]

    # 1. Tạo đơn nháp 75tr
    draft_payload = {
        "customer_id": cust_id,
        "customer_name": "Đại lý Chốt Nháp Vượt Hạn Mức",
        "customer_phone": "0988111222",
        "items": [
            {
                "product_id": prod_id,
                "sku": s4_test_setup["sku"],
                "name": s4_test_setup["product_name"],
                "price": 15000000.0,
                "quantity": 5,
                "discount": 0.0,
                "subtotal": 75000000.0
            }
        ],
        "subtotal": 75000000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 75000000.0,
        "paid_amount": 0.0,
        "payment_method": "debt",
        "payment_status": "unpaid",
        "status": "draft"
    }

    res_draft = client.post("/api/v1/orders", json=draft_payload, headers=headers)
    assert res_draft.status_code == 201
    draft_order = res_draft.json()
    order_id = draft_order["id"]
    assert draft_order["status"] == "draft"

    # 2. Chốt đơn nháp qua API /submit
    res_submit = client.post(f"/api/v1/orders/{order_id}/submit", headers=headers)
    assert res_submit.status_code == 200
    submitted_order = res_submit.json()
    assert submitted_order["status"] == "pending_approval"
    assert submitted_order["requiresApproval"] is True
    assert "vượt hạn mức" in submitted_order["approvalReason"].lower()


def test_approve_pending_approval_order_resets_flag(s4_test_setup):
    """
    Khi Quản lý kinh doanh duyệt đơn chờ duyệt sang 'confirmed':
    Trạng thái đổi thành 'confirmed' và cờ requires_approval được giải phóng (False).
    """
    headers = _get_auth_headers()
    cust_id = s4_test_setup["customer_id"]
    prod_id = s4_test_setup["product_id"]

    # 1. Tạo đơn vượt hạn mức
    payload = {
        "customer_id": cust_id,
        "customer_name": "Đại lý Chờ Quản Lý Duyệt",
        "customer_phone": "0988111222",
        "items": [
            {
                "product_id": prod_id,
                "sku": s4_test_setup["sku"],
                "name": s4_test_setup["product_name"],
                "price": 15000000.0,
                "quantity": 5,
                "discount": 0.0,
                "subtotal": 75000000.0
            }
        ],
        "subtotal": 75000000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 75000000.0,
        "paid_amount": 0.0,
        "payment_method": "debt",
        "payment_status": "unpaid",
        "status": "pending"
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 201
    order_id = res.json()["id"]
    assert res.json()["status"] == "pending_approval"
    assert res.json()["requiresApproval"] is True

    # 2. Quản lý duyệt đơn
    res_update = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "confirmed"}, headers=headers)
    assert res_update.status_code == 200
    approved_order = res_update.json()
    assert approved_order["status"] == "confirmed"
    assert approved_order["requiresApproval"] is False

    # 3. Xuất kho thành công cho đơn đã được phê duyệt vượt hạn mức (S4-05: confirmed -> shipping)
    res_ship = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "shipping"}, headers=headers)
    assert res_ship.status_code == 200
    assert res_ship.json()["status"] == "shipping"


def test_scrum499_check_credit_api_with_order_context(s4_test_setup):
    """
    Kiểm tra endpoint /check-credit với context='order':
    Trả về action='REQUIRE_APPROVAL' khi vượt hạn mức, 'ALLOW' khi trong hạn mức.
    """
    headers = _get_auth_headers()
    cust_id = s4_test_setup["customer_id"]

    # Trong hạn mức
    res1 = client.post(
        f"/api/v1/customers/{cust_id}/check-credit",
        json={"unpaid_amount": 20000000.0, "context": "order"},
        headers=headers
    )
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["action"] == "ALLOW"
    assert d1["requiresApproval"] is False
    assert d1["isBlocked"] is False

    # Vượt hạn mức
    res2 = client.post(
        f"/api/v1/customers/{cust_id}/check-credit",
        json={"unpaid_amount": 80000000.0, "context": "order"},
        headers=headers
    )
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["action"] == "REQUIRE_APPROVAL"
    assert d2["requiresApproval"] is True
    assert d2["isBlocked"] is False
