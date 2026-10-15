from datetime import date, datetime, timedelta, timezone
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
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, StockDispatchLot, DispatchStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnSequence, ReturnStatus, ReturnReason, ItemCondition
from app.services.stock_ledger import DAMAGED_WAREHOUSE_ID
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Return S8-01
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
def setup_return_test_database():
    """Tạo schema và dữ liệu người dùng / sản phẩm / kho trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_ret",
            email="admin_ret@test.local",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="wh_manager_ret",
            email="wh_mgr_ret@test.local",
            role=UserRole.WH_MANAGER.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="wh_staff_ret",
            email="wh_staff_ret@test.local",
            role=UserRole.WAREHOUSE.value,  # Thủ kho thường
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=4,
            username="sales_rep_ret",
            email="sales_rep_ret@test.local",
            role=UserRole.SALES_REP.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=5,
            username="sales_mgr_ret",
            email="sales_mgr_ret@test.local",
            role=UserRole.SALES_MANAGER.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=6,
            username="customer_ret_1",
            email="cust_ret_1@test.local",
            role=UserRole.CUSTOMER.value,
            customer_id="CUST-001",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=7,
            username="customer_ret_2",
            email="cust_ret_2@test.local",
            role=UserRole.CUSTOMER.value,
            customer_id="CUST-002",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)

    customers = [
        Customer(
            id="CUST-001",
            code="DL-001",
            name="Đại lý Dược Phẩm Hà Nội",
            address="123 Phố Huế, Hà Nội",
            tax_code="0109988771",
            status="active",
        ),
        Customer(
            id="CUST-002",
            code="DL-002",
            name="Đại lý Dược Phẩm Sài Gòn",
            address="456 Nguyễn Huệ, TP.HCM",
            tax_code="0309988772",
            status="active",
        ),
    ]
    for c in customers:
        db.add(c)

    # 1 sản phẩm có quản lý lô, 1 sản phẩm không quản lý lô
    prod_lot = Product(
        id="PROD-LOT-01",
        sku="SKU-LOT-01",
        name="Thuốc Kháng Sinh Amox 500",
        unit="hộp",
        stock=100,
        price=100_000,
        cost_price=80_000,
        manage_by_lot=True,
    )
    prod_no_lot = Product(
        id="PROD-NO-LOT-02",
        sku="SKU-NO-LOT-02",
        name="Bông Băng Y Tế Tiệt Trùng",
        unit="cuộn",
        stock=200,
        price=20_000,
        cost_price=15_000,
        manage_by_lot=False,
    )
    db.add(prod_lot)
    db.add(prod_no_lot)

    # Khởi tạo tồn kho kho 2 (Kho Đà Nẵng để kiểm tra kho xuất khác 1)
    wh_stock1 = WarehouseStock(
        product_id="PROD-LOT-01",
        sku="SKU-LOT-01",
        warehouse_id=2,
        physical_stock=100,
        stock=100,
    )
    wh_stock2 = WarehouseStock(
        product_id="PROD-NO-LOT-02",
        sku="SKU-NO-LOT-02",
        warehouse_id=2,
        physical_stock=200,
        stock=200,
    )
    db.add(wh_stock1)
    db.add(wh_stock2)

    # 2 lô hàng cho PROD-LOT-01 tại kho 2
    lot1 = ProductLot(
        id=10,
        lot_number="LOT-2026-A1",
        product_id="PROD-LOT-01",
        warehouse_id=2,
        mfg_date=date(2025, 1, 1),
        exp_date=date(2027, 1, 1),
        remaining_quantity=50,
        initial_quantity=100,
    )
    lot2 = ProductLot(
        id=11,
        lot_number="LOT-2026-A2",
        product_id="PROD-LOT-01",
        warehouse_id=2,
        mfg_date=date(2025, 2, 1),
        exp_date=date(2027, 2, 1),
        remaining_quantity=50,
        initial_quantity=100,
    )
    db.add(lot1)
    db.add(lot2)

    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def get_token_for(username: str, role: str, user_id: int, customer_id: str = None) -> str:
    data = {
        "sub": username,
        "role": role,
        "user_id": user_id,
        "token_version": 1,
    }
    if customer_id:
        data["customer_id"] = customer_id
    return tao_token_truy_cap(data)


def create_sample_dispatch_and_invoice(db, customer_id="CUST-001", warehouse_id=2):
    """
    Tạo bộ dữ liệu hoàn chỉnh: Phiếu xuất kho (có 2 lô cho SKU 1 và 1 dòng cho SKU 2)
    và Hóa đơn tương ứng đã phát hành.
    """
    now_utc = datetime.now(timezone.utc)

    # 1. Phiếu xuất kho (kho xuất là warehouse_id = 2)
    dispatch = StockDispatch(
        id="PXK-2026-0000001",
        order_id="ORD-001",
        customer_id=customer_id,
        warehouse_id=warehouse_id,
        status=DispatchStatus.CONFIRMED.value,
        dispatched_by=1,
        created_at=now_utc - timedelta(days=2),
    )
    db.add(dispatch)
    db.flush()

    # Dòng 1: SKU-LOT-01 xuất 30 cái (gồm lô 10: 20 cái, lô 11: 10 cái)
    item1 = StockDispatchItem(
        id=101,
        dispatch_id=dispatch.id,
        product_id="PROD-LOT-01",
        sku="SKU-LOT-01",
        product_name="Thuốc Kháng Sinh Amox 500",
        ordered_quantity=30,
        dispatched_quantity=30,
        shortfall_quantity=0,
    )
    db.add(item1)
    db.flush()

    disp_lot1 = StockDispatchLot(
        id=201,
        dispatch_item_id=item1.id,
        lot_id=10,
        lot_number="LOT-2026-A1",
        quantity=20,
    )
    disp_lot2 = StockDispatchLot(
        id=202,
        dispatch_item_id=item1.id,
        lot_id=11,
        lot_number="LOT-2026-A2",
        quantity=10,
    )
    db.add(disp_lot1)
    db.add(disp_lot2)

    # Dòng 2: SKU-NO-LOT-02 xuất 40 cái (không quản lý lô)
    item2 = StockDispatchItem(
        id=102,
        dispatch_id=dispatch.id,
        product_id="PROD-NO-LOT-02",
        sku="SKU-NO-LOT-02",
        product_name="Bông Băng Y Tế Tiệt Trùng",
        ordered_quantity=40,
        dispatched_quantity=40,
        shortfall_quantity=0,
    )
    db.add(item2)
    db.flush()

    # 2. Hóa đơn bán hàng tương ứng
    invoice = Invoice(
        id="HD-2026-0000001",
        customer_id=customer_id,
        customer_name="Đại lý Dược Phẩm Hà Nội",
        subtotal_amount=3_800_000,
        discount_amount=200_000,
        vat_amount=360_000,
        total_amount=3_960_000,
        paid_amount=0,
        remaining_amount=3_960_000,
        status=InvoiceStatus.UNPAID.value,
        issued_at=now_utc - timedelta(days=1),
        due_date=now_utc + timedelta(days=29),
        issued_by=1,
    )
    db.add(invoice)
    db.flush()

    # Dòng hoá đơn 1
    inv_item1 = InvoiceItem(
        id=301,
        invoice_id=invoice.id,
        dispatch_id=dispatch.id,
        dispatch_item_id=item1.id,
        order_id="ORD-001",
        product_id="PROD-LOT-01",
        sku="SKU-LOT-01",
        product_name="Thuốc Kháng Sinh Amox 500",
        unit="hộp",
        quantity=30,
        unit_price=100_000,
        discount_amount=150_000,
        vat_amount=285_000,
        subtotal=3_135_000,
    )
    # Dòng hoá đơn 2
    inv_item2 = InvoiceItem(
        id=302,
        invoice_id=invoice.id,
        dispatch_id=dispatch.id,
        dispatch_item_id=item2.id,
        order_id="ORD-001",
        product_id="PROD-NO-LOT-02",
        sku="SKU-NO-LOT-02",
        product_name="Bông Băng Y Tế Tiệt Trùng",
        unit="cuộn",
        quantity=40,
        unit_price=20_000,
        discount_amount=50_000,
        vat_amount=75_000,
        subtotal=825_000,
    )
    db.add(inv_item1)
    db.add(inv_item2)
    db.commit()

    return dispatch, invoice, inv_item1, inv_item2


# ==============================================================================
# TEST CASES STORY S8-01: LẬP PHIẾU TRẢ HÀNG & NHẬP LẠI KHO
# ==============================================================================

def test_01_create_return_request_multi_lots_requested_state(client):
    """
    Test 1: Lập yêu cầu trả hàng cho nhiều dòng / nhiều lô thành công.
    - Trạng thái là REQUESTED.
    - Tồn kho vật lý và tồn bán khả dụng hoàn toàn CHƯA THAY ĐỔI.
    - Sinh mã TH-YYYY-XXXXXXX liên tục.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    db.close()

    token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)
    payload = {
        "client_request_id": "REQ-RET-001",
        "invoice_id": invoice.id,
        "return_reason": "DEFECTIVE_PRODUCT",
        "notes": "Đại lý báo hàng bị lỗi vỉ thuốc",
        "items": [
            {
                "invoice_item_id": inv_item1.id,
                "lot_id": 10,  # Lô 10 xuất 20 cái, trả 5 cái
                "quantity": 5,
                "condition": "GOOD",
            },
            {
                "invoice_item_id": inv_item1.id,
                "lot_id": 11,  # Lô 11 xuất 10 cái, trả 3 cái
                "quantity": 3,
                "condition": "DAMAGED",
            },
            {
                "invoice_item_id": inv_item2.id,  # Không quản lý lô
                "lot_id": None,
                "quantity": 10,
                "condition": "GOOD",
            },
        ],
    }

    resp = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["id"].startswith("TH-")
    assert data["status"] == "REQUESTED"
    assert data["origin_warehouse_id"] == 2  # Kho gốc là kho 2
    assert len(data["items"]) == 3

    # Kiểm tra tồn kho CHƯA THAY ĐỔI khi ở trạng thái REQUESTED
    db = TestingSessionLocal()
    wh_stock1 = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PROD-LOT-01", WarehouseStock.warehouse_id == 2).first()
    assert wh_stock1.physical_stock == 100
    assert wh_stock1.stock == 100
    lot10 = db.query(ProductLot).filter(ProductLot.id == 10).first()
    assert lot10.remaining_quantity == 50
    db.close()


