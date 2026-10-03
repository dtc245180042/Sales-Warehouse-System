import uuid
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


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

    # Lấy 1 sản phẩm có sẵn
    prods = client.get("/api/v1/products").json()
    prod = prods[0]
    initial_stock = prod["stock"]

    # 1. Tạo đơn hàng mới
    payload = {
        "customer_id": "CUS-001",
        "customer_name": f"Khách Hàng {uid}",
        "customer_phone": "0911223344",
        "items": [
            {
                "product_id": prod["id"],
                "sku": prod["sku"],
                "name": prod["name"],
                "price": prod["salePrice"],
                "quantity": 2,
                "discount": 0.0,
                "subtotal": prod["salePrice"] * 2
            }
        ],
        "subtotal": prod["salePrice"] * 2,
        "discount": 0.0,
        "tax": 0.0,
        "total": prod["salePrice"] * 2,
        "paid_amount": prod["salePrice"] * 2,
        "payment_method": "transfer",
        "payment_status": "paid",
        "status": "pending"
    }

    create_res = client.post("/api/v1/orders", json=payload)
    assert create_res.status_code == 201
    order = create_res.json()
    order_id = order["id"]

    # Kiểm tra tồn kho đã bị trừ 2
    prod_after = client.get(f"/api/v1/products/{prod['id']}").json()
    assert prod_after["stock"] == initial_stock - 2

    # 2. Cập nhật trạng thái
    status_res = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "confirmed"})
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "confirmed"

    # 3. Hủy đơn và kiểm tra hoàn kho
    cancel_res = client.post(f"/api/v1/orders/{order_id}/cancel")
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"

    prod_refunded = client.get(f"/api/v1/products/{prod['id']}").json()
    assert prod_refunded["stock"] == initial_stock
