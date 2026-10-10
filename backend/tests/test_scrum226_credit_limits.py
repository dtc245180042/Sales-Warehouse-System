import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile, CustomerCreditHistory
from app.models.order import Order
from app.models.order_delivery_profile import OrderDeliveryProfile
from app.services.customer_credit_service import (
    get_or_create_credit_profile,
    calculate_actual_customer_debt,
    check_credit_for_dispatch,
    update_credit_profile,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_test_orders():
    """Tự động dọn dẹp sạch mọi đơn hàng test trước và sau mỗi test case."""
    def _clean():
        db = SessionLocal()
        orders = db.query(Order).filter(
            Order.id.like("TEST-%") | Order.code.like("DH-TEST%") |
            Order.code.like("DH-BOUND%") | Order.code.like("DH-ZERO%") |
            Order.code.like("DH-PRIO%") | Order.code.like("DH-FULL%") |
            Order.code.like("DH-INTEG%") | Order.code.like("DH-OK%") |
            Order.code.like("DH-RACE%") | Order.code.like("DH-PART%") |
            Order.code.like("DH-FALL%") | Order.code.like("DH-SYNC%") |
            Order.code.like("DH-DEBT%")
        ).all()
        for o in orders:
            db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == o.id).delete()
            db.delete(o)
        db.commit()
        db.close()

    _clean()
    yield
    _clean()


def _get_auth_headers(role_name: str = "accountant"):
    """Lấy token xác thực dựa trên tài khoản người dùng thực tế trong cơ sở dữ liệu."""
    db = SessionLocal()
    # Tìm user theo vai trò tương ứng trong hệ thống
    user = None
    if role_name == "accountant":
        user = db.query(User).filter(User.username == "accountant").first()
    elif role_name == "sales_rep":
        user = db.query(User).filter(User.username == "sales_rep").first()
    elif role_name == "sales_manager":
        user = db.query(User).filter(User.username == "sales_mgr").first()
    elif role_name == "admin":
        user = db.query(User).filter(User.username == "admin").first()

    if not user:
        user = db.query(User).first()

    user_id = user.id
    username = user.username
    user_role = user.role
    user_token_version = user.token_version or 1
    db.close()

    token = tao_token_truy_cap({
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "role": user_role,
        "token_version": user_token_version
    })
    return {"Authorization": f"Bearer {token}"}


def test_get_or_create_credit_profile_default():
    """1. Lấy thông tin hồ sơ hạn mức mặc định (khởi tạo an toàn nếu chưa có)."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    assert cust is not None
    cust_id = cust.id
    db.close()

    res = client.get(f"/api/v1/customers/{cust_id}/credit-profile")
    assert res.status_code == 200
    data = res.json()
    assert data["customerId"] == cust_id
    assert "creditLimit" in data
    assert "maxDebtDays" in data
    assert "currentDebt" in data
    assert "availableCredit" in data


def test_update_credit_profile_by_accountant_success():
    """2. Kế toán cập nhật hạn mức thành công và lưu lịch sử Append-Only."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id
    db.close()

    headers = _get_auth_headers(role_name="accountant")
    payload = {
        "credit_limit": 80000000,
        "max_debt_days": 45,
        "reason": "Nâng hạn mức đại lý dịp cao điểm bán hàng vụ Tết"
    }
    res = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["creditLimit"] == 80000000
    assert data["maxDebtDays"] == 45

    # Kiểm tra lịch sử thay đổi (Append-Only)
    res_hist = client.get(f"/api/v1/customers/{cust_id}/credit-history")
    assert res_hist.status_code == 200
    histories = res_hist.json()
    assert len(histories) >= 1
    latest = histories[0]
    assert latest["newCreditLimit"] == 80000000
    assert latest["newMaxDebtDays"] == 45
    assert latest["reason"] == "Nâng hạn mức đại lý dịp cao điểm bán hàng vụ Tết"
    assert latest["changedBy"] == "accountant"


