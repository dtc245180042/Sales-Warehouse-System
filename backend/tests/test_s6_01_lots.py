from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.product_lot import ProductLot
from app.models.warehouse_stock import WarehouseStock
from app.services.lot_service import LotService
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Lot S6-01
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
def setup_lot_test_database():
    """Tạo schema và dữ liệu người dùng trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()

    # Tạo các user theo vai trò chuẩn UserRole
    users = [
        User(
            id=1,
            username="admin_lot",
            email="admin_lot@test.local",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
        ),
        User(
            id=2,
            username="wh_mgr_lot",
            email="wh_mgr_lot@test.local",
            role=UserRole.WH_MANAGER.value,
            assigned_warehouse="Kho Tổng Hà Nội",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
        ),
        User(
            id=3,
            username="wh_staff_lot",
            email="wh_staff_lot@test.local",
            role=UserRole.WAREHOUSE.value,
            assigned_warehouse="Kho Tổng Hà Nội",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
        ),
    ]
    for u in users:
        db.add(u)
    db.commit()
    db.close()

    yield

    db = TestingSessionLocal()
    Base.metadata.drop_all(bind=test_engine)
    db.close()
    app.dependency_overrides.pop(lay_phien_db, None)


@pytest.fixture
def client():
    return TestClient(app)


def auth_header(user_id: int, username: str, role: str) -> dict:
    token = tao_token_truy_cap(du_lieu={
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "role": role,
        "token_version": 1,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    return auth_header(1, "admin_lot", UserRole.ADMIN.value)


@pytest.fixture
def wh_mgr_headers():
    return auth_header(2, "wh_mgr_lot", UserRole.WH_MANAGER.value)


@pytest.fixture
def wh_staff_headers():
    return auth_header(3, "wh_staff_lot", UserRole.WAREHOUSE.value)


# ==============================================================================
# TEST CASES CHO S6-01
# ==============================================================================

def test_01_product_lot_model_fields_and_constraints():
    """Kiểm tra cấu trúc model ProductLot, String(50) product_id và ràng buộc CheckConstraint."""
    db = TestingSessionLocal()
    # Tạo sản phẩm
    prod = Product(
        id="PRD-TECH-001",
        sku="SKU-TECH-001",
        name="Laptop Dell XPS 15",
        category="Laptop",
        manage_by_lot=True,
        near_expiry_threshold_days=30,
    )
    db.add(prod)
    db.commit()

    today = LotService.get_current_vn_date()
    lot = ProductLot(
        lot_number="LOT-2026-001",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=60),
        exp_date=today + timedelta(days=300),
        initial_quantity=100,
        remaining_quantity=100,
    )
    db.add(lot)
    db.commit()

    assert lot.id is not None
    assert isinstance(lot.product_id, str)
    assert lot.product_id == "PRD-TECH-001"
    assert lot.remaining_quantity == 100
    db.close()


def test_02_toggle_lot_tracking_zero_stock_succeeds_immediately(client, admin_headers):
    """Khi sản phẩm có tồn physical_stock == 0 ở tất cả các kho, bật manage_by_lot thành công ngay."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-ZERO-001",
        sku="SKU-ZERO-001",
        name="Tai nghe Bluetooth Sony",
        category="Phụ kiện",
        manage_by_lot=False,
    )
    db.add(prod)
    db.commit()
    db.close()

    res = client.put(
        f"/api/v1/products/PRD-ZERO-001/lot-tracking",
        json={"manage_by_lot": True, "near_expiry_threshold_days": 45, "initial_lots": []},
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["manage_by_lot"] is True

    db = TestingSessionLocal()
    p = db.query(Product).filter(Product.id == "PRD-ZERO-001").first()
    assert p.manage_by_lot is True
    assert p.near_expiry_threshold_days == 45
    db.close()


def test_03_toggle_lot_tracking_requires_initial_lots_per_warehouse(client, admin_headers):
    """
    Quy tắc 1 của Nhóm trưởng:
    Khi bật manage_by_lot: Xét từng kho dựa trên warehouse_stocks.physical_stock.
    Kho nào có tồn mà thiếu lô thì trả 400 và nêu rõ kho nào.
    """
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-MULTI-001",
        sku="SKU-MULTI-001",
        name="Bàn phím cơ không dây",
        category="Phụ kiện",
        manage_by_lot=False,
    )
    db.add(prod)
    # Kho 1 có tồn 50, Kho 2 có tồn 20
    ws1 = WarehouseStock(product_id=prod.id, warehouse_id=1, warehouse="Kho Tổng Hà Nội", physical_stock=50, stock=50)
    ws2 = WarehouseStock(product_id=prod.id, warehouse_id=2, warehouse="Kho Đà Nẵng", physical_stock=20, stock=20)
    db.add_all([ws1, ws2])
    db.commit()
    db.close()

    # Request không gửi initial_lots nào
    res_none = client.put(
        f"/api/v1/products/PRD-MULTI-001/lot-tracking",
        json={"manage_by_lot": True, "initial_lots": []},
        headers=admin_headers,
    )
    assert res_none.status_code == 400
    detail = res_none.json()["detail"]
    assert "Kho Tổng Hà Nội" in detail or "warehouse_id=1" in detail
    assert "Kho Đà Nẵng" in detail or "warehouse_id=2" in detail

    # Request chỉ gửi initial_lot cho Kho 1, thiếu Kho 2
    today = LotService.get_current_vn_date()
    res_partial = client.put(
        f"/api/v1/products/PRD-MULTI-001/lot-tracking",
        json={
            "manage_by_lot": True,
            "initial_lots": [
                {
                    "warehouse_id": 1,
                    "lot_number": "LOT-HN-01",
                    "mfg_date": str(today - timedelta(days=30)),
                    "exp_date": str(today + timedelta(days=180)),
                }
            ],
        },
        headers=admin_headers,
    )
    assert res_partial.status_code == 400
    detail_partial = res_partial.json()["detail"]
    assert "warehouse_id=2" in detail_partial or "Kho Đà Nẵng" in detail_partial


