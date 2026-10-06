import uuid
from fastapi.testclient import TestClient
from main import app
from app.core.security import tao_token_truy_cap

client = TestClient(app)


def _get_auth_headers():
    token = tao_token_truy_cap({
        "sub": "admin",
        "user_id": 1,
        "username": "admin",
        "role": "Admin",
        "token_version": 1
    })
    return {"Authorization": f"Bearer {token}"}


def test_get_orders_list():
    response = client.get("/api/v1/orders")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Check camelCase properties
    assert "customerName" in data[0]
    assert "paidAmount" in data[0]


def test_create_and_cancel_order():
    uid = uuid.uuid4().hex[:6]
    headers = _get_auth_headers()

    # Lấy 1 sản phẩm có sẵn
    res = client.get("/api/v1/products", headers=headers).json()
    prods = res.get("items", res) if isinstance(res, dict) else res
    assert len(prods) >= 1, "Cần có ít nhất 1 sản phẩm trong DB"
    prod = prods[0]
    initial_stock = prod["stock"]
    sale_price = prod.get("salePrice") or prod.get("price") or 100000.0

    # 1. Tạo đơn hàng mới
    payload = {
        "customer_id": "CUS-001",
        "customer_name": f"Khách Hàng {uid}",
        "customer_phone": "0911223344",
        "items": [
            {
                "product_id": str(prod["id"]),
                "sku": prod["sku"],
                "name": prod["name"],
                "price": sale_price,
                "quantity": 2,
                "discount": 0.0,
                "subtotal": sale_price * 2
            }
        ],
        "subtotal": sale_price * 2,
        "discount": 0.0,
        "tax": 0.0,
        "total": sale_price * 2,
        "paid_amount": sale_price * 2,
        "payment_method": "transfer",
        "payment_status": "paid",
        "status": "pending"
    }

    create_res = client.post("/api/v1/orders", json=payload)
    assert create_res.status_code == 201
    order = create_res.json()
    order_id = order["id"]

    # Kiểm tra tồn kho đã bị trừ 2
    prod_after = client.get(f"/api/v1/products/{prod['id']}", headers=headers).json()
    assert prod_after["stock"] == initial_stock - 2

    # 2. Cập nhật trạng thái
    status_res = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "confirmed"})
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "confirmed"

    # 3. Hủy đơn và kiểm tra hoàn kho
    cancel_res = client.post(f"/api/v1/orders/{order_id}/cancel")
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"

    prod_refunded = client.get(f"/api/v1/products/{prod['id']}", headers=headers).json()
    assert prod_refunded["stock"] == initial_stock
