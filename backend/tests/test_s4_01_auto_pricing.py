import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User
from app.models.customer import Customer
from app.models.product import Product
from app.models.price_list import PriceList, PriceListItem
from app.models.volume_discount import (
    VolumeDiscountPolicy,
    VolumeDiscountTier,
    VolumeDiscountScope,
    VolumeDiscountType,
)
from app.models.order import Order

client = TestClient(app)


def _get_auth_header(role="Admin"):
    db = SessionLocal()
    user = db.query(User).filter(User.role == role, User.is_active == True).first()
    if not user:
        user = User(
            username=f"user_{uuid.uuid4().hex[:6]}",
            email=f"{uuid.uuid4().hex[:6]}@example.com",
            hashed_password="pw",
            role=role,
            is_active=True,
            token_version=1
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = tao_token_truy_cap({
        "sub": str(user.id),
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "token_version": user.token_version
    })
    db.close()
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def pricing_fixtures():
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # 1. Tạo sản phẩm test
    prod1 = Product(
        id=f"PRD-AUTO-{uid}-1",
        sku=f"SKU-AUTO-{uid}-1",
        name=f"Sản phẩm Test Tự Động 1 {uid}",
        category="Điện tử",
        unit="chiếc",
        price=30000000.0,
        status="ACTIVE"
    )
    prod2 = Product(
        id=f"PRD-AUTO-{uid}-2",
        sku=f"SKU-AUTO-{uid}-2",
        name=f"Sản phẩm Test Tự Động 2 {uid}",
        category="Phụ kiện",
        unit="cái",
        price=1000000.0,
        status="ACTIVE"
    )
    # Sản phẩm chưa có bảng giá
    prod_no_pl = Product(
        id=f"PRD-NOPL-{uid}",
        sku=f"SKU-NOPL-{uid}",
        name=f"Sản phẩm Không Có Bảng Giá {uid}",
        category="Khác",
        unit="chiếc",
        price=5000000.0,
        status="ACTIVE"
    )
    db.add_all([prod1, prod2, prod_no_pl])
    db.commit()

    # 2. Tạo 2 đại lý thuộc nhóm Cấp 1 và Cấp 2
    cus_t1 = Customer(
        id=f"CUS-T1-{uid}",
        code=f"DL-T1-{uid}",
        name=f"Đại Lý Cấp 1 {uid}",
        customer_group="TIER_1",
        status="active"
    )
    cus_t2 = Customer(
        id=f"CUS-T2-{uid}",
        code=f"DL-T2-{uid}",
        name=f"Đại Lý Cấp 2 {uid}",
        customer_group="TIER_2",
        status="active"
    )
    # Khách hàng thuộc nhóm chưa có bảng giá
    cus_no_pl = Customer(
        id=f"CUS-NOPL-{uid}",
        code=f"DL-NOPL-{uid}",
        name=f"Khách Mua Sỉ Chưa Có Bảng Giá {uid}",
        customer_group="WHOLESALE_NOPL",
        status="active"
    )
    db.add_all([cus_t1, cus_t2, cus_no_pl])
    db.commit()

    # 3. Tạo bảng giá hiệu lực cho TIER_1 (Sale = 25M, Floor = 23M)
    pl_t1 = PriceList(
        code=f"PL-T1-{uid}",
        name=f"Bảng giá Cấp 1 {uid}",
        customer_group="TIER_1",
        status="APPROVED",
        is_active=True,
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=30),
    )
    db.add(pl_t1)
    db.commit()
    db.refresh(pl_t1)

    pli_t1_1 = PriceListItem(
        price_list_id=pl_t1.id,
        product_id=str(prod1.id),
        product_sku=prod1.sku,
        product_name=prod1.name,
        unit=prod1.unit,
        listed_price=30000000.0,
        floor_price=23000000.0,
        sale_price=25000000.0,
        discount_percent=16.67,
        status="APPROVED"
    )
    pli_t1_2 = PriceListItem(
        price_list_id=pl_t1.id,
        product_id=str(prod2.id),
        product_sku=prod2.sku,
        product_name=prod2.name,
        unit=prod2.unit,
        listed_price=1000000.0,
        floor_price=800000.0,
        sale_price=900000.0,
        discount_percent=10.0,
        status="APPROVED"
    )
    db.add_all([pli_t1_1, pli_t1_2])

    # 4. Tạo bảng giá hiệu lực cho TIER_2 (Sale = 27M, Floor = 24M)
    pl_t2 = PriceList(
        code=f"PL-T2-{uid}",
        name=f"Bảng giá Cấp 2 {uid}",
        customer_group="TIER_2",
        status="APPROVED",
        is_active=True,
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=30),
    )
    db.add(pl_t2)
    db.commit()
    db.refresh(pl_t2)

    pli_t2_1 = PriceListItem(
        price_list_id=pl_t2.id,
        product_id=str(prod1.id),
        product_sku=prod1.sku,
        product_name=prod1.name,
        unit=prod1.unit,
        listed_price=30000000.0,
        floor_price=24000000.0,
        sale_price=27000000.0,
        discount_percent=10.0,
        status="APPROVED"
    )
    db.add(pli_t2_1)

    # 5. Tạo chính sách chiết khấu theo sản lượng (SCRUM-491)
    # Bậc: 10 - 49 -> 5%; 50 trở lên -> 10%
    disc_policy = VolumeDiscountPolicy(
        code=f"CK-{uid}",
        name=f"Chiết khấu sản lượng {uid}",
        applied_scope=VolumeDiscountScope.PRODUCT,
        target_id=str(prod1.id),
        customer_group="ALL",
        valid_from=now - timedelta(days=1),
        valid_to=now + timedelta(days=30),
        is_active=True
    )
    db.add(disc_policy)
    db.commit()
    db.refresh(disc_policy)

    tier1 = VolumeDiscountTier(
        policy_id=disc_policy.id,
        min_quantity=10,
        max_quantity=49,
        discount_type=VolumeDiscountType.PERCENT,
        discount_value=Decimal("5.0")
    )
    tier2 = VolumeDiscountTier(
        policy_id=disc_policy.id,
        min_quantity=50,
        max_quantity=None,
        discount_type=VolumeDiscountType.PERCENT,
        discount_value=Decimal("10.0")
    )
    db.add_all([tier1, tier2])
    db.commit()

    data = {
        "prod1": prod1,
        "prod2": prod2,
        "prod_no_pl": prod_no_pl,
        "cus_t1": cus_t1,
        "cus_t2": cus_t2,
        "cus_no_pl": cus_no_pl,
        "pl_t1": pl_t1,
        "pl_t2": pl_t2,
        "disc_policy": disc_policy,
    }
    yield data
    db.close()