def test_update_credit_profile_sales_rep_forbidden():
    """3. Nhân viên kinh doanh (Sales Rep) không có quyền sửa hạn mức -> 403 Forbidden."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id
    db.close()

    headers = _get_auth_headers(role_name="sales_rep")
    payload = {
        "credit_limit": 150000000,
        "max_debt_days": 60,
        "reason": "Sale tự ý muốn nâng hạn mức cho khách"
    }
    res = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json=payload, headers=headers)
    assert res.status_code == 403
    assert "Chỉ Kế toán công nợ và Quản lý kinh doanh" in res.json().get("detail", "")


def test_update_credit_profile_validation_errors():
    """4. Kiểm tra các ràng buộc validation: lý do rỗng/ngắn, số âm, vượt trần 10 tỷ."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id
    db.close()

    headers = _get_auth_headers(role_name="accountant")

    # 1. Lý do chỉ toàn khoảng trắng hoặc quá ngắn
    res_short = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json={
        "credit_limit": 50000000,
        "max_debt_days": 30,
        "reason": "   abc   "
    }, headers=headers)
    assert res_short.status_code in [400, 422]

    # 2. Số tiền âm
    res_neg = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json={
        "credit_limit": -1000000,
        "max_debt_days": 30,
        "reason": "Lý do hợp lệ nhưng số tiền âm"
    }, headers=headers)
    assert res_neg.status_code in [400, 422]

    # 3. Vượt trần 10 tỷ
    res_over = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json={
        "credit_limit": 10000000001,
        "max_debt_days": 30,
        "reason": "Lý do hợp lệ nhưng vượt trần 10 tỷ"
    }, headers=headers)
    assert res_over.status_code in [400, 422]


def test_credit_check_full_payment_always_allowed():
    """5. Đơn thanh toán đủ 100% (unpaid = 0) luôn được phép xuất ngay."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id
    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 0
    db.commit()
    db.close()

    res = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 0})
    assert res.status_code == 200
    data = res.json()
    assert data["allowed"] is True


def test_credit_check_zero_limit_blocked_for_debt():
    """6. credit_limit = 0 + đơn còn thiếu tiền -> Chặn với thông báo 'chưa được cấp hạn mức'."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id
    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 0
    db.commit()
    db.close()

    res = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 5000000})
    assert res.status_code == 200
    data = res.json()
    assert data["allowed"] is False
    assert "chưa được cấp hạn mức công nợ" in data["error_message"]


def test_credit_check_amount_exceeded_and_boundary():
    """7. Kiểm tra đúng hạn mức biên vs vượt 1 đồng (không tính trùng dư nợ)."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id
    current_debt = calculate_actual_customer_debt(db, cust_id)

    prof = get_or_create_credit_profile(db, cust_id)
    # Đặt hạn mức sao cho cho phép nợ thêm chính xác 20 triệu
    prof.credit_limit = current_debt + 20000000
    prof.max_debt_days = 60
    db.commit()
    db.close()

    # Đúng bằng 20 triệu -> Cho phép
    res_exact = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 20000000})
    assert res_exact.status_code == 200
    assert res_exact.json()["allowed"] is True

    # Vượt 1 đồng (20.000.001 đ) -> Bị chặn
    res_exceeded = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 20000001})
    assert res_exceeded.status_code == 200
    data = res_exceeded.json()
    assert data["allowed"] is False
    assert "không đủ hạn mức công nợ" in data["error_message"]
    assert data["excess_amount"] >= 1


def test_credit_check_overdue_calendar_days_blocked():
    """8. Kiểm tra chặn khi có đơn hàng xuất kho quá hạn ngày lịch (calendar days)."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 500000000  # 500 triệu hạn mức rất lớn
    prof.max_debt_days = 15
    db.commit()

    # Tạo một đơn hàng cũ đã xuất kho 20 ngày trước và còn nợ tiền
    old_date = datetime.now(timezone.utc) - timedelta(days=20)
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}"
    old_order_id = f"TEST-OVERDUE-{unique_suffix}"
    old_order = Order(
        id=old_order_id,
        code=f"DH-TEST-OVERDUE-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=5000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="shipping",
        created_at=old_date
    )
    db.add(old_order)
    db.commit()

    odp = OrderDeliveryProfile(
        order_id=old_order_id,
        dispatched_at=old_date
    )
    db.add(odp)
    db.commit()
    db.close()

    try:
        # Kiểm tra đơn hàng mới cần nợ -> Phải bị chặn do có đơn quá hạn 20 ngày (tối đa 15 ngày)
        res = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 1000000})
        assert res.status_code == 200
        data = res.json()
        assert data["allowed"] is False
        assert "nợ quá hạn" in data["error_message"]
        assert data["overdue_days"] >= 20
    finally:
        # Dọn dẹp đơn test
        db2 = SessionLocal()
        db2.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == old_order_id).delete()
        db2.query(Order).filter(Order.id == old_order_id).delete()
        db2.commit()
        db2.close()


