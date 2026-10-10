import uuid
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal, engine, Base
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.price_list import PriceList, PriceListItem
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.order_approval import OrderApprovalRequest, OrderApprovalHistory

client = TestClient(app)


def _get_auth_headers(role: str = "Admin", username: str = "admin"):
    db = SessionLocal()
    user = db.query(User).filter_by(username=username).first()
    if not user:
        user = db.query(User).filter_by(role=role).first()
    tv = user.token_version if user else 1
    uid = user.id if user else 1
    actual_role = user.role if user else role
    db.close()

    token = tao_token_truy_cap({
        "sub": username,
        "user_id": uid,
        "username": username,
        "role": actual_role,
        "token_version": tv,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    sm = db.query(User).filter_by(username="sales_mgr").first()
    if not sm:
        sm = User(
            username="sales_mgr",
            email="sales_mgr@warehouse.local",
            role=UserRole.SALES_MANAGER.value,
            full_name="Quản Lý Kinh Doanh",
            is_active=True
        )
        db.add(sm)

    sr = db.query(User).filter_by(username="sales_rep").first()
    if not sr:
        sr = User(
            username="sales_rep",
            email="sales_rep@warehouse.local",
            role=UserRole.SALES_REP.value,
            full_name="Nhân Viên Kinh Doanh",
            is_active=True
        )
        db.add(sr)

    admin = db.query(User).filter_by(username="admin").first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@warehouse.local",
            role=UserRole.ADMIN.value,
            full_name="Quản Trị Viên",
            is_active=True
        )
        db.add(admin)

    db.commit()
    db.close()


def test_01_order_with_credit_limit_violation_enters_pending_approval():
    """Đơn hàng vượt hạn mức công nợ tự động vào trạng thái pending_approval và chưa giữ chỗ kho."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-CREDIT-{uid}"

    customer = Customer(
        id=cid,
        code=cid,
        name=f"Đại lý Vi Phạm Nợ {uid}",
        phone="0912345678",
        status="active"
    )
    db.add(customer)

    cred = CustomerCreditProfile(
        customer_id=cid,
        credit_limit=10000000,
        max_debt_days=30,
        current_debt=0
    )
    db.add(cred)

    prod = Product(
        sku=f"SKU-CR-{uid}",
        name=f"Sản phẩm Test Công Nợ {uid}",
        price=15000000.0,
        cost_price=10000000.0
    )
    db.add(prod)
    db.flush()

    stock_prof = ProductStockProfile(
        product_id=prod.id,
        sku=prod.sku,
        stock=50,
        min_stock=5
    )
    db.add(stock_prof)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    initial_stock = stock_prof.stock
    db.close()

    headers_admin = _get_auth_headers(role="Admin", username="admin")

    payload = {
        "customer_id": cid,
        "customer_name": f"Đại lý Vi Phạm Nợ {uid}",
        "payment_method": "transfer",
        "payment_status": "unpaid",
        "paid_amount": 0.0,
        "total": 15000000.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 15000000.0,
                "quantity": 1,
                "subtotal": 15000000.0
            }
        ]
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers_admin)
    assert res.status_code == 201, f"Tạo đơn lỗi: {res.text}"
    order_data = res.json()
    assert order_data["status"] == "pending_approval", "Đơn hàng vượt hạn mức phải có trạng thái pending_approval"

    # Kiểm tra tồn kho KHÔNG bị trừ
    db = SessionLocal()
    sp = db.query(ProductStockProfile).filter_by(product_id=prod_id).first()
    assert sp.stock == initial_stock, "Đơn chờ duyệt ngoại lệ KHÔNG được phép trừ tồn kho trước khi duyệt"

    # Kiểm tra bản ghi OrderApprovalRequest
    appr_req = db.query(OrderApprovalRequest).filter_by(order_id=order_data["id"]).first()
    assert appr_req is not None
    assert appr_req.approval_status == "PENDING"
    assert appr_req.has_credit_limit_violation is True
    assert appr_req.credit_excess_amount == 5000000
    assert appr_req.is_stock_reserved is False
    db.close()


def test_02_order_with_floor_price_violation_enters_pending_approval():
    """Đơn hàng bán dưới giá sàn quy định tự động vào trạng thái pending_approval."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-FLOOR-{uid}"

    customer = Customer(
        id=cid,
        code=cid,
        name=f"Đại lý Giá Sàn {uid}",
        status="active"
    )
    db.add(customer)

    cred = CustomerCreditProfile(
        customer_id=cid,
        credit_limit=100000000,
        max_debt_days=30,
        current_debt=0
    )
    db.add(cred)

    prod = Product(
        sku=f"SKU-FL-{uid}",
        name=f"Sản phẩm Giá Sàn {uid}",
        price=1200000.0,
        cost_price=800000.0
    )
    db.add(prod)
    db.flush()

    stock_prof = ProductStockProfile(
        product_id=prod.id,
        sku=prod.sku,
        stock=100,
        min_stock=10
    )
    db.add(stock_prof)

    pl = PriceList(
        code=f"PL-FL-{uid}",
        name=f"Bảng giá sàn {uid}",
        customer_group="TIER_1",
        status="APPROVED",
        is_active=True,
        valid_from=datetime.now(timezone.utc)
    )
    db.add(pl)
    db.flush()

    pli = PriceListItem(
        price_list_id=pl.id,
        product_id=str(prod.id),
        product_sku=prod.sku,
        product_name=prod.name,
        listed_price=1200000.0,
        floor_price=1000000.0,
        sale_price=1100000.0
    )
    db.add(pli)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    pl_id = pl.id
    db.close()

    headers_admin = _get_auth_headers(role="Admin", username="admin")

    payload = {
        "customer_id": cid,
        "customer_name": f"Đại lý Giá Sàn {uid}",
        "price_list_id": pl_id,
        "paid_amount": 900000.0,
        "payment_status": "paid",
        "total": 900000.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 900000.0,
                "quantity": 1,
                "subtotal": 900000.0
            }
        ]
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers_admin)
    assert res.status_code == 201
    order_data = res.json()
    assert order_data["status"] == "pending_approval"

    db = SessionLocal()
    sp = db.query(ProductStockProfile).filter_by(product_id=prod_id).first()
    assert sp.stock == 100

    appr_req = db.query(OrderApprovalRequest).filter_by(order_id=order_data["id"]).first()
    assert appr_req is not None
    assert appr_req.has_floor_price_violation is True
    assert appr_req.floor_price_violation_count == 1
    assert appr_req.total_floor_price_gap == 100000.0
    db.close()