def test_lookup_line_pricing_default_by_customer_group(pricing_fixtures):
    """
    SCRUM-488 & SCRUM-489:
    Xác định giá bán mặc định và giá sàn tự động theo nhóm khách hàng và SKU.
    """
    headers = _get_auth_header("SalesRep")
    prod1 = pricing_fixtures["prod1"]
    cus_t1 = pricing_fixtures["cus_t1"]
    cus_t2 = pricing_fixtures["cus_t2"]

    # 1. Tra cứu cho Đại lý Cấp 1 -> giá 25,000,000, sàn 23,000,000
    res1 = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={"customer_id": cus_t1.id, "product_id": str(prod1.id), "quantity": 1}
    )
    assert res1.status_code == 200, res1.text
    d1 = res1.json()
    assert d1["success"] is True
    assert d1["customer_group"] == "TIER_1"
    assert d1["default_price"] == 25000000.0
    assert d1["applied_unit_price"] == 25000000.0
    assert d1["floor_price"] == 23000000.0
    assert d1["is_below_floor"] is False
    assert d1["requires_approval"] is False

    # 2. Tra cứu cho Đại lý Cấp 2 -> giá 27,000,000, sàn 24,000,000
    res2 = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={"customer_id": cus_t2.id, "sku": prod1.sku, "quantity": 1}
    )
    assert res2.status_code == 200, res2.text
    d2 = res2.json()
    assert d2["customer_group"] == "TIER_2"
    assert d2["default_price"] == 27000000.0
    assert d2["applied_unit_price"] == 27000000.0
    assert d2["floor_price"] == 24000000.0


