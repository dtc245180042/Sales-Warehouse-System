"""
Automated Test Suite for SCRUM-240 / S4-08 (SCRUM-620)
Kiểm thử toàn diện chức năng In và xuất HTML/PDF đơn hàng kèm Barcode Code128:
- Nội dung mẫu in, font tiếng Việt có dấu, watermark theo trạng thái.
- Phân quyền RBAC cho Nhân viên kinh doanh theo phân công đại lý.
- Xử lý điểm giao hàng fallback và phòng chống XSS.
"""

import pytest
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_assignment import CustomerAssignment
from app.models.order import Order, OrderItem
from app.models.order_delivery_profile import OrderDeliveryProfile
from app.services.barcode_service import generate_code128_svg

client = TestClient(app)


def _get_headers_for(username: str = "admin") -> dict:
    """Tạo token xác thực cho user test."""
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        # Tạo user phụ nếu chưa có (ví dụ sales_rep_other)
        user = User(
            username=username,
            email=f"{username}@warehouse.local",
            full_name=f"Họ Tên {username}",
            hashed_password="hash_test_pw",
            role=UserRole.SALES_REP.value if "rep" in username else UserRole.ADMIN.value,
            is_active=True,
            token_version=1
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    user_id = user.id
    uname = user.username
    urole = user.role
    tver = user.token_version or 1
    db.close()

    token = tao_token_truy_cap({
        "sub": str(user_id),
        "user_id": user_id,
        "username": uname,
        "role": urole,
        "token_version": tver
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_test_order():
    """Tạo đơn hàng test mẫu và dọn dẹp sau test."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:8]
    cust_id = f"TEST-CUST-{uid}"
    order_id = f"TEST-ORD-{uid}"
    order_code = f"DH-TEST-{uid}"

    # 1. Khách hàng test
    cust = Customer(
        id=cust_id,
        code=f"KH-TEST-{uid}",
        name="Đại Lý Phân Phối Ánh Dương & Co.",
        phone="0918889999",
        address="Số 45 Đường Hoàng Quốc Việt, Cầu Giấy, Hà Nội",
        tax_code=f"01099{uid[:5]}",
        status="active"
    )
    db.add(cust)

    # 2. Đơn hàng test
    order = Order(
        id=order_id,
        code=order_code,
        customer_id=cust_id,
        customer_name=cust.name,
        customer_phone=cust.phone,
        customer_address=cust.address,
        subtotal=8800000.0,
        discount=760000.0,
        tax=643200.0,
        total=8683200.0,
        paid_amount=0.0,
        payment_method="Ghi nợ đại lý",
        payment_status="unpaid",
        status="confirmed",
        staff_id="TEST-STAFF-1",
        staff_name="Lê Thị Sales Rep",
        note="Giao vào buổi sáng trước 11h, liên hệ bảo vệ cổng số 2.",
        created_at=datetime.now(timezone.utc)
    )
    db.add(order)
    db.commit()

    # 3. Dòng sản phẩm
    item1 = OrderItem(
        order_id=order_id,
        product_id=f"SP-01-{uid}",
        sku=f"SKU-01-{uid}",
        name="Sữa chua Vinamilk có đường 100g",
        unit="Thùng",
        price=240000.0,
        quantity=10,
        discount=120000.0,
        subtotal=2280000.0,
        discount_rate=5.0,
        applied_discount_policy_name="Chiết khấu đại lý cấp 1"
    )
    item2 = OrderItem(
        order_id=order_id,
        product_id=f"SP-02-{uid}",
        sku=f"SKU-02-{uid}",
        name="Sữa tươi tiệt trùng 100% 1L",
        unit="Thùng",
        price=320000.0,
        quantity=20,
        discount=640000.0,
        subtotal=5760000.0,
        discount_rate=10.0,
        applied_discount_policy_name="Chiết khấu số lượng lớn"
    )
    db.add(item1)
    db.add(item2)

    # 4. Điểm giao hàng
    odp = OrderDeliveryProfile(
        order_id=order_id,
        delivery_address_name="Kho Phụ 2 - Cụm CN Phú Nghĩa",
        delivery_receiver_name="Trần Văn Kho",
        delivery_phone="0988776655",
        delivery_address="Kho số 2, Cụm Công Nghiệp Phú Nghĩa, Chương Mỹ, Hà Nội",
        expected_delivery_date="15/10/2026",
        delivery_notes="Xe tải 2.5 tấn vào được tận cửa kho"
    )
    db.add(odp)
    db.commit()
    db.close()

    yield {
        "order_id": order_id,
        "order_code": order_code,
        "customer_id": cust_id
    }

    # Teardown dọn sạch dữ liệu test
    db_clean = SessionLocal()
    db_clean.query(OrderItem).filter(OrderItem.order_id == order_id).delete()
    db_clean.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id).delete()
    db_clean.query(Order).filter(Order.id == order_id).delete()
    db_clean.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cust_id).delete()
    db_clean.query(Customer).filter(Customer.id == cust_id).delete()
    db_clean.commit()
    db_clean.close()


def test_scrum617_barcode_code128_svg_generation():
    """SCRUM-617: Kiểm thử sinh mã vạch vector SVG Code128 chuẩn."""
    code = "DH-2026-999"
    svg = generate_code128_svg(code)
    assert "<svg" in svg
    assert "</svg>" in svg
    assert "<rect" in svg
    assert code in svg
    assert 'class="order-barcode-svg"' in svg


def test_scrum614_and_615_admin_can_get_print_data_and_html(sample_test_order):
    """SCRUM-614, SCRUM-615: Kiểm thử lấy print-data và print-html thành công với đầy đủ thông tin."""
    headers = _get_headers_for("admin")
    order_id = sample_test_order["order_id"]

    # 1. API print-data
    res_data = client.get(f"/api/v1/orders/{order_id}/print-data", headers=headers)
    assert res_data.status_code == 200
    json_data = res_data.json()

    assert json_data["order_id"] == order_id
    assert json_data["order_code"] == sample_test_order["order_code"]
    assert json_data["customer"]["name"] == "Đại Lý Phân Phối Ánh Dương & Co."
    assert json_data["delivery"]["receiver_name"] == "Trần Văn Kho"
    assert json_data["delivery"]["address"] == "Kho số 2, Cụm Công Nghiệp Phú Nghĩa, Chương Mỹ, Hà Nội"
    assert len(json_data["items"]) == 2
    assert "<svg" in json_data["barcode_svg"]
    assert json_data["financials"]["final_total"] == 8683200.0

    # 2. API print-html
    res_html = client.get(f"/api/v1/orders/{order_id}/print-html", headers=headers)
    assert res_html.status_code == 200
    assert "text/html" in res_html.headers.get("content-type", "")
    html_text = res_html.text

    # Kiểm tra font tiếng Việt có dấu đầy đủ
    assert "ĐƠN ĐẶT HÀNG" in html_text
    assert "Đại Lý Phân Phối Ánh Dương" in html_text
    assert "Sữa chua Vinamilk có đường" in html_text
    assert "Trần Văn Kho" in html_text
    assert "ĐẠI DIỆN ĐẠI LÝ XÁC NHẬN" in html_text
    assert "ĐẠI DIỆN KINH DOANH" in html_text
    assert "TỔNG CỘNG THANH TOÁN" in html_text
    assert "8.683.200 đ" in html_text or "8,683,200" in html_text


def test_watermark_display_by_status(sample_test_order):
    """SCRUM-614: Kiểm thử cơ chế Watermark theo trạng thái đơn hàng (chống gian lận)."""
    headers = _get_headers_for("admin")
    order_id = sample_test_order["order_id"]
    db = SessionLocal()

    # 1. Đơn nháp (draft) -> Phải có watermark "BẢN NHÁP"
    order = db.query(Order).filter(Order.id == order_id).first()
    order.status = "draft"
    db.commit()
    db.close()

    res = client.get(f"/api/v1/orders/{order_id}/print-html", headers=headers)
    assert res.status_code == 200
    assert "BẢN NHÁP — CHƯA XÁC NHẬN" in res.text

    # 2. Đơn chờ duyệt (pending) -> Phải có watermark "CHỜ PHÊ DUYỆT"
    db = SessionLocal()
    order = db.query(Order).filter(Order.id == order_id).first()
    order.status = "pending"
    db.commit()
    db.close()

    res = client.get(f"/api/v1/orders/{order_id}/print-html", headers=headers)
    assert res.status_code == 200
    assert "CHỜ PHÊ DUYỆT" in res.text

    # 3. Đơn đã hủy (cancelled) -> Phải có watermark "ĐƠN HÀNG ĐÃ HỦY"
    db = SessionLocal()
    order = db.query(Order).filter(Order.id == order_id).first()
    order.status = "cancelled"
    db.commit()
    db.close()

    res = client.get(f"/api/v1/orders/{order_id}/print-html", headers=headers)
    assert res.status_code == 200
    assert "ĐƠN HÀNG ĐÃ HỦY" in res.text

    # 4. Đơn đã xác nhận (confirmed) -> Không có watermark mờ
    db = SessionLocal()
    order = db.query(Order).filter(Order.id == order_id).first()
    order.status = "confirmed"
    db.commit()
    db.close()

    res = client.get(f"/api/v1/orders/{order_id}/print-html", headers=headers)
    assert res.status_code == 200
    assert '<div class="watermark-overlay">' not in res.text


def test_delivery_profile_fallback(sample_test_order):
    """SCRUM-614: Đơn hàng không có OrderDeliveryProfile thì tự động fallback về địa chỉ đại lý."""
    headers = _get_headers_for("admin")
    order_id = sample_test_order["order_id"]

    # Xóa OrderDeliveryProfile của đơn này
    db = SessionLocal()
    db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id).delete()
    db.commit()
    db.close()

    res = client.get(f"/api/v1/orders/{order_id}/print-data", headers=headers)
    assert res.status_code == 200
    data = res.json()
    # Fallback về tên và địa chỉ khách hàng
    assert data["delivery"]["receiver_name"] == "Đại Lý Phân Phối Ánh Dương & Co."
    assert "Số 45 Đường Hoàng Quốc Việt" in data["delivery"]["address"]


def test_scrum619_rbac_sales_rep_isolation(sample_test_order):
    """SCRUM-619: Nhân viên kinh doanh chưa được phân công phụ trách đại lý bị chặn 403 Forbidden."""
    order_id = sample_test_order["order_id"]
    cust_id = sample_test_order["customer_id"]

    # Tạo user NVKD không liên quan
    db = SessionLocal()
    other_rep = db.query(User).filter(User.username == "sales_rep_unassigned").first()
    if not other_rep:
        other_rep = User(
            username="sales_rep_unassigned",
            email="sales_rep_unassigned@warehouse.local",
            full_name="Nhân Viên Khác Chưa Phân Công",
            hashed_password="hashed_pw",
            role=UserRole.SALES_REP.value,
            is_active=True,
            token_version=1
        )
        db.add(other_rep)
        db.commit()
        db.refresh(other_rep)
    other_id = other_rep.id

    # Đảm bảo không có phân công cho other_rep với customer này
    db.query(CustomerAssignment).filter(
        CustomerAssignment.customer_id == cust_id,
        CustomerAssignment.assigned_staff_id == other_id
    ).delete()
    # Đảm bảo order staff_id không phải other_id
    order = db.query(Order).filter(Order.id == order_id).first()
    order.staff_id = "OTHER-STAFF-99"
    order.staff_name = "NVKD Khác"
    db.commit()
    db.close()

    headers_other = _get_headers_for("sales_rep_unassigned")

    # Gọi API -> Bị chặn 403 Forbidden
    res_blocked_data = client.get(f"/api/v1/orders/{order_id}/print-data", headers=headers_other)
    assert res_blocked_data.status_code == 403
    assert "chưa được phân công phụ trách" in res_blocked_data.json()["detail"]

    res_blocked_html = client.get(f"/api/v1/orders/{order_id}/print-html", headers=headers_other)
    assert res_blocked_html.status_code == 403

    # Giờ phân công đại lý cho other_rep
    db2 = SessionLocal()
    assignment = CustomerAssignment(
        customer_id=cust_id,
        assigned_staff_id=other_id,
        assigned_by="Quản lý gán",
        assigned_at=datetime.now(timezone.utc)
    )
    db2.add(assignment)
    db2.commit()
    db2.close()

    # Thử lại -> Thành công 200 OK
    res_allowed = client.get(f"/api/v1/orders/{order_id}/print-data", headers=headers_other)
    assert res_allowed.status_code == 200
    assert res_allowed.json()["order_id"] == order_id


def test_xss_protection_in_order_print(sample_test_order):
    """Kiểm thử phòng chống mã độc XSS trong ghi chú hoặc địa chỉ."""
    headers = _get_headers_for("admin")
    order_id = sample_test_order["order_id"]

    db = SessionLocal()
    order = db.query(Order).filter(Order.id == order_id).first()
    order.note = "<script>alert('xss-attack')</script>"
    db.commit()
    db.close()

    res = client.get(f"/api/v1/orders/{order_id}/print-html", headers=headers)
    assert res.status_code == 200
    # Thẻ script phải được escape thành ký tự an toàn
    assert "<script>alert('xss-attack')</script>" not in res.text
    assert "&lt;script&gt;alert(&#x27;xss-attack&#x27;)&lt;/script&gt;" in res.text or "&lt;script&gt;" in res.text