def test_03_order_with_both_violations():
    """Đơn hàng vừa vượt hạn mức vừa dưới giá sàn hiển thị đầy đủ cả 2 lý do vi phạm."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-BOTH-{uid}"

    customer = Customer(id=cid, code=cid, name=f"Đại lý Vi Phạm Cả Hai {uid}", status="active")
    db.add(customer)
    cred = CustomerCreditProfile(customer_id=cid, credit_limit=2000000, max_debt_days=30, current_debt=0)
    db.add(cred)

    prod = Product(sku=f"SKU-BOTH-{uid}", name=f"Sản phẩm Cả Hai {uid}", price=5000000.0)
    db.add(prod)
    db.flush()
    stock_prof = ProductStockProfile(product_id=prod.id, sku=prod.sku, stock=50, min_stock=5)
    db.add(stock_prof)

    pl = PriceList(code=f"PL-B-{uid}", name="PL Both", customer_group="TIER_1", status="APPROVED", valid_from=datetime.now(timezone.utc))
    db.add(pl)
    db.flush()
    pli = PriceListItem(
        price_list_id=pl.id,
        product_id=str(prod.id),
        product_name=prod.name,
        listed_price=5000000.0,
        floor_price=4500000.0,
        sale_price=4800000.0
    )
    db.add(pli)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    pl_id = pl.id
    db.close()

    headers_admin = _get_auth_headers(role="Admin", username="admin")
    payload = {
        "customer_id": cid,
        "customer_name": f"Đại lý Vi Phạm Cả Hai {uid}",
        "price_list_id": pl_id,
        "payment_status": "unpaid",
        "paid_amount": 0.0,
        "total": 4000000.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 4000000.0,
                "quantity": 1,
                "subtotal": 4000000.0
            }
        ]
    }

    res = client.post("/api/v1/orders", json=payload, headers=headers_admin)
    assert res.status_code == 201
    order_data = res.json()
    assert order_data["status"] == "pending_approval"

    headers_sm = _get_auth_headers(role="sales_mgr", username="sales_mgr")
    detail_res = client.get(f"/api/v1/order-approvals/{order_data['id']}", headers=headers_sm)
    assert detail_res.status_code == 200
    data = detail_res.json()
    assert data["has_credit_limit_violation"] is True
    assert data["has_floor_price_violation"] is True
    assert len(data["violations"]) >= 2
    assert data["floor_price_violation_count"] == 1
    assert data["total_floor_price_gap"] == 500000.0


def test_04_approve_action_reserves_stock_and_changes_status_to_reserved():
    """Hành động Duyệt (APPROVE): Chuyển đơn sang trạng thái giữ chỗ tồn kho & chờ xuất kho (reserved)."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-APP-{uid}"

    customer = Customer(id=cid, code=cid, name=f"Đại lý Approve {uid}")
    db.add(customer)
    cred = CustomerCreditProfile(customer_id=cid, credit_limit=1000000, max_debt_days=30, current_debt=0)
    db.add(cred)

    prod = Product(sku=f"SKU-APP-{uid}", name=f"Sản phẩm Approve {uid}", price=3000000.0)
    db.add(prod)
    db.flush()
    stock_prof = ProductStockProfile(product_id=prod.id, sku=prod.sku, stock=20, min_stock=2)
    db.add(stock_prof)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    db.close()

    headers_admin = _get_auth_headers(role="Admin", username="admin")
    res = client.post("/api/v1/orders", json={
        "customer_id": cid,
        "customer_name": f"Đại lý Approve {uid}",
        "payment_status": "unpaid",
        "paid_amount": 0.0,
        "total": 3000000.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 3000000.0,
                "quantity": 3,
                "subtotal": 9000000.0
            }
        ]
    }, headers=headers_admin)
    assert res.status_code == 201
    order_id = res.json()["id"]

    headers_sm = _get_auth_headers(role="sales_mgr", username="sales_mgr")
    approve_res = client.post(
        f"/api/v1/order-approvals/{order_id}/approve",
        json={"comment": "Duyệt đặc cách cho khách hàng thân thiết"},
        headers=headers_sm
    )
    assert approve_res.status_code == 200
    app_data = approve_res.json()
    assert app_data["approval_status"] == "APPROVED"
    assert app_data["order_status"] == "reserved"
    assert app_data["is_stock_reserved"] is True

    db = SessionLocal()
    sp = db.query(ProductStockProfile).filter_by(product_id=prod_id).first()
    assert sp.stock == 17

    hist = db.query(OrderApprovalHistory).filter_by(order_id=order_id).first()
    assert hist is not None
    assert hist.action == "APPROVE"
    assert hist.previous_status == "pending_approval"
    assert hist.new_status == "reserved"
    assert hist.comment == "Duyệt đặc cách cho khách hàng thân thiết"
    db.close()