def test_04_toggle_lot_tracking_success_with_all_warehouses(client, admin_headers):
    """Bật manage_by_lot thành công khi cung cấp đầy đủ initial_lots cho mọi kho có tồn."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-OK-001",
        sku="SKU-OK-001",
        name="Màn hình Gaming 27 inch",
        category="Màn hình",
        manage_by_lot=False,
    )
    db.add(prod)
    ws1 = WarehouseStock(product_id=prod.id, warehouse_id=1, warehouse="Kho Tổng Hà Nội", physical_stock=40, stock=40)
    ws2 = WarehouseStock(product_id=prod.id, warehouse_id=2, warehouse="Kho Đà Nẵng", physical_stock=15, stock=15)
    db.add_all([ws1, ws2])
    db.commit()
    db.close()

    today = LotService.get_current_vn_date()
    res = client.put(
        f"/api/v1/products/PRD-OK-001/lot-tracking",
        json={
            "manage_by_lot": True,
            "near_expiry_threshold_days": 60,
            "initial_lots": [
                {
                    "warehouse_id": 1,
                    "lot_number": "LOT-HN-OK",
                    "mfg_date": str(today - timedelta(days=20)),
                    "exp_date": str(today + timedelta(days=200)),
                },
                {
                    "warehouse_id": 2,
                    "lot_number": "LOT-DN-OK",
                    "mfg_date": str(today - timedelta(days=20)),
                    "exp_date": str(today + timedelta(days=200)),
                },
            ],
        },
        headers=admin_headers,
    )
    assert res.status_code == 200

    db = TestingSessionLocal()
    p = db.query(Product).filter(Product.id == "PRD-OK-001").first()
    assert p.manage_by_lot is True
    assert p.near_expiry_threshold_days == 60

    # Kiểm tra các lô đầu kỳ được tạo đúng số lượng bằng physical_stock
    lots = db.query(ProductLot).filter(ProductLot.product_id == "PRD-OK-001").all()
    assert len(lots) == 2
    lot_hn = next(l for l in lots if l.warehouse_id == 1)
    lot_dn = next(l for l in lots if l.warehouse_id == 2)
    assert lot_hn.initial_quantity == 40
    assert lot_hn.remaining_quantity == 40
    assert lot_dn.initial_quantity == 15
    assert lot_dn.remaining_quantity == 15
    db.close()


def test_05_disable_lot_tracking_blocked_if_remaining_stock_exists(client, admin_headers):
    """Không thể tắt quản lý lô khi còn tồn trong các lô hàng."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-DIS-001",
        sku="SKU-DIS-001",
        name="Ổ cứng SSD 1TB",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)
    today = LotService.get_current_vn_date()
    lot = ProductLot(
        lot_number="LOT-SSD-01",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=10),
        exp_date=today + timedelta(days=365),
        initial_quantity=20,
        remaining_quantity=10,
    )
    db.add(lot)
    db.commit()
    db.close()

    # Thử tắt khi remaining_quantity = 10 > 0 -> Bị từ chối HTTP 400
    res_fail = client.put(
        f"/api/v1/products/PRD-DIS-001/lot-tracking",
        json={"manage_by_lot": False},
        headers=admin_headers,
    )
    assert res_fail.status_code == 400
    assert "Không thể tắt quản lý lô khi sản phẩm vẫn còn tồn" in res_fail.json()["detail"]

    # Đưa remaining_quantity về 0 -> Tắt thành công
    db = TestingSessionLocal()
    lot_to_zero = db.query(ProductLot).filter(ProductLot.product_id == "PRD-DIS-001").first()
    lot_to_zero.remaining_quantity = 0
    db.commit()
    db.close()

    res_ok = client.put(
        f"/api/v1/products/PRD-DIS-001/lot-tracking",
        json={"manage_by_lot": False},
        headers=admin_headers,
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["manage_by_lot"] is False


def test_06_post_lots_does_not_increase_physical_stock_and_blocks_excess(client, admin_headers):
    """
    Quy tắc 2 của Nhóm trưởng:
    POST /lots chỉ khai báo lô, không cộng tồn.
    Chặn nếu tổng remaining_quantity các lô của (product_id, warehouse_id) vượt physical_stock.
    """
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-POST-001",
        sku="SKU-POST-001",
        name="Chuột công thái học MX Master",
        category="Phụ kiện",
        manage_by_lot=True,
    )
    db.add(prod)
    # Tồn thực tế tại kho 1 là 100
    ws = WarehouseStock(product_id=prod.id, warehouse_id=1, warehouse="Kho Tổng Hà Nội", physical_stock=100, stock=100)
    db.add(ws)
    db.commit()
    db.close()

    today = LotService.get_current_vn_date()

    # 1. Khai báo lô 1 với số lượng 60 -> Thành công
    res1 = client.post(
        "/api/v1/lots",
        json={
            "product_id": "PRD-POST-001",
            "warehouse_id": 1,
            "lot_number": "LOT-MX-01",
            "mfg_date": str(today - timedelta(days=10)),
            "exp_date": str(today + timedelta(days=180)),
            "initial_quantity": 60,
            "remaining_quantity": 60,
        },
        headers=admin_headers,
    )
    assert res1.status_code == 201

    # Kiểm tra physical_stock của kho VẪN LÀ 100 (POST /lots KHÔNG được cộng dồn tồn kho)
    db = TestingSessionLocal()
    ws_check = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PRD-POST-001", WarehouseStock.warehouse_id == 1).first()
    assert ws_check.physical_stock == 100
    db.close()

    # 2. Khai báo thêm lô 2 với số lượng 50 (Tổng lô = 60 + 50 = 110 > 100) -> Phải bị chặn HTTP 400!
    res_exceed = client.post(
        "/api/v1/lots",
        json={
            "product_id": "PRD-POST-001",
            "warehouse_id": 1,
            "lot_number": "LOT-MX-02",
            "mfg_date": str(today - timedelta(days=10)),
            "exp_date": str(today + timedelta(days=180)),
            "initial_quantity": 50,
            "remaining_quantity": 50,
        },
        headers=admin_headers,
    )
    assert res_exceed.status_code == 400
    assert "vượt quá tồn kho vật lý hiện tại" in res_exceed.json()["detail"]

    # 3. Khai báo lô 2 với số lượng 40 (Tổng lô = 60 + 40 = 100 == 100) -> Thành công
    res2 = client.post(
        "/api/v1/lots",
        json={
            "product_id": "PRD-POST-001",
            "warehouse_id": 1,
            "lot_number": "LOT-MX-02",
            "mfg_date": str(today - timedelta(days=10)),
            "exp_date": str(today + timedelta(days=180)),
            "initial_quantity": 40,
            "remaining_quantity": 40,
        },
        headers=admin_headers,
    )
    assert res2.status_code == 201

    # Kiểm tra physical_stock vẫn là 100
    db = TestingSessionLocal()
    ws_check2 = db.query(WarehouseStock).filter(WarehouseStock.product_id == "PRD-POST-001", WarehouseStock.warehouse_id == 1).first()
    assert ws_check2.physical_stock == 100
    db.close()