def test_credit_check_error_priority_overdue_before_credit_limit():
    """9. Thứ tự kiểm tra lỗi: Đại lý VỪA quá hạn VỪA vượt hạn mức -> Báo lỗi NỢ QUÁ HẠN trước."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 1000000  # Hạn mức chỉ 1 triệu
    prof.max_debt_days = 10
    db.commit()

    # Đơn hàng cũ nợ quá hạn 15 ngày (> 10 ngày)
    old_date = datetime.now(timezone.utc) - timedelta(days=15)
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_prio"
    old_order_id = f"TEST-PRIO-{unique_suffix}"
    old_order = Order(
        id=old_order_id,
        code=f"DH-PRIO-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=2000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="shipping",
        created_at=old_date
    )
    db.add(old_order)
    db.commit()

    odp = OrderDeliveryProfile(order_id=old_order_id, dispatched_at=old_date)
    db.add(odp)
    db.commit()
    db.close()

    try:
        # Đơn hàng mới cần nợ 50 triệu -> Cả 2 lỗi: Nợ quá hạn VÀ Vượt hạn mức
        # Thứ tự chốt: Nợ quá hạn phải được báo trước!
        res = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 50000000})
        assert res.status_code == 200
        data = res.json()
        assert data["allowed"] is False
        assert "nợ quá hạn" in data["error_message"]
    finally:
        db2 = SessionLocal()
        db2.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == old_order_id).delete()
        db2.query(Order).filter(Order.id == old_order_id).delete()
        db2.commit()
        db2.close()


def test_credit_check_full_payment_allowed_even_with_overdue_and_zero_limit():
    """10. Đơn trả đủ 100% của đại lý CÓ nợ quá hạn và credit_limit = 0 -> Vẫn được phép xuất."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 0
    prof.max_debt_days = 5
    db.commit()

    # Tạo đơn nợ quá hạn
    old_date = datetime.now(timezone.utc) - timedelta(days=10)
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_full"
    old_order_id = f"TEST-FULL-{unique_suffix}"
    old_order = Order(
        id=old_order_id,
        code=f"DH-FULL-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=1000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="shipping",
        created_at=old_date
    )
    db.add(old_order)
    db.commit()

    odp = OrderDeliveryProfile(order_id=old_order_id, dispatched_at=old_date)
    db.add(odp)
    db.commit()
    db.close()

    try:
        # Đơn khách trả đủ 100% tiền (unpaid = 0)
        res = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 0})
        assert res.status_code == 200
        data = res.json()
        assert data["allowed"] is True
    finally:
        db2 = SessionLocal()
        db2.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == old_order_id).delete()
        db2.query(Order).filter(Order.id == old_order_id).delete()
        db2.commit()
        db2.close()


