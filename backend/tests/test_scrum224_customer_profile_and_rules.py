import uuid
import random
import threading
from typing import Tuple, Optional, List, Dict
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_group import CustomerGroup
from app.models.customer_assignment import CustomerAssignment
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.price_list import PriceList, PriceListItem
from app.services.order_service import create_order
from app.schemas.order import OrderCreate, OrderItemCreate

client = TestClient(app)


def get_auth_token(role: str = "Admin") -> Tuple[str, User]:
    db = SessionLocal()
    user = db.query(User).filter(User.role == role, User.is_active == True).first()
    if not user:
        user = User(
            username=f"test_{role.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
            email=f"{uuid.uuid4().hex[:6]}@test.com",
            hashed_password="hashed_pw",
            role=role,
            token_version=1,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = tao_token_truy_cap({
        "sub": str(user.id),
        "user_id": user.id,
        "role": user.role,
        "token_version": user.token_version
    })
    db.close()
    return token, user


def generate_tax_code() -> str:
    """Sinh mã số thuế 10 số hợp lệ theo chuẩn Việt Nam."""
    return f"01{random.randint(10000000, 99999999)}"


def test_01_create_agency_profile_with_tax_and_region():
    """1. SCRUM-430: Tạo hồ sơ đại lý đầy đủ mã thuế, khu vực và auto-create bảng phụ."""
    token, _ = get_auth_token("Sales Manager")
    unique_code = f"DL-{uuid.uuid4().hex[:6].upper()}"
    unique_tax = generate_tax_code()

    payload = {
        "code": unique_code,
        "name": f"Đại lý Miền Bắc {unique_code}",
        "phone": "0987654321",
        "email": f"{unique_code.lower()}@daily.vn",
        "address": "123 Phố Huế, Hai Bà Trưng, Hà Nội",
        "customer_group": "TIER_1",
        "region": "Miền Bắc",
        "tax_code": unique_tax
    }

    res = client.post("/api/v1/customers", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["code"] == unique_code
    assert data["tax_code"] == unique_tax
    assert data["region"] == "Miền Bắc"
    assert data["customer_group"] == "TIER_1"
    assert data["status"] == "active"

    # Kiểm tra bảng phụ credit_profile và assignment được auto-create trong cùng transaction
    db = SessionLocal()
    credit = db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == data["id"]).first()
    assert credit is not None
    assert credit.credit_limit == 0

    assignment = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == data["id"]).first()
    assert assignment is not None
    db.close()


