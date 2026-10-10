import uuid
from fastapi.testclient import TestClient
from main import app
from app.core.security import tao_token_truy_cap

client = TestClient(app)


from app.core.database import SessionLocal
from app.models.auth import User

def _get_headers_for_role(role: str, username: str = None, user_id: int = None):
    db = SessionLocal()
    try:
        user = None
        if username:
            user = db.query(User).filter(User.username == username, User.role == role).first()
        if not user and user_id:
            user = db.query(User).filter(User.id == user_id, User.role == role).first()
        if not user:
            user = db.query(User).filter(User.role == role).first()
        if not user:
            user = db.query(User).first()
        
        uid = user.id if user else (user_id or 1)
        uname = user.username if user else (username or "admin")
        urole = user.role if user else role
        token_version = user.token_version if user else 1
    finally:
        db.close()

    token = tao_token_truy_cap({
        "sub": str(uid),
        "user_id": uid,
        "username": uname,
        "role": urole,
        "token_version": token_version,
    })
    return {"Authorization": f"Bearer {token}"}


def _create_test_customer():
    uid = uuid.uuid4().hex[:6]
    payload = {
        "name": f"Đại Lý Test {uid}",
        "phone": f"09{uid[:8].zfill(8)}",
        "email": f"daily_{uid}@test.vn",
        "customer_group": "TIER_1",
    }
    res = client.post("/api/v1/customers", json=payload)
    assert res.status_code == 201
    return res.json()


def _get_active_product():
    admin_headers = _get_headers_for_role("Admin", "admin", 1)
    res = client.get("/api/v1/products", headers=admin_headers)
    assert res.status_code == 200, f"Lỗi lấy sản phẩm: {res.text}"
    data = res.json()
    items = data.get("items") if isinstance(data, dict) else data
    assert len(items) > 0, f"Không có sản phẩm trong items: {items}"
    return items[0]


def test_lock_status_default_active():
    """Kiểm tra đại lý mới tạo mặc định ở trạng thái mở giao dịch."""
    cus = _create_test_customer()
    res = client.get(f"/api/v1/customer-locks/{cus['id']}/status")
    assert res.status_code == 200
    data = res.json()
    assert data["isLocked"] is False
    assert data["status"] == "active"
    assert data["lockReason"] is None


def test_lock_customer_requires_reason():
    """SC-228: Bắt buộc nhập lý do khi khoá giao dịch đại lý."""
    cus = _create_test_customer()
    accountant_headers = _get_headers_for_role("Accountant", "accountant_user", 6)

    # 1. Bỏ trống lý do
    res = client.post(
        f"/api/v1/customer-locks/{cus['id']}/lock",
        json={"reason": "   "},
        headers=accountant_headers
    )
    assert res.status_code in [400, 422]

    # 2. Lý do quá ngắn (< 3 ký tự)
    res2 = client.post(
        f"/api/v1/customer-locks/{cus['id']}/lock",
        json={"reason": "ab"},
        headers=accountant_headers
    )
    assert res2.status_code in [400, 422]


def test_lock_customer_role_permission():
    """SC-228: Chỉ Kế toán công nợ và Admin mới có quyền khoá đại lý."""
    cus = _create_test_customer()
    warehouse_headers = _get_headers_for_role("Warehouse", "wh_staff", 20)

    res = client.post(
        f"/api/v1/customer-locks/{cus['id']}/lock",
        json={"reason": "Nợ quá hạn 90 ngày"},
        headers=warehouse_headers
    )
    assert res.status_code == 403


def test_lock_customer_success_and_block_new_orders():
    """SC-228: Khoá giao dịch đại lý và chặn tuyệt đối tạo đơn hàng mới."""
    cus = _create_test_customer()
    accountant_headers = _get_headers_for_role("Accountant", "accountant_huyen", 6)
    prod = _get_active_product()
    sale_price = prod.get("salePrice") or prod.get("price") or 100000.0

    # 1. Kế toán khoá giao dịch đại lý
    lock_res = client.post(
        f"/api/v1/customer-locks/{cus['id']}/lock",
        json={"reason": "Chưa thanh toán công nợ đợt 1, nợ quá hạn 120 triệu"},
        headers=accountant_headers
    )
    assert lock_res.status_code == 200
    lock_data = lock_res.json()
    assert lock_data["isLocked"] is True
    assert lock_data["status"] == "locked"
    assert "120 triệu" in lock_data["lockReason"]

    # 2. Kiểm tra API status trả về đúng trạng thái khoá
    status_res = client.get(f"/api/v1/customer-locks/{cus['id']}/status")
    assert status_res.status_code == 200
    assert status_res.json()["isLocked"] is True

    # 3. NVKD cố tình tạo đơn mới cho đại lý bị khoá -> Bị chặn (HTTP 400)
    order_payload = {
        "customer_id": cus["id"],
        "customer_name": cus["name"],
        "customer_phone": cus.get("phone", "0900000000"),
        "items": [
            {
                "product_id": str(prod["id"]),
                "sku": prod.get("sku", "SKU-TEST"),
                "name": prod["name"],
                "price": sale_price,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": sale_price,
            }
        ],
        "subtotal": sale_price,
        "total": sale_price,
        "payment_method": "cash",
        "payment_status": "unpaid",
        "status": "pending",
    }
    create_res = client.post("/api/v1/orders", json=order_payload)
    assert create_res.status_code == 400
    assert "khoá giao dịch" in create_res.json()["detail"].lower()