def test_07_post_lot_date_validation_and_duplicate(client, admin_headers):
    """Kiểm tra ngày hết hạn phải sau ngày sản xuất và chặn trùng số lô."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-VAL-001",
        sku="SKU-VAL-001",
        name="Webcam 4K Ultra",
        category="Phụ kiện",
        manage_by_lot=True,
    )
    db.add(prod)
    ws = WarehouseStock(product_id=prod.id, warehouse_id=1, physical_stock=50, stock=50)
    db.add(ws)
    db.commit()
    db.close()

    today = LotService.get_current_vn_date()

    # exp_date <= mfg_date -> Bị từ chối
    res_date = client.post(
        "/api/v1/lots",
        json={
            "product_id": "PRD-VAL-001",
            "warehouse_id": 1,
            "lot_number": "LOT-ERR-01",
            "mfg_date": str(today),
            "exp_date": str(today - timedelta(days=1)),
            "initial_quantity": 10,
        },
        headers=admin_headers,
    )
    assert res_date.status_code == 400
    assert "sau ngày sản xuất" in res_date.json()["detail"]

    # Tạo thành công 1 lô
    res_ok = client.post(
        "/api/v1/lots",
        json={
            "product_id": "PRD-VAL-001",
            "warehouse_id": 1,
            "lot_number": "LOT-DUP-01",
            "mfg_date": str(today - timedelta(days=10)),
            "exp_date": str(today + timedelta(days=90)),
            "initial_quantity": 10,
        },
        headers=admin_headers,
    )
    assert res_ok.status_code == 201

    # Tạo lại cùng số lô tại cùng kho -> Bị chặn trùng
    res_dup = client.post(
        "/api/v1/lots",
        json={
            "product_id": "PRD-VAL-001",
            "warehouse_id": 1,
            "lot_number": "LOT-DUP-01",
            "mfg_date": str(today - timedelta(days=10)),
            "exp_date": str(today + timedelta(days=90)),
            "initial_quantity": 10,
        },
        headers=admin_headers,
    )
    assert res_dup.status_code == 400
    assert "đã tồn tại" in res_dup.json()["detail"]


def test_08_dynamic_lot_statuses_and_warning_endpoint(client, wh_mgr_headers):
    """Kiểm tra tính toán trạng thái động: ACTIVE, NEAR_EXPIRY, EXPIRED, EXHAUSTED và endpoint cảnh báo."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-STATUS-001",
        sku="SKU-STATUS-001",
        name="Loa Soundbar Cao Cấp",
        category="Âm thanh",
        manage_by_lot=True,
        near_expiry_threshold_days=30,
    )
    db.add(prod)
    ws = WarehouseStock(product_id=prod.id, warehouse_id=1, physical_stock=200, stock=200)
    db.add(ws)
    db.commit()

    today = LotService.get_current_vn_date()

    # 1. Lô ACTIVE (còn hạn dài > 30 ngày)
    lot_act = ProductLot(
        lot_number="LOT-ACTIVE",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=30),
        exp_date=today + timedelta(days=120),
        initial_quantity=50,
        remaining_quantity=50,
    )
    # 2. Lô NEAR_EXPIRY (hạn trong vòng 15 ngày <= 30 ngày)
    lot_near = ProductLot(
        lot_number="LOT-NEAR",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=60),
        exp_date=today + timedelta(days=15),
        initial_quantity=50,
        remaining_quantity=30,
    )
    # 3. Lô EXPIRED (đã hết hạn)
    lot_exp = ProductLot(
        lot_number="LOT-EXPIRED",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=100),
        exp_date=today - timedelta(days=5),
        initial_quantity=50,
        remaining_quantity=20,
    )
    # 4. Lô EXHAUSTED (hết tồn kho nhưng chưa hết hạn)
    lot_exh = ProductLot(
        lot_number="LOT-EXHAUSTED",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=30),
        exp_date=today + timedelta(days=90),
        initial_quantity=50,
        remaining_quantity=0,
    )
    db.add_all([lot_act, lot_near, lot_exp, lot_exh])
    db.commit()
    db.close()

    # Gọi API lấy danh sách lô
    res_list = client.get("/api/v1/lots?product_id=PRD-STATUS-001", headers=wh_mgr_headers)
    assert res_list.status_code == 200
    items = {item["lot_number"]: item for item in res_list.json()["items"]}

    assert items["LOT-ACTIVE"]["status"] == "ACTIVE"
    assert items["LOT-NEAR"]["status"] == "NEAR_EXPIRY"
    assert items["LOT-EXPIRED"]["status"] == "EXPIRED"
    assert items["LOT-EXHAUSTED"]["status"] == "EXHAUSTED"

    # Gọi API cảnh báo cận date: /api/v1/lots/near-expiry
    res_warn = client.get("/api/v1/lots/near-expiry?warehouse_id=1", headers=wh_mgr_headers)
    assert res_warn.status_code == 200
    warn_data = res_warn.json()
    assert warn_data["near_expiry_count"] == 1
    assert warn_data["expired_count"] == 1
    assert warn_data["total_warnings"] == 2


