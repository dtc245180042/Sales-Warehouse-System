import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.price_list import PriceList, PriceListItem
from app.models.portal_idempotency import PortalIdempotencyRecord

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
def reorder_test_data():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]

    try:
        # 1. Tạo 2 đại lý riêng biệt để test cả chức năng và chống IDOR
        cust1 = Customer(
            id=f"CUST-RO1-{uid}",
            code=f"DL-RO1-{uid}",
            name=f"Đại Lý Reorder Alpha {uid}",
            phone=f"0981{uid[:6]}",
            customer_group="WHOLESALE",
            status="active"
        )
        cust2 = Customer(
            id=f"CUST-RO2-{uid}",
            code=f"DL-RO2-{uid}",
            name=f"Đại Lý Reorder Beta {uid}",
            phone=f"0982{uid[:6]}",
            customer_group="WHOLESALE",
            status="active"
        )
        db.add_all([cust1, cust2])
        db.flush()

        # Cấp hạn mức công nợ đủ lớn để tạo đơn không bị chặn
        cred1 = CustomerCreditProfile(
            customer_id=cust1.id,
            credit_limit=100000000,
            max_debt_days=30
        )
        db.add(cred1)

        # 2. Tạo User đăng nhập cho 2 đại lý
        user1 = User(
            username=f"cust_ro1_{uid}",
            email=f"ro1_{uid}@test.local",
            hashed_password="hashed_dummy_password",
            role=UserRole.CUSTOMER.value,
            customer_id=cust1.id,
            is_active=True,
            token_version=1
        )
        user2 = User(
            username=f"cust_ro2_{uid}",
            email=f"ro2_{uid}@test.local",
            hashed_password="hashed_dummy_password",
            role=UserRole.CUSTOMER.value,
            customer_id=cust2.id,
            is_active=True,
            token_version=1
        )
        db.add_all([user1, user2])
        db.flush()

        # 3. Tạo 3 sản phẩm:
        prod1 = Product(
            id=f"PRD-RO1-{uid}",
            sku=f"SKU-RO1-{uid}",
            name=f"Sản phẩm đổi giá {uid}",
            price=100000.0,
            unit="hộp",
            status="active"
        )
        prod2 = Product(
            id=f"PRD-RO2-{uid}",
            sku=f"SKU-RO2-{uid}",
            name=f"Sản phẩm giữ giá {uid}",
            price=200000.0,
            unit="chiếc",
            status="active"
        )
        prod3 = Product(
            id=f"PRD-RO3-{uid}",
            sku=f"SKU-RO3-{uid}",
            name=f"Sản phẩm ngừng kinh doanh {uid}",
            price=150000.0,
            unit="bộ",
            status="discontinued"  # NGỪNG KINH DOANH!
        )
        db.add_all([prod1, prod2, prod3])
        db.flush()

        # 4. Tạo Bảng giá hiện hành APPROVED cho nhóm WHOLESALE:
        plist = PriceList(
            code=f"PL-{uid}",
            name=f"Bảng giá hiện hành {uid}",
            customer_group="WHOLESALE",
            status="APPROVED",
            valid_from=datetime(2020, 1, 1, tzinfo=timezone.utc),
            valid_to=datetime(2030, 1, 1, tzinfo=timezone.utc),
        )
        db.add(plist)
        db.flush()

        pli1 = PriceListItem(
            price_list_id=plist.id,
            product_id=prod1.id,
            product_sku=prod1.sku,
            product_name=prod1.name,
            listed_price=100000.0,
            floor_price=120000.0,
            sale_price=140000.0,  # Giá mới hiện hành!
            status="APPROVED"
        )
        pli2 = PriceListItem(
            price_list_id=plist.id,
            product_id=prod2.id,
            product_sku=prod2.sku,
            product_name=prod2.name,
            listed_price=200000.0,
            floor_price=180000.0,
            sale_price=200000.0,
            status="APPROVED"
        )
        db.add_all([pli1, pli2])
        db.flush()

        # 5. Tạo đơn cũ cho Cust 1
        order1 = Order(
            id=f"ORD-RO1-{uid}",
            code=f"DH-RO1-{uid}",
            customer_id=cust1.id,
            customer_name=cust1.name,
            customer_phone=cust1.phone,
            status="completed",
            subtotal=650000.0,
            total=650000.0,
            payment_method="transfer",
            payment_status="paid",
            created_at=datetime(2026, 9, 1, tzinfo=timezone.utc)
        )
        db.add(order1)
        db.flush()

        item1 = OrderItem(
            order_id=order1.id,
            product_id=prod1.id,
            sku=prod1.sku,
            name=prod1.name,
            unit=prod1.unit,
            price=100000.0,
            quantity=2,
            subtotal=200000.0
        )
        item2 = OrderItem(
            order_id=order1.id,
            product_id=prod2.id,
            sku=prod2.sku,
            name=prod2.name,
            unit=prod2.unit,
            price=200000.0,
            quantity=1,
            subtotal=200000.0
        )
        item3 = OrderItem(
            order_id=order1.id,
            product_id=prod3.id,
            sku=prod3.sku,
            name=prod3.name,
            unit=prod3.unit,
            price=150000.0,
            quantity=1,
            subtotal=150000.0
        )
        db.add_all([item1, item2, item3])

        # 6. Tạo đơn của Cust 2 để kiểm thử chống IDOR
        order2 = Order(
            id=f"ORD-RO2-{uid}",
            code=f"DH-RO2-{uid}",
            customer_id=cust2.id,
            customer_name=cust2.name,
            customer_phone=cust2.phone,
            status="completed",
            subtotal=500000.0,
            total=500000.0,
            payment_status="paid",
            created_at=datetime(2026, 9, 1, tzinfo=timezone.utc)
        )
        db.add(order2)

        db.commit()

        token1 = tao_token_truy_cap({
            "sub": user1.username,
            "user_id": user1.id,
            "username": user1.username,
            "role": user1.role,
            "token_version": user1.token_version or 1
        })
        token2 = tao_token_truy_cap({
            "sub": user2.username,
            "user_id": user2.id,
            "username": user2.username,
            "role": user2.role,
            "token_version": user2.token_version or 1
        })

        result = {
            "cust1_id": cust1.id,
            "cust2_id": cust2.id,
            "headers1": {"Authorization": f"Bearer {token1}"},
            "headers2": {"Authorization": f"Bearer {token2}"},
            "order1_id": order1.id,
            "order2_id": order2.id,
            "prod1_id": prod1.id,
            "prod2_id": prod2.id,
            "prod3_id": prod3.id,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    try:
        yield result
    finally:
        cleanup_db = SessionLocal()
        try:
            # Xóa các đơn mới được sinh ra từ đơn cũ order1
            new_orders = cleanup_db.query(Order).filter(Order.copied_from_order_id == order1.id).all()
            for no in new_orders:
                cleanup_db.query(OrderItem).filter(OrderItem.order_id == no.id).delete()
                cleanup_db.delete(no)

            cleanup_db.query(OrderItem).filter(OrderItem.order_id.in_([order1.id, order2.id])).delete()
            cleanup_db.query(Order).filter(Order.id.in_([order1.id, order2.id])).delete()
            cleanup_db.query(PriceListItem).filter(PriceListItem.price_list_id == plist.id).delete()
            cleanup_db.query(PriceList).filter(PriceList.id == plist.id).delete()
            cleanup_db.query(Product).filter(Product.id.in_([prod1.id, prod2.id, prod3.id])).delete()
            cleanup_db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == cust1.id).delete()
            cleanup_db.query(User).filter(User.id.in_([user1.id, user2.id])).delete()
            cleanup_db.query(Customer).filter(Customer.id.in_([cust1.id, cust2.id])).delete()
            cleanup_db.query(PortalIdempotencyRecord).filter(PortalIdempotencyRecord.customer_id == cust1.id).delete()
            cleanup_db.commit()
        except Exception:
            cleanup_db.rollback()
        finally:
            cleanup_db.close()