def test_block_when_sku_has_no_effective_price_list(pricing_fixtures):
    """
    SCRUM-492: Chặn thêm dòng hàng khi SKU không có bảng giá hiệu lực và trả thông báo lỗi rõ lý do.
    """
    headers = _get_auth_header("SalesRep")
    cus_t1 = pricing_fixtures["cus_t1"]
    cus_no_pl = pricing_fixtures["cus_no_pl"]
    prod_no_pl = pricing_fixtures["prod_no_pl"]

    # Tình huống 1: Nhóm khách hàng chưa có bảng giá hiệu lực
    res1 = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={"customer_id": cus_no_pl.id, "product_id": str(prod_no_pl.id), "quantity": 1}
    )
    assert res1.status_code == 400
    assert "Không có bảng giá nào đang có hiệu lực" in res1.json()["detail"]

    # Tình huống 2: Khách hàng có bảng giá nhưng sản phẩm không nằm trong bảng giá
    res2 = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={"customer_id": cus_t1.id, "product_id": str(prod_no_pl.id), "quantity": 1}
    )
    assert res2.status_code == 400
    assert "chưa có trong bảng giá hiệu lực" in res2.json()["detail"]


def test_recalculate_volume_discount_on_quantity_change(pricing_fixtures):
    """
    SCRUM-491: Tính lại chiết khấu theo sản lượng mỗi khi số lượng dòng hàng thay đổi.
    """
    headers = _get_auth_header("SalesRep")
    prod1 = pricing_fixtures["prod1"]
    cus_t1 = pricing_fixtures["cus_t1"]

    # Số lượng = 5 (< 10) -> Chiết khấu = 0%
    res_qty5 = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={"customer_id": cus_t1.id, "product_id": str(prod1.id), "quantity": 5}
    )
    d5 = res_qty5.json()
    assert d5["quantity"] == 5
    assert d5["discount_rate"] == 0.0
    assert d5["total_discount"] == 0.0
    assert d5["final_unit_price"] == 25000000.0

    # Số lượng = 20 (bậc 10-49) -> Chiết khấu 5%
    # Đơn giá 25M, giảm 5% = 1,250,000 đ/chiếc -> Đơn giá sau giảm = 23,750,000 đ
    res_qty20 = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={"customer_id": cus_t1.id, "product_id": str(prod1.id), "quantity": 20}
    )
    d20 = res_qty20.json()
    assert d20["quantity"] == 20
    assert d20["discount_rate"] == 5.0
    assert d20["discount_amount_per_unit"] == 1250000.0
    assert d20["total_discount"] == 1250000.0 * 20
    assert d20["final_unit_price"] == 23750000.0

    # Số lượng = 50 (bậc >= 50) -> Chiết khấu 10%
    # Giảm 10% = 2,500,000 đ/chiếc -> Đơn giá sau giảm = 22,500,000 đ
    res_qty50 = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={"customer_id": cus_t1.id, "product_id": str(prod1.id), "quantity": 50}
    )
    d50 = res_qty50.json()
    assert d50["quantity"] == 50
    assert d50["discount_rate"] == 10.0
    assert d50["discount_amount_per_unit"] == 2500000.0
    assert d50["final_unit_price"] == 22500000.0


def test_manual_price_floor_price_check_and_approval(pricing_fixtures):
    """
    SCRUM-490: Kiểm tra giá sàn khi người dùng sửa giá thủ công và gắn trạng thái cần duyệt.
    """
    headers = _get_auth_header("SalesRep")
    prod1 = pricing_fixtures["prod1"]
    cus_t1 = pricing_fixtures["cus_t1"]
    # Giá sàn quy định của prod1 cho TIER_1 là 23,000,000 đ

    # Trường hợp A: Sửa giá thủ công >= giá sàn (24,000,000 đ) -> Hợp lệ, không cần duyệt
    res_ok = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={
            "customer_id": cus_t1.id,
            "product_id": str(prod1.id),
            "quantity": 2,
            "custom_price": 24000000.0
        }
    )
    d_ok = res_ok.json()
    assert d_ok["applied_unit_price"] == 24000000.0
    assert d_ok["is_manual_price"] is True
    assert d_ok["is_below_floor"] is False
    assert d_ok["requires_approval"] is False

    # Trường hợp B: Sửa giá thủ công < giá sàn (21,500,000 đ < 23,000,000 đ) -> CẦN DUYỆT!
    res_subfloor = client.post(
        "/api/v1/order-pricings/lookup-line",
        headers=headers,
        json={
            "customer_id": cus_t1.id,
            "product_id": str(prod1.id),
            "quantity": 2,
            "custom_price": 21500000.0
        }
    )
    d_sub = res_subfloor.json()
    assert d_sub["applied_unit_price"] == 21500000.0
    assert d_sub["is_manual_price"] is True
    assert d_sub["is_below_floor"] is True
    assert d_sub["requires_approval"] is True
    assert "thấp hơn giá sàn quy định" in d_sub["approval_reason"]