def test_05_reject_action_requires_comment_and_does_not_reserve_stock():
    """Hành động Từ chối (REJECT): Bắt buộc nhập ý kiến và TUYỆT ĐỐI không giữ chỗ tồn kho."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-REJ-{uid}"

    customer = Customer(id=cid, code=cid, name=f"Đại lý Reject {uid}")
    db.add(customer)
    cred = CustomerCreditProfile(customer_id=cid, credit_limit=500000, max_debt_days=30, current_debt=0)
    db.add(cred)

    prod = Product(sku=f"SKU-REJ-{uid}", name=f"Sản phẩm Reject {uid}", price=2000000.0)
    db.add(prod)
    db.flush()
    stock_prof = ProductStockProfile(product_id=prod.id, sku=prod.sku, stock=10, min_stock=1)
    db.add(stock_prof)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    db.close()

    headers_admin = _get_auth_headers(role="Admin", username="admin")
    res = client.post("/api/v1/orders", json={
        "customer_id": cid,
        "customer_name": f"Đại lý Reject {uid}",
        "payment_status": "unpaid",
        "paid_amount": 0.0,
        "total": 2000000.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 2000000.0,
                "quantity": 2,
                "subtotal": 4000000.0
            }
        ]
    }, headers=headers_admin)
    assert res.status_code == 201
    order_id = res.json()["id"]

    headers_sm = _get_auth_headers(role="sales_mgr", username="sales_mgr")

    fail_res = client.post(
        f"/api/v1/order-approvals/{order_id}/reject",
        json={"comment": ""},
        headers=headers_sm
    )
    assert fail_res.status_code == 400 or fail_res.status_code == 422

    reject_res = client.post(
        f"/api/v1/order-approvals/{order_id}/reject",
        json={"comment": "Khách hàng còn nhiều khoản nợ tồn đọng chưa thanh toán, không duyệt đơn nợ thêm."},
        headers=headers_sm
    )
    assert reject_res.status_code == 200
    rej_data = reject_res.json()
    assert rej_data["approval_status"] == "REJECTED"
    assert rej_data["order_status"] == "rejected"
    assert rej_data["is_stock_reserved"] is False

    db = SessionLocal()
    sp = db.query(ProductStockProfile).filter_by(product_id=prod_id).first()
    assert sp.stock == 10

    hist = db.query(OrderApprovalHistory).filter_by(order_id=order_id).first()
    assert hist is not None
    assert hist.action == "REJECT"
    assert "nợ tồn đọng" in hist.comment
    db.close()


def test_06_return_action_requires_comment_and_does_not_reserve_stock():
    """Hành động Trả lại sửa (RETURN): Bắt buộc nhập ý kiến và không giữ chỗ tồn kho."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-RET-{uid}"

    customer = Customer(id=cid, code=cid, name=f"Đại lý Return {uid}")
    db.add(customer)
    cred = CustomerCreditProfile(customer_id=cid, credit_limit=500000, max_debt_days=30, current_debt=0)
    db.add(cred)

    prod = Product(sku=f"SKU-RET-{uid}", name=f"Sản phẩm Return {uid}", price=1000000.0)
    db.add(prod)
    db.flush()
    stock_prof = ProductStockProfile(product_id=prod.id, sku=prod.sku, stock=15, min_stock=2)
    db.add(stock_prof)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    db.close()

    headers_admin = _get_auth_headers(role="Admin", username="admin")
    res = client.post("/api/v1/orders", json={
        "customer_id": cid,
        "customer_name": f"Đại lý Return {uid}",
        "payment_status": "unpaid",
        "paid_amount": 0.0,
        "total": 1000000.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 1000000.0,
                "quantity": 1,
                "subtotal": 1000000.0
            }
        ]
    }, headers=headers_admin)
    assert res.status_code == 201
    order_id = res.json()["id"]

    headers_sm = _get_auth_headers(role="sales_mgr", username="sales_mgr")

    fail_res = client.post(
        f"/api/v1/order-approvals/{order_id}/return",
        json={"comment": "   "},
        headers=headers_sm
    )
    assert fail_res.status_code == 400 or fail_res.status_code == 422

    ret_res = client.post(
        f"/api/v1/order-approvals/{order_id}/return",
        json={"comment": "Yêu cầu thu trước tối thiểu 50% tiền hàng trước khi trình duyệt lại."},
        headers=headers_sm
    )
    assert ret_res.status_code == 200
    ret_data = ret_res.json()
    assert ret_data["approval_status"] == "RETURNED"
    assert ret_data["order_status"] == "returned"
    assert ret_data["is_stock_reserved"] is False

    db = SessionLocal()
    sp = db.query(ProductStockProfile).filter_by(product_id=prod_id).first()
    assert sp.stock == 15

    hist = db.query(OrderApprovalHistory).filter_by(order_id=order_id).first()
    assert hist is not None
    assert hist.action == "RETURN"
    assert "thu trước tối thiểu 50%" in hist.comment
    db.close()