def test_02_duplicate_customer_code_case_insensitive():
    """2. SCRUM-431: Chặn trùng mã đại lý (không phân biệt hoa thường)."""
    token, _ = get_auth_token("Sales Manager")
    raw_code = f"DL-UNIQ-{uuid.uuid4().hex[:4]}"
    unique_tax1 = generate_tax_code()
    unique_tax2 = generate_tax_code()

    # Tạo lần 1 bằng chữ hoa
    p1 = {
        "code": raw_code.upper(),
        "name": "Đại lý Thử nghiệm A",
        "phone": "0911222333",
        "tax_code": unique_tax1
    }
    res1 = client.post("/api/v1/customers", json=p1, headers={"Authorization": f"Bearer {token}"})
    assert res1.status_code == 201

    # Tạo lần 2 bằng chữ thường
    p2 = {
        "code": raw_code.lower(),
        "name": "Đại lý Thử nghiệm B",
        "phone": "0911222444",
        "tax_code": unique_tax2
    }
    res2 = client.post("/api/v1/customers", json=p2, headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code == 400
    assert "đã tồn tại" in res2.json()["detail"].lower()


def test_03_duplicate_tax_code_blocked():
    """3. SCRUM-431: Chặn trùng mã số thuế."""
    token, _ = get_auth_token("Sales Manager")
    shared_tax = generate_tax_code()

    p1 = {
        "code": f"DL-TAX1-{uuid.uuid4().hex[:4]}",
        "name": "Công ty TNHH Minh Khang",
        "phone": "0933111222",
        "tax_code": shared_tax
    }
    res1 = client.post("/api/v1/customers", json=p1, headers={"Authorization": f"Bearer {token}"})
    assert res1.status_code == 201

    p2 = {
        "code": f"DL-TAX2-{uuid.uuid4().hex[:4]}",
        "name": "Công ty TNHH Hoàng Long",
        "phone": "0933111333",
        "tax_code": shared_tax
    }
    res2 = client.post("/api/v1/customers", json=p2, headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code == 400
    assert "mã số thuế" in res2.json()["detail"].lower()


def test_04_lock_code_modification_after_orders_exist():
    """4. SCRUM-431: Khóa không cho đổi mã đại lý khi đã phát sinh đơn hàng."""
    token, _ = get_auth_token("Sales Manager")
    db = SessionLocal()

    # Tạo đại lý
    cust = Customer(
        id=f"CUS-{uuid.uuid4().hex[:8].upper()}",
        code=f"DL-LOCK-{uuid.uuid4().hex[:4].upper()}",
        name="Đại lý Phát sinh Đơn",
        phone="0944555666",
        status="active"
    )
    db.add(cust)
    db.commit()
    cust_id = cust.id

    prod = db.query(Product).first()

    # Tạo 1 đơn hàng cho đại lý này
    order_in = OrderCreate(
        customer_id=cust_id,
        customer_name=cust.name,
        payment_method="cash",
        payment_status="paid",
        status="completed",
        items=[
            OrderItemCreate(
                product_id=str(prod.id),
                sku=prod.sku,
                name=prod.name,
                price=float(prod.price),
                quantity=1,
                discount=0.0,
                subtotal=float(prod.price)
            )
        ]
    )
    create_order(db, order_in)
    db.close()

    # Cố gắng đổi mã đại lý -> 400
    update_payload = {
        "code": f"DL-NEW-{uuid.uuid4().hex[:4].upper()}",
        "name": "Đổi tên và mã"
    }
    res = client.put(f"/api/v1/customers/{cust_id}", json=update_payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 400
    assert any(phrase in res.json()["detail"].lower() for phrase in ["giao dịch", "đơn hàng", "không được phép"])


def test_05_dynamic_order_stats_calculated_from_orders():
    """5. SCRUM-433: total_orders và total_spent tính động từ bảng orders, không tin cột tĩnh."""
    token, _ = get_auth_token("Sales Manager")
    db = SessionLocal()

    cust = Customer(
        id=f"CUS-{uuid.uuid4().hex[:8].upper()}",
        code=f"DL-STAT-{uuid.uuid4().hex[:4].upper()}",
        name="Đại lý Thống kê Doanh số",
        phone="0977888999",
        status="active"
    )
    db.add(cust)
    db.commit()
    cust_id = cust.id
    cust_name = cust.name

    prod = Product(
        name=f"Sản phẩm Test Stats {uuid.uuid4().hex[:6]}",
        sku=f"SKU-STAT-{uuid.uuid4().hex[:6].upper()}",
        price=200000,
        unit="cái",
        is_active=True
    )
    db.add(prod)
    db.commit()
    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name

    # Tạo 2 đơn hàng, mỗi đơn 2 cái (tổng 400.000 đ)
    for _ in range(2):
        order_in = OrderCreate(
            customer_id=cust_id,
            customer_name=cust_name,
            payment_method="bank_transfer",
            payment_status="paid",
            status="completed",
            items=[
                OrderItemCreate(
                    product_id=str(prod_id),
                    sku=prod_sku,
                    name=prod_name,
                    price=200000.0,
                    quantity=2,
                    discount=0.0,
                    subtotal=400000.0
                )
            ]
        )
        create_order(db, order_in)
    db.close()

    # GET thông tin đại lý
    res = client.get(f"/api/v1/customers/{cust_id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["total_orders"] == 2
    assert data["total_spent"] == 800000


def test_06_deletion_guard_blocked_when_orders_exist():
    """6. SCRUM-434: Guard xóa đại lý - chặn xóa khi có đơn hàng trong hệ thống."""
    token, _ = get_auth_token("Admin")
    db = SessionLocal()

    cust = Customer(
        id=f"CUS-{uuid.uuid4().hex[:8].upper()}",
        code=f"DL-DEL-{uuid.uuid4().hex[:4].upper()}",
        name="Đại lý Chặn Xóa",
        phone="0966777888",
        status="active"
    )
    db.add(cust)
    db.commit()
    cust_id = cust.id
    cust_name = cust.name

    prod = db.query(Product).first()

    order_in = OrderCreate(
        customer_id=cust_id,
        customer_name=cust_name,
        payment_method="cash",
        payment_status="paid",
        status="completed",
        items=[
            OrderItemCreate(
                product_id=str(prod.id),
                sku=prod.sku,
                name=prod.name,
                price=float(prod.price),
                quantity=1,
                discount=0.0,
                subtotal=float(prod.price)
            )
        ]
    )
    create_order(db, order_in)
    db.close()

    res = client.delete(f"/api/v1/customers/{cust_id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 400
    assert "đơn hàng" in res.json()["detail"].lower()


def test_07_status_toggle_to_inactive_when_cannot_delete():
    """7. SCRUM-434: Chuyển trạng thái sang 'inactive' (ngừng hoạt động) khi không được xóa."""
    token, _ = get_auth_token("Sales Manager")
    db = SessionLocal()

    cust = Customer(
        id=f"CUS-{uuid.uuid4().hex[:8].upper()}",
        code=f"DL-INACT-{uuid.uuid4().hex[:4].upper()}",
        name="Đại lý Vô hiệu hóa",
        phone="0922333444",
        status="active"
    )
    db.add(cust)
    db.commit()
    cust_id = cust.id
    db.close()

    res = client.patch(
        f"/api/v1/customers/{cust_id}/status",
        json={"status": "inactive"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "inactive"


def test_08_get_applied_price_list():
    """8. SCRUM-436: Tra cứu bảng giá áp dụng theo nhóm khách hàng; 404 khi không có."""
    token, _ = get_auth_token("Sales Manager")
    db = SessionLocal()

    cust = Customer(
        id=f"CUS-{uuid.uuid4().hex[:8].upper()}",
        code=f"DL-PL-{uuid.uuid4().hex[:4].upper()}",
        name="Đại lý VIP Bảng Giá",
        phone="0955666777",
        customer_group="VIP",
        status="active"
    )
    db.add(cust)
    db.commit()
    cust_id = cust.id

    # 1. Khi chưa có bảng giá VIP nào -> 404
    res_none = client.get(f"/api/v1/customers/{cust_id}/applied-price-list", headers={"Authorization": f"Bearer {token}"})
    if res_none.status_code == 404:
        assert "bảng giá" in res_none.json()["detail"].lower()

    # 2. Tạo bảng giá hiệu lực cho nhóm VIP
    now = datetime.now(timezone.utc)
    pl = PriceList(
        code=f"BG-VIP-{uuid.uuid4().hex[:4].upper()}",
        name="Bảng giá Siêu VIP 2026",
        customer_group="VIP",
        status="APPROVED",
        is_active=True,
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=30)
    )
    db.add(pl)
    db.commit()
    pl_id = pl.id
    db.close()

    res_found = client.get(f"/api/v1/customers/{cust_id}/applied-price-list", headers={"Authorization": f"Bearer {token}"})
    assert res_found.status_code == 200
    assert res_found.json()["price_list_id"] == pl_id


def test_09_sales_rep_cross_scope_access_returns_404():
    """9. SCRUM-430/434: Sales Rep xem đại lý ngoài phạm vi phân công bị trả về 404 (chống IDOR)."""
    db = SessionLocal()
    # Tạo 2 sales rep
    rep1 = User(
        username=f"rep1_{uuid.uuid4().hex[:6]}",
        email=f"rep1_{uuid.uuid4().hex[:6]}@test.com",
        hashed_password="pw",
        role=UserRole.SALES_REP.value,
        token_version=1,
        is_active=True
    )
    rep2 = User(
        username=f"rep2_{uuid.uuid4().hex[:6]}",
        email=f"rep2_{uuid.uuid4().hex[:6]}@test.com",
        hashed_password="pw",
        role=UserRole.SALES_REP.value,
        token_version=1,
        is_active=True
    )
    db.add(rep1)
    db.add(rep2)
    db.commit()
    rep1_id = rep1.id
    rep1_role = rep1.role
    rep1_version = rep1.token_version
    rep2_id = rep2.id

    # Tạo đại lý và gán cho rep2
    cust = Customer(
        id=f"CUS-{uuid.uuid4().hex[:8].upper()}",
        code=f"DL-REP2-{uuid.uuid4().hex[:4].upper()}",
        name="Đại lý của Rep 2",
        phone="0911888999",
        status="active"
    )
    db.add(cust)
    db.commit()
    cust_id = cust.id

    asgn = CustomerAssignment(
        customer_id=cust_id,
        assigned_staff_id=rep2_id,
        assigned_by="Admin"
    )
    db.add(asgn)
    db.commit()
    db.close()

    # Đăng nhập bằng rep1 và truy cập đại lý của rep2
    token_rep1 = tao_token_truy_cap({
        "sub": str(rep1_id),
        "user_id": rep1_id,
        "role": rep1_role,
        "token_version": rep1_version
    })

    res = client.get(f"/api/v1/customers/{cust_id}", headers={"Authorization": f"Bearer {token_rep1}"})
    assert res.status_code == 404
    assert "không tìm thấy" in res.json()["detail"].lower()


def test_10_concurrent_duplicate_code_race_condition():
    """10. SCRUM-431: Test Race Condition - Đồng thời tạo đại lý cùng mã trong MySQL, chứng minh chỉ 1 transaction thành công."""
    shared_code = f"DL-RACE-{uuid.uuid4().hex[:6].upper()}"
    results = []

    def create_cust_thread(idx: int):
        db = SessionLocal()
        try:
            c = Customer(
                id=f"CUS-RACE-{idx}-{uuid.uuid4().hex[:6].upper()}",
                code=shared_code,
                name=f"Đại lý Concurrency {idx}",
                phone=f"098800000{idx}",
                status="active"
            )
            db.add(c)
            db.commit()
            results.append(("SUCCESS", idx))
        except Exception as e:
            db.rollback()
            results.append(("FAILED", type(e).__name__))
        finally:
            db.close()

    t1 = threading.Thread(target=create_cust_thread, args=(1,))
    t2 = threading.Thread(target=create_cust_thread, args=(2,))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Trong 2 luồng đồng thời, chính xác 1 luồng thành công và 1 luồng bị chặn bởi IntegrityError/OperationalError
    success_count = sum(1 for r in results if r[0] == "SUCCESS")
    failed_count = sum(1 for r in results if r[0] == "FAILED")

    assert success_count == 1, f"Expected 1 success, got {success_count}. Results: {results}"
    assert failed_count == 1, f"Expected 1 failure due to MySQL UNIQUE constraint, got {failed_count}. Results: {results}"