def test_order_creation_with_subfloor_price_sets_pending_approval(pricing_fixtures):
    """
    SCRUM-490 & SCRUM-494: Tạo đơn hàng với sản phẩm sửa giá dưới sàn,
    kiểm tra đơn hàng tự động gắn trạng thái 'pending_approval' và cờ requires_approval.
    """
    headers = _get_auth_header("SalesRep")
    prod1 = pricing_fixtures["prod1"]
    cus_t1 = pricing_fixtures["cus_t1"]

    order_payload = {
        "customer_id": cus_t1.id,
        "customer_name": cus_t1.name,
        "items": [
            {
                "product_id": str(prod1.id),
                "sku": prod1.sku,
                "name": prod1.name,
                "quantity": 1,
                "price": 20000000.0,  # Dưới giá sàn (23,000,000 đ)
                "subtotal": 20000000.0
            }
        ],
        "total": 20000000.0,
        "status": "pending"
    }

    res = client.post("/api/v1/orders", headers=headers, json=order_payload)
    assert res.status_code == 201, res.text
    data = res.json()
    # Kiểm tra trạng thái đơn bị đổi sang pending_approval do bán dưới giá sàn
    assert data["requires_approval"] is True or data.get("requiresApproval") is True
    assert data["status"] == "pending_approval"
    assert "thấp hơn giá sàn" in (data.get("approval_reason") or "")
    # Dòng hàng ghi nhận đúng giá sàn và cờ is_below_floor
    assert data["items"][0]["floor_price"] == 23000000.0
    assert data["items"][0]["is_below_floor"] is True


def test_order_creation_blocked_when_product_has_no_effective_price_list(pricing_fixtures):
    """
    SCRUM-492: Chặn tạo đơn hàng khi có sản phẩm không có bảng giá hiệu lực.
    """
    headers = _get_auth_header("SalesRep")
    cus_t1 = pricing_fixtures["cus_t1"]
    prod_no_pl = pricing_fixtures["prod_no_pl"]

    order_payload = {
        "customer_id": cus_t1.id,
        "customer_name": cus_t1.name,
        "items": [
            {
                "product_id": str(prod_no_pl.id),
                "sku": prod_no_pl.sku,
                "name": prod_no_pl.name,
                "quantity": 1,
                "price": 5000000.0,
                "subtotal": 5000000.0
            }
        ],
        "total": 5000000.0,
        "status": "pending"
    }

    res = client.post("/api/v1/orders", headers=headers, json=order_payload)
    assert res.status_code == 400
    assert "chưa có trong bảng giá hiệu lực" in res.json()["detail"]


def test_validate_cart_api(pricing_fixtures):
    """
    Kiểm tra endpoint /validate-cart cho giỏ hàng.
    """
    headers = _get_auth_header("SalesRep")
    prod1 = pricing_fixtures["prod1"]
    prod2 = pricing_fixtures["prod2"]
    cus_t1 = pricing_fixtures["cus_t1"]

    cart_req = {
        "customer_id": cus_t1.id,
        "items": [
            {"product_id": str(prod1.id), "quantity": 10, "price": 25000000.0},
            {"product_id": str(prod2.id), "quantity": 1, "price": 900000.0}
        ]
    }
    res = client.post("/api/v1/order-pricings/validate-cart", headers=headers, json=cart_req)
    assert res.status_code == 200, res.text
    cart_data = res.json()
    assert cart_data["valid"] is True
    assert cart_data["customer_group"] == "TIER_1"
    assert cart_data["requires_approval"] is False
    assert len(cart_data["items"]) == 2