def test_02_validation_missing_or_extra_lot_id(client):
    """
    Test 2: Bắt buộc lot_id với SKU có lô và cấm lot_id với SKU không quản lý lô (Yêu cầu 2).
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    db.close()

    token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)

    # 1. SKU có quản lý lô nhưng thiếu lot_id -> 400
    p1 = {
        "invoice_id": invoice.id,
        "return_reason": "WRONG_DELIVERY",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": None, "quantity": 2}],
    }
    r1 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {token}"}, json=p1)
    assert r1.status_code == 400
    assert "quản lý theo lô" in r1.json()["detail"]

    # 2. SKU không quản lý lô nhưng lại truyền lot_id -> 400
    p2 = {
        "invoice_id": invoice.id,
        "return_reason": "WRONG_DELIVERY",
        "items": [{"invoice_item_id": inv_item2.id, "lot_id": 10, "quantity": 2}],
    }
    r2 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {token}"}, json=p2)
    assert r2.status_code == 400
    assert "không quản lý theo lô" in r2.json()["detail"]


def test_03_validation_lot_not_in_dispatch(client):
    """
    Test 3: lot_id phải thuộc các lô đã xuất cho dòng hoá đơn đó (Yêu cầu 2).
    - Tạo một lô 999 không liên quan đến phiếu xuất này.
    - Cố tình truyền lot_id = 999 -> 400.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    unrelated_lot = ProductLot(
        id=999,
        lot_number="LOT-UNRELATED",
        product_id="PROD-LOT-01",
        warehouse_id=1,
        mfg_date=date(2025, 1, 1),
        exp_date=date(2027, 1, 1),
        remaining_quantity=10,
        initial_quantity=10,
    )
    db.add(unrelated_lot)
    db.commit()
    db.close()

    token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)
    payload = {
        "invoice_id": invoice.id,
        "return_reason": "DEFECTIVE_PRODUCT",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 999, "quantity": 1}],
    }
    resp = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert resp.status_code == 400
    assert "không thuộc danh sách các lô đã xuất" in resp.json()["detail"]


