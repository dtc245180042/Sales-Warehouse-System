from datetime import datetime, timezone
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, StockDispatchLot, DispatchStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnStatus, ReturnReason, ItemCondition
from app.models.credit_note import CreditNote, CreditNoteItem, CreditNoteSequence
from app.services.credit_note_service import hook_sau_khi_lap_chung_tu_giam_no
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Credit Note S8-02
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=test_engine)


def override_lay_phien_db():
    phien_db = TestingSessionLocal()
    try:
        yield phien_db
    finally:
        phien_db.close()


@pytest.fixture(autouse=True)
def setup_credit_note_test_database():
    """Tạo schema và dữ liệu người dùng / hoá đơn / phiếu trả hàng trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_cn",
            email="admin_cn@test.local",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="accountant_cn",
            email="accountant_cn@test.local",
            role=UserRole.ACCOUNTANT.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="sales_rep_cn",
            email="sales_rep_cn@test.local",
            role=UserRole.SALES_REP.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=4,
            username="wh_mgr_cn",
            email="wh_mgr_cn@test.local",
            role=UserRole.WH_MANAGER.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=5,
            username="customer_cn_1",
            email="cust_cn_1@test.local",
            role=UserRole.CUSTOMER.value,
            customer_id="CUST-001",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=6,
            username="customer_cn_2",
            email="cust_cn_2@test.local",
            role=UserRole.CUSTOMER.value,
            customer_id="CUST-002",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    db.add_all(users)

    # 2 khách hàng
    c1 = Customer(
        id="CUST-001",
        code="DL-001",
        name="Đại lý Dược Phẩm Hà Nội",
        address="100 Phố Huế, HN",
        tax_code="0101010101",
    )
    c2 = Customer(
        id="CUST-002",
        code="DL-002",
        name="Đại lý Dược Phẩm Sài Gòn",
        address="200 Nguyễn Huệ, TP.HCM",
        tax_code="0202020202",
    )
    db.add_all([c1, c2])

    # Sản phẩm
    p1 = Product(
        id="PROD-01",
        sku="SKU-01",
        name="Thuốc Kháng Sinh Amox 500",
        unit="hộp",
        price=100000,
        stock=100,
        manage_by_lot=True,
    )
    db.add(p1)

    # Phiếu xuất kho gốc
    dispatch = StockDispatch(
        id="PXK-2026-0000001",
        order_id="ORD-001",
        customer_id="CUST-001",
        warehouse_id=1,
        status=DispatchStatus.CONFIRMED.value,
        dispatched_by=1,
        created_at=datetime.now(timezone.utc),
    )
    db.add(dispatch)
    db.flush()

    disp_item = StockDispatchItem(
        id=201,
        dispatch_id=dispatch.id,
        product_id="PROD-01",
        sku="SKU-01",
        product_name="Thuốc Kháng Sinh Amox 500",
        ordered_quantity=10,
        dispatched_quantity=10,
        shortfall_quantity=0,
    )
    db.add(disp_item)
    db.flush()

    # Hoá đơn 1 cho CUST-001: Tổng tiền 1,000,000 - còn nợ 1,000,000
    inv1 = Invoice(
        id="HD-2026-0000001",
        customer_id="CUST-001",
        customer_name="Đại lý Dược Phẩm Hà Nội",
        subtotal_amount=1000000,
        discount_amount=100000,
        vat_amount=90000,
        total_amount=990000,
        paid_amount=0,
        remaining_amount=990000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime.now(timezone.utc),
        issued_by=1,
    )
    inv1_item = InvoiceItem(
        id=101,
        invoice_id="HD-2026-0000001",
        dispatch_id=dispatch.id,
        dispatch_item_id=disp_item.id,
        order_id="ORD-001",
        product_id="PROD-01",
        sku="SKU-01",
        product_name="Thuốc Kháng Sinh Amox 500",
        unit="hộp",
        quantity=10,
        unit_price=100000,
        discount_amount=100000,
        vat_amount=90000,
        subtotal=990000,
    )
    db.add_all([inv1, inv1_item])

    # Hoá đơn 2 cho CUST-002
    inv2 = Invoice(
        id="HD-2026-0000002",
        customer_id="CUST-002",
        customer_name="Đại lý Dược Phẩm Sài Gòn",
        subtotal_amount=500000,
        discount_amount=0,
        vat_amount=50000,
        total_amount=550000,
        paid_amount=0,
        remaining_amount=550000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime.now(timezone.utc),
        issued_by=1,
    )
    db.add(inv2)

    # Phiếu trả hàng 1 (CONFIRMED) cho HD-2026-0000001: Trả 3 hộp, subtotal = 297,000
    ret1 = ReturnOrder(
        id="TH-2026-0000001",
        invoice_id="HD-2026-0000001",
        customer_id="CUST-001",
        customer_name="Đại lý Dược Phẩm Hà Nội",
        status=ReturnStatus.CONFIRMED.value,
        return_reason=ReturnReason.DEFECTIVE_PRODUCT.value,
        origin_warehouse_id=1,
        requested_by=3,
        total_returned_value=297000,
        confirmed_by=4,
        confirmed_at=datetime.now(timezone.utc),
    )
    ret1_item = ReturnOrderItem(
        id=1,
        return_id="TH-2026-0000001",
        invoice_item_id=101,
        product_id="PROD-01",
        sku="SKU-01",
        product_name="Thuốc Kháng Sinh Amox 500",
        unit="hộp",
        quantity=3,
        condition=ItemCondition.GOOD.value,
        unit_price=100000,
        discount_amount=30000,
        vat_amount=27000,
        subtotal=297000,
    )
    db.add_all([ret1, ret1_item])

    # Phiếu trả hàng 2 (REQUESTED - Chưa xác nhận) cho HD-2026-0000001
    ret2 = ReturnOrder(
        id="TH-2026-0000002",
        invoice_id="HD-2026-0000001",
        customer_id="CUST-001",
        customer_name="Đại lý Dược Phẩm Hà Nội",
        status=ReturnStatus.REQUESTED.value,
        return_reason=ReturnReason.DAMAGED_IN_TRANSIT.value,
        origin_warehouse_id=1,
        requested_by=3,
        total_returned_value=99000,
    )
    db.add(ret2)

    # Phiếu trả hàng 3 (CANCELLED - Đã bị huỷ) cho HD-2026-0000001
    ret3 = ReturnOrder(
        id="TH-2026-0000003",
        invoice_id="HD-2026-0000001",
        customer_id="CUST-001",
        customer_name="Đại lý Dược Phẩm Hà Nội",
        status=ReturnStatus.CANCELLED.value,
        return_reason=ReturnReason.OTHER.value,
        notes="Hủy phiếu",
        origin_warehouse_id=1,
        requested_by=3,
        total_returned_value=99000,
        cancelled_by=4,
        cancelled_at=datetime.now(timezone.utc),
    )
    db.add(ret3)

    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


def lay_header_auth(username: str, role: str, user_id: int = 1, customer_id: str = None) -> dict:
    claims = {
        "sub": username,
        "role": role,
        "user_id": user_id,
        "token_version": 1,
    }
    if customer_id:
        claims["customer_id"] = customer_id
    token = tao_token_truy_cap(claims)
    return {"Authorization": f"Bearer {token}"}


client = TestClient(app)


# ==============================================================================
# TEST CASE 1: Lập Credit Note thành công -> Giảm nợ hoá đơn chính xác & AC-4
# ==============================================================================
def test_create_credit_note_success_reduces_invoice_debt():
    """
    Kế toán lập Credit Note từ phiếu trả hàng CONFIRMED:
    - Sinh mã CN-YYYY-XXXXXXX.
    - Hoá đơn giảm remaining_amount đúng bằng 297,000.
    - Hoá đơn chuyển status thành PARTIALLY_PAID.
    - AC-4: Hoá đơn gốc total_amount, subtotal, discount, vat và items giữ nguyên vẹn.
    """
    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)
    payload = {
        "client_request_id": "REQ-CN-001",
        "return_order_id": "TH-2026-0000001",
        "notes": "Giảm trừ nợ hàng trả do lỗi kỹ thuật",
    }
    resp = client.post("/api/v1/credit-notes", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()

    assert data["id"].startswith("CN-")
    assert data["return_order_id"] == "TH-2026-0000001"
    assert data["invoice_id"] == "HD-2026-0000001"
    assert data["customer_id"] == "CUST-001"
    assert data["adjustment_amount"] == 297000
    assert len(data["items"]) == 1
    assert data["items"][0]["quantity"] == 3
    assert data["items"][0]["subtotal"] == 297000

    # Kiểm tra hoá đơn gốc trong DB
    db = TestingSessionLocal()
    inv = db.query(Invoice).filter(Invoice.id == "HD-2026-0000001").first()
    assert inv.remaining_amount == 990000 - 297000  # 693,000
    assert inv.status == InvoiceStatus.PARTIALLY_PAID.value

    # AC-4: Bất biến hoá đơn gốc
    assert inv.total_amount == 990000
    assert inv.subtotal_amount == 1000000
    assert inv.discount_amount == 100000
    assert inv.vat_amount == 90000
    assert len(inv.items) == 1
    db.close()


# ==============================================================================
# TEST CASE 2: Chặn lập Credit Note khi phiếu trả hàng còn ở trạng thái REQUESTED
# ==============================================================================
def test_reject_credit_note_when_return_order_is_requested():
    """Không được lập Credit Note khi phiếu trả hàng chưa được Quản lý kho xác nhận (REQUESTED)."""
    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)
    payload = {
        "return_order_id": "TH-2026-0000002",
        "notes": "Cố gắng giảm nợ khi kho chưa nhận",
    }
    resp = client.post("/api/v1/credit-notes", json=payload, headers=headers)
    assert resp.status_code == 400
    assert "REQUESTED" in resp.json()["detail"]


# ==============================================================================
# TEST CASE 3: Chặn lập Credit Note khi phiếu trả hàng bị CANCELLED
# ==============================================================================
def test_reject_credit_note_when_return_order_is_cancelled():
    """Không được lập Credit Note khi phiếu trả hàng đã bị hủy (CANCELLED)."""
    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)
    payload = {
        "return_order_id": "TH-2026-0000003",
    }
    resp = client.post("/api/v1/credit-notes", json=payload, headers=headers)
    assert resp.status_code == 400
    assert "CANCELLED" in resp.json()["detail"]


# ==============================================================================
# TEST CASE 4: Chống lập Credit Note 2 lần cho cùng một phiếu trả hàng
# ==============================================================================
def test_reject_duplicate_credit_note_for_same_return_order():
    """Một ReturnOrder chỉ được lập duy nhất một Credit Note (Ràng buộc Unique)."""
    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)

    # Lần 1: Thành công
    p1 = {
        "client_request_id": "REQ-CN-DUP-1",
        "return_order_id": "TH-2026-0000001",
    }
    resp1 = client.post("/api/v1/credit-notes", json=p1, headers=headers)
    assert resp1.status_code == 201

    # Lần 2: Thử lập lại phiếu giảm nợ khác cho cùng ReturnOrder đó
    p2 = {
        "client_request_id": "REQ-CN-DUP-2",
        "return_order_id": "TH-2026-0000001",
    }
    resp2 = client.post("/api/v1/credit-notes", json=p2, headers=headers)
    assert resp2.status_code == 400
    assert "đã được lập chứng từ giảm nợ" in resp2.json()["detail"]


# ==============================================================================
# TEST CASE 5: Idempotency với client_request_id
# ==============================================================================
def test_idempotency_with_client_request_id():
    """Gửi lại cùng client_request_id và payload trả về record cũ; payload khác trả về 409."""
    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)

    payload = {
        "client_request_id": "REQ-IDEMP-001",
        "return_order_id": "TH-2026-0000001",
        "notes": "Idempotent test",
    }
    resp1 = client.post("/api/v1/credit-notes", json=payload, headers=headers)
    assert resp1.status_code == 201
    cn_id = resp1.json()["id"]

    # Gửi lại đúng nguyên văn
    resp2 = client.post("/api/v1/credit-notes", json=payload, headers=headers)
    assert resp2.status_code == 201
    assert resp2.json()["id"] == cn_id

    # Gửi lại với nội dung notes khác nhưng cùng client_request_id -> 409 Conflict
    diff_payload = {
        "client_request_id": "REQ-IDEMP-001",
        "return_order_id": "TH-2026-0000001",
        "notes": "Different notes",
    }
    resp3 = client.post("/api/v1/credit-notes", json=diff_payload, headers=headers)
    assert resp3.status_code == 409


# ==============================================================================
# TEST CASE 6: Đối trừ khi nợ còn lại < số tiền giảm nợ -> nợ về 0 & PAID
# ==============================================================================
def test_credit_note_debt_reduction_when_remaining_is_less_than_adjustment():
    """Nếu tiền nợ còn lại của hoá đơn nhỏ hơn số tiền giảm trừ, giảm nợ về 0 và chuyển sang PAID."""
    db = TestingSessionLocal()
    # Cập nhật nợ còn lại của hoá đơn chỉ còn 100,000 (nhỏ hơn 297,000 của phiếu trả)
    inv = db.query(Invoice).filter(Invoice.id == "HD-2026-0000001").first()
    inv.remaining_amount = 100000
    db.commit()
    db.close()

    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)
    payload = {
        "return_order_id": "TH-2026-0000001",
    }
    resp = client.post("/api/v1/credit-notes", json=payload, headers=headers)
    assert resp.status_code == 201

    db = TestingSessionLocal()
    inv = db.query(Invoice).filter(Invoice.id == "HD-2026-0000001").first()
    assert inv.remaining_amount == 0
    assert inv.status == InvoiceStatus.PAID.value
    db.close()


# ==============================================================================
# TEST CASE 7: Tính bất biến của Credit Note: PUT và DELETE trả về HTTP 405
# ==============================================================================
def test_immutable_endpoints_put_delete_return_405():
    """Chứng từ giảm nợ là chứng từ kế toán bất biến, chặn hoàn toàn PUT và DELETE bằng HTTP 405."""
    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)
    resp_put = client.put("/api/v1/credit-notes/CN-2026-0000001", json={"notes": "hack"}, headers=headers)
    assert resp_put.status_code == 405

    resp_del = client.delete("/api/v1/credit-notes/CN-2026-0000001", headers=headers)
    assert resp_del.status_code == 405


# ==============================================================================
# TEST CASE 8: Phân quyền vai trò: Sales / Warehouse bị 403, Accountant & Admin OK
# ==============================================================================
def test_role_permissions_for_credit_notes():
    """Chỉ Kế toán và Admin mới được lập Credit Note. Các vai trò khác bị 403."""
    payload = {"return_order_id": "TH-2026-0000001"}

    # Sales Rep -> 403
    h_sales = lay_header_auth("sales_rep_cn", UserRole.SALES_REP.value, user_id=3)
    r_sales = client.post("/api/v1/credit-notes", json=payload, headers=h_sales)
    assert r_sales.status_code == 403

    # Quản lý kho -> 403
    h_wh = lay_header_auth("wh_mgr_cn", UserRole.WH_MANAGER.value, user_id=4)
    r_wh = client.post("/api/v1/credit-notes", json=payload, headers=h_wh)
    assert r_wh.status_code == 403

    # Customer -> 403
    h_cust = lay_header_auth("customer_cn_1", UserRole.CUSTOMER.value, user_id=5, customer_id="CUST-001")
    r_cust = client.post("/api/v1/credit-notes", json=payload, headers=h_cust)
    assert r_cust.status_code == 403

    # Admin -> 201
    h_admin = lay_header_auth("admin_cn", UserRole.ADMIN.value, user_id=1)
    r_admin = client.post("/api/v1/credit-notes", json=payload, headers=h_admin)
    assert r_admin.status_code == 201


# ==============================================================================
# TEST CASE 9: Customer Scope & Anti-IDOR khi xem Credit Note
# ==============================================================================
def test_anti_idor_customer_scope_on_viewing():
    """Tài khoản Đại lý chỉ xem được Credit Note của mình, xem của đại lý khác bị 403."""
    # Tạo trước 1 Credit Note cho CUST-001
    h_admin = lay_header_auth("admin_cn", UserRole.ADMIN.value, user_id=1)
    client.post("/api/v1/credit-notes", json={"return_order_id": "TH-2026-0000001"}, headers=h_admin)

    # Customer 1 (CUST-001) xem chi tiết -> 200 OK
    h_cust1 = lay_header_auth("customer_cn_1", UserRole.CUSTOMER.value, user_id=5, customer_id="CUST-001")
    r1 = client.get("/api/v1/credit-notes/CN-2026-0000001", headers=h_cust1)
    assert r1.status_code == 200
    assert r1.json()["customer_id"] == "CUST-001"

    # Customer 2 (CUST-002) xem chi tiết Credit Note của CUST-001 -> 403 Forbidden (chống IDOR)
    h_cust2 = lay_header_auth("customer_cn_2", UserRole.CUSTOMER.value, user_id=6, customer_id="CUST-002")
    r2 = client.get("/api/v1/credit-notes/CN-2026-0000001", headers=h_cust2)
    assert r2.status_code == 403

    # Customer 2 xem danh sách -> danh sách rỗng vì không có Credit Note nào thuộc CUST-002
    r_list = client.get("/api/v1/credit-notes", headers=h_cust2)
    assert r_list.status_code == 200
    assert len(r_list.json()) == 0


# ==============================================================================
# TEST CASE 10: Hook an toàn của Trang: ngoại lệ không làm đổ vỡ transaction
# ==============================================================================
def test_safe_trang_hook_exception_does_not_break_transaction():
    """Nếu hook cập nhật Sổ nợ của Trang xảy ra ngoại lệ, transaction lập Credit Note vẫn thành công."""
    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)
    payload = {
        "return_order_id": "TH-2026-0000001",
        "notes": "Test hook an toan",
    }

    with patch(
        "app.services.credit_note_service.hook_sau_khi_lap_chung_tu_giam_no",
        side_effect=RuntimeError("Lỗi mô phỏng logic Sổ nợ của Trang bị crash!"),
    ):
        resp = client.post("/api/v1/credit-notes", json=payload, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["id"].startswith("CN-")
        assert data["adjustment_amount"] == 297000


# ==============================================================================
# TEST CASE 11: Bộ đếm số chứng từ CN-YYYY-XXXXXXX không nhảy cóc khi rollback
# ==============================================================================
def test_continuous_sequence_no_gap_and_rollback_does_not_burn_number():
    """Rollback transaction không làm tiêu tốn số phiếu trong bảng sequences."""
    db = TestingSessionLocal()
    # Kiểm tra ban đầu chưa có sequence 2026
    seq = db.query(CreditNoteSequence).filter(CreditNoteSequence.period_key == "2026").first()
    assert seq is None
    db.close()

    # Thực hiện 1 request hợp lệ -> nhận CN-2026-0000001
    headers = lay_header_auth("accountant_cn", UserRole.ACCOUNTANT.value, user_id=2)
    resp = client.post(
        "/api/v1/credit-notes",
        json={"return_order_id": "TH-2026-0000001"},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["id"] == "CN-2026-0000001"

    # Thử request thứ 2 bị lỗi (phiếu trả hàng không tồn tại) -> transaction bị rollback
    resp_fail = client.post(
        "/api/v1/credit-notes",
        json={"return_order_id": "TH-NON-EXISTENT"},
        headers=headers,
    )
    assert resp_fail.status_code == 404

    # Kiểm tra sequence trong database vẫn dừng ở số 1
    db = TestingSessionLocal()
    seq = db.query(CreditNoteSequence).filter(CreditNoteSequence.period_key == "2026").first()
    assert seq.current_number == 1
    db.close()


# ==============================================================================
# TEST CASE 12: Bộ lọc danh sách chứng từ giảm nợ
# ==============================================================================
def test_list_credit_notes_with_filters():
    """Tra cứu danh sách Credit Note theo customer_id, invoice_id, return_order_id."""
    headers = lay_header_auth("admin_cn", UserRole.ADMIN.value, user_id=1)
    client.post("/api/v1/credit-notes", json={"return_order_id": "TH-2026-0000001"}, headers=headers)

    # Lọc đúng customer_id
    r1 = client.get("/api/v1/credit-notes?customer_id=CUST-001", headers=headers)
    assert r1.status_code == 200
    assert len(r1.json()) == 1

    # Lọc customer_id khác
    r2 = client.get("/api/v1/credit-notes?customer_id=CUST-999", headers=headers)
    assert r2.status_code == 200
    assert len(r2.json()) == 0

    # Lọc invoice_id
    r3 = client.get("/api/v1/credit-notes?invoice_id=HD-2026-0000001", headers=headers)
    assert r3.status_code == 200
    assert len(r3.json()) == 1

    # Lọc return_order_id
    r4 = client.get("/api/v1/credit-notes?return_order_id=TH-2026-0000001", headers=headers)
    assert r4.status_code == 200
    assert len(r4.json()) == 1