def test_order_calculate_realtime_totals_and_floor_warning(pricing_fixtures):
    """
    SCRUM-488 & SCRUM-490: Kiểm tra API /api/v1/orders/calculate tính tổng realtime,
    tự nhận diện giá sàn và cảnh báo đơn cần duyệt nếu có giá dưới sàn.
    """
    headers = _get_auth_header("SalesRep")
    prod1 = pricing_fixtures["prod1"]
    cus_t1 = pricing_fixtures["cus_t1"]

    # 1. Tính với giá hợp lệ
    calc_req_ok = {
        "customer_id": cus_t1.id,
        "items": [
            {"product_id": str(prod1.id), "quantity": 2, "price": 25000000.0}
        ]
    }
    res_ok = client.post("/api/v1/orders/calculate", headers=headers, json=calc_req_ok)
    assert res_ok.status_code == 200, res_ok.text
    d_ok = res_ok.json()
    assert d_ok["requires_approval"] is False
    assert d_ok["items"][0]["unit_price"] == 25000000.0
    assert d_ok["items"][0]["floor_price"] == 23000000.0
    assert d_ok["items"][0]["is_below_floor"] is False

    # 2. Tính với giá dưới sàn (21M < 23M) -> cảnh báo requires_approval = True
    calc_req_sub = {
        "customer_id": cus_t1.id,
        "items": [
            {"product_id": str(prod1.id), "quantity": 2, "price": 21000000.0}
        ]
    }
    res_sub = client.post("/api/v1/orders/calculate", headers=headers, json=calc_req_sub)
    assert res_sub.status_code == 200, res_sub.text
    d_sub = res_sub.json()
    assert d_sub["requires_approval"] is True
    assert len(d_sub["approval_reasons"]) > 0
    assert "thấp hơn giá sàn" in d_sub["approval_reasons"][0]
    assert d_sub["items"][0]["is_below_floor"] is True


def test_draft_order_submission_with_floor_price_and_blocking(pricing_fixtures):
    """
    SCRUM-490 & SCRUM-492: Chốt đơn nháp, kiểm tra chặn khi thiếu bảng giá và gắn pending_approval nếu dưới sàn.
    """
    headers = _get_auth_header("SalesRep")
    prod1 = pricing_fixtures["prod1"]
    prod_no_pl = pricing_fixtures["prod_no_pl"]
    cus_t1 = pricing_fixtures["cus_t1"]

    # 1. Tạo đơn nháp với sản phẩm không có bảng giá -> tạo nháp được (status = draft)
    draft_no_pl = {
        "customer_id": cus_t1.id,
        "customer_name": cus_t1.name,
        "status": "draft",
        "items": [
            {"product_id": str(prod_no_pl.id), "sku": prod_no_pl.sku, "name": prod_no_pl.name, "quantity": 1, "price": 5000000.0}
        ],
        "total": 5000000.0
    }
    res_d1 = client.post("/api/v1/orders", headers=headers, json=draft_no_pl)
    assert res_d1.status_code == 201
    draft_id1 = res_d1.json()["id"]

    # Chốt đơn nháp này -> BỊ CHẶN vì prod_no_pl không có bảng giá hiệu lực (SCRUM-492)
    res_sub1 = client.post(f"/api/v1/orders/{draft_id1}/submit", headers=headers)
    assert res_sub1.status_code == 400
    assert "chưa có trong bảng giá hiệu lực" in res_sub1.json()["detail"]

    # 2. Tạo đơn nháp với giá dưới sàn -> chốt đơn thành công nhưng chuyển thành pending_approval (SCRUM-490)
    draft_subfloor = {
        "customer_id": cus_t1.id,
        "customer_name": cus_t1.name,
        "status": "draft",
        "items": [
            {"product_id": str(prod1.id), "sku": prod1.sku, "name": prod1.name, "quantity": 1, "price": 20000000.0}
        ],
        "total": 20000000.0
    }
    res_d2 = client.post("/api/v1/orders", headers=headers, json=draft_subfloor)
    assert res_d2.status_code == 201
    draft_id2 = res_d2.json()["id"]

    res_sub2 = client.post(f"/api/v1/orders/{draft_id2}/submit", headers=headers)
    assert res_sub2.status_code == 200
    sub2_data = res_sub2.json()
    assert sub2_data["status"] == "pending_approval"
    assert sub2_data["requires_approval"] is True or sub2_data.get("requiresApproval") is True
    assert "thấp hơn giá sàn" in (sub2_data.get("approval_reason") or "")

