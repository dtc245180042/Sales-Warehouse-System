from datetime import datetime, timedelta, timezone
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
from app.models.warehouse_stock import WarehouseStock
from app.models.delivery_trip import (
    DeliveryTrip,
    DeliveryTripPoint,
    DeliveryTripPointItem,
    TripStatus,
    PointStatus,
    ItemTransitStatus,
)
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test DeliveryTrips S6-07
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
    """Tạo schema và dữ liệu người dùng trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_trip",
            email="admin_trip@test.local",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="wh_mgr_trip",
            email="wh_mgr_trip@test.local",
            role=UserRole.WH_MANAGER.value,
            assigned_warehouse="Kho Tổng Hà Nội",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    token = tao_token_truy_cap(
        du_lieu={"sub": "1", "user_id": 1, "role": UserRole.ADMIN.value, "token_version": 1}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_dispatches():
    """Tạo sẵn sản phẩm, đơn hàng và 2 phiếu xuất kho CONFIRMED phục vụ test chuyến giao."""
    db = TestingSessionLocal()
    now = datetime.now(timezone.utc)

    # Sản phẩm
    p1 = Product(id="PRD-IP15", sku="IP15-128", name="iPhone 15", price=20000000.0, sale_price=20000000.0)
    p2 = Product(id="PRD-MAC14", sku="MAC14-M3", name="MacBook Pro 14", price=40000000.0, sale_price=40000000.0)
    db.add_all([p1, p2])

    # Tồn kho ban đầu
    ws1 = WarehouseStock(product_id="PRD-IP15", warehouse_id=1, physical_stock=50, stock=50)
    ws2 = WarehouseStock(product_id="PRD-MAC14", warehouse_id=1, physical_stock=30, stock=30)
    db.add_all([ws1, ws2])

    # Đơn hàng 1
    o1 = Order(
        id="ORD-001",
        code="ORD-001",
        customer_id="CUST-001",
        customer_name="Đại Lý An Phát",
        customer_address="123 Cầu Giấy, Hà Nội",
        status="EXPORTED",
    )
    oi1 = OrderItem(order_id="ORD-001", product_id="PRD-IP15", name="iPhone 15", price=20000000.0, quantity=5)
    db.add_all([o1, oi1])

    # Đơn hàng 2
    o2 = Order(
        id="ORD-002",
        code="ORD-002",
        customer_id="CUST-002",
        customer_name="Đại Lý Mai Hoàng",
        customer_address="456 Thái Hà, Hà Nội",
        status="EXPORTED",
    )
    oi2 = OrderItem(order_id="ORD-002", product_id="PRD-MAC14", name="MacBook Pro 14", price=40000000.0, quantity=2)
    db.add_all([o2, oi2])

    # Phiếu xuất kho 1 (PXK-001): 5 cái iPhone 15 = 100.000.000 đ
    disp1 = StockDispatch(
        id="PXK-20261016-0001",
        order_id="ORD-001",
        customer_id="CUST-001",
        customer_name="Đại Lý An Phát",
        customer_address="123 Cầu Giấy, Hà Nội",
        warehouse_id=1,
        warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value,
        total_items=1,
        total_dispatched_quantity=5,
        dispatched_by=1,
        dispatched_at=now,
    )
    d_item1 = StockDispatchItem(
        dispatch_id="PXK-20261016-0001",
        product_id="PRD-IP15",
        sku="IP15-128",
        product_name="iPhone 15",
        ordered_quantity=5,
        dispatched_quantity=5,
        shortfall_quantity=0,
    )
    disp1.items.append(d_item1)

    # Phiếu xuất kho 2 (PXK-002): 2 cái MacBook Pro = 80.000.000 đ
    disp2 = StockDispatch(
        id="PXK-20261016-0002",
        order_id="ORD-002",
        customer_id="CUST-002",
        customer_name="Đại Lý Mai Hoàng",
        customer_address="456 Thái Hà, Hà Nội",
        warehouse_id=1,
        warehouse_name="Kho Tổng Hà Nội",
        status=DispatchStatus.CONFIRMED.value,
        total_items=1,
        total_dispatched_quantity=2,
        dispatched_by=1,
        dispatched_at=now,
    )
    d_item2 = StockDispatchItem(
        dispatch_id="PXK-20261016-0002",
        product_id="PRD-MAC14",
        sku="MAC14-M3",
        product_name="MacBook Pro 14",
        ordered_quantity=2,
        dispatched_quantity=2,
        shortfall_quantity=0,
    )
    disp2.items.append(d_item2)

    db.add_all([disp1, disp2])
    db.commit()
    db.close()
    return ["PXK-20261016-0001", "PXK-20261016-0002"]


def test_create_delivery_trip_success(auth_headers, sample_dispatches):
    """Test tạo chuyến giao hàng gom 2 phiếu xuất kho và tính tiền hàng trên đường ban đầu."""
    client = TestClient(app)

    payload = {
        "warehouse_id": 1,
        "driver_name": "Nguyễn Văn Lái Xe",
        "driver_phone": "0987654321",
        "license_plate": "29B-12345",
        "dispatch_ids": sample_dispatches,
        "estimated_duration_hours": 3.5,
        "notes": "Chuyến giao buổi sáng tuyến Cầu Giấy - Đống Đa",
    }

    res = client.post("/api/v1/delivery-trips", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()

    assert data["id"].startswith("TRIP-")
    assert data["status"] == "IN_TRANSIT"
    assert data["driver_name"] == "Nguyễn Văn Lái Xe"
    assert data["license_plate"] == "29B-12345"
    assert data["total_points"] == 2
    assert data["delivered_points"] == 0
    assert data["remaining_points"] == 2
    assert data["failed_points"] == 0
    assert data["is_delayed"] is False

    # Kiểm tra tính tiền hàng trên đường: 5*20M + 2*40M = 180.000.000 đ
    assert data["initial_total_value"] == 180000000.0
    assert data["in_transit_value"] == 180000000.0
    assert data["delivered_value"] == 0.0

    assert len(data["points"]) == 2
    assert data["points"][0]["customer_name"] == "Đại Lý An Phát"
    assert data["points"][0]["point_value"] == 100000000.0
    assert data["points"][0]["remaining_value"] == 100000000.0
    assert data["points"][0]["hold_on_trip"] is True

    assert data["points"][1]["customer_name"] == "Đại Lý Mai Hoàng"
    assert data["points"][1]["point_value"] == 80000000.0
    assert data["points"][1]["remaining_value"] == 80000000.0


def test_create_delivery_trip_validation_errors(auth_headers, sample_dispatches):
    """Test các trường hợp validation khi tạo chuyến giao."""
    client = TestClient(app)

    # 1. Dispatch không tồn tại
    res = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": ["PXK-KHONG-TON-TAI"]},
        headers=auth_headers,
    )
    assert res.status_code == 404

    # 2. Sai kho xuất phát
    res = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 2, "dispatch_ids": sample_dispatches},
        headers=auth_headers,
    )
    assert res.status_code == 400

    # 3. Tạo chuyến thành công lần 1
    res1 = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": sample_dispatches},
        headers=auth_headers,
    )
    assert res1.status_code == 201

    # 4. Gom lại phiếu xuất đang nằm trong chuyến đang chạy -> 409 Conflict
    res2 = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": [sample_dispatches[0]]},
        headers=auth_headers,
    )
    assert res2.status_code == 409


def test_delay_warning_calculation(auth_headers, sample_dispatches):
    """Test cảnh báo chuyến giao quá thời gian dự kiến và phân cấp mức độ trễ (S6-07)."""
    client = TestClient(app)
    now = datetime.now(timezone.utc)

    # Tạo chuyến có expected_completion_time đã trôi qua 90 phút trước
    past_time = (now - timedelta(minutes=90)).isoformat()
    payload = {
        "warehouse_id": 1,
        "dispatch_ids": sample_dispatches,
        "expected_completion_time": past_time,
    }

    create_res = client.post("/api/v1/delivery-trips", json=payload, headers=auth_headers)
    assert create_res.status_code == 201
    trip_id = create_res.json()["id"]

    # Tra cứu lại để kiểm tra cảnh báo trễ hạn
    detail_res = client.get(f"/api/v1/delivery-trips/{trip_id}", headers=auth_headers)
    assert detail_res.status_code == 200
    data = detail_res.json()

    assert data["is_delayed"] is True
    assert data["delay_minutes"] >= 89
    assert data["delay_level"] == "CRITICAL"
    assert "CẢNH BÁO" in data["delay_warning"]


def test_record_point_delivery_success_sync_trip(auth_headers, sample_dispatches):
    """Test giao thành công 1 điểm và tự động đồng bộ tiến độ toàn chuyến."""
    client = TestClient(app)

    # Tạo chuyến
    create_res = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": sample_dispatches},
        headers=auth_headers,
    )
    trip_id = create_res.json()["id"]
    point_1_id = create_res.json()["points"][0]["id"]

    # Giao thành công điểm 1
    result_payload = {
        "status": "DELIVERED",
        "completion_notes": "Đã bàn giao đủ 5 máy iPhone 15 cho anh Nam quản lý đại lý.",
    }
    pt_res = client.post(
        f"/api/v1/delivery-trips/{trip_id}/points/{point_1_id}/result",
        json=result_payload,
        headers=auth_headers,
    )
    assert pt_res.status_code == 200
    pt_data = pt_res.json()

    assert pt_data["status"] == "DELIVERED"
    assert pt_data["delivered_items_count"] == 5
    assert pt_data["undelivered_items_count"] == 0
    assert pt_data["delivered_value"] == 100000000.0
    assert pt_data["remaining_value"] == 0.0

    # Kiểm tra đồng bộ toàn chuyến
    trip_res = client.get(f"/api/v1/delivery-trips/{trip_id}", headers=auth_headers)
    trip_data = trip_res.json()

    assert trip_data["delivered_points"] == 1
    assert trip_data["remaining_points"] == 1
    assert trip_data["failed_points"] == 0
    assert trip_data["delivered_value"] == 100000000.0
    # Tiền hàng trên đường giảm từ 180M xuống 80M
    assert trip_data["in_transit_value"] == 80000000.0
    assert trip_data["status"] == "IN_TRANSIT"


def test_hold_undelivered_items_on_trip_no_auto_return_to_warehouse(auth_headers, sample_dispatches):
    """
    Test QUY TẮC CỐT LÕI (S6-07):
    - Hàng chưa giao được VẪN THUỘC TRÁCH NHIỆM CỦA CHUYẾN, KHÔNG tự về kho!
    - Tồn kho vật lý WarehouseStock KHÔNG được tự động cộng lại.
    - Tiền hàng chưa giao vẫn tiếp tục treo trong in_transit_value của chuyến.
    """
    client = TestClient(app)

    # Kiểm tra tồn kho vật lý ban đầu của PRD-MAC14 tại Kho 1 (đang là 30 cái)
    db = TestingSessionLocal()
    stock_before = db.query(WarehouseStock).filter(
        WarehouseStock.product_id == "PRD-MAC14", WarehouseStock.warehouse_id == 1
    ).first().physical_stock
    db.close()

    # 1. Tạo chuyến
    create_res = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": sample_dispatches},
        headers=auth_headers,
    )
    trip_data = create_res.json()
    trip_id = trip_data["id"]
    point_1_id = trip_data["points"][0]["id"]  # Điểm 1: iPhone 15 (100M)
    point_2_id = trip_data["points"][1]["id"]  # Điểm 2: MacBook Pro (80M)

    # 2. Giao thành công điểm 1
    client.post(
        f"/api/v1/delivery-trips/{trip_id}/points/{point_1_id}/result",
        json={"status": "DELIVERED"},
        headers=auth_headers,
    )

    # 3. Giao THẤT BẠI điểm 2 (Khách đi vắng)
    failed_payload = {
        "status": "FAILED",
        "failure_reason": "Khách hàng đi vắng, cửa hàng đóng cửa, hẹn giao lại vào ngày mai.",
        "completion_notes": "Tài xế đã gọi điện 3 cuộc không ai nghe máy.",
    }
    pt2_res = client.post(
        f"/api/v1/delivery-trips/{trip_id}/points/{point_2_id}/result",
        json=failed_payload,
        headers=auth_headers,
    )
    assert pt2_res.status_code == 200
    pt2_data = pt2_res.json()

    assert pt2_data["status"] == "FAILED"
    assert pt2_data["hold_on_trip"] is True  # Khẳng định giữ hàng trên chuyến
    assert pt2_data["undelivered_items_count"] == 2
    assert pt2_data["remaining_value"] == 80000000.0
    assert pt2_data["failure_reason"] == failed_payload["failure_reason"]

    # 4. Kiểm tra: Tồn kho vật lý KHÔNG ĐƯỢC TỰ ĐỘNG TĂNG LẠI
    db = TestingSessionLocal()
    stock_after = db.query(WarehouseStock).filter(
        WarehouseStock.product_id == "PRD-MAC14", WarehouseStock.warehouse_id == 1
    ).first().physical_stock
    db.close()
    assert stock_after == stock_before, "LỖI: Hàng thất bại không được tự động trả về kho!"

    # 5. Kiểm tra trạng thái toàn chuyến sau khi cả 2 điểm đã xử lý xong
    trip_res = client.get(f"/api/v1/delivery-trips/{trip_id}", headers=auth_headers)
    final_trip = trip_res.json()

    assert final_trip["remaining_points"] == 0
    assert final_trip["delivered_points"] == 1
    assert final_trip["failed_points"] == 1
    # Tiền hàng 80M của điểm 2 vẫn đang treo trên đường!
    assert final_trip["in_transit_value"] == 80000000.0
    assert final_trip["delivered_value"] == 100000000.0
    # Chuyến có sự cố giao thiếu/thất bại
    assert final_trip["status"] == "COMPLETED_WITH_ISSUES"
    assert "chưa giao xong" in final_trip["notes"]


def test_partial_delivery_result(auth_headers, sample_dispatches):
    """Test trường hợp giao một phần (PARTIAL) và tiền hàng còn lại tiếp tục treo trên chuyến."""
    client = TestClient(app)

    create_res = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": sample_dispatches},
        headers=auth_headers,
    )
    trip_id = create_res.json()["id"]
    point_1_id = create_res.json()["points"][0]["id"]  # 5 cái iPhone 15 = 100M

    # Giao một phần: nhận 3 cái (60M), từ chối 2 cái (40M) do bao bì móp méo
    partial_payload = {
        "status": "PARTIAL",
        "failure_reason": "Khách từ chối nhận 2 máy do hộp móp trong lúc vận chuyển",
        "delivered_items": [
            {
                "product_id": "PRD-IP15",
                "delivered_quantity": 3,
                "failure_reason": "Hộp móp",
            }
        ],
    }

    res = client.post(
        f"/api/v1/delivery-trips/{trip_id}/points/{point_1_id}/result",
        json=partial_payload,
        headers=auth_headers,
    )
    assert res.status_code == 200
    pt_data = res.json()

    assert pt_data["status"] == "PARTIAL"
    assert pt_data["delivered_items_count"] == 3
    assert pt_data["undelivered_items_count"] == 2
    assert pt_data["delivered_value"] == 60000000.0
    assert pt_data["remaining_value"] == 40000000.0

    # Tiền hàng trên đường của chuyến: 40M (từ điểm 1) + 80M (điểm 2 chưa giao) = 120M
    trip_res = client.get(f"/api/v1/delivery-trips/{trip_id}", headers=auth_headers)
    trip_data = trip_res.json()
    assert trip_data["in_transit_value"] == 120000000.0
    assert trip_data["delivered_value"] == 60000000.0


def test_list_delivery_trips_and_summary_endpoint(auth_headers, sample_dispatches):
    """Test danh sách chuyến giao và endpoint tổng hợp dashboard cho quản lý kho (S6-07)."""
    client = TestClient(app)

    # Tạo chuyến giao
    client.post(
        "/api/v1/delivery-trips",
        json={
            "warehouse_id": 1,
            "dispatch_ids": sample_dispatches,
            "driver_name": "Tài Xế Thử Nghiệm",
            "license_plate": "30A-99999",
        },
        headers=auth_headers,
    )

    # 1. Danh sách chuyến giao
    list_res = client.get("/api/v1/delivery-trips?status=IN_TRANSIT", headers=auth_headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    assert list_data["active_trips_count"] >= 1
    assert list_data["total_in_transit_value"] >= 180000000.0

    # 2. Tìm kiếm theo tên tài xế
    search_res = client.get("/api/v1/delivery-trips?search=Thử+Nghiệm", headers=auth_headers)
    assert search_res.status_code == 200
    assert search_res.json()["total"] >= 1

    # 3. Endpoint Dashboard summary
    summary_res = client.get("/api/v1/delivery-trips/summary", headers=auth_headers)
    assert summary_res.status_code == 200
    summary_data = summary_res.json()
    assert summary_data["total_active_trips"] >= 1
    assert summary_data["total_in_transit_value"] >= 180000000.0
    assert len(summary_data["by_warehouse"]) >= 1


def test_put_and_delete_rejected_405(auth_headers, sample_dispatches):
    """Test chặn sửa và xóa chuyến giao hàng đã xuất bến (405 Method Not Allowed)."""
    client = TestClient(app)

    create_res = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": sample_dispatches},
        headers=auth_headers,
    )
    trip_id = create_res.json()["id"]

    # Thử sửa chuyến -> 405
    put_res = client.put(f"/api/v1/delivery-trips/{trip_id}", json={}, headers=auth_headers)
    assert put_res.status_code == 405

    # Thử xóa chuyến -> 405
    del_res = client.delete(f"/api/v1/delivery-trips/{trip_id}", headers=auth_headers)
    assert del_res.status_code == 405


def test_start_delivery_trip(auth_headers, sample_dispatches):
    """Test endpoint khởi động chuyến giao hàng POST /{id}/start."""
    client = TestClient(app)

    create_res = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": sample_dispatches},
        headers=auth_headers,
    )
    trip_id = create_res.json()["id"]

    start_res = client.post(f"/api/v1/delivery-trips/{trip_id}/start", headers=auth_headers)
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "IN_TRANSIT"


def test_partial_delivery_validation_edge_cases(auth_headers, sample_dispatches):
    """Test các validation chặt chẽ của giao một phần (PARTIAL)."""
    client = TestClient(app)

    create_res = client.post(
        "/api/v1/delivery-trips",
        json={"warehouse_id": 1, "dispatch_ids": sample_dispatches},
        headers=auth_headers,
    )
    trip_id = create_res.json()["id"]
    point_id = create_res.json()["points"][0]["id"]

    # 1. PARTIAL nhưng thiếu delivered_items -> 400
    res1 = client.post(
        f"/api/v1/delivery-trips/{trip_id}/points/{point_id}/result",
        json={"status": "PARTIAL", "failure_reason": "Thiếu danh sách hàng"},
        headers=auth_headers,
    )
    assert res1.status_code == 400

    # 2. PARTIAL nhưng mã sản phẩm không tồn tại trong điểm giao -> 400
    res2 = client.post(
        f"/api/v1/delivery-trips/{trip_id}/points/{point_id}/result",
        json={
            "status": "PARTIAL",
            "failure_reason": "Lỗi sản phẩm",
            "delivered_items": [{"product_id": "PRD-KHONG-CO-TRONG-DON", "delivered_quantity": 1}],
        },
        headers=auth_headers,
    )
    assert res2.status_code == 400

    # 3. PARTIAL nhưng số lượng giao = 0 -> Hệ thống yêu cầu dùng FAILED
    res3 = client.post(
        f"/api/v1/delivery-trips/{trip_id}/points/{point_id}/result",
        json={
            "status": "PARTIAL",
            "failure_reason": "Giao 0 cái",
            "delivered_items": [{"product_id": "PRD-IP15", "delivered_quantity": 0}],
        },
        headers=auth_headers,
    )
    assert res3.status_code == 400

    # 4. PARTIAL nhưng giao đủ 100% -> Hệ thống yêu cầu dùng DELIVERED
    res4 = client.post(
        f"/api/v1/delivery-trips/{trip_id}/points/{point_id}/result",
        json={
            "status": "PARTIAL",
            "failure_reason": "Giao đủ hết",
            "delivered_items": [{"product_id": "PRD-IP15", "delivered_quantity": 5}],
        },
        headers=auth_headers,
    )
    assert res4.status_code == 400