def test_calendar_days_boundary():
    """11. Biên ngày lịch: đúng bằng max_debt_days (cho phép) vs vượt 1 ngày (chặn)."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    max_days = 10
    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 500000000
    prof.max_debt_days = max_days
    db.commit()

    # 1. Đơn xuất đúng bằng 10 ngày lịch trước -> (today - disp_date).days == 10 <= 10 -> Cho phép
    exact_date = datetime.now(timezone.utc) - timedelta(days=max_days)
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_bound"
    order_id_1 = f"TEST-BOUND-1-{unique_suffix}"
    order_1 = Order(
        id=order_id_1,
        code=f"DH-BOUND-1-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=1000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="shipping",
        created_at=exact_date
    )
    db.add(order_1)
    db.commit()

    odp_1 = OrderDeliveryProfile(order_id=order_id_1, dispatched_at=exact_date)
    db.add(odp_1)
    db.commit()
    db.close()

    try:
        res1 = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 500000})
        assert res1.status_code == 200
        assert res1.json()["allowed"] is True

        # Đổi mốc sang 11 ngày trước (vượt 1 ngày) -> Phải bị chặn
        db_edit = SessionLocal()
        odp_rec = db_edit.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id_1).first()
        odp_rec.dispatched_at = datetime.now(timezone.utc) - timedelta(days=max_days + 1)
        db_edit.commit()
        db_edit.close()

        res2 = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 500000})
        assert res2.status_code == 200
        assert res2.json()["allowed"] is False
        assert "nợ quá hạn" in res2.json()["error_message"]
    finally:
        db2 = SessionLocal()
        db2.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id_1).delete()
        db2.query(Order).filter(Order.id == order_id_1).delete()
        db2.commit()
        db2.close()


def test_max_debt_days_zero_logic():
    """12. max_debt_days = 0 kèm credit_limit > 0:
    - Đơn nợ xuất hôm nay (0 ngày) -> Chưa quá hạn trong ngày hôm nay.
    - Đơn nợ xuất hôm qua (1 ngày > 0) -> Quá hạn ngay ngày hôm sau.
    """
    db = SessionLocal()
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_zero"
    cust_id = f"TEST-CUST-ZERO-{unique_suffix}"
    cust = Customer(
        id=cust_id,
        code=f"KH-ZERO-{unique_suffix}",
        name=f"Khách hàng Test Zero {unique_suffix}",
        status="active"
    )
    db.add(cust)
    db.commit()

    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 500000000
    prof.max_debt_days = 0
    db.commit()

    # Đơn xuất ngày hôm nay (0 ngày)
    today_disp = datetime.now(timezone.utc)
    order_id_today = f"TEST-ZERO-TODAY-{unique_suffix}"
    order_today = Order(
        id=order_id_today,
        code=f"DH-ZERO-TODAY-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=1000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="shipping",
        created_at=today_disp
    )
    db.add(order_today)
    db.commit()

    odp = OrderDeliveryProfile(order_id=order_id_today, dispatched_at=today_disp)
    db.add(odp)
    db.commit()
    db.close()

    try:
        # Xuất hàng trong ngày: (today.date() - today.date()).days = 0 <= 0 -> Cho phép
        res_today = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 500000})
        assert res_today.status_code == 200
        assert res_today.json()["allowed"] is True

        # Đổi ngày xuất về ngày hôm qua (1 ngày trước) -> (today - yesterday).days = 1 > 0 -> Bị quá hạn ngay hôm sau!
        db_edit = SessionLocal()
        odp_rec = db_edit.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id_today).first()
        odp_rec.dispatched_at = datetime.now(timezone.utc) - timedelta(days=1)
        db_edit.commit()
        db_edit.close()

        res_next_day = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 500000})
        assert res_next_day.status_code == 200
        assert res_next_day.json()["allowed"] is False
        assert "nợ quá hạn" in res_next_day.json()["error_message"]
    finally:
        db2 = SessionLocal()
        db2.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id_today).delete()
        db2.query(Order).filter(Order.id == order_id_today).delete()
        db2.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == cust_id).delete()
        db2.query(Customer).filter(Customer.id == cust_id).delete()
        db2.commit()
        db2.close()


def test_seed_credit_profiles_idempotency():
    """13. Hồ sơ seed chạy nhiều lần đảm bảo tính Idempotent, không sinh bản ghi trùng lặp."""
    from app.services.customer_credit_service import seed_default_credit_profiles
    db = SessionLocal()
    seed_default_credit_profiles(db)
    count1 = db.query(CustomerCreditProfile).count()
    seed_default_credit_profiles(db)
    count2 = db.query(CustomerCreditProfile).count()
    assert count1 == count2
    db.close()


def test_concurrent_get_or_create_race_condition():
    """14. Mô phỏng 2 luồng đồng thời khởi tạo hồ sơ đại lý (Race Condition an toàn)."""
    import threading
    db1 = SessionLocal()
    cust = db1.query(Customer).first()
    cust_id = cust.id
    db1.close()

    results = []
    def worker():
        db_w = SessionLocal()
        try:
            prof = get_or_create_credit_profile(db_w, cust_id)
            results.append(prof.id)
        finally:
            db_w.close()

    t1 = threading.Thread(target=worker)
    t2 = threading.Thread(target=worker)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert len(results) == 2
    assert results[0] == results[1]


def test_verify_real_mysql_environment():
    """15. Xác nhận môi trường chạy test là hệ quản trị cơ sở dữ liệu MySQL thật 100%."""
    from sqlalchemy import text
    from app.core.database import engine
    assert engine.dialect.name == "mysql", f"Môi trường phải là MySQL, hiện tại là: {engine.dialect.name}"
    with engine.connect() as conn:
        res = conn.execute(text("SELECT VERSION()")).scalar()
        print(f"\n[Database Confirmed] MySQL Version: {res}")
        assert res is not None


def test_order_dispatch_api_integration_blocks_when_exceeded():
    """16. Test tích hợp API luồng xuất kho: PATCH /orders/{id}/status -> shipping bị CHẶN 400 khi vượt hạn mức."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    # Đặt hạn mức 5 triệu
    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 5000000
    prof.max_debt_days = 30
    db.commit()

    # Tạo 1 đơn hàng Pending với số tiền nợ 10 triệu (> 5 triệu)
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_integ"
    order_id = f"TEST-INTEG-{unique_suffix}"
    order = Order(
        id=order_id,
        code=f"DH-INTEG-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=10000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="pending",
        created_at=datetime.now(timezone.utc)
    )
    db.add(order)
    db.commit()
    db.close()

    try:
        # Gọi API cập nhật trạng thái đơn sang shipping (xuất kho)
        res = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "shipping"})
        assert res.status_code == 400
        detail = res.json().get("detail", "")
        assert "không đủ hạn mức công nợ" in detail

        # Kiểm tra trạng thái đơn trong DB vẫn giữ nguyên là pending, không bị chuyển bừa
        db_chk = SessionLocal()
        order_chk = db_chk.query(Order).filter(Order.id == order_id).first()
        assert order_chk.status == "pending"
        db_chk.close()
    finally:
        db2 = SessionLocal()
        db2.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id).delete()
        db2.query(Order).filter(Order.id == order_id).delete()
        db2.commit()
        db2.close()