def test_04_quota_exceeded_single_and_cumulative(client):
    """
    Test 4: Hạn mức trả tính theo từng lô:
    - Lô 10 xuất 20 cái. Cố tình trả 25 cái -> 400.
    - Lập phiếu 1 trả 15 cái (trạng thái REQUESTED).
    - Lập phiếu 2 đòi trả tiếp 10 cái (tổng 25 > 20) -> 400.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    db.close()

    token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)

    # 1. Trả quá số xuất trong 1 lần
    p1 = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 10, "quantity": 25}],
    }
    r1 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {token}"}, json=p1)
    assert r1.status_code == 400
    assert "vượt quá số lượng còn lại có thể trả của lô" in r1.json()["detail"]

    # 2. Trả hợp lệ 15 cái ở phiếu 1
    p2 = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 10, "quantity": 15}],
    }
    r2 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {token}"}, json=p2)
    assert r2.status_code == 201

    # 3. Phiếu 2 đòi trả 10 cái (lô 10 chỉ còn 5 cái có thể trả) -> 400
    p3 = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 10, "quantity": 10}],
    }
    r3 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {token}"}, json=p3)
    assert r3.status_code == 400
    assert "vượt quá số lượng còn lại có thể trả của lô" in r3.json()["detail"]


def test_05_cancel_return_frees_quota(client):
    """
    Test 5: Hủy phiếu giải phóng hạn mức trả (Yêu cầu 5 & 7):
    - Phiếu 1 đặt chỗ 15 cái cho lô 10.
    - Hủy phiếu 1 (bắt buộc có cancel_reason).
    - Phiếu 2 sau đó được phép trả lại 15 cái thành công.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    db.close()

    sales_token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)
    wh_mgr_token = get_token_for("wh_manager_ret", UserRole.WH_MANAGER.value, 2)

    # 1. Tạo phiếu 1
    p1 = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 10, "quantity": 15}],
    }
    r1 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {sales_token}"}, json=p1)
    ret_id = r1.json()["id"]

    # 2. Hủy thiếu cancel_reason -> 422
    r_bad_cancel = client.post(f"/api/v1/returns/{ret_id}/cancel", headers={"Authorization": f"Bearer {wh_mgr_token}"}, json={})
    assert r_bad_cancel.status_code == 422

    # 3. Hủy hợp lệ
    r_cancel = client.post(
        f"/api/v1/returns/{ret_id}/cancel",
        headers={"Authorization": f"Bearer {wh_mgr_token}"},
        json={"cancel_reason": "Đại lý báo giữ lại bán sau khi thương lượng chiết khấu"},
    )
    assert r_cancel.status_code == 200
    assert r_cancel.json()["status"] == "CANCELLED"

    # 4. Phiếu 2 trả lại 15 cái -> Thành công vì hạn mức đã được giải phóng
    r2 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {sales_token}"}, json=p1)
    assert r2.status_code == 201


