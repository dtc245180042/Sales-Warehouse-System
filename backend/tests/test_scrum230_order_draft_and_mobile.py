import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_delivery_address import CustomerDeliveryAddress
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.order import Order

client = TestClient(app)


def _get_headers_for_role(username="admin", role="Admin", user_id=1):
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
def test_data():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]

    # Khách hàng đại lý
    customer = Customer(
        id=f"CUS-230-{uid}",
        code=f"DL-230-{uid}",
        name=f"Đại Lý 230 {uid}",
        phone=f"0987{uid[:4]}",
        status="active",
        total_spent=0.0,
        total_orders=0
    )
    db.add(customer)
    db.commit()

    # Địa chỉ giao hàng hợp lệ của khách
    addr = CustomerDeliveryAddress(
        customer_id=customer.id,
        name="Kho tổng Chi nhánh 1",
        receiver_name="Nguyễn Văn Nhận",
        phone="0912345678",
        address="123 Đường Số 1, Quận 1, TP.HCM",
        is_default=True,
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)

    # Sản phẩm test với packaging_spec
    prod = Product(
        sku=f"SKU-230-{uid}",
        name=f"Bia Lon Saigon Special {uid}",
        price=15000.0,
        unit="lon",
        packaging_spec="24 lon/thùng",
        status="ACTIVE"
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    stock_prof = ProductStockProfile(
        product_id=prod.id,
        stock=50,
        min_stock=5
    )
    db.add(stock_prof)
    db.commit()
    db.refresh(stock_prof)

    yield {
        "customer": customer,
        "address": addr,
        "product": prod,
        "stock_profile": stock_prof
    }

    db.close()


def test_products_search_for_order(test_data):
    """Test API tìm kiếm sản phẩm cho đơn hàng hiện trường và trả về danh sách đơn vị tính."""
    headers = _get_headers_for_role()
    prod = test_data["product"]

    res = client.get(f"/api/v1/orders/products/search?q={prod.sku}", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    found = next((p for p in data if p["id"] == prod.id), None)
    assert found is not None
    assert found["unit"] == "lon"
    # Phải có sẵn các đơn vị tính chiết xuất từ packaging_spec hoặc mặc định
    assert "lon" in found["available_units"]
    assert "thùng" in found["available_units"]


def test_calculate_order_totals(test_data):
    """Test API tính toán tức thời (realtime) giá trị giỏ hàng và chiết khấu."""
    headers = _get_headers_for_role()
    customer = test_data["customer"]
    prod = test_data["product"]

    req_body = {
        "customer_id": customer.id,
        "items": [
            {
                "product_id": prod.id,
                "quantity": 10,
                "price": 15000.0,
                "unit": "lon"
            }
        ]
    }
    res = client.post("/api/v1/orders/calculate", json=req_body, headers=headers)
    assert res.status_code == 200
    calc = res.json()
    assert calc["subtotal"] == 150000.0
    assert calc["total"] <= 150000.0
    assert len(calc["items"]) == 1
    assert calc["items"][0]["unit"] == "lon"


def test_create_draft_order_does_not_deduct_stock(test_data):
    """Test tạo đơn nháp: không trừ kho và không cộng dồn doanh số khách hàng."""
    headers = _get_headers_for_role()
    customer = test_data["customer"]
    prod = test_data["product"]
    addr = test_data["address"]

    future_date = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d")

    payload = {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "status": "draft",
        "items": [
            {
                "product_id": prod.id,
                "sku": prod.sku,
                "name": prod.name,
                "price": 15000.0,
                "quantity": 5,
                "unit": "thùng",
                "discount": 0.0,
                "subtotal": 75000.0
            }
        ],
        "subtotal": 75000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 75000.0,
        "paid_amount": 0.0,
        "payment_method": "transfer",
        "delivery_address_id": addr.id,
        "delivery_address_name": addr.name,
        "delivery_receiver_name": addr.receiver_name,
        "delivery_phone": addr.phone,
        "delivery_address": addr.address,
        "expected_delivery_date": future_date,
        "note": "Giao vào buổi sáng"
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 201
    order_data = res.json()
    assert order_data["status"] == "draft"
    assert order_data["items"][0]["unit"] == "thùng"
    assert order_data["expectedDeliveryDate"] == future_date

    # Kiểm tra tồn kho KHÔNG bị trừ
    db = SessionLocal()
    stk = db.query(ProductStockProfile).filter_by(product_id=prod.id).first()
    assert stk.stock == 50, "Đơn nháp không được trừ tồn kho"

    # Kiểm tra doanh thu khách hàng KHÔNG bị cộng
    cus_in_db = db.query(Customer).filter_by(id=customer.id).first()
    assert cus_in_db.total_orders == 0
    assert cus_in_db.total_spent == 0.0
    db.close()


def test_validation_wrong_delivery_address(test_data):
    """Test ràng buộc điểm giao hàng phải thuộc đại lý đặt hàng."""
    headers = _get_headers_for_role()
    prod = test_data["product"]

    # Tạo 1 đại lý khác và địa chỉ của họ
    db = SessionLocal()
    ouid = uuid.uuid4().hex[:6]
    other_cus = Customer(id=f"CUS-OTHER-{ouid}", code=f"DL-OTHER-{ouid}", name="Đại Lý Khác", status="active")
    db.add(other_cus)
    db.commit()
    other_addr = CustomerDeliveryAddress(
        customer_id=other_cus.id,
        name="Kho đại lý khác",
        receiver_name="Trần Văn Khác",
        phone="0999888777",
        address="456 Đường ABC",
    )
    db.add(other_addr)
    db.commit()
    db.refresh(other_addr)
    db.close()

    payload = {
        "customer_id": test_data["customer"].id,
        "customer_name": test_data["customer"].name,
        "status": "pending",
        "items": [
            {
                "product_id": prod.id,
                "sku": prod.sku,
                "name": prod.name,
                "price": 15000.0,
                "quantity": 2,
                "unit": "lon"
            }
        ],
        "delivery_address_id": other_addr.id,  # Điểm giao hàng của đại lý khác!
        "total": 30000.0
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 400
    assert "không thuộc về đại lý" in res.json()["detail"]


def test_validation_past_expected_delivery_date(test_data):
    """Test ràng buộc ngày giao mong muốn không được là ngày trong quá khứ đối với đơn chính thức."""
    headers = _get_headers_for_role()
    customer = test_data["customer"]
    prod = test_data["product"]

    past_date = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d")

    payload = {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "status": "pending",
        "items": [
            {
                "product_id": prod.id,
                "sku": prod.sku,
                "name": prod.name,
                "price": 15000.0,
                "quantity": 1,
                "unit": "lon"
            }
        ],
        "expected_delivery_date": past_date,
        "total": 15000.0
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 400
    assert "quá khứ" in res.json()["detail"]


def test_draft_crud_and_submission_lifecycle(test_data):
    """Test trọn vẹn vòng đời đơn nháp: Tạo nháp -> Sửa nháp -> Xem DS nháp -> Chốt đơn (Submit)."""
    headers = _get_headers_for_role()
    customer = test_data["customer"]
    prod = test_data["product"]
    addr = test_data["address"]

    future_date = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")

    # 1. Tạo đơn nháp ban đầu
    create_payload = {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "status": "draft",
        "items": [
            {
                "product_id": prod.id,
                "sku": prod.sku,
                "name": prod.name,
                "price": 15000.0,
                "quantity": 4,
                "unit": "lon",
                "subtotal": 60000.0
            }
        ],
        "subtotal": 60000.0,
        "total": 60000.0,
        "delivery_address_id": addr.id,
        "expected_delivery_date": future_date
    }
    create_res = client.post("/api/v1/orders", json=create_payload, headers=headers)
    assert create_res.status_code == 201
    order_id = create_res.json()["id"]

    # 2. Xem danh sách nháp
    drafts_res = client.get("/api/v1/orders/drafts", headers=headers)
    assert drafts_res.status_code == 200
    draft_ids = [d["id"] for d in drafts_res.json()]
    assert order_id in draft_ids

    # 3. Cập nhật đơn nháp (đổi số lượng từ 4 lên 10, sửa ghi chú)
    update_payload = {
        "note": "Khách dặn mang kèm hóa đơn đỏ",
        "items": [
            {
                "product_id": prod.id,
                "sku": prod.sku,
                "name": prod.name,
                "price": 15000.0,
                "quantity": 10,
                "unit": "lon",
                "subtotal": 150000.0
            }
        ],
        "subtotal": 150000.0,
        "total": 150000.0
    }
    upd_res = client.put(f"/api/v1/orders/{order_id}/draft", json=update_payload, headers=headers)
    assert upd_res.status_code == 200
    upd_data = upd_res.json()
    assert upd_data["note"] == "Khách dặn mang kèm hóa đơn đỏ"
    assert upd_data["items"][0]["quantity"] == 10

    # Tồn kho vẫn phải là 50
    db = SessionLocal()
    stk = db.query(ProductStockProfile).filter_by(product_id=prod.id).first()
    assert stk.stock == 50
    db.close()

    # 4. Chốt đơn (Submit)
    submit_res = client.post(f"/api/v1/orders/{order_id}/submit", headers=headers)
    assert submit_res.status_code == 200
    sub_data = submit_res.json()
    assert sub_data["status"] == "pending"

    # Sau khi chốt đơn, tồn kho phải bị trừ (50 - 10 = 40)
    db = SessionLocal()
    stk_after = db.query(ProductStockProfile).filter_by(product_id=prod.id).first()
    assert stk_after.stock == 40, f"Tồn kho thực tế: {stk_after.stock}, kỳ vọng 40"

    # Doanh số khách hàng được tăng
    cus_after = db.query(Customer).filter_by(id=customer.id).first()
    assert cus_after.total_orders == 1
    assert cus_after.total_spent >= 150000.0
    db.close()

    # Thử submit lại phải báo lỗi 400 vì không còn là đơn nháp
    res_re_submit = client.post(f"/api/v1/orders/{order_id}/submit", headers=headers)
    assert res_re_submit.status_code == 400