def test_order_dispatch_api_integration_succeeds_when_within_limit():
    """17. Test tích hợp API luồng xuất kho: PATCH /orders/{id}/status -> shipping THÀNH CÔNG khi trong hạn mức."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    # Đặt hạn mức 20 triệu
    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 20000000
    prof.max_debt_days = 30
    db.commit()

    # Tạo 1 đơn hàng Pending 5 triệu
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_ok"
    order_id = f"TEST-OK-{unique_suffix}"
    order = Order(
        id=order_id,
        code=f"DH-OK-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=5000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="pending",
        created_at=datetime.now(timezone.utc)
    )
    db.add(order)
    db.commit()
    db.close()

    try:
        # Xuất kho thành công
        res = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "shipping"})
        assert res.status_code == 200
        assert res.json()["status"] == "shipping"

        # Kiểm tra dispatched_at được tự động ghi nhận
        db_chk = SessionLocal()
        odp = db_chk.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id).first()
        assert odp is not None
        assert odp.dispatched_at is not None
        db_chk.close()
    finally:
        db2 = SessionLocal()
        db2.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id).delete()
        db2.query(Order).filter(Order.id == order_id).delete()
        db2.commit()
        db2.close()


def test_concurrent_order_dispatch_race_condition_on_mysql():
    """18. Race condition xuất kho đồng thời trên MySQL (2 luồng cùng xuất 2 đơn vượt hạn mức)."""
    import threading
    from app.services.order_service import update_order_status
    from fastapi import HTTPException

    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    # Khách hàng có hạn mức chính xác 10 triệu
    prof = get_or_create_credit_profile(db, cust_id)
    current_debt = calculate_actual_customer_debt(db, cust_id)
    prof.current_debt = current_debt
    prof.credit_limit = current_debt + 10000000  # Cho phép nợ thêm tối đa đúng 10 triệu
    prof.max_debt_days = 30
    db.commit()

    # Tạo 2 đơn Pending, mỗi đơn nợ 7 triệu. (Tổng = 14 triệu > 10 triệu)
    unique_1 = f"{int(datetime.now().timestamp() * 1000)}_race1"
    unique_2 = f"{int(datetime.now().timestamp() * 1000)}_race2"
    order_id_1 = f"TEST-RACE-1-{unique_1}"
    order_id_2 = f"TEST-RACE-2-{unique_2}"

    order1 = Order(
        id=order_id_1, code=f"DH-RACE-1-{unique_1}",
        customer_id=cust_id, customer_name=cust.name,
        total=7000000, paid_amount=0,
        payment_method="debt", payment_status="unpaid",
        status="pending", created_at=datetime.now(timezone.utc)
    )
    order2 = Order(
        id=order_id_2, code=f"DH-RACE-2-{unique_2}",
        customer_id=cust_id, customer_name=cust.name,
        total=7000000, paid_amount=0,
        payment_method="debt", payment_status="unpaid",
        status="pending", created_at=datetime.now(timezone.utc)
    )
    db.add(order1)
    db.add(order2)
    db.commit()
    db.close()

    results = []
    def dispatch_worker(oid):
        db_thread = SessionLocal()
        try:
            update_order_status(db=db_thread, order_id=oid, new_status="shipping")
            results.append((oid, "SUCCESS"))
        except HTTPException as e:
            results.append((oid, f"BLOCKED_{e.status_code}"))
        finally:
            db_thread.close()

    t1 = threading.Thread(target=dispatch_worker, args=(order_id_1,))
    t2 = threading.Thread(target=dispatch_worker, args=(order_id_2,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    try:
        # Do có Pessimistic Locking with_for_update() trên CustomerCreditProfile:
        # Chính xác 1 đơn được SUCCESS và 1 đơn bị BLOCKED_400
        statuses = [r[1] for r in results]
        assert "SUCCESS" in statuses, "Phải có đúng 1 đơn hàng xuất kho thành công"
        assert "BLOCKED_400" in statuses, "Đơn hàng thứ 2 vượt hạn mức phải bị chặn với 400"
    finally:
        db_clean = SessionLocal()
        for oid in [order_id_1, order_id_2]:
            db_clean.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == oid).delete()
            db_clean.query(Order).filter(Order.id == oid).delete()
        db_clean.commit()
        db_clean.close()


def test_transaction_rollback_when_audit_fails():
    """19. Test Rollback Transaction: Ép lỗi khi ghi nhận, hạn mức và lịch sử được rollback nguyên trạng."""
    from unittest.mock import patch
    from app.schemas.customer_credit_profile import CreditProfileUpdate
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id
    prof = get_or_create_credit_profile(db, cust_id)
    initial_limit = prof.credit_limit
    initial_days = prof.max_debt_days
    hist_count_before = db.query(CustomerCreditHistory).filter(CustomerCreditHistory.customer_id == cust_id).count()

    acct_user = db.query(User).filter(User.username == "accountant").first()
    # Mock AuditLog ném lỗi RuntimeException để kiểm tra rollback
    with patch("app.services.customer_credit_service.AuditLog", side_effect=RuntimeError("Lỗi ép buộc ghi AuditLog")):
        try:
            update_credit_profile(
                db=db,
                customer_id=cust_id,
                data=CreditProfileUpdate(
                    credit_limit=999999999,
                    max_debt_days=99,
                    reason="Cập nhật giả lập thử nghiệm rollback"
                ),
                current_user=acct_user
            )
        except RuntimeError:
            pass

    db.close()

    # Kiểm tra lại DB: Hạn mức không bị thay đổi và không có lịch sử thừa
    db_verify = SessionLocal()
    prof_verify = get_or_create_credit_profile(db_verify, cust_id)
    assert prof_verify.credit_limit == initial_limit
    assert prof_verify.max_debt_days == initial_days
    hist_count_after = db_verify.query(CustomerCreditHistory).filter(CustomerCreditHistory.customer_id == cust_id).count()
    assert hist_count_after == hist_count_before
    db_verify.close()


def test_lower_credit_limit_below_current_debt():
    """20. Hạ hạn mức xuống dưới dư nợ hiện tại: Lưu thành công nhưng đơn mới nợ bị chặn ngay."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    # Tạo 1 đơn nợ 5 triệu đã xuất
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_debt"
    test_order_id = f"TEST-DEBT-{unique_suffix}"
    o = Order(
        id=test_order_id, code=f"DH-DEBT-{unique_suffix}",
        customer_id=cust_id, customer_name=cust.name,
        total=5000000, paid_amount=0,
        payment_method="debt", payment_status="unpaid",
        status="shipping", created_at=datetime.now(timezone.utc)
    )
    db.add(o)
    db.commit()
    db.close()

    try:
        headers = _get_auth_headers(role_name="accountant")
        # Kế toán hạ hạn mức xuống 2 triệu (< 5 triệu dư nợ đang có)
        payload = {
            "credit_limit": 2000000,
            "max_debt_days": 30,
            "reason": "Siết chặt công nợ do tình hình tài chính đại lý có rủi ro"
        }
        res = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json=payload, headers=headers)
        assert res.status_code == 200
        assert res.json()["creditLimit"] == 2000000

        # Sau đó kiểm tra xuất đơn mới cần nợ 500k -> 5tr + 500k = 5.5tr > 2tr -> Bị chặn ngay
        chk = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 500000})
        assert chk.status_code == 200
        assert chk.json()["allowed"] is False
        assert "không đủ hạn mức công nợ" in chk.json()["error_message"]
    finally:
        db_clean = SessionLocal()
        db_clean.query(Order).filter(Order.id == test_order_id).delete()
        db_clean.commit()
        db_clean.close()