def test_subtask_1_and_2_reorder_preview_discontinued_and_repricing(reorder_test_data):
    """
    Subtask 1, 2, 4:
    - Lấy thông tin xem trước đặt lại từ đơn cũ.
    - Mặt hàng ngừng kinh doanh (prod3) được xếp vào discontinued_items.
    - Mặt hàng khả dụng (prod1) được áp lại giá mới (140,000 đ thay vì 100,000 đ).
    - Cờ has_discontinued_items = True, has_price_changes = True.
    """
    data = reorder_test_data
    res = client.get(
        f"/api/portal/orders/{data['order1_id']}/reorder-preview",
        headers=data["headers1"]
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["original_order_id"] == data["order1_id"]
    assert body["has_discontinued_items"] is True
    assert body["has_price_changes"] is True

    # 1. Kiểm tra mặt hàng ngừng kinh doanh
    disc_items = body["discontinued_items"]
    assert len(disc_items) == 1
    assert disc_items[0]["product_id"] == data["prod3_id"]
    assert "ngừng kinh doanh" in disc_items[0]["reason"].lower()

    # 2. Kiểm tra mặt hàng khả dụng & áp lại giá hiện hành
    avail_items = body["available_items"]
    assert len(avail_items) == 2

    prod1_item = next(i for i in avail_items if i["product_id"] == data["prod1_id"])
    assert prod1_item["old_price"] == 100000.0
    assert prod1_item["current_price"] == 140000.0  # Giá mới trong bảng giá!
    assert prod1_item["is_price_changed"] is True
    assert prod1_item["price_difference"] == 40000.0
    assert prod1_item["estimated_subtotal"] == 2 * 140000.0

    prod2_item = next(i for i in avail_items if i["product_id"] == data["prod2_id"])
    assert prod2_item["current_price"] == 200000.0
    assert prod2_item["is_price_changed"] is False


def test_subtask_3_and_4_create_reorder_full_and_repricing(reorder_test_data):
    """
    Subtask 3:
    - Tạo đơn đặt lại toàn bộ mặt hàng khả dụng (prod1 và prod2).
    - Dù client có gửi kèm prod3 (ngừng kinh doanh), hệ thống tự động loại bỏ prod3.
    - Đơn mới được áp giá hiện hành: prod1 giá 140k, prod2 giá 200k.
    - Lưu vết copied_from_order_id = đơn cũ.
    """
    data = reorder_test_data
    idem_key = str(uuid.uuid4())

    payload = {
        "selected_items": [
            {"product_id": data["prod1_id"], "quantity": 2},
            {"product_id": data["prod2_id"], "quantity": 1},
            {"product_id": data["prod3_id"], "quantity": 1},  # Cố tình gửi mặt hàng ngừng kinh doanh
        ],
        "delivery_notes": "Giao giờ hành chính",
        "expected_delivery_date": "2026-10-30"
    }

    res = client.post(
        f"/api/portal/orders/{data['order1_id']}/reorder",
        headers={**data["headers1"], "X-Idempotency-Key": idem_key},
        json=payload
    )
    assert res.status_code == 201, res.text
    body = res.json()

    assert body["copied_from_order_id"] == data["order1_id"]
    assert body["status"] == "pending"
    assert body["items_count"] == 2  # Chỉ 2 mặt hàng hợp lệ được đưa vào đơn!

    # Kiểm tra mặt hàng ngừng kinh doanh bị loại
    removed = body["removed_discontinued_items"]
    assert len(removed) == 1
    assert removed[0]["product_id"] == data["prod3_id"]

    # Kiểm tra tổng tiền tính theo giá mới: (2 * 140,000) + (1 * 200,000) = 480,000 đ
    assert body["total"] == 480000.0
    assert len(body["price_change_warnings"]) >= 1

    # Kiểm tra trong cơ sở dữ liệu chi tiết đơn mới
    db = SessionLocal()
    new_order = db.query(Order).filter(Order.id == body["order_id"]).first()
    assert new_order is not None
    assert new_order.copied_from_order_id == data["order1_id"]
    assert len(new_order.items) == 2

    # Đơn giá trong OrderItem được lưu là giá mới 140,000 đ
    item1 = next(it for it in new_order.items if it.product_id == data["prod1_id"])
    assert item1.price == 140000.0
    assert item1.subtotal == 280000.0
    db.close()


def test_subtask_3_create_reorder_partial(reorder_test_data):
    """
    Subtask 3:
    - Đặt lại một phần dòng hàng: Chỉ chọn 1 mặt hàng (prod2), bỏ qua prod1.
    """
    data = reorder_test_data
    idem_key = str(uuid.uuid4())

    payload = {
        "selected_items": [
            {"product_id": data["prod2_id"], "quantity": 3},  # Chỉ đặt lại prod2 với số lượng 3
        ]
    }

    res = client.post(
        f"/api/portal/orders/{data['order1_id']}/reorder",
        headers={**data["headers1"], "X-Idempotency-Key": idem_key},
        json=payload
    )
    assert res.status_code == 201, res.text
    body = res.json()

    assert body["items_count"] == 1
    assert body["total"] == 3 * 200000.0  # 600,000 đ


def test_subtask_all_discontinued_rejects(reorder_test_data):
    """
    Subtask 2:
    - Nếu đại lý chỉ chọn các mặt hàng mà tất cả đều đã ngừng kinh doanh -> Báo lỗi 400 Bad Request.
    """
    data = reorder_test_data
    idem_key = str(uuid.uuid4())

    payload = {
        "selected_items": [
            {"product_id": data["prod3_id"], "quantity": 1},  # Chỉ chọn sản phẩm đã ngừng kinh doanh
        ]
    }

    res = client.post(
        f"/api/portal/orders/{data['order1_id']}/reorder",
        headers={**data["headers1"], "X-Idempotency-Key": idem_key},
        json=payload
    )
    assert res.status_code == 400
    assert "ngừng kinh doanh" in res.json()["detail"].lower()


def test_subtask_5_anti_idor_isolation(reorder_test_data):
    """
    Subtask 5:
    - Chống IDOR: Đại lý 1 không thể xem trước hoặc đặt lại đơn của Đại lý 2.
    - Đại lý 2 không thể xem trước hoặc đặt lại đơn của Đại lý 1.
    """
    data = reorder_test_data

    # 1. Cust 1 cố gắng xem preview đơn của Cust 2 -> 403 Forbidden
    res_preview = client.get(
        f"/api/portal/orders/{data['order2_id']}/reorder-preview",
        headers=data["headers1"]
    )
    assert res_preview.status_code == 403

    # 2. Cust 1 cố gắng đặt lại từ đơn của Cust 2 -> 403 Forbidden
    res_reorder = client.post(
        f"/api/portal/orders/{data['order2_id']}/reorder",
        headers={**data["headers1"], "X-Idempotency-Key": str(uuid.uuid4())},
        json={"selected_items": [{"product_id": data["prod1_id"], "quantity": 1}]}
    )
    assert res_reorder.status_code == 403
