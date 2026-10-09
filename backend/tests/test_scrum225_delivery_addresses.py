import uuid
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.customer import Customer
from app.models.customer_delivery_address import CustomerDeliveryAddress
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile

client = TestClient(app)


@pytest.fixture
def setup_customer_and_product():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    
    # 1. Tạo customer test
    customer = Customer(
        id=f"CUS-TEST-{uid}",
        code=f"KH-TEST-{uid}",
        name=f"Đại lý Test {uid}",
        phone="0912345678",
        email=f"test_{uid}@agency.vn",
        address="100 Đường Nguyễn Huệ, Quận 1, TP. HCM",
        customer_group="TIER_1",
        status="active"
    )
    db.add(customer)
    
    # 2. Tạo customer khác để test cross-validation
    other_customer = Customer(
        id=f"CUS-OTHER-{uid}",
        code=f"KH-OTHER-{uid}",
        name=f"Đại lý Khác {uid}",
        phone="0987654321",
        email=f"other_{uid}@agency.vn",
        address="200 Phố Huế, Hà Nội",
        customer_group="TIER_2",
        status="active"
    )
    db.add(other_customer)

    # 3. Tạo sản phẩm test đủ tồn kho
    prod = Product(
        sku=f"SKU-TEST-{uid}",
        name=f"Sản phẩm Test {uid}",
        price=100000.0,
        status="active"
    )
    db.add(prod)
    db.flush()

    stock = ProductStockProfile(
        product_id=prod.id,
        stock=50,
        min_stock=5
    )
    db.add(stock)

    db.commit()
    db.refresh(customer)
    db.refresh(other_customer)
    db.refresh(prod)

    yield {
        "customer": customer,
        "other_customer": other_customer,
        "product": prod
    }

    # Dọn dẹp
    db.query(CustomerDeliveryAddress).filter(
        (CustomerDeliveryAddress.customer_id == customer.id) |
        (CustomerDeliveryAddress.customer_id == other_customer.id)
    ).delete()
    db.query(ProductStockProfile).filter(ProductStockProfile.product_id == prod.id).delete()
    db.query(Product).filter(Product.id == prod.id).delete()
    db.query(Customer).filter((Customer.id == customer.id) | (Customer.id == other_customer.id)).delete()
    db.commit()
    db.close()


def test_get_initial_delivery_address(setup_customer_and_product):
    cus = setup_customer_and_product["customer"]
    res = client.get(f"/api/v1/customers/{cus.id}/delivery-addresses")
    assert res.status_code == 200
    addresses = res.json()
    # Tự động khởi tạo điểm mặc định từ thông tin đại lý
    assert len(addresses) >= 1
    assert addresses[0]["is_default"] is True
    assert addresses[0]["receiver_name"] == cus.name


