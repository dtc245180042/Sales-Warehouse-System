import uuid
import threading
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User
from app.models.customer import Customer
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.stock_reservation import StockReservation
from app.models.customer_warehouse_profile import CustomerWarehouseProfile
from app.models.order import Order
from app.services.inventory_reservation_service import (
    calculate_sku_availability,
    get_customer_servicing_warehouse,
    assign_customer_servicing_warehouse,
    CustomerWarehouseProfileCreate,
)

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
def s4_03_fixture():
    """Tạo bộ dữ liệu độc lập cho kiểm thử Tồn khả dụng và Giữ chỗ (S4-03)."""
    uid = uuid.uuid4().hex[:6]
    db = SessionLocal()

    # Tạo khách hàng đại lý Miền Bắc
    customer_north = Customer(
        id=f"CUS-S403-HN-{uid}",
        code=f"DL-HN-{uid}",
        name=f"Đại Lý Miền Bắc {uid}",
        phone=f"0981{uid[:4]}",
        region="Miền Bắc",
        status="active",
        customer_group="RETAIL",
    )
    db.add(customer_north)

    # Tạo khách hàng đại lý Miền Trung
    customer_central = Customer(
        id=f"CUS-S403-DN-{uid}",
        code=f"DL-DN-{uid}",
        name=f"Đại Lý Miền Trung {uid}",
        phone=f"0982{uid[:4]}",
        region="Miền Trung",
        status="active",
        customer_group="RETAIL",
    )
    db.add(customer_central)

    # Tạo sản phẩm có sẵn
    prod = Product(
        id=f"PRD-S403-{uid}",
        sku=f"SKU-S403-{uid}",
        name=f"Sản Phẩm Test S4-03 {uid}",
        unit="hộp",
        price=500000.0,
        sale_price=500000.0,
        cost_price=350000.0,
        stock=20,
        min_stock=3,
        status="active",
        is_active=True,
    )
    db.add(prod)
    db.flush()

    # Tạo hồ sơ tồn kho ProductStockProfile với 20 sản phẩm tại Kho Tổng Hà Nội
    prof = ProductStockProfile(
        product_id=prod.id,
        sku=prod.sku,
        stock=20,
        physical_stock=20,
        reserved_stock=0,
        min_stock=3,
        warehouse="Kho Tổng Hà Nội",
    )
    db.add(prof)
    db.commit()

    cust_north_id = customer_north.id
    cust_central_id = customer_central.id
    prod_id = prod.id
    sku = prod.sku
    prod_name = prod.name
    db.close()

    yield {
        "uid": uid,
        "customer_north_id": cust_north_id,
        "customer_central_id": cust_central_id,
        "product_id": prod_id,
        "sku": sku,
        "product_name": prod_name,
    }

    # Dọn dẹp sau test
    clean_db = SessionLocal()
    clean_db.query(StockReservation).filter(StockReservation.product_id == prod_id).delete()
    clean_db.query(ProductStockProfile).filter(ProductStockProfile.product_id == prod_id).delete()
    clean_db.query(Product).filter(Product.id == prod_id).delete()
    clean_db.query(CustomerWarehouseProfile).filter(CustomerWarehouseProfile.customer_id.in_([cust_north_id, cust_central_id])).delete()
    clean_db.query(Customer).filter(Customer.id.in_([cust_north_id, cust_central_id])).delete()
    clean_db.commit()
    clean_db.close()


def test_scrum505_calculate_available_stock_and_servicing_warehouse(s4_03_fixture):
    """SCRUM-505: Thiết kế và tính toán tồn khả dụng theo kho phục vụ đại lý cho từng SKU."""
    headers = _get_auth_headers()
    data = s4_03_fixture
    db = SessionLocal()

    # 1. Tra cứu kho mặc định theo đại lý Miền Bắc -> Kho Tổng Hà Nội
    wh_hn, code_hn = get_customer_servicing_warehouse(db, data["customer_north_id"])
    assert wh_hn == "Kho Tổng Hà Nội"
    assert code_hn == "WH-HANOI"

    # 2. Tra cứu kho mặc định theo đại lý Miền Trung -> Kho Đà Nẵng
    wh_dn, code_dn = get_customer_servicing_warehouse(db, data["customer_central_id"])
    assert wh_dn == "Kho Đà Nẵng"
    assert code_dn == "WH-DANANG"

    # 3. Tính tồn khả dụng: chưa có giữ chỗ -> Available = Physical = 20
    avail_res = calculate_sku_availability(
        db=db,
        customer_id=data["customer_north_id"],
        product_id=data["product_id"]
    )
    assert avail_res.physical_stock == 20
    assert avail_res.reserved_stock == 0
    assert avail_res.available_stock == 20
    assert avail_res.max_orderable_quantity == 20

    # 4. Tạo một giữ chỗ 5 sản phẩm cho đơn hàng khác
    res_mock = StockReservation(
        order_id="ORD-MOCK-001",
        order_code="DH-2026-MOCK",
        product_id=data["product_id"],
        sku=data["sku"],
        warehouse="Kho Tổng Hà Nội",
        reserved_quantity=5,
        status="active",
        note="Giữ chỗ đơn trước"
    )
    db.add(res_mock)
    db.commit()

    # 5. Tính lại: Available = Physical (20) - Reserved (5) = 15
    avail_after = calculate_sku_availability(
        db=db,
        customer_id=data["customer_north_id"],
        product_id=data["product_id"]
    )
    assert avail_after.physical_stock == 20
    assert avail_after.reserved_stock == 5
    assert avail_after.available_stock == 15
    assert avail_after.max_orderable_quantity == 15
    db.close()


