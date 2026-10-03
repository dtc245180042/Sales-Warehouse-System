import uuid
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_get_products_list():
    response = client.get("/api/v1/products")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Kiểm tra cả 2 trường camelCase và snake_case đều tồn tại
    assert "salePrice" in data[0]
    assert "sale_price" in data[0]
    assert "costPrice" in data[0]


def test_create_and_update_product():
    uid = uuid.uuid4().hex[:6]
    sku = f"SKU-{uid}"
    
    # 1. Tạo mới sản phẩm
    payload = {
        "sku": sku,
        "name": f"Sản Phẩm Test {uid}",
        "category": "Điện Thoại & Tablet",
        "cost_price": 1000000.0,
        "sale_price": 1500000.0,
        "stock": 20,
        "min_stock": 5,
        "unit": "Chiếc"
    }
    create_res = client.post("/api/v1/products", json=payload)
    assert create_res.status_code == 201
    prod = create_res.json()
    assert prod["sku"] == sku
    prod_id = prod["id"]

    # 2. Chi tiết sản phẩm
    detail_res = client.get(f"/api/v1/products/{prod_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["name"] == f"Sản Phẩm Test {uid}"

    # 3. Cập nhật tồn kho (delta)
    stock_res = client.patch(f"/api/v1/products/{prod_id}/stock", json={"delta": -5})
    assert stock_res.status_code == 200
    assert stock_res.json()["stock"] == 15

    # 4. Cập nhật thông tin
    update_res = client.put(f"/api/v1/products/{prod_id}", json={"name": f"Tên Mới {uid}"})
    assert update_res.status_code == 200
    assert update_res.json()["name"] == f"Tên Mới {uid}"

    # 5. Xóa sản phẩm
    del_res = client.delete(f"/api/v1/products/{prod_id}")
    assert del_res.status_code == 200