def test_existing_order_can_continue_with_warning():
    """SC-228: Đơn đang dở của đại lý bị khoá vẫn xử lý tiếp được nhưng có cảnh báo."""
    cus = _create_test_customer()
    accountant_headers = _get_headers_for_role("Accountant", "accountant_user", 6)
    prod = _get_active_product()
    sale_price = prod.get("salePrice") or prod.get("price") or 100000.0

    # 1. Tạo đơn hàng khi đại lý VẪN ĐANG HOẠT ĐỘNG
    order_payload = {
        "customer_id": cus["id"],
        "customer_name": cus["name"],
        "customer_phone": cus.get("phone", "0900000000"),
        "items": [
            {
                "product_id": str(prod["id"]),
                "sku": prod.get("sku", "SKU-TEST"),
                "name": prod["name"],
                "price": sale_price,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": sale_price,
            }
        ],
        "subtotal": sale_price,
        "total": sale_price,
        "status": "pending",
    }
    order_res = client.post("/api/v1/orders", json=order_payload)
    assert order_res.status_code == 201
    order_id = order_res.json()["id"]

    # 2. Sau đó, Kế toán KHOÁ giao dịch của đại lý
    lock_res = client.post(
        f"/api/v1/customer-locks/{cus['id']}/lock",
        json={"reason": "Phát hiện rủi ro tín dụng ngân hàng"},
        headers=accountant_headers
    )
    assert lock_res.status_code == 200

    # 3. Lấy thông tin đơn hàng đang dở -> Vẫn đọc được và có gắn cảnh báo
    get_order_res = client.get(f"/api/v1/orders/{order_id}")
    assert get_order_res.status_code == 200
    order_detail = get_order_res.json()
    assert order_detail["customerIsLocked"] is True
    assert "Cảnh báo" in order_detail["customerLockWarning"]

    # 4. Tiếp tục xử lý đơn đang dở (Xác nhận đơn, chuyển shipping) -> Vẫn thành công!
    update_res = client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "confirmed"}
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "confirmed"
    assert update_res.json()["customerIsLocked"] is True


def test_unlock_customer_and_resume_order_creation():
    """SC-228: Mở khoá giao dịch đại lý và cho phép tạo đơn mới trở lại."""
    cus = _create_test_customer()
    accountant_headers = _get_headers_for_role("Accountant", "accountant_user", 6)
    prod = _get_active_product()
    sale_price = prod.get("salePrice") or prod.get("price") or 100000.0

    # 1. Khoá đại lý
    client.post(
        f"/api/v1/customer-locks/{cus['id']}/lock",
        json={"reason": "Tạm khoá đối chiếu số dư nợ"},
        headers=accountant_headers
    )

    # 2. Mở khoá đại lý
    unlock_res = client.post(
        f"/api/v1/customer-locks/{cus['id']}/unlock",
        json={"reason": "Đại lý đã hoàn tất thanh toán số dư nợ"},
        headers=accountant_headers
    )
    assert unlock_res.status_code == 200
    unlock_data = unlock_res.json()
    assert unlock_data["isLocked"] is False
    assert unlock_data["status"] == "active"

    # 3. Tạo đơn mới sau khi mở khoá -> Thành công 201
    order_payload = {
        "customer_id": cus["id"],
        "customer_name": cus["name"],
        "customer_phone": cus.get("phone", "0900000000"),
        "items": [
            {
                "product_id": str(prod["id"]),
                "sku": prod.get("sku", "SKU-TEST"),
                "name": prod["name"],
                "price": sale_price,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": sale_price,
            }
        ],
        "subtotal": sale_price,
        "total": sale_price,
        "status": "pending",
    }
    create_res = client.post("/api/v1/orders", json=order_payload)
    assert create_res.status_code == 201


def test_lock_history_tracking():
    """SC-228: Kiểm tra lịch sử thay đổi lưu vết đầy đủ."""
    cus = _create_test_customer()
    accountant_headers = _get_headers_for_role("Accountant", "accountant", 6)

    # Thao tác 1: Khoá
    client.post(
        f"/api/v1/customer-locks/{cus['id']}/lock",
        json={"reason": "Lý do kiểm tra lần 1"},
        headers=accountant_headers
    )

    # Thao tác 2: Mở
    client.post(
        f"/api/v1/customer-locks/{cus['id']}/unlock",
        json={"reason": "Mở lại sau đối chiếu lần 1"},
        headers=accountant_headers
    )

    # Lấy lịch sử
    history_res = client.get(f"/api/v1/customer-locks/{cus['id']}/history")
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history) >= 2
    assert history[0]["action"] == "unlock"
    assert history[1]["action"] == "lock"
    assert history[1]["reason"] == "Lý do kiểm tra lần 1"
    assert history[1]["actorUsername"] == "accountant"