def test_06_confirm_good_condition_restocks_to_origin_warehouse(client):
    """
    Test 6: Xác nhận hàng tốt nguyên vẹn -> Nhập lại đúng kho xuất gốc (kho 2) (Yêu cầu 3, 4):
    - Tăng physical_stock tại kho 2.
    - Tăng ProductLot.remaining_quantity tại lô 10.
    - Sinh thẻ kho StockLedgerEntry loại IN_RETURN có lot_id.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db, warehouse_id=2)
    db.close()

    sales_token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)
    wh_mgr_token = get_token_for("wh_manager_ret", UserRole.WH_MANAGER.value, 2)

    p = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 10, "quantity": 8, "condition": "GOOD"}],
    }
    r_create = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {sales_token}"}, json=p)
    ret_id = r_create.json()["id"]

    # Quản lý kho xác nhận nhận hàng
    r_conf = client.post(
        f"/api/v1/returns/{ret_id}/confirm",
        headers={"Authorization": f"Bearer {wh_mgr_token}"},
        json={"notes": "Đã kiểm đếm 8 hộp nguyên seal"},
    )
    assert r_conf.status_code == 200
    assert r_conf.json()["status"] == "CONFIRMED"

    # Kiểm tra database
    db = TestingSessionLocal()
    # Tồn tại kho 2 tăng từ 100 lên 108
    wh_stock2 = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PROD-LOT-01", WarehouseStock.warehouse_id == 2).first()
    assert wh_stock2.physical_stock == 108
    assert wh_stock2.stock == 108

    # Lô 10 tăng từ 50 lên 58
    lot10 = db.query(ProductLot).filter(ProductLot.id == 10).first()
    assert lot10.remaining_quantity == 58

    # Có bản ghi thẻ kho IN_RETURN
    ledger = db.query(StockLedgerEntry).filter(StockLedgerEntry.reference_code == ret_id).first()
    assert ledger is not None
    assert ledger.movement_type == "IN_RETURN"
    assert ledger.warehouse_id == 2
    assert ledger.quantity_base == 8
    assert ledger.lot_id == 10
    db.close()


def test_07_confirm_damaged_condition_does_not_increase_sellable_stock(client):
    """
    Test 7: Xác nhận hàng hỏng -> Nhập vào kho lỗi 99:
    - KHÔNG làm tăng tồn bán khả dụng Product.stock.
    - KHÔNG làm tăng tồn bán kho gốc WarehouseStock(warehouse_id=2).stock.
    - Chỉ tăng tồn tại kho lỗi WarehouseStock(warehouse_id=99).physical_stock.
    - Giữ thông tin lô tại kho lỗi và đảm bảo sum(lô tại kho lỗi) <= physical_stock(kho lỗi).
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db, warehouse_id=2)
    # Lấy tồn bán trước khi trả
    prod_before = db.query(Product).filter(Product.id == "PROD-LOT-01").first()
    initial_sellable_stock = prod_before.stock
    db.close()

    sales_token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)
    wh_mgr_token = get_token_for("wh_manager_ret", UserRole.WH_MANAGER.value, 2)

    p = {
        "invoice_id": invoice.id,
        "return_reason": "DAMAGED_IN_TRANSIT",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 10, "quantity": 6, "condition": "DAMAGED"}],
    }
    r_create = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {sales_token}"}, json=p)
    ret_id = r_create.json()["id"]

    r_conf = client.post(
        f"/api/v1/returns/{ret_id}/confirm",
        headers={"Authorization": f"Bearer {wh_mgr_token}"},
        json={"notes": "Hàng hỏng bao bì nhập kho lỗi"},
    )
    assert r_conf.status_code == 200

    # Kiểm tra chứng minh tồn khả dụng không tăng
    db = TestingSessionLocal()
    prod_after = db.query(Product).filter(Product.id == "PROD-LOT-01").first()
    assert prod_after.stock == initial_sellable_stock  # KHÔNG TĂNG!

    # Kho gốc 2 không bị tăng tồn
    wh_stock_orig = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PROD-LOT-01", WarehouseStock.warehouse_id == 2).first()
    assert wh_stock_orig.physical_stock == 100
    assert wh_stock_orig.stock == 100

    # Kho lỗi 99 tăng physical_stock = 6 nhưng tồn bán stock = 0
    wh_stock_damaged = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PROD-LOT-01", WarehouseStock.warehouse_id == DAMAGED_WAREHOUSE_ID).first()
    assert wh_stock_damaged is not None
    assert wh_stock_damaged.physical_stock == 6
    assert wh_stock_damaged.stock == 0

    # Lô hàng hỏng được lưu vết tại kho lỗi 99
    damaged_lot = db.query(ProductLot).filter(ProductLot.product_id == "PROD-LOT-01", ProductLot.warehouse_id == DAMAGED_WAREHOUSE_ID).first()
    assert damaged_lot is not None
    assert damaged_lot.lot_number == "LOT-2026-A1"
    assert damaged_lot.remaining_quantity == 6
    assert damaged_lot.remaining_quantity <= wh_stock_damaged.physical_stock
    db.close()


