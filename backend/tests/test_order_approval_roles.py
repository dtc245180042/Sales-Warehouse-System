import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.security import tao_token_truy_cap
from app.core.database import SessionLocal
from app.models.auth import User, UserRole
from app.models.order import Order

client = TestClient(app)


def _get_headers_for_role(username: str, role_value: str) -> dict:
    db = SessionLocal()
    user = db.query(User).filter_by(username=username).first()
    tv = user.token_version if user else 1
    uid = user.id if user else 999
    db.close()
    token = tao_token_truy_cap({
        "sub": username,
        "user_id": uid,
        "username": username,
        "role": role_value,
        "token_version": tv
    })
    return {"Authorization": f"Bearer {token}"}


def test_sales_rep_cannot_approve_pending_approval_order():
    """Nhân viên kinh doanh (Sales Rep) KHÔNG CÓ QUYỀN duyệt đơn hàng vượt hạn mức công nợ (S4-05)."""
    db = SessionLocal()
    order = db.query(Order).filter(Order.status == "pending_approval").first()
    if not order:
        order = Order(
            id="TEST-APPROVAL-001",
            code="DH-TEST-001",
            customer_id="CUS-001",
            customer_name="Đại Lý Test",
            total=50000000.0,
            status="pending_approval",
            requires_approval=True,
            approval_reason="Vượt hạn mức",
        )
        db.add(order)
        db.commit()
    order_id = order.id
    db.close()

    sales_rep_headers = _get_headers_for_role("sales_rep", UserRole.SALES_REP.value)
    res = client.patch(f"/api/v1/orders/{order_id}/status", json={"status": "confirmed"}, headers=sales_rep_headers)
    assert res.status_code == 403
    assert "Chỉ Quản lý kinh doanh" in res.json()["detail"]


def test_sales_rep_cannot_confirm_pending_order():
    """Nhân viên kinh doanh (Sales Rep) KHÔNG CÓ QUYỀN xác nhận đơn hàng thông thường (pending -> confirmed)."""
    db = SessionLocal()
    order = Order(
        id="TEST-PENDING-001",
        code="DH-TEST-PENDING",
        customer_id="CUS-001",
        customer_name="Đại Lý Test",
        total=1000000.0,
        status="pending",
    )
    db.merge(order)
    db.commit()
    db.close()

    sales_rep_headers = _get_headers_for_role("sales_rep", UserRole.SALES_REP.value)
    res = client.patch(f"/api/v1/orders/TEST-PENDING-001/status", json={"status": "confirmed"}, headers=sales_rep_headers)
    assert res.status_code == 403
    assert "Nhân viên kinh doanh không có quyền duyệt/xác nhận đơn hàng" in res.json()["detail"]


def test_sales_rep_cannot_start_shipping():
    """Nhân viên kinh doanh (Sales Rep) KHÔNG CÓ QUYỀN bấm 'Bắt đầu giao hàng' (confirmed -> shipping)."""
    db = SessionLocal()
    order = Order(
        id="TEST-CONFIRMED-001",
        code="DH-TEST-CONFIRMED",
        customer_id="CUS-001",
        customer_name="Đại Lý Test",
        total=1000000.0,
        status="confirmed",
    )
    db.merge(order)
    db.commit()
    db.close()

    sales_rep_headers = _get_headers_for_role("sales_rep", UserRole.SALES_REP.value)
    res = client.patch(f"/api/v1/orders/TEST-CONFIRMED-001/status", json={"status": "shipping"}, headers=sales_rep_headers)
    assert res.status_code == 403
    assert "bộ phận Kho vận phụ trách" in res.json()["detail"]


def test_sales_manager_can_approve_order():
    """Quản lý kinh doanh (Sales Manager) ĐƯỢC QUYỀN duyệt đơn hàng."""
    db = SessionLocal()
    order = Order(
        id="TEST-MGR-APP-001",
        code="DH-TEST-MGR",
        customer_id="CUS-001",
        customer_name="Đại Lý Test",
        total=1000000.0,
        status="pending",
    )
    db.merge(order)
    db.commit()
    db.close()

    mgr_headers = _get_headers_for_role("sales_mgr", UserRole.SALES_MANAGER.value)
    res = client.patch(f"/api/v1/orders/TEST-MGR-APP-001/status", json={"status": "confirmed"}, headers=mgr_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "confirmed"