def test_partial_payment_still_overdue_on_remaining_amount():
    """21. Thanh toán một phần (partial payment): phần còn lại vẫn bị tính nợ quá hạn."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 500000000
    prof.max_debt_days = 10
    db.commit()

    # Đơn 10 triệu, đã trả 8 triệu, còn thiếu 2 triệu, xuất 20 ngày trước
    old_date = datetime.now(timezone.utc) - timedelta(days=20)
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_part"
    order_id = f"TEST-PART-{unique_suffix}"
    order = Order(
        id=order_id,
        code=f"DH-PART-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=10000000,
        paid_amount=8000000,  # Đã trả 8tr
        payment_method="debt",
        payment_status="partial",
        status="shipping",
        created_at=old_date
    )
    db.add(order)
    db.commit()

    odp = OrderDeliveryProfile(order_id=order_id, dispatched_at=old_date)
    db.add(odp)
    db.commit()
    db.close()

    try:
        res = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 1000000})
        assert res.status_code == 200
        data = res.json()
        assert data["allowed"] is False
        assert "nợ quá hạn" in data["error_message"]
        # Phải nêu rõ số tiền nợ còn lại là 2.000.000 đ
        assert "2,000,000" in data["error_message"]
    finally:
        db2 = SessionLocal()
        db2.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id).delete()
        db2.query(Order).filter(Order.id == order_id).delete()
        db2.commit()
        db2.close()


def test_dispatched_at_fallback_to_created_at():
    """22. dispatched_at rỗng -> Hệ thống tự động fallback về created_at để tính ngày quá hạn."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    prof = get_or_create_credit_profile(db, cust_id)
    prof.credit_limit = 500000000
    prof.max_debt_days = 10
    db.commit()

    # Đơn hàng cũ KHÔNG CÓ bản ghi OrderDeliveryProfile, created_at là 25 ngày trước
    old_date = datetime.now(timezone.utc) - timedelta(days=25)
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_fall"
    order_id = f"TEST-FALL-{unique_suffix}"
    order = Order(
        id=order_id,
        code=f"DH-FALL-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=3000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="shipping",
        created_at=old_date
    )
    db.add(order)
    db.commit()
    db.close()

    try:
        # Không có dispatched_at nhưng fallback created_at -> Vẫn phát hiện quá hạn 25 ngày
        res = client.post(f"/api/v1/customers/{cust_id}/check-credit", json={"unpaid_amount": 1000000})
        assert res.status_code == 200
        data = res.json()
        assert data["allowed"] is False
        assert "nợ quá hạn" in data["error_message"]
        assert data["overdue_days"] >= 25
    finally:
        db2 = SessionLocal()
        db2.query(Order).filter(Order.id == order_id).delete()
        db2.commit()
        db2.close()