def test_create_and_manage_multiple_delivery_addresses(setup_customer_and_product):
    cus = setup_customer_and_product["customer"]

    # Đảm bảo đã có địa chỉ mặc định đầu tiên
    res1 = client.get(f"/api/v1/customers/{cus.id}/delivery-addresses")
    assert res1.status_code == 200

    # 1. Thêm điểm giao hàng thứ 2 (không mặc định)
    addr2_payload = {
        "name": "Kho Vận Chi Nhánh Bình Dương",
        "receiver_name": "Nguyễn Văn Kho",
        "phone": "0933112233",
        "address": "Lô 5 KCN VSIP 1, Thuận An, Bình Dương",
        "directions_note": "Xe container vào cổng số 2",
        "is_default": False,
        "status": "active"
    }
    res2 = client.post(f"/api/v1/customers/{cus.id}/delivery-addresses", json=addr2_payload)
    assert res2.status_code == 201
    addr2 = res2.json()
    assert addr2["name"] == "Kho Vận Chi Nhánh Bình Dương"
    assert addr2["is_default"] is False

    # 2. Thêm điểm thứ 3 với is_default = True -> các điểm trước phải mất cờ mặc định
    addr3_payload = {
        "name": "Kho Trung Chuyển Long An",
        "receiver_name": "Lê Thị Trưởng Kho",
        "phone": "0944556677",
        "address": "Ấp 3, Đức Hòa, Long An",
        "directions_note": "Giao trước 17h hàng ngày",
        "is_default": True,
        "status": "active"
    }
    res3 = client.post(f"/api/v1/customers/{cus.id}/delivery-addresses", json=addr3_payload)
    assert res3.status_code == 201
    addr3 = res3.json()
    assert addr3["is_default"] is True

    # Kiểm tra danh sách: addr3 phải là mặc định duy nhất
    list_res = client.get(f"/api/v1/customers/{cus.id}/delivery-addresses")
    assert list_res.status_code == 200
    all_addrs = list_res.json()
    default_addrs = [a for a in all_addrs if a["is_default"] is True]
    assert len(default_addrs) == 1
    assert default_addrs[0]["id"] == addr3["id"]

    # 3. Test set_default endpoint: Đổi lại addr2 làm mặc định
    patch_res = client.patch(f"/api/v1/delivery-addresses/{addr2['id']}/set-default")
    assert patch_res.status_code == 200
    assert patch_res.json()["is_default"] is True

    # 4. Test update endpoint
    put_res = client.put(f"/api/v1/delivery-addresses/{addr2['id']}", json={
        "name": "Kho Vận Chi Nhánh Bình Dương (Cập Nhật)",
        "receiver_name": "Nguyễn Văn Kho Trưởng",
        "phone": "0933999888"
    })
    assert put_res.status_code == 200
    assert put_res.json()["name"] == "Kho Vận Chi Nhánh Bình Dương (Cập Nhật)"
    assert put_res.json()["phone"] == "0933999888"

    # 5. Test delete endpoint
    del_res = client.delete(f"/api/v1/delivery-addresses/{addr3['id']}")
    assert del_res.status_code == 200


def test_order_with_valid_and_invalid_delivery_address(setup_customer_and_product):
    cus = setup_customer_and_product["customer"]
    other_cus = setup_customer_and_product["other_customer"]
    prod = setup_customer_and_product["product"]

    # Tạo 1 điểm giao hàng cho cus
    addr_payload = {
        "name": "Kho Giao Hàng Chuẩn",
        "receiver_name": "Trần Nhận Hàng",
        "phone": "0977889900",
        "address": "Số 15 Lê Duẩn, Bến Nghé, Quận 1",
        "directions_note": "Giao ban ngày",
        "is_default": True
    }
    res_addr = client.post(f"/api/v1/customers/{cus.id}/delivery-addresses", json=addr_payload)
    assert res_addr.status_code == 201
    valid_addr_id = res_addr.json()["id"]

    # 1. Tạo đơn hàng với điểm giao hàng HỢP LỆ
    order_valid_payload = {
        "customer_id": cus.id,
        "customer_name": cus.name,
        "delivery_address_id": valid_addr_id,
        "items": [
            {
                "product_id": prod.id,
                "sku": prod.sku,
                "name": prod.name,
                "price": 100000.0,
                "quantity": 2,
                "subtotal": 200000.0
            }
        ],
        "total": 200000.0,
        "payment_method": "cash",
        "payment_status": "paid"
    }
    res_order = client.post("/api/v1/orders", json=order_valid_payload)
    assert res_order.status_code == 201
    order_data = res_order.json()
    assert order_data["delivery_address_id"] == valid_addr_id
    assert order_data["delivery_receiver_name"] == "Trần Nhận Hàng"
    assert order_data["delivery_phone"] == "0977889900"
    assert order_data["delivery_address"] == "Số 15 Lê Duẩn, Bến Nghé, Quận 1"

    # 2. Tạo đơn hàng với điểm giao hàng của KHÁCH HÀNG KHÁC (Cross-customer validation)
    order_invalid_payload = {
        "customer_id": other_cus.id,
        "customer_name": other_cus.name,
        "delivery_address_id": valid_addr_id,  # Điểm này của 'cus', không phải của 'other_cus'
        "items": [
            {
                "product_id": prod.id,
                "sku": prod.sku,
                "name": prod.name,
                "price": 100000.0,
                "quantity": 1,
                "subtotal": 100000.0
            }
        ],
        "total": 100000.0
    }
    res_order_invalid = client.post("/api/v1/orders", json=order_invalid_payload)
    assert res_order_invalid.status_code == 400
    assert "không thuộc về đại lý" in res_order_invalid.json()["detail"]