def test_07_immutability_of_order_approval_history():
    """Lịch sử duyệt bất biến: Nghiêm cấm chỉnh sửa (UPDATE) hoặc xoá (DELETE) ở mọi cấp độ."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    oid = f"ORD-IMMUTABLE-{uid}"

    history_record = OrderApprovalHistory(
        order_id=oid,
        order_code=f"DH-{uid}",
        action="APPROVE",
        previous_status="pending_approval",
        new_status="reserved",
        comment="Ý kiến gốc không thể thay đổi",
        performed_by_id=1,
        performed_by_name="Quản Lý Kinh Doanh",
        performed_by_role="SalesManager"
    )
    db.add(history_record)
    db.commit()
    record_id = history_record.id
    db.close()

    # Thử sửa nội dung bản ghi (UPDATE) -> Phải ném lỗi ValueError
    db = SessionLocal()
    rec = db.query(OrderApprovalHistory).filter_by(id=record_id).first()
    rec.comment = "Cố tình sửa đổi lịch sử"
    with pytest.raises(Exception) as exc_info:
        db.commit()
    assert "bất biến" in str(exc_info.value).lower()
    db.rollback()
    db.close()

    # Thử xoá bản ghi (DELETE) -> Phải ném lỗi ValueError
    db = SessionLocal()
    rec = db.query(OrderApprovalHistory).filter_by(id=record_id).first()
    db.delete(rec)
    with pytest.raises(Exception) as exc_info:
        db.commit()
    assert "bất biến" in str(exc_info.value).lower()
    db.rollback()
    db.close()


def test_08_role_based_access_control_for_approval():
    """Phân quyền: Sales Rep không được phép duyệt đơn (403), Sales Manager / Admin được duyệt."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-RBAC-{uid}"

    customer = Customer(id=cid, code=cid, name=f"Đại lý RBAC {uid}")
    db.add(customer)
    cred = CustomerCreditProfile(customer_id=cid, credit_limit=100000, max_debt_days=30, current_debt=0)
    db.add(cred)

    prod = Product(sku=f"SKU-RBAC-{uid}", name=f"Sản phẩm RBAC {uid}", price=1000000.0)
    db.add(prod)
    db.flush()
    stock_prof = ProductStockProfile(product_id=prod.id, sku=prod.sku, stock=10, min_stock=1)
    db.add(stock_prof)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    db.close()

    headers_admin = _get_auth_headers(role="Admin", username="admin")
    res = client.post("/api/v1/orders", json={
        "customer_id": cid,
        "customer_name": f"Đại lý RBAC {uid}",
        "payment_status": "unpaid",
        "paid_amount": 0.0,
        "total": 1000000.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 1000000.0,
                "quantity": 1,
                "subtotal": 1000000.0
            }
        ]
    }, headers=headers_admin)
    assert res.status_code == 201
    order_id = res.json()["id"]

    headers_sr = _get_auth_headers(role="sales_rep", username="sales_rep")
    forbidden_res = client.post(
        f"/api/v1/order-approvals/{order_id}/approve",
        json={"comment": "Sales rep tự duyệt"},
        headers=headers_sr
    )
    assert forbidden_res.status_code == 403, "Sales Rep không được phép tự duyệt đơn hàng"

    headers_sm = _get_auth_headers(role="sales_mgr", username="sales_mgr")
    ok_res = client.post(
        f"/api/v1/order-approvals/{order_id}/approve",
        json={"comment": "Quản lý kinh doanh duyệt hợp lệ"},
        headers=headers_sm
    )
    assert ok_res.status_code == 200


