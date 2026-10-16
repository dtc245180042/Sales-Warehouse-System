from datetime import datetime, timezone, timedelta
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
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, DispatchStatus
from app.models.delivery_trip import (
    DeliveryTrip,
    DeliveryTripPoint,
    DeliveryTripPointItem,
    TripStatus,
    PointStatus,
)
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
def setup_test_database():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    # Khởi tạo hoặc lấy admin user
    admin_user = db.query(User).filter(User.username == "admin").first()
    if not admin_user:
        admin_user = User(
            id=1,
            username="admin",
            email="admin@warehouse.local",
            full_name="Quản Trị Viên Phân Tuyến",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Admin@123456"),
            is_active=True,
            token_version=1,
        )
        db.add(admin_user)

    # Tạo sản phẩm
    p1 = Product(id="PRD-ROUT-01", sku="SKU-ROUT-01", name="Điện thoại Galaxy S24 Ultra", price=25000000.0, unit="cái")
    p2 = Product(id="PRD-ROUT-02", sku="SKU-ROUT-02", name="Tai nghe chống ồn Sony", price=4500000.0, unit="cái")
    p3 = Product(id="PRD-ROUT-03", sku="SKU-ROUT-03", name="Củ sạc nhanh Anker 65W", price=650000.0, unit="cái")
    db.merge(p1)
    db.merge(p2)
    db.merge(p3)

    # Tạo các đơn hàng với địa chỉ ở các khu vực khác nhau
    o1 = Order(
        id="ORD-ROUT-01", code="ORD-ROUT-01", customer_id="CUS-01", customer_name="Đại lý Cầu Giấy A",
        customer_phone="0912345678", customer_address="123 Trần Thái Tông, Cầu Giấy, Hà Nội",
        total=50000000.0, status="APPROVED",
    )
    o2 = Order(
        id="ORD-ROUT-02", code="ORD-ROUT-02", customer_id="CUS-02", customer_name="Đại lý Cầu Giấy B",
        customer_phone="0987654321", customer_address="45 Duy Tân, Cầu Giấy, Hà Nội",
        total=15000000.0, status="APPROVED",
    )
    o3 = Order(
        id="ORD-ROUT-03", code="ORD-ROUT-03", customer_id="CUS-03", customer_name="Đại lý Đống Đa C",
        customer_phone="0933221100", customer_address="88 Chùa Bộc, Đống Đa, Hà Nội",
        total=20000000.0, status="APPROVED",
    )
    o4 = Order(
        id="ORD-ROUT-04", code="ORD-ROUT-04", customer_id="CUS-04", customer_name="Đại lý Hải Phòng D",
        customer_phone="0944556677", customer_address="12 Lạch Tray, Ngô Quyền, Hải Phòng",
        total=30000000.0, status="APPROVED",
    )
    db.merge(o1)
    db.merge(o2)
    db.merge(o3)
    db.merge(o4)

    # Tạo phiếu xuất kho CONFIRMED chưa gán chuyến
    d1 = StockDispatch(
        id="PXK-CG-01", order_id="ORD-ROUT-01", customer_id="CUS-01", customer_name="Đại lý Cầu Giấy A",
        customer_address="123 Trần Thái Tông, Cầu Giấy, Hà Nội", warehouse_id=1, warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value, total_items=1, total_dispatched_quantity=2, dispatched_by=1,
    )
    d2 = StockDispatch(
        id="PXK-CG-02", order_id="ORD-ROUT-02", customer_id="CUS-02", customer_name="Đại lý Cầu Giấy B",
        customer_address="45 Duy Tân, Cầu Giấy, Hà Nội", warehouse_id=1, warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value, total_items=1, total_dispatched_quantity=3, dispatched_by=1,
    )
    d3 = StockDispatch(
        id="PXK-DD-03", order_id="ORD-ROUT-03", customer_id="CUS-03", customer_name="Đại lý Đống Đa C",
        customer_address="88 Chùa Bộc, Đống Đa, Hà Nội", warehouse_id=1, warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value, total_items=1, total_dispatched_quantity=4, dispatched_by=1,
    )
    d4 = StockDispatch(
        id="PXK-HP-04", order_id="ORD-ROUT-04", customer_id="CUS-04", customer_name="Đại lý Hải Phòng D",
        customer_address="12 Lạch Tray, Ngô Quyền, Hải Phòng", warehouse_id=1, warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value, total_items=1, total_dispatched_quantity=10, dispatched_by=1,
    )
    db.merge(d1)
    db.merge(d2)
    db.merge(d3)
    db.merge(d4)
    db.flush()

    # Dòng sản phẩm trong phiếu xuất
    it1 = StockDispatchItem(dispatch_id="PXK-CG-01", product_id="PRD-ROUT-01", sku="SKU-ROUT-01", product_name="Galaxy S24", ordered_quantity=2, dispatched_quantity=2)
    it2 = StockDispatchItem(dispatch_id="PXK-CG-02", product_id="PRD-ROUT-02", sku="SKU-ROUT-02", product_name="Sony Headphone", ordered_quantity=3, dispatched_quantity=3)
    it3 = StockDispatchItem(dispatch_id="PXK-DD-03", product_id="PRD-ROUT-03", sku="SKU-ROUT-03", product_name="Anker 65W", ordered_quantity=4, dispatched_quantity=4)
    it4 = StockDispatchItem(dispatch_id="PXK-HP-04", product_id="PRD-ROUT-01", sku="SKU-ROUT-01", product_name="Galaxy S24", ordered_quantity=10, dispatched_quantity=10)
    db.merge(it1)
    db.merge(it2)
    db.merge(it3)
    db.merge(it4)

    db.commit()
    db.close()

    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    token = tao_token_truy_cap(du_lieu={"sub": "1", "user_id": 1, "role": UserRole.ADMIN.value, "token_version": 1})
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------------------------
# 1. TEST ĐỀ XUẤT GOM PHIẾU THEO KHU VỰC (S6-06 SUBTASK 10)
# ------------------------------------------------------------------------------
def test_01_suggest_grouping_by_area(client, auth_headers):
    resp = client.get("/api/v1/delivery-trips/grouping-suggestions?warehouse_id=1", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    suggestions = resp.json()
    assert len(suggestions) >= 3

    # Phải có nhóm Cầu Giấy (chứa 2 phiếu PXK-CG-01 và PXK-CG-02)
    cg_group = next((s for s in suggestions if "Cầu Giấy" in s["area"]), None)
    assert cg_group is not None
    assert cg_group["dispatch_count"] == 2
    assert cg_group["total_packages"] == 5
    cg_ids = [d["id"] for d in cg_group["dispatches"]]
    assert "PXK-CG-01" in cg_ids
    assert "PXK-CG-02" in cg_ids

    # Phải có nhóm Đống Đa (chứa 1 phiếu PXK-DD-03)
    dd_group = next((s for s in suggestions if "Đống Đa" in s["area"]), None)
    assert dd_group is not None
    assert dd_group["dispatch_count"] == 1

    # Phải có tuyến Hải Phòng
    hp_group = next((s for s in suggestions if "Hải Phòng" in s["area"]), None)
    assert hp_group is not None
    assert hp_group["dispatch_count"] == 1


# ------------------------------------------------------------------------------
# 2. TEST TẠO CHUYẾN GIAO HÀNG GOM NHIỀU PHIẾU & GÁN TÀI XẾ/XE (S6-06 SUBTASK 8)
# ------------------------------------------------------------------------------
def test_02_create_delivery_trip_with_driver_and_vehicle(client, auth_headers):
    payload = {
        "warehouse_id": 1,
        "area": "Tuyến Cầu Giấy - Mỹ Đình",
        "driver_id": 10,
        "driver_name": "Trần Văn Tài Xế",
        "driver_phone": "0988776655",
        "license_plate": "29C-888.99",
        "vehicle_type": "Xe tải 1.5 Tấn",
        "notes": "Chuyến giao hàng khu vực Cầu Giấy ca chiều",
        "dispatch_ids": ["PXK-CG-01", "PXK-CG-02"]
    }

    resp = client.post("/api/v1/delivery-trips", json=payload, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    trip_data = resp.json()

    assert trip_data["id"].startswith("TRIP-")
    assert trip_data["area"] == "Tuyến Cầu Giấy - Mỹ Đình"
    assert trip_data["driver_name"] == "Trần Văn Tài Xế"
    assert trip_data["license_plate"] == "29C-888.99"
    assert trip_data["status"] == "READY"  # Đã gán đủ tài xế và xe
    assert trip_data["total_points"] == 2
    assert trip_data["total_packages"] == 5
    assert len(trip_data["points"]) == 2

    # Kiểm tra điểm dừng
    p1 = trip_data["points"][0]
    p2 = trip_data["points"][1]
    assert p1["stop_order"] == 1
    assert p1["dispatch_id"] == "PXK-CG-01"
    assert p1["customer_name"] == "Đại lý Cầu Giấy A"
    assert p1["contact_phone"] == "0912345678"

    assert p2["stop_order"] == 2
    assert p2["dispatch_id"] == "PXK-CG-02"
    assert p2["customer_name"] == "Đại lý Cầu Giấy B"

    # Kiểm tra trong DB: Phiếu xuất kho đã được liên kết trip_id
    db = TestingSessionLocal()
    d1 = db.query(StockDispatch).filter(StockDispatch.id == "PXK-CG-01").first()
    d2 = db.query(StockDispatch).filter(StockDispatch.id == "PXK-CG-02").first()
    assert d1.trip_id == trip_data["id"]
    assert d2.trip_id == trip_data["id"]
    db.close()


# ------------------------------------------------------------------------------
# 3. TEST CHẶN GOM PHIẾU XUẤT ĐÃ ĐƯỢC GÁN VÀO CHUYẾN KHÁC (AC CHỐNG TRÙNG)
# ------------------------------------------------------------------------------
def test_03_prevent_duplicate_dispatch_assignment(client, auth_headers):
    # 1. Tạo chuyến thứ nhất gom PXK-DD-03
    p1 = {
        "warehouse_id": 1,
        "dispatch_ids": ["PXK-DD-03"]
    }
    r1 = client.post("/api/v1/delivery-trips", json=p1, headers=auth_headers)
    assert r1.status_code == 201

    # 2. Thử tạo chuyến thứ hai cố tình gom lại PXK-DD-03
    p2 = {
        "warehouse_id": 1,
        "dispatch_ids": ["PXK-DD-03", "PXK-HP-04"]
    }
    r2 = client.post("/api/v1/delivery-trips", json=p2, headers=auth_headers)
    assert r2.status_code == 400
    assert "đã được gán vào chuyến khác" in r2.json()["detail"]


# ------------------------------------------------------------------------------
# 4. TEST CẬP NHẬT GÁN, ĐỔI VÀ HỦY GÁN TÀI XẾ/XE (S6-06 SUBTASK 14)
# ------------------------------------------------------------------------------
def test_04_assign_and_change_driver_vehicle(client, auth_headers):
    # Tạo chuyến chưa gán tài xế & xe (chỉ có danh sách phiếu)
    resp = client.post("/api/v1/delivery-trips", json={
        "warehouse_id": 1,
        "dispatch_ids": ["PXK-HP-04"]
    }, headers=auth_headers)
    assert resp.status_code == 201
    trip = resp.json()
    trip_id = trip["id"]
    assert trip["status"] == "PLANNED"
    assert trip["driver_name"] is None
    assert trip["license_plate"] is None

    # Bước A: Gán tài xế và xe -> status chuyển sang READY
    assign_resp = client.put(f"/api/v1/delivery-trips/{trip_id}/assign-driver-vehicle", json={
        "driver_id": 15,
        "driver_name": "Lê Văn Lái Xe",
        "driver_phone": "0911223344",
        "license_plate": "15C-123.45",
        "vehicle_type": "Xe tải 3.5 Tấn",
        "notes": "Phân công xe chạy tuyến Hải Phòng"
    }, headers=auth_headers)
    assert assign_resp.status_code == 200
    data = assign_resp.json()
    assert data["driver_name"] == "Lê Văn Lái Xe"
    assert data["license_plate"] == "15C-123.45"
    assert data["status"] == "READY"

    # Bước B: Đổi tài xế khác (ví dụ tài xế cũ bận)
    reassign_resp = client.put(f"/api/v1/delivery-trips/{trip_id}/assign-driver-vehicle", json={
        "driver_name": "Hoàng Văn Đổi Tài",
        "driver_phone": "0999888777",
        "license_plate": "15C-123.45",
        "notes": "Đổi tài xế do tài xế cũ xin nghỉ"
    }, headers=auth_headers)
    assert reassign_resp.status_code == 200
    data2 = reassign_resp.json()
    assert data2["driver_name"] == "Hoàng Văn Đổi Tài"
    assert data2["driver_phone"] == "0999888777"
    assert data2["status"] == "READY"

    # Bước C: Hủy gán (bỏ trống tài xế) -> status tự động về PLANNED
    unassign_resp = client.put(f"/api/v1/delivery-trips/{trip_id}/assign-driver-vehicle", json={
        "driver_name": "",
        "license_plate": "15C-123.45"
    }, headers=auth_headers)
    assert unassign_resp.status_code == 200
    data3 = unassign_resp.json()
    assert data3["driver_name"] is None
    assert data3["status"] == "PLANNED"


# ------------------------------------------------------------------------------
# 5. TEST LẤY DỮ LIỆU IN ẤN DANH SÁCH ĐIỂM GIAO (MANIFEST) (S6-06 SUBTASK 18)
# ------------------------------------------------------------------------------
def test_05_delivery_manifest_for_printing(client, auth_headers):
    # Tạo chuyến với 2 điểm
    c_resp = client.post("/api/v1/delivery-trips", json={
        "warehouse_id": 1,
        "area": "Khu vực Cầu Giấy",
        "driver_name": "Vũ Văn Vận Chuyển",
        "driver_phone": "0909090909",
        "license_plate": "29H-555.66",
        "dispatch_ids": ["PXK-CG-01", "PXK-CG-02"]
    }, headers=auth_headers)
    assert c_resp.status_code == 201
    trip_id = c_resp.json()["id"]

    # Gọi API manifest in ấn
    m_resp = client.get(f"/api/v1/delivery-trips/{trip_id}/manifest", headers=auth_headers)
    assert m_resp.status_code == 200
    manifest = m_resp.json()

    assert manifest["trip_code"] == trip_id
    assert manifest["driver_name"] == "Vũ Văn Vận Chuyển"
    assert manifest["driver_phone"] == "0909090909"
    assert manifest["license_plate"] == "29H-555.66"
    assert manifest["total_stops"] == 2
    assert manifest["total_packages"] == 5

    # Kiểm tra thứ tự và thông tin từng điểm giao
    stops = manifest["stops"]
    assert len(stops) == 2
    assert stops[0]["stop_order"] == 1
    assert stops[0]["customer_name"] == "Đại lý Cầu Giấy A"
    assert stops[0]["delivery_address"] == "123 Trần Thái Tông, Cầu Giấy, Hà Nội"
    assert stops[0]["contact_phone"] == "0912345678"
    assert len(stops[0]["items"]) == 1

    assert stops[1]["stop_order"] == 2
    assert stops[1]["customer_name"] == "Đại lý Cầu Giấy B"
    assert stops[1]["delivery_address"] == "45 Duy Tân, Cầu Giấy, Hà Nội"
    assert stops[1]["contact_phone"] == "0987654321"


# ------------------------------------------------------------------------------
# 6. TEST HỦY CHUYẾN CHƯA XUẤT BẾN VÀ NHẢ PHIẾU XUẤT VỀ HÀNG ĐỢI
# ------------------------------------------------------------------------------
def test_06_cancel_trip_releases_dispatches(client, auth_headers):
    # Tạo chuyến
    c_resp = client.post("/api/v1/delivery-trips", json={
        "warehouse_id": 1,
        "dispatch_ids": ["PXK-DD-03"]
    }, headers=auth_headers)
    assert c_resp.status_code == 201
    trip_id = c_resp.json()["id"]

    # Hủy chuyến
    del_resp = client.delete(f"/api/v1/delivery-trips/{trip_id}", headers=auth_headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "CANCELLED"

    # Kiểm tra: Phiếu PXK-DD-03 đã được trả lại tự do (trip_id == None)
    db = TestingSessionLocal()
    d3 = db.query(StockDispatch).filter(StockDispatch.id == "PXK-DD-03").first()
    assert d3.trip_id is None
    db.close()

    # Bây giờ có thể gán PXK-DD-03 vào chuyến mới mà không bị lỗi
    c2_resp = client.post("/api/v1/delivery-trips", json={
        "warehouse_id": 1,
        "dispatch_ids": ["PXK-DD-03"]
    }, headers=auth_headers)
    assert c2_resp.status_code == 201