def test_09_check_lot_dispatch_validity_and_rbac(client, wh_staff_headers, wh_mgr_headers, admin_headers):
    """
    Quy tắc 5 của Nhóm trưởng:
    Kiểm tra quyền ghi đè lô hết hạn bằng enum UserRole:
    - Nhân viên kho thường (Warehouse staff) không được xuất lô hết hạn.
    - Quản lý kho (WH Manager) hoặc Quản trị viên (Admin) phải có override_reason mới được xuất.
    """
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-DISP-001",
        sku="SKU-DISP-001",
        name="Router Wi-Fi 6 Mesh",
        category="Thiết bị mạng",
        manage_by_lot=True,
    )
    db.add(prod)
    today = LotService.get_current_vn_date()
    expired_lot = ProductLot(
        lot_number="LOT-EXP-DISP",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=120),
        exp_date=today - timedelta(days=10),
        initial_quantity=50,
        remaining_quantity=30,
    )
    db.add(expired_lot)
    db.commit()
    lot_id = expired_lot.id
    db.close()

    # 1. Nhân viên kho thông thường thử kiểm tra xuất lô hết hạn -> Bị chặn vì không đủ quyền
    res_staff = client.post(
        "/api/v1/lots/check-dispatch",
        json={"lot_id": lot_id, "override_reason": "Cần xuất gấp"},
        headers=wh_staff_headers,
    )
    assert res_staff.status_code == 400
    assert "Chỉ Quản trị viên (Admin) hoặc Quản lý kho (WH Manager)" in res_staff.json()["detail"]

    # 2. Quản lý kho (WH Manager) không cung cấp lý do -> Bị chặn
    res_mgr_no_reason = client.post(
        "/api/v1/lots/check-dispatch",
        json={"lot_id": lot_id, "override_reason": ""},
        headers=wh_mgr_headers,
    )
    assert res_mgr_no_reason.status_code == 400
    assert "Bắt buộc phải cung cấp lý do ghi đè" in res_mgr_no_reason.json()["detail"]

    # 3. Quản lý kho (WH Manager) cung cấp lý do ghi đè -> Cho phép thành công
    res_mgr_ok = client.post(
        "/api/v1/lots/check-dispatch",
        json={"lot_id": lot_id, "override_reason": "Xuất hủy kiểm định theo quyết định BLĐ"},
        headers=wh_mgr_headers,
    )
    assert res_mgr_ok.status_code == 200
    data_mgr = res_mgr_ok.json()
    assert data_mgr["valid"] is True
    assert data_mgr["override_allowed"] is True
    assert data_mgr["is_expired"] is True

    # 4. Quản trị viên (Admin) cung cấp lý do ghi đè -> Cho phép thành công
    res_admin_ok = client.post(
        "/api/v1/lots/check-dispatch",
        json={"lot_id": lot_id, "override_reason": "Xuất trả hàng lỗi nhà cung cấp"},
        headers=admin_headers,
    )
    assert res_admin_ok.status_code == 200
    assert res_admin_ok.json()["valid"] is True
