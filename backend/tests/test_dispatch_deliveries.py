import io
from typing import Optional
from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, StockDispatchLot, DispatchStatus
from app.models.dispatch_delivery import DispatchDelivery, DeliveryStatus, DeliveryFailureReason
from app.services.invoice_service import InvoiceService, kiem_tra_dieu_kien_lap_hoa_don
from app.schemas.invoice import InvoiceCreateRequest
from main import app

TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_lay_phien_db():
    phien_db = TestingSessionLocal()
    try:
        yield phien_db
    finally:
        phien_db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    # Create test users
    admin = User(
        id=1,
        username="admin_delivery",
        email="admin_delivery@test.local",
        role=UserRole.ADMIN.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    wh_staff = User(
        id=2,
        username="wh_staff_1",
        email="wh_staff_1@test.local",
        role=UserRole.WAREHOUSE.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    accountant = User(
        id=3,
        username="accountant_1",
        email="accountant_1@test.local",
        role=UserRole.ACCOUNTANT.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    db.add_all([admin, wh_staff, accountant])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


def get_auth_headers(username: str = "wh_staff_1", role: Optional[str] = None) -> dict:
    user_id = 1 if username == "admin_delivery" else (3 if username == "accountant_1" else 2)
    role_val = role or (UserRole.ADMIN.value if username == "admin_delivery" else (UserRole.ACCOUNTANT.value if username == "accountant_1" else UserRole.WAREHOUSE.value))
    token = tao_token_truy_cap({
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "role": role_val,
        "token_version": 1,
    })
    return {"Authorization": f"Bearer {token}"}


def create_sample_dispatch_and_order(db, dispatch_id="PXK-20261016-0001", order_id="ORD-20261016-0001", product_id="PRD-101", sku="TEST-SKU-001"):
    """Tạo đơn hàng, phiếu xuất, sản phẩm, kho và lô mẫu để test."""
    now_utc = datetime.now(timezone.utc)

    # 1. Product (idempotent)
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        product = Product(
            id=product_id,
            sku=sku,
            name="Thức ăn chăn nuôi CP-55",
            unit="bao",
            price=350000.0,
        )
        db.add(product)
        db.flush()

    # 2. Warehouse Stock (idempotent)
    stock = db.query(WarehouseStock).filter(WarehouseStock.warehouse_id == 1, WarehouseStock.product_id == product_id).first()
    if not stock:
        stock = WarehouseStock(
            warehouse_id=1,
            product_id=product_id,
            sku=sku,
            physical_stock=50,  # còn 50 sau khi xuất 50
            stock=50,
            min_stock=10,
        )
        db.add(stock)
    else:
        stock.physical_stock = 50

    # 3. Product Lot (idempotent)
    lot_num = f"LOT-{product_id}"
    lot = db.query(ProductLot).filter(ProductLot.product_id == product_id, ProductLot.lot_number == lot_num).first()
    if not lot:
        lot = ProductLot(
            product_id=product_id,
            warehouse_id=1,
            lot_number=lot_num,
            mfg_date=date(2025, 1, 1),
            exp_date=date(2027, 10, 1),
            initial_quantity=100,
            remaining_quantity=50,
        )
        db.add(lot)
        db.flush()
    else:
        lot.remaining_quantity = 50

    # 4. Order & Order Item
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        order = Order(
            id=order_id,
            code=order_id,
            customer_id="CUST-001",
            customer_name="Đại Lý Hải Dương",
            total=17500000.0,
            status="DISPATCHED",
        )
        db.add(order)
        db.flush()

        order_item = OrderItem(
            order_id=order_id,
            product_id=product_id,
            sku=sku,
            name="Thức ăn chăn nuôi CP-55",
            quantity=50,
            price=350000.0,
            subtotal=17500000.0,
        )
        db.add(order_item)

    # 5. Stock Dispatch
    dispatch = db.query(StockDispatch).filter(StockDispatch.id == dispatch_id).first()
    if not dispatch:
        dispatch = StockDispatch(
            id=dispatch_id,
            order_id=order_id,
            warehouse_id=1,
            warehouse_name="Kho Tổng Hà Nội",
            customer_id="CUST-001",
            customer_name="Đại Lý Hải Dương",
            status=DispatchStatus.CONFIRMED.value,
            total_items=1,
            dispatched_by=2,
        )
        db.add(dispatch)
        db.flush()

        dispatch_item = StockDispatchItem(
            dispatch_id=dispatch_id,
            product_id=product_id,
            sku=sku,
            product_name="Thức ăn chăn nuôi CP-55",
            ordered_quantity=50,
            dispatched_quantity=50,
            shortfall_quantity=0,
            delivered_quantity=0,
        )
        db.add(dispatch_item)
        db.flush()

        dispatch_lot = StockDispatchLot(
            dispatch_item_id=dispatch_item.id,
            lot_id=lot.id,
            lot_number=lot.lot_number,
            quantity=50,
        )
        db.add(dispatch_lot)

    db.commit()
    return dispatch, order


def test_01_upload_proof_and_confirm_delivery_success():
    """AC-1 & AC-6: Tải ảnh biên bản có chữ ký (POD) và xác nhận giao thành công."""
    client = TestClient(app)
    headers = get_auth_headers("wh_staff_1")

    db = TestingSessionLocal()
    create_sample_dispatch_and_order(db, "PXK-TEST-SUCCESS-01", "ORD-TEST-SUCCESS-01")
    db.close()

    # 1. Tải lên tệp ảnh POD
    fake_img = io.BytesIO(b"FAKE_IMAGE_DATA_FOR_POD_PROOF")
    files = {"file": ("bien_ban_ky_nhan.jpg", fake_img, "image/jpeg")}
    upload_resp = client.post("/api/v1/dispatch-deliveries/upload-proof", headers=headers, files=files)
    assert upload_resp.status_code == 201, upload_resp.text
    upload_data = upload_resp.json()
    assert "proof_image_url" in upload_data
    proof_url = upload_data["proof_image_url"]

    # 2. Kiểm tra đọc lại tệp tĩnh POD
    file_resp = client.get(proof_url)
    assert file_resp.status_code == 200
    assert file_resp.content == b"FAKE_IMAGE_DATA_FOR_POD_PROOF"

    # 3. Xác nhận giao hàng thành công
    confirm_payload = {
        "receiver_name": "Nguyễn Văn Đại Lý",
        "receiver_phone": "0987654321",
        "delivered_at": datetime.now(timezone.utc).isoformat(),
        "proof_image_url": proof_url,
        "notes": "Đại lý đã kiểm đủ 50 bao và ký biên bản đầy đủ",
    }
    confirm_resp = client.post(
        "/api/v1/dispatch-deliveries/PXK-TEST-SUCCESS-01/confirm",
        headers=headers,
        json=confirm_payload,
    )
    assert confirm_resp.status_code == 200, confirm_resp.text
    res_data = confirm_resp.json()

    assert res_data["dispatch_id"] == "PXK-TEST-SUCCESS-01"
    assert res_data["status"] == "DELIVERED"
    assert res_data["receiver_name"] == "Nguyễn Văn Đại Lý"
    assert res_data["proof_image_url"] == proof_url

    # 4. Kiểm tra CSDL cập nhật
    db = TestingSessionLocal()
    dsp = db.query(StockDispatch).filter(StockDispatch.id == "PXK-TEST-SUCCESS-01").first()
    assert dsp.status == "DELIVERED"
    assert dsp.items[0].delivered_quantity == 50

    ord_obj = db.query(Order).filter(Order.id == "ORD-TEST-SUCCESS-01").first()
    assert ord_obj.status == "DELIVERED"
    db.close()


def test_02_confirm_delivery_validations():
    """Kiểm tra các ràng buộc dữ liệu: bắt buộc người nhận, bắt buộc ảnh chứng từ POD."""
    client = TestClient(app)
    headers = get_auth_headers("wh_staff_1")

    db = TestingSessionLocal()
    create_sample_dispatch_and_order(db, "PXK-TEST-VAL-01", "ORD-TEST-VAL-01")
    db.close()

    # Thiếu người nhận
    resp1 = client.post(
        "/api/v1/dispatch-deliveries/PXK-TEST-VAL-01/confirm",
        headers=headers,
        json={"receiver_name": "", "proof_image_url": "/some/proof.jpg"},
    )
    assert resp1.status_code in [400, 422]

    # Thiếu ảnh chứng từ POD
    resp2 = client.post(
        "/api/v1/dispatch-deliveries/PXK-TEST-VAL-01/confirm",
        headers=headers,
        json={"receiver_name": "Trần Văn A", "proof_image_url": ""},
    )
    assert resp2.status_code == 400
    assert "Bắt buộc phải tải lên ảnh biên bản" in resp2.json()["detail"]

    # Không tìm thấy dispatch_id
    resp3 = client.post(
        "/api/v1/dispatch-deliveries/PXK-KHONG-TON-TAI/confirm",
        headers=headers,
        json={"receiver_name": "Trần Văn A", "proof_image_url": "/valid.jpg"},
    )
    assert resp3.status_code == 404


def test_03_delivery_failure_reasons_and_auto_restock():
    """AC-2 & AC-4: Giao thất bại, chọn lý do, tự động hoàn trả tồn kho và tồn lô."""
    client = TestClient(app)
    headers = get_auth_headers("wh_staff_1")

    # 1. Kiểm tra danh mục lý do thất bại
    reasons_resp = client.get("/api/v1/dispatch-deliveries/failure-reasons", headers=headers)
    assert reasons_resp.status_code == 200
    reasons = reasons_resp.json()
    assert len(reasons) >= 5
    assert any("không liên lạc được" in r["label"] for r in reasons)

    # 2. Chuẩn bị phiếu xuất (kho đang có 50, lô đang có 50; xuất 50)
    db = TestingSessionLocal()
    create_sample_dispatch_and_order(db, "PXK-TEST-FAIL-01", "ORD-TEST-FAIL-01")
    db.close()

    # 3. Báo giao hàng thất bại
    fail_payload = {
        "failure_reason": DeliveryFailureReason.RECIPIENT_UNAVAILABLE.value,
        "failure_notes": "Tài xế đã gọi 3 cuộc không nghe máy, cửa hàng đóng cửa.",
        "notes": "Chở hàng quay về nhập lại kho tổng.",
    }
    fail_resp = client.post(
        "/api/v1/dispatch-deliveries/PXK-TEST-FAIL-01/fail",
        headers=headers,
        json=fail_payload,
    )
    assert fail_resp.status_code == 200, fail_resp.text
    data = fail_resp.json()

    assert data["status"] == "DELIVERY_FAILED"
    assert data["returned_to_warehouse"] is True
    assert data["returned_warehouse_id"] == 1
    assert data["failure_reason"] == DeliveryFailureReason.RECIPIENT_UNAVAILABLE.value

    # 4. Kiểm tra kho vật lý và lô được tự động hoàn lại số lượng (50 + 50 = 100)
    db = TestingSessionLocal()
    stock = db.query(WarehouseStock).filter(WarehouseStock.warehouse_id == 1, WarehouseStock.product_id == "PRD-101").first()
    assert stock.physical_stock == 100, f"Tồn kho thực tế phải là 100, nhưng là {stock.physical_stock}"

    lot = db.query(ProductLot).filter(ProductLot.product_id == "PRD-101").first()
    assert lot is not None
    assert lot.remaining_quantity == 100, f"Tồn lô phải là 100, nhưng là {lot.remaining_quantity}"

    # 5. Kiểm tra ghi sổ cái kho IN_RETURN
    ledger_entries = db.query(StockLedgerEntry).filter(
        StockLedgerEntry.reference_code == "PXK-TEST-FAIL-01"
    ).all()
    assert len(ledger_entries) > 0
    assert any(e.movement_type == "IN_RETURN" and e.quantity_base == 50 for e in ledger_entries)

    # 6. Kiểm tra trạng thái phiếu xuất và đơn hàng
    dsp = db.query(StockDispatch).filter(StockDispatch.id == "PXK-TEST-FAIL-01").first()
    assert dsp.status == "DELIVERY_FAILED"

    ord_obj = db.query(Order).filter(Order.id == "ORD-TEST-FAIL-01").first()
    assert ord_obj.status == "DELIVERY_FAILED"
    db.close()


def test_04_conflict_and_get_details():
    """Kiểm tra không cho phép xác nhận đè khi đã thất bại và tra cứu chi tiết."""
    client = TestClient(app)
    headers = get_auth_headers("wh_staff_1")

    db = TestingSessionLocal()
    create_sample_dispatch_and_order(db, "PXK-TEST-CONFLICT", "ORD-TEST-CONFLICT")
    db.close()

    # Báo thất bại
    client.post(
        "/api/v1/dispatch-deliveries/PXK-TEST-CONFLICT/fail",
        headers=headers,
        json={"failure_reason": "Sai địa chỉ giao hàng"},
    )

    # Thử xác nhận giao thành công cho phiếu đã báo thất bại -> Lỗi 400
    confirm_fail = client.post(
        "/api/v1/dispatch-deliveries/PXK-TEST-CONFLICT/confirm",
        headers=headers,
        json={"receiver_name": "Ai Đó", "proof_image_url": "/some.png"},
    )
    assert confirm_fail.status_code == 400
    assert "đã bị ghi nhận giao thất bại" in confirm_fail.json()["detail"]

    # Tra cứu chi tiết
    get_resp = client.get("/api/v1/dispatch-deliveries/PXK-TEST-CONFLICT", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["failure_reason"] == "Sai địa chỉ giao hàng"


def test_05_invoice_linkage_gating_sc259():
    """AC-3 & AC-7: Phiếu giao thất bại tuyệt đối không được lập hóa đơn; chỉ DELIVERED mới được."""
    db = TestingSessionLocal()
    dsp_fail, _ = create_sample_dispatch_and_order(db, "PXK-INV-FAIL", "ORD-INV-FAIL")
    dsp_success, _ = create_sample_dispatch_and_order(db, "PXK-INV-SUCCESS", "ORD-INV-SUCCESS")

    # Giả lập 1 phiếu giao thất bại và 1 phiếu giao thành công
    dsp_fail.status = "DELIVERY_FAILED"
    dsp_success.status = "DELIVERED"
    db.commit()

    # 1. Hàm kiểm tra điều kiện
    assert kiem_tra_dieu_kien_lap_hoa_don(dsp_fail) is False
    assert kiem_tra_dieu_kien_lap_hoa_don(dsp_success) is True

    # 2. Thử lập hóa đơn cho phiếu thất bại thông qua InvoiceService -> Bị chặn 400
    admin_user = db.query(User).filter(User.username == "admin_delivery").first()
    payload_fail = InvoiceCreateRequest(
        dispatch_ids=["PXK-INV-FAIL"],
        client_request_id="REQ-INV-FAIL-01",
    )

    with pytest.raises(Exception) as excinfo:
        InvoiceService.create_invoice(db=db, payload=payload_fail, current_user=admin_user)
    assert "chưa đủ điều kiện lập hóa đơn" in str(excinfo.value)

    db.close()