def test_09_api_list_and_filter_approvals():
    """API GET /api/v1/order-approvals: Hỗ trợ lọc theo trạng thái, loại vi phạm và tìm kiếm."""
    headers_sm = _get_auth_headers(role="sales_mgr", username="sales_mgr")

    res = client.get("/api/v1/order-approvals?status=pending", headers=headers_sm)
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)

    res_all = client.get("/api/v1/order-approvals?status=all", headers=headers_sm)
    assert res_all.status_code == 200
    assert isinstance(res_all.json(), list)

    res_cr = client.get("/api/v1/order-approvals?status=all&violation_type=credit_limit", headers=headers_sm)
    assert res_cr.status_code == 200


def test_10_api_evaluate_violations():
    """API POST /api/v1/order-approvals/evaluate: Đánh giá vi phạm theo thời gian thực trước khi đặt hàng."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-EVAL-{uid}"

    customer = Customer(id=cid, code=cid, name=f"Đại lý Eval {uid}")
    db.add(customer)
    cred = CustomerCreditProfile(customer_id=cid, credit_limit=5000000, max_debt_days=30, current_debt=0)
    db.add(cred)

    prod = Product(sku=f"SKU-EV-{uid}", name=f"Sản phẩm Eval {uid}", price=10000000.0)
    db.add(prod)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    db.close()

    eval_payload = {
        "customer_id": cid,
        "total_amount": 10000000.0,
        "paid_amount": 0.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 10000000.0,
                "quantity": 1,
                "subtotal": 10000000.0
            }
        ]
    }

    res = client.post("/api/v1/order-approvals/evaluate", json=eval_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["requires_approval"] is True
    assert data["has_credit_limit_violation"] is True
    assert len(data["violations"]) >= 1


def test_11_dispatch_approved_order_succeeds_without_reblocking():
    """Đơn hàng ngoại lệ sau khi được duyệt chuyển sang reserved có thể xuất kho mà không bị chặn lại."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    cid = f"CUS-SC237-DISP-{uid}"

    customer = Customer(id=cid, code=cid, name=f"Đại lý Dispatch {uid}")
    db.add(customer)
    cred = CustomerCreditProfile(customer_id=cid, credit_limit=1000000, max_debt_days=30, current_debt=0)
    db.add(cred)

    prod = Product(sku=f"SKU-DISP-{uid}", name=f"Sản phẩm Dispatch {uid}", price=5000000.0)
    db.add(prod)
    db.flush()
    stock_prof = ProductStockProfile(product_id=prod.id, sku=prod.sku, stock=10, min_stock=1)
    db.add(stock_prof)
    db.commit()

    prod_id = prod.id
    prod_sku = prod.sku
    prod_name = prod.name
    db.close()

    headers_admin = _get_auth_headers(role="Admin", username="admin")
    res = client.post("/api/v1/orders", json={
        "customer_id": cid,
        "customer_name": f"Đại lý Dispatch {uid}",
        "payment_status": "unpaid",
        "paid_amount": 0.0,
        "total": 5000000.0,
        "items": [
            {
                "product_id": str(prod_id),
                "sku": prod_sku,
                "name": prod_name,
                "price": 5000000.0,
                "quantity": 1,
                "subtotal": 5000000.0
            }
        ]
    }, headers=headers_admin)
    assert res.status_code == 201
    order_id = res.json()["id"]

    # 1. Quản lý kinh doanh duyệt ngoại lệ
    headers_sm = _get_auth_headers(role="sales_mgr", username="sales_mgr")
    app_res = client.post(
        f"/api/v1/order-approvals/{order_id}/approve",
        json={"comment": "Duyệt xuất đơn"},
        headers=headers_sm
    )
    assert app_res.status_code == 200

    # 2. Xuất kho (shipping): Phải thành công do Quản lý đã duyệt ngoại lệ
    patch_res = client.patch(
        f"/api/v1/orders/{order_id}/status",
        json={"status": "shipping"},
        headers=headers_sm
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "shipping"