def test_08_atomic_double_confirm_prevented(client):
    """
    Test 8: Chống xác nhận hai lần qua câu lệnh UPDATE rowcount (Yêu cầu 5):
    - Xác nhận lần 1 -> 200 OK.
    - Xác nhận lần 2 -> 400 Bad Request, không cộng tồn hai lần.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    db.close()

    sales_token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)
    wh_mgr_token = get_token_for("wh_manager_ret", UserRole.WH_MANAGER.value, 2)

    p = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item2.id, "lot_id": None, "quantity": 5, "condition": "GOOD"}],
    }
    ret_id = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {sales_token}"}, json=p).json()["id"]

    # Lần 1
    r1 = client.post(f"/api/v1/returns/{ret_id}/confirm", headers={"Authorization": f"Bearer {wh_mgr_token}"}, json={})
    assert r1.status_code == 200

    # Lần 2
    r2 = client.post(f"/api/v1/returns/{ret_id}/confirm", headers={"Authorization": f"Bearer {wh_mgr_token}"}, json={})
    assert r2.status_code == 400
    assert "không ở trạng thái REQUESTED" in r2.json()["detail"]


def test_09_rollback_on_ledger_error(client):
    """
    Test 9: Rollback nguyên tử khi ghi nhận kho phát sinh lỗi (Yêu cầu 8):
    - Mô phỏng ngoại lệ ở record_stock_movement.
    - Phiếu trả vẫn giữ trạng thái REQUESTED, không cộng dở dang tồn kho.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    db.close()

    sales_token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)
    wh_mgr_token = get_token_for("wh_manager_ret", UserRole.WH_MANAGER.value, 2)

    p = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item2.id, "lot_id": None, "quantity": 5, "condition": "GOOD"}],
    }
    ret_id = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {sales_token}"}, json=p).json()["id"]

    with patch("app.services.return_service.record_stock_movement") as mock_ledger:
        mock_ledger.side_effect = Exception("Lỗi giả lập từ hệ thống sổ cái kho")

        with pytest.raises(Exception):
            client.post(f"/api/v1/returns/{ret_id}/confirm", headers={"Authorization": f"Bearer {wh_mgr_token}"}, json={})

    # Kiểm tra database sau rollback
    db = TestingSessionLocal()
    ret_order = db.query(ReturnOrder).filter(ReturnOrder.id == ret_id).first()
    assert ret_order.status == "REQUESTED"
    db.close()