def test_boundary_limits_validation():
    """23. Kiểm tra các giá trị biên trần: đúng 10 tỷ, 365 ngày, lý do 5 và 500 ký tự."""
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id
    db.close()

    headers = _get_auth_headers(role_name="accountant")

    # 1. Đúng 10 tỷ, đúng 365 ngày, đúng 5 ký tự lý do -> HỢP LỆ
    res_valid = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json={
        "credit_limit": 10_000_000_000,
        "max_debt_days": 365,
        "reason": "12345"
    }, headers=headers)
    assert res_valid.status_code == 200
    assert res_valid.json()["creditLimit"] == 10_000_000_000
    assert res_valid.json()["maxDebtDays"] == 365

    # 2. Đúng 500 ký tự lý do -> HỢP LỆ
    long_500 = "A" * 500
    res_500 = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json={
        "credit_limit": 50000000,
        "max_debt_days": 30,
        "reason": long_500
    }, headers=headers)
    assert res_500.status_code == 200

    # 3. 501 ký tự lý do -> LỖI 422
    long_501 = "A" * 501
    res_501 = client.put(f"/api/v1/customers/{cust_id}/credit-profile", json={
        "credit_limit": 50000000,
        "max_debt_days": 30,
        "reason": long_501
    }, headers=headers)
    assert res_501.status_code in [400, 422]