def test_scrum507_api_get_availability_and_check(s4_03_fixture):
    """SCRUM-507: Cung cấp API lấy tồn khả dụng và số lượng còn có thể đặt cho từng dòng hàng."""
    headers = _get_auth_headers()
    data = s4_03_fixture

    # 1. API GET /api/v1/inventory-availabilities
    res = client.get(
        "/api/v1/inventory-availabilities",
        params={"customer_id": data["customer_north_id"], "product_id": data["product_id"]},
        headers=headers
    )
    assert res.status_code == 200
    info = res.json()
    assert info["product_id"] == data["product_id"]
    assert info["sku"] == data["sku"]
    assert info["warehouse_name"] == "Kho Tổng Hà Nội"
    assert info["physical_stock"] == 20
    assert info["available_stock"] == 20
    assert info["max_orderable_quantity"] == 20

    # 2. API POST /api/v1/inventory-availabilities/check với số lượng hợp lệ (10 <= 20)
    check_payload_valid = {
        "customer_id": data["customer_north_id"],
        "items": [
            {"product_id": data["product_id"], "sku": data["sku"], "quantity": 10}
        ]
    }
    res_check = client.post("/api/v1/inventory-availabilities/check", json=check_payload_valid, headers=headers)
    assert res_check.status_code == 200
    check_data = res_check.json()
    assert check_data["all_items_available"] is True
    assert len(check_data["items"]) == 1
    assert check_data["items"][0]["is_available"] is True
    assert check_data["items"][0]["max_orderable_quantity"] == 20


def test_scrum506_block_order_when_quantity_exceeds_available_stock(s4_03_fixture):
    """SCRUM-506: Chặn chốt đơn khi số lượng vượt tồn khả dụng và trả về số lượng tối đa còn đặt được."""
    headers = _get_auth_headers()
    data = s4_03_fixture

    # Thử tạo đơn hàng vượt quá tồn khả dụng (đặt 25, trong khi tồn chỉ có 20)
    payload_exceeded = {
        "customer_id": data["customer_north_id"],
        "customer_name": "Đại Lý Test Vượt Tồn",
        "customer_phone": "0911223344",
        "items": [
            {
                "product_id": data["product_id"],
                "sku": data["sku"],
                "name": data["product_name"],
                "price": 500000.0,
                "quantity": 25,
                "discount": 0.0,
                "subtotal": 12500000.0
            }
        ],
        "subtotal": 12500000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 12500000.0,
        "paid_amount": 12500000.0,
        "payment_method": "transfer",
        "payment_status": "paid",
        "status": "pending"
    }

    create_res = client.post("/api/v1/orders", json=payload_exceeded, headers=headers)
    assert create_res.status_code == 400
    err_detail = create_res.json()["detail"]
    # Kiểm tra thông báo chặn có nêu rõ tồn hiện có và gợi ý số lượng tối đa có thể đặt (SCRUM-506)
    assert "không đủ tồn khả dụng" in err_detail
    assert "Còn 20" in err_detail
    assert "yêu cầu 25" in err_detail
    assert "Số lượng tối đa còn có thể đặt: 20" in err_detail


