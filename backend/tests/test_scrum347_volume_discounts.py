import uuid
from typing import Tuple, Optional, List, Dict
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.volume_discount import (
    VolumeDiscountPolicy,
    VolumeDiscountTier,
    VolumeDiscountScope,
    VolumeDiscountType,
)
from app.services.volume_discount_service import (
    calculate_volume_discount,
    delete_volume_discount_policy,
)
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


@pytest.fixture(autouse=True)
def cleanup_test_policies():
    db = SessionLocal()
    test_policies = db.query(VolumeDiscountPolicy).filter(VolumeDiscountPolicy.code.like("CK-%")).all()
    p_ids = [p.id for p in test_policies]
    if p_ids:
        db.query(VolumeDiscountTier).filter(VolumeDiscountTier.policy_id.in_(p_ids)).delete(synchronize_session=False)
        db.query(OrderItem).filter(OrderItem.applied_discount_policy_id.in_(p_ids)).update({OrderItem.applied_discount_policy_id: None}, synchronize_session=False)
        db.query(VolumeDiscountPolicy).filter(VolumeDiscountPolicy.id.in_(p_ids)).delete(synchronize_session=False)
        db.commit()
    db.close()
    yield


def test_01_create_volume_discount_policy_with_tiers_success():
    """1. Tạo chính sách chiết khấu bậc thang thành công."""
    token, user = get_auth_token("Sales Manager")
    unique_code = f"CK-TEST-{uuid.uuid4().hex[:6].upper()}"

    payload = {
        "code": unique_code,
        "name": "Chính sách chiết khấu bán buôn Q4",
        "description": "Ưu đãi số lượng lớn cho khách sỉ",
        "applied_scope": "ALL_PRODUCTS",
        "customer_group": "TIER_1",
        "valid_from": datetime.now(timezone.utc).isoformat(),
        "valid_to": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "is_active": True,
        "tiers": [
            {
                "min_quantity": 10,
                "max_quantity": 49,
                "discount_type": "PERCENT",
                "discount_value": 5.0
            },
            {
                "min_quantity": 50,
                "max_quantity": 99,
                "discount_type": "PERCENT",
                "discount_value": 10.0
            },
            {
                "min_quantity": 100,
                "max_quantity": None,
                "discount_type": "PERCENT",
                "discount_value": 15.0
            }
        ]
    }

    res = client.post("/api/v1/volume-discounts", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201
    data = res.json()
    assert data["code"] == unique_code
    assert len(data["tiers"]) == 3
    assert data["tiers"][0]["min_quantity"] == 10
    assert data["tiers"][2]["max_quantity"] is None


def test_02_tiers_overlapping_and_percent_over_100_rejected():
    """2. Bậc chồng lấn nhau hoặc % chiết khấu > 100% bị từ chối 400."""
    token, _ = get_auth_token("Admin")
    
    # Bậc giao nhau: [10-50] và [40-100]
    overlap_payload = {
        "code": f"CK-OVERLAP-{uuid.uuid4().hex[:6].upper()}",
        "name": "Chính sách lỗi bậc",
        "applied_scope": "ALL_PRODUCTS",
        "valid_from": datetime.now(timezone.utc).isoformat(),
        "tiers": [
            {"min_quantity": 10, "max_quantity": 50, "discount_type": "PERCENT", "discount_value": 5.0},
            {"min_quantity": 40, "max_quantity": 100, "discount_type": "PERCENT", "discount_value": 10.0}
        ]
    }
    res1 = client.post("/api/v1/volume-discounts", json=overlap_payload, headers={"Authorization": f"Bearer {token}"})
    assert res1.status_code == 400
    assert "chồng lấn" in res1.json()["detail"].lower() or "giao nhau" in res1.json()["detail"].lower()

    # % chiết khấu vượt 100%
    invalid_percent_payload = {
        "code": f"CK-INVPERC-{uuid.uuid4().hex[:6].upper()}",
        "name": "Chính sách % quá 100",
        "applied_scope": "ALL_PRODUCTS",
        "valid_from": datetime.now(timezone.utc).isoformat(),
        "tiers": [
            {"min_quantity": 10, "max_quantity": None, "discount_type": "PERCENT", "discount_value": 150.0}
        ]
    }
    res2 = client.post("/api/v1/volume-discounts", json=invalid_percent_payload, headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code in (400, 422)


def test_03_boundary_tier_calculation():
    """3. Kiểm tra biên đúng min_quantity, đúng max_quantity và vượt max."""
    db = SessionLocal()
    prod = Product(
        name=f"Sản phẩm Test Biên {uuid.uuid4().hex[:6]}",
        sku=f"SKU-BOUND-{uuid.uuid4().hex[:6].upper()}",
        price=100000,
        unit="cái",
        is_active=True
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    unique_code = f"CK-BOUND-{uuid.uuid4().hex[:6].upper()}"

    policy = VolumeDiscountPolicy(
        code=unique_code,
        name="Chính sách kiểm tra biên",
        applied_scope=VolumeDiscountScope.PRODUCT,
        target_id=str(prod.id),
        customer_group="ALL",
        valid_from=datetime.now(timezone.utc) - timedelta(days=1),
        valid_to=datetime.now(timezone.utc) + timedelta(days=5),
        is_active=True
    )
    db.add(policy)
    db.flush()

    tier1 = VolumeDiscountTier(policy_id=policy.id, min_quantity=10, max_quantity=20, discount_type="PERCENT", discount_value=5.0)
    tier2 = VolumeDiscountTier(policy_id=policy.id, min_quantity=21, max_quantity=50, discount_type="PERCENT", discount_value=10.0)
    db.add(tier1)
    db.add(tier2)
    db.commit()

    # Dưới min (9 sp) -> Không được chiết khấu (0%)
    c_under = calculate_volume_discount(db, str(prod.id), quantity=9)
    assert c_under.discount_rate == Decimal("0.00")

    # Đúng min bậc 1 (10 sp) -> Được 5%
    c_exact_min1 = calculate_volume_discount(db, str(prod.id), quantity=10)
    assert c_exact_min1.discount_rate == Decimal("5.00")

    # Đúng max bậc 1 (20 sp) -> Được 5%
    c_exact_max1 = calculate_volume_discount(db, str(prod.id), quantity=20)
    assert c_exact_max1.discount_rate == Decimal("5.00")

    # Đúng min bậc 2 (21 sp) -> Nhảy lên 10%
    c_exact_min2 = calculate_volume_discount(db, str(prod.id), quantity=21)
    assert c_exact_min2.discount_rate == Decimal("10.00")

    db.close()


def test_04_policy_priority_resolution():
    """4. Khi nhiều chính sách cùng khớp, chọn đúng theo ưu tiên: PRODUCT > CATEGORY > ALL."""
    db = SessionLocal()
    # Tạo sản phẩm riêng cho test priority để không bị ảnh hưởng bởi chính sách cũ
    prod = Product(
        name=f"Sản phẩm Test Priority {uuid.uuid4().hex[:6]}",
        sku=f"SKU-PRIO-{uuid.uuid4().hex[:6].upper()}",
        price=100000,
        unit="cái",
        is_active=True
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    now = datetime.now(timezone.utc)
    # Chính sách 1: Áp dụng toàn bộ (ALL_PRODUCTS) được 2%
    p_all = VolumeDiscountPolicy(
        code=f"CK-ALL-{uuid.uuid4().hex[:6].upper()}",
        name="Chính sách toàn hệ thống",
        applied_scope=VolumeDiscountScope.ALL_PRODUCTS,
        customer_group="ALL",
        valid_from=now - timedelta(days=2),
        is_active=True
    )
    db.add(p_all)
    db.flush()
    db.add(VolumeDiscountTier(policy_id=p_all.id, min_quantity=5, max_quantity=None, discount_type="PERCENT", discount_value=2.0))

    # Chính sách 2: Áp dụng riêng cho PRODUCT này được 12%
    p_prod = VolumeDiscountPolicy(
        code=f"CK-SPEC-{uuid.uuid4().hex[:6].upper()}",
        name="Chính sách đặc thù sản phẩm",
        applied_scope=VolumeDiscountScope.PRODUCT,
        target_id=str(prod.id),
        customer_group="ALL",
        valid_from=now - timedelta(days=1),
        is_active=True
    )
    db.add(p_prod)
    db.flush()
    db.add(VolumeDiscountTier(policy_id=p_prod.id, min_quantity=5, max_quantity=None, discount_type="PERCENT", discount_value=12.0))
    db.commit()

    # Tính cho 10 sản phẩm -> Hệ thống phải ưu tiên chọn p_prod (12%) thay vì p_all (2%), không cộng dồn
    calc = calculate_volume_discount(db, str(prod.id), quantity=10)
    assert calc.applied_policy_id == p_prod.id
    assert calc.discount_rate == Decimal("12.00")
    db.close()


def test_05_fixed_amount_caps_at_unit_price_no_negative_price():
    """5. FIXED_AMOUNT: discount_amount <= đơn giá (không làm giá âm)."""
    db = SessionLocal()
    prod = Product(
        name=f"Sản phẩm Test Cap {uuid.uuid4().hex[:6]}",
        sku=f"SKU-CAP-{uuid.uuid4().hex[:6].upper()}",
        price=50000,
        unit="cái",
        is_active=True
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    unit_price = int(prod.price)

    # Đặt mức giảm cố định 999.999.999 đ (vượt xa giá sản phẩm)
    p_fixed = VolumeDiscountPolicy(
        code=f"CK-FIXED-{uuid.uuid4().hex[:6].upper()}",
        name="Chính sách giảm số tiền cực lớn",
        applied_scope=VolumeDiscountScope.PRODUCT,
        target_id=str(prod.id),
        customer_group="ALL",
        valid_from=datetime.now(timezone.utc) - timedelta(days=1),
        is_active=True
    )
    db.add(p_fixed)
    db.flush()
    db.add(VolumeDiscountTier(policy_id=p_fixed.id, min_quantity=1, max_quantity=None, discount_type="FIXED_AMOUNT", discount_value=999999999))
    db.commit()

    calc = calculate_volume_discount(db, str(prod.id), quantity=2)
    # Giá cuối cùng không bao giờ được âm (tối thiểu là 0)
    assert calc.final_unit_price == 0
    assert calc.discount_amount_per_unit == unit_price
    assert calc.total_amount == 0
    db.close()


def test_06_expired_policy_not_applied():
    """6. Chính sách hết hạn (valid_to < now) không được áp dụng."""
    db = SessionLocal()
    prod = Product(
        name=f"Sản phẩm Test Expired {uuid.uuid4().hex[:6]}",
        sku=f"SKU-EXP-{uuid.uuid4().hex[:6].upper()}",
        price=80000,
        unit="cái",
        is_active=True
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    # Chính sách đã hết hạn 2 ngày trước
    p_expired = VolumeDiscountPolicy(
        code=f"CK-EXP-{uuid.uuid4().hex[:6].upper()}",
        name="Chính sách đã hết hạn",
        applied_scope=VolumeDiscountScope.PRODUCT,
        target_id=str(prod.id),
        customer_group="ALL",
        valid_from=datetime.now(timezone.utc) - timedelta(days=10),
        valid_to=datetime.now(timezone.utc) - timedelta(days=2),
        is_active=True
    )
    db.add(p_expired)
    db.flush()
    db.add(VolumeDiscountTier(policy_id=p_expired.id, min_quantity=1, max_quantity=None, discount_type="PERCENT", discount_value=20.0))
    db.commit()

    calc = calculate_volume_discount(db, str(prod.id), quantity=10)
    # Không được áp chính sách hết hạn
    assert calc.applied_policy_id != p_expired.id
    db.close()


def test_07_order_snapshot_immutability():
    """7. Snapshot vào đơn hàng lúc tạo đơn; sửa chính sách sau không đổi đơn cũ."""
    db = SessionLocal()
    prod = Product(
        name=f"Sản phẩm Test Snapshot {uuid.uuid4().hex[:6]}",
        sku=f"SKU-SNAP-{uuid.uuid4().hex[:6].upper()}",
        price=100000,
        unit="cái",
        is_active=True
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    cust = db.query(Customer).first()

    # Tạo chính sách 8%
    p = VolumeDiscountPolicy(
        code=f"CK-SNAP-{uuid.uuid4().hex[:6].upper()}",
        name="Chính sách kiểm tra Snapshot",
        applied_scope=VolumeDiscountScope.PRODUCT,
        target_id=str(prod.id),
        customer_group="ALL",
        valid_from=datetime.now(timezone.utc) - timedelta(days=1),
        is_active=True
    )
    db.add(p)
    db.flush()
    tier = VolumeDiscountTier(policy_id=p.id, min_quantity=5, max_quantity=None, discount_type="PERCENT", discount_value=8.0)
    db.add(tier)
    db.commit()

    # Tạo đơn hàng mua 10 sp
    order_in = OrderCreate(
        customer_id=cust.id,
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
                quantity=10,
                discount=0.0,
                subtotal=float(prod.price * 10)
            )
        ]
    )
    order = create_order(db, order_in)
    saved_order_item = db.query(OrderItem).filter(OrderItem.order_id == order.id).first()
    assert saved_order_item.applied_discount_policy_id == p.id
    assert saved_order_item.discount_rate == Decimal("8.00")

    # Sửa chính sách từ 8% thành 30%
    tier.discount_value = 30.0
    db.commit()

    # Dòng đơn hàng cũ vẫn giữ nguyên snapshot 8.00%, không bị đổi
    db.refresh(saved_order_item)
    assert saved_order_item.discount_rate == Decimal("8.00")
    db.close()


def test_08_delete_applied_policy_blocked():
    """8. Chính sách đã từng áp dụng vào đơn hàng: cấm xóa cứng, chỉ cho vô hiệu hóa."""
    token, user = get_auth_token("Sales Manager")
    db = SessionLocal()
    # Tìm chính sách có applied_count > 0
    p = db.query(VolumeDiscountPolicy).filter(VolumeDiscountPolicy.applied_count > 0).first()
    if not p:
        p = VolumeDiscountPolicy(
            code=f"CK-APPLIED-{uuid.uuid4().hex[:6].upper()}",
            name="Chính sách đã áp dụng",
            applied_scope="ALL_PRODUCTS",
            applied_count=3,
            valid_from=datetime.now(timezone.utc),
            is_active=True
        )
        db.add(p)
        db.commit()

    policy_id = p.id
    db.close()

    # Gọi DELETE -> Bị chặn 400
    res = client.delete(f"/api/v1/volume-discounts/{policy_id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 400
    assert "không thể xóa" in res.json()["detail"].lower()


def test_09_sales_rep_forbidden_to_create_or_modify():
    """9. Quyền: Sales Rep tạo hoặc sửa chính sách bị từ chối 403."""
    token, _ = get_auth_token("Sales Rep")
    payload = {
        "code": f"CK-REP-{uuid.uuid4().hex[:6].upper()}",
        "name": "Chính sách tạo trái phép",
        "applied_scope": "ALL_PRODUCTS",
        "valid_from": datetime.now(timezone.utc).isoformat(),
        "tiers": []
    }
    res = client.post("/api/v1/volume-discounts", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