def test_10_immutable_original_invoice(client):
    """
    Test 10: Hoá đơn gốc hoàn toàn không bị thay đổi sau quy trình trả hàng S8-01 (Yêu cầu 6):
    - paid_amount, remaining_amount, status của hoá đơn gốc giữ nguyên.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    db.close()

    sales_token = get_token_for("sales_rep_ret", UserRole.SALES_REP.value, 4)
    wh_mgr_token = get_token_for("wh_manager_ret", UserRole.WH_MANAGER.value, 2)

    p = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 10, "quantity": 5, "condition": "GOOD"}],
    }
    ret_id = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {sales_token}"}, json=p).json()["id"]
    client.post(f"/api/v1/returns/{ret_id}/confirm", headers={"Authorization": f"Bearer {wh_mgr_token}"}, json={})

    db = TestingSessionLocal()
    inv_check = db.query(Invoice).filter(Invoice.id == invoice.id).first()
    assert inv_check.status == InvoiceStatus.UNPAID.value
    assert inv_check.remaining_amount == 3_960_000
    assert inv_check.paid_amount == 0
    db.close()


def test_11_role_based_access_control(client):
    """
    Test 11: Phân quyền theo vai trò (Yêu cầu 1):
    - Lập phiếu: Sales Rep (201), Sales Manager (201), Admin (201), Customer cùng đại lý (201).
    - Customer đại lý khác cố tình lập -> 403 Forbidden.
    - Thủ kho thường (Warehouse) cố tình xác nhận hoặc hủy -> 403 Forbidden.
    - PUT và DELETE -> 405 Method Not Allowed.
    """
    db = TestingSessionLocal()
    dispatch, invoice, inv_item1, inv_item2 = create_sample_dispatch_and_invoice(db)
    db.close()

    sales_mgr_token = get_token_for("sales_mgr_ret", UserRole.SALES_MANAGER.value, 5)
    cust1_token = get_token_for("customer_ret_1", UserRole.CUSTOMER.value, 6, "CUST-001")
    cust2_token = get_token_for("customer_ret_2", UserRole.CUSTOMER.value, 7, "CUST-002")
    wh_staff_token = get_token_for("wh_staff_ret", UserRole.WAREHOUSE.value, 3)

    p = {
        "invoice_id": invoice.id,
        "return_reason": "CUSTOMER_RETURN",
        "items": [{"invoice_item_id": inv_item1.id, "lot_id": 10, "quantity": 1}],
    }

    # 1. Sales Manager lập phiếu -> 201
    r_sm = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {sales_mgr_token}"}, json=p)
    assert r_sm.status_code == 201
    ret_id = r_sm.json()["id"]

    # 2. Customer 1 (chính đại lý hoá đơn) lập phiếu -> 201
    r_c1 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {cust1_token}"}, json=p)
    assert r_c1.status_code == 201

    # 3. Customer 2 (đại lý khác) cố tình lập phiếu cho hoá đơn của Customer 1 -> 403
    r_c2 = client.post("/api/v1/returns", headers={"Authorization": f"Bearer {cust2_token}"}, json=p)
    assert r_c2.status_code == 403

    # 4. Thủ kho thường (Warehouse) cố tình xác nhận nhận hàng -> 403
    r_wh_staff = client.post(f"/api/v1/returns/{ret_id}/confirm", headers={"Authorization": f"Bearer {wh_staff_token}"}, json={})
    assert r_wh_staff.status_code == 403

    # 5. Thủ kho thường (Warehouse) cố tình hủy phiếu -> 403
    r_wh_cancel = client.post(f"/api/v1/returns/{ret_id}/cancel", headers={"Authorization": f"Bearer {wh_staff_token}"}, json={"cancel_reason": "Hủy trái phép"})
    assert r_wh_cancel.status_code == 403

    # 6. PUT / DELETE từ chối 405
    r_put = client.put(f"/api/v1/returns/{ret_id}", headers={"Authorization": f"Bearer {sales_mgr_token}"}, json={})
    assert r_put.status_code == 405
    r_del = client.delete(f"/api/v1/returns/{ret_id}", headers={"Authorization": f"Bearer {sales_mgr_token}"})
    assert r_del.status_code == 405