def test_cache_sync_current_debt_on_cancellation():
    """24. SCRUM-452: Đồng bộ cache current_debt khi đơn hàng bị HỦY (cancel)."""
    from app.services.order_service import update_order_status
    db = SessionLocal()
    cust = db.query(Customer).first()
    cust_id = cust.id

    # Đơn hàng đang giao 8 triệu
    unique_suffix = f"{int(datetime.now().timestamp() * 1000)}_sync"
    order_id = f"TEST-SYNC-{unique_suffix}"
    order = Order(
        id=order_id,
        code=f"DH-SYNC-{unique_suffix}",
        customer_id=cust_id,
        customer_name=cust.name,
        total=8000000,
        paid_amount=0,
        payment_method="debt",
        payment_status="unpaid",
        status="pending",
        created_at=datetime.now(timezone.utc)
    )
    db.add(order)
    db.commit()

    # Chuyển sang shipping -> current_debt tăng
    prof_before = get_or_create_credit_profile(db, cust_id)
    debt_before = prof_before.current_debt

    update_order_status(db=db, order_id=order_id, new_status="shipping")
    db.refresh(prof_before)
    assert prof_before.current_debt == debt_before + 8000000

    # Chuyển sang cancelled -> current_debt tự động giảm lại đúng 8 triệu
    update_order_status(db=db, order_id=order_id, new_status="cancelled")
    db.refresh(prof_before)
    assert prof_before.current_debt == debt_before

    # Dọn dẹp
    db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order_id).delete()
    db.query(Order).filter(Order.id == order_id).delete()
    db.commit()
    db.close()