def test_scrum504_reservation_creation_and_release_lifecycle(s4_03_fixture):
    """SCRUM-504: Cơ chế giữ chỗ, cập nhật tồn an toàn và nhả tồn khi hủy đơn."""
    headers = _get_auth_headers()
    data = s4_03_fixture

    # 1. Tạo đơn hàng hợp lệ 8 sản phẩm
    payload_order = {
        "customer_id": data["customer_north_id"],
        "customer_name": "Đại Lý Test Giữ Chỗ",
        "customer_phone": "0911223344",
        "items": [
            {
                "product_id": data["product_id"],
                "sku": data["sku"],
                "name": data["product_name"],
                "price": 500000.0,
                "quantity": 8,
                "discount": 0.0,
                "subtotal": 4000000.0
            }
        ],
        "subtotal": 4000000.0,
        "discount": 0.0,
        "tax": 0.0,
        "total": 4000000.0,
        "paid_amount": 4000000.0,
        "payment_method": "transfer",
        "payment_status": "paid",
        "status": "pending"
    }

    create_res = client.post("/api/v1/orders", json=payload_order, headers=headers)
    assert create_res.status_code == 201
    order_data = create_res.json()
    order_id = order_data["id"]

    # 2. Kiểm tra bản ghi stock_reservations được tạo ở trạng thái 'active'
    db = SessionLocal()
    res_rec = db.query(StockReservation).filter(
        StockReservation.order_id == order_id,
        StockReservation.status == "active"
    ).first()
    assert res_rec is not None
    assert res_rec.reserved_quantity == 8
    assert res_rec.warehouse == "Kho Tổng Hà Nội"

    # 3. Kiểm tra tồn khả dụng giảm còn 12 (20 - 8 = 12)
    stk_prof = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == data["product_id"]).first()
    assert stk_prof.stock == 12
    assert stk_prof.reserved_stock == 8
    assert stk_prof.physical_stock == 20
    db.close()

    # 4. Hủy đơn hàng và kiểm tra giữ chỗ chuyển sang 'released'
    cancel_res = client.post(f"/api/v1/orders/{order_id}/cancel", headers=headers)
    assert cancel_res.status_code == 200

    db_check = SessionLocal()
    res_cancelled = db_check.query(StockReservation).filter(StockReservation.id == res_rec.id).first()
    assert res_cancelled.status == "released"

    # Tồn khả dụng được phục hồi về 20
    stk_restored = db_check.query(ProductStockProfile).filter(ProductStockProfile.product_id == data["product_id"]).first()
    assert stk_restored.stock == 20
    assert stk_restored.reserved_stock == 0
    db_check.close()


def test_scrum504_concurrent_orders_on_low_stock_sku(s4_03_fixture):
    """
    SCRUM-504 & Acceptance Criteria S4-03:
    'Hai người cùng chốt đơn trên SKU sắp hết phải cho kết quả đúng, không âm tồn'
    Mô phỏng 2 luồng đồng thời chốt đơn trên SKU chỉ còn 3 sản phẩm:
    - User 1 đặt 2 sản phẩm.
    - User 2 đặt 2 sản phẩm.
    Tổng cầu = 4 > Tồn khả dụng = 3.
    Kết quả: Đúng 1 đơn thành công, 1 đơn bị chặn 400 Bad Request, tồn không bao giờ bị âm!
    """
    headers = _get_auth_headers()
    data = s4_03_fixture

    # Chuẩn bị tồn kho SKU chỉ còn 3 sản phẩm
    db = SessionLocal()
    stk = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == data["product_id"]).first()
    stk.stock = 3
    stk.physical_stock = 3
    stk.reserved_stock = 0
    db.commit()
    db.close()

    results = []

    def place_order_thread(buyer_name):
        client_thread = TestClient(app)
        payload = {
            "customer_id": data["customer_north_id"],
            "customer_name": buyer_name,
            "customer_phone": "0911223344",
            "items": [
                {
                    "product_id": data["product_id"],
                    "sku": data["sku"],
                    "name": data["product_name"],
                    "price": 500000.0,
                    "quantity": 2,
                    "discount": 0.0,
                    "subtotal": 1000000.0
                }
            ],
            "subtotal": 1000000.0,
            "discount": 0.0,
            "tax": 0.0,
            "total": 1000000.0,
            "paid_amount": 1000000.0,
            "payment_method": "transfer",
            "payment_status": "paid",
            "status": "pending"
        }
        res = client_thread.post("/api/v1/orders", json=payload, headers=headers)
        results.append((res.status_code, res.json()))

    t1 = threading.Thread(target=place_order_thread, args=("NVKD 1 - Luồng A",))
    t2 = threading.Thread(target=place_order_thread, args=("NVKD 2 - Luồng B",))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    status_codes = [r[0] for r in results]
    # Phải có chính xác 1 đơn 201 Created và 1 đơn 400 Bad Request
    assert 201 in status_codes, "Cần có 1 đơn chốt thành công trong tồn 3 cái"
    assert 400 in status_codes, "Đơn thứ 2 vượt tồn phải bị chặn ngay tại chỗ"

    failed_result = [r[1] for r in results if r[0] == 400][0]
    assert "không đủ tồn khả dụng" in failed_result["detail"]

    # Kiểm tra tồn kho trong cơ sở dữ liệu: tồn còn lại đúng 1, không bao giờ bị âm!
    db_verify = SessionLocal()
    stk_final = db_verify.query(ProductStockProfile).filter(ProductStockProfile.product_id == data["product_id"]).first()
    assert stk_final.stock == 1, f"Tồn khả dụng phải là 1 (3 - 2 = 1), thực tế: {stk_final.stock}"
    assert stk_final.reserved_stock == 2
    assert stk_final.stock >= 0, "TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỂ ÂM TỒN KHO"
    db_verify.close()
