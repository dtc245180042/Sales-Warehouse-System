from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.warehouse_stock import WarehouseStock
from app.services.fefo_service import FEFOService
from app.services.lot_service import LotService
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test FEFO S6-04
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
def setup_fefo_test_database():
    """Tạo schema và dữ liệu người dùng trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_fefo",
            email="admin_fefo@test.local",
            role=UserRole.ADMIN.value,
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="wh_mgr_fefo",
            email="wh_mgr_fefo@test.local",
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
    return auth_header(1, "admin_fefo", UserRole.ADMIN.value)


@pytest.fixture
def wh_mgr_headers():
    return auth_header(2, "wh_mgr_fefo", UserRole.WH_MANAGER.value)


# ==============================================================================
# TEST CASES CHO S6-04 FEFO
# ==============================================================================

def test_01_fefo_nearest_expiry_first(client, wh_mgr_headers):
    """Lô có exp_date gần nhất được ưu tiên gợi ý trước."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-FEFO-001",
        sku="SKU-FEFO-001",
        name="Ổ cứng SSD Samsung 980 Pro",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)

    today = FEFOService.get_current_vn_date()
    # Lô 1: Hạn 90 ngày nữa
    lot_far = ProductLot(
        lot_number="LOT-FAR",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=30),
        exp_date=today + timedelta(days=90),
        initial_quantity=50,
        remaining_quantity=50,
    )
    # Lô 2: Hạn 20 ngày nữa (gần nhất)
    lot_near = ProductLot(
        lot_number="LOT-NEAR",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=30),
        exp_date=today + timedelta(days=20),
        initial_quantity=50,
        remaining_quantity=50,
    )
    db.add_all([lot_far, lot_near])
    db.commit()
    db.close()

    # Yêu cầu xuất 30 đơn vị
    res = client.post(
        "/api/v1/lots/fefo-suggest",
        json={"product_id": "PRD-FEFO-001", "warehouse_id": 1, "requested_quantity": 30},
        headers=wh_mgr_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_fully_allocated"] is True
    assert data["allocated_total"] == 30
    assert data["shortfall"] == 0
    assert len(data["suggested_lots"]) == 1

    # Lô được gợi ý phải là LOT-NEAR (hạn 20 ngày)
    first_lot = data["suggested_lots"][0]
    assert first_lot["lot_number"] == "LOT-NEAR"
    assert first_lot["allocated_quantity"] == 30


def test_02_fefo_tie_breaking_mfg_date_and_id(client, wh_mgr_headers):
    """
    Khi hai lô cùng exp_date:
    1. Ưu tiên lô có mfg_date cũ hơn (mfg_date ASC)
    2. Nếu cùng cả exp_date và mfg_date: ưu tiên lô có id nhỏ hơn (id ASC)
    """
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-FEFO-002",
        sku="SKU-FEFO-002",
        name="RAM DDR5 Kingston 32GB",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)

    today = FEFOService.get_current_vn_date()
    common_exp = today + timedelta(days=60)

    # Lô A: cùng exp_date, mfg_date mới hơn (sản xuất cách đây 10 ngày)
    lot_a = ProductLot(
        lot_number="LOT-NEW-MFG",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=10),
        exp_date=common_exp,
        initial_quantity=20,
        remaining_quantity=20,
    )
    # Lô B: cùng exp_date, mfg_date cũ hơn (sản xuất cách đây 30 ngày) -> Ưu tiên hơn Lô A
    lot_b = ProductLot(
        lot_number="LOT-OLD-MFG",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=30),
        exp_date=common_exp,
        initial_quantity=20,
        remaining_quantity=20,
    )
    db.add_all([lot_a, lot_b])
    db.commit()
    db.close()

    res = client.post(
        "/api/v1/lots/fefo-suggest",
        json={"product_id": "PRD-FEFO-002", "warehouse_id": 1, "requested_quantity": 15},
        headers=wh_mgr_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["suggested_lots"]) == 1
    assert data["suggested_lots"][0]["lot_number"] == "LOT-OLD-MFG"


def test_03_fefo_multi_lot_allocation(client, wh_mgr_headers):
    """Lấy đủ hàng qua nhiều lô liên tiếp theo thứ tự hạn dùng."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-FEFO-003",
        sku="SKU-FEFO-003",
        name="Nguồn máy tính Corsair 850W",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)

    today = FEFOService.get_current_vn_date()
    # Lô 1: còn 25 cái, hạn 10 ngày
    lot1 = ProductLot(
        lot_number="LOT-01",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=40),
        exp_date=today + timedelta(days=10),
        initial_quantity=25,
        remaining_quantity=25,
    )
    # Lô 2: còn 30 cái, hạn 25 ngày
    lot2 = ProductLot(
        lot_number="LOT-02",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=40),
        exp_date=today + timedelta(days=25),
        initial_quantity=30,
        remaining_quantity=30,
    )
    # Lô 3: còn 50 cái, hạn 100 ngày
    lot3 = ProductLot(
        lot_number="LOT-03",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=40),
        exp_date=today + timedelta(days=100),
        initial_quantity=50,
        remaining_quantity=50,
    )
    db.add_all([lot1, lot2, lot3])
    db.commit()
    db.close()

    # Yêu cầu 40 cái: Sẽ lấy hết 25 cái từ LOT-01, và lấy thêm 15 cái từ LOT-02 (LOT-03 không cần lấy)
    res = client.post(
        "/api/v1/lots/fefo-suggest",
        json={"product_id": "PRD-FEFO-003", "warehouse_id": 1, "requested_quantity": 40},
        headers=wh_mgr_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_fully_allocated"] is True
    assert data["allocated_total"] == 40
    assert data["shortfall"] == 0

    lots = data["suggested_lots"]
    assert len(lots) == 2
    assert lots[0]["lot_number"] == "LOT-01"
    assert lots[0]["allocated_quantity"] == 25
    assert lots[1]["lot_number"] == "LOT-02"
    assert lots[1]["allocated_quantity"] == 15


def test_04_fefo_insufficient_stock_returns_shortfall(client, wh_mgr_headers):
    """Không đủ hàng thì trả phần lấy được kèm shortfall (thiếu hụt)."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-FEFO-004",
        sku="SKU-FEFO-004",
        name="Vỏ Case Montech Sky Two",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)

    today = FEFOService.get_current_vn_date()
    lot = ProductLot(
        lot_number="LOT-CASE-01",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=20),
        exp_date=today + timedelta(days=150),
        initial_quantity=35,
        remaining_quantity=35,
    )
    db.add(lot)
    db.commit()
    db.close()

    # Yêu cầu 50 cái, nhưng kho chỉ có 35 cái
    res = client.post(
        "/api/v1/lots/fefo-suggest",
        json={"product_id": "PRD-FEFO-004", "warehouse_id": 1, "requested_quantity": 50},
        headers=wh_mgr_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_fully_allocated"] is False
    assert data["allocated_total"] == 35
    assert data["shortfall"] == 15  # Thiếu 15
    assert len(data["suggested_lots"]) == 1
    assert data["suggested_lots"][0]["allocated_quantity"] == 35
    assert "thiếu 15 đơn vị" in data["message"]


def test_05_fefo_skips_exhausted_and_expired_lots(client, wh_mgr_headers):
    """Bỏ qua lô EXHAUSTED (remaining_quantity = 0) và EXPIRED (exp_date < today)."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-FEFO-005",
        sku="SKU-FEFO-005",
        name="Card Màn Hình RTX 4070 Ti",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)

    today = FEFOService.get_current_vn_date()
    # 1. Lô đã hết hạn (EXPIRED) -> Không được gợi ý
    lot_exp = ProductLot(
        lot_number="LOT-EXP",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=100),
        exp_date=today - timedelta(days=5),
        initial_quantity=20,
        remaining_quantity=10,
    )
    # 2. Lô đã hết tồn (EXHAUSTED) -> Không được gợi ý
    lot_exh = ProductLot(
        lot_number="LOT-EXH",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=40),
        exp_date=today + timedelta(days=30),
        initial_quantity=20,
        remaining_quantity=0,
    )
    # 3. Lô hợp lệ còn hàng
    lot_valid = ProductLot(
        lot_number="LOT-VALID",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=20),
        exp_date=today + timedelta(days=50),
        initial_quantity=20,
        remaining_quantity=15,
    )
    db.add_all([lot_exp, lot_exh, lot_valid])
    db.commit()
    db.close()

    res = client.post(
        "/api/v1/lots/fefo-suggest",
        json={"product_id": "PRD-FEFO-005", "warehouse_id": 1, "requested_quantity": 10},
        headers=wh_mgr_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["suggested_lots"]) == 1
    assert data["suggested_lots"][0]["lot_number"] == "LOT-VALID"


def test_06_fefo_does_not_take_from_other_warehouses(client, wh_mgr_headers):
    """Không lấy lô ở kho khác, chỉ gợi ý lô của kho được chỉ định."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-FEFO-006",
        sku="SKU-FEFO-006",
        name="CPU Intel Core i7 14700K",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)

    today = FEFOService.get_current_vn_date()
    # Lô Kho 1: exp_date xa (100 ngày)
    lot_wh1 = ProductLot(
        lot_number="LOT-WH1",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=20),
        exp_date=today + timedelta(days=100),
        initial_quantity=20,
        remaining_quantity=20,
    )
    # Lô Kho 2: exp_date rất gần (5 ngày) nhưng ở Kho 2!
    lot_wh2 = ProductLot(
        lot_number="LOT-WH2",
        product_id=prod.id,
        warehouse_id=2,
        mfg_date=today - timedelta(days=20),
        exp_date=today + timedelta(days=5),
        initial_quantity=20,
        remaining_quantity=20,
    )
    db.add_all([lot_wh1, lot_wh2])
    db.commit()
    db.close()

    # Yêu cầu xuất từ Kho 1 -> Tuyệt đối không được lấy LOT-WH2 của Kho 2
    res = client.post(
        "/api/v1/lots/fefo-suggest",
        json={"product_id": "PRD-FEFO-006", "warehouse_id": 1, "requested_quantity": 10},
        headers=wh_mgr_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["suggested_lots"]) == 1
    assert data["suggested_lots"][0]["lot_number"] == "LOT-WH1"


def test_07_validate_lot_override_with_and_without_reason(client, wh_mgr_headers):
    """
    Quy tắc S6-04:
    Chọn lô khác gợi ý FEFO thì bắt buộc lot_override_reason, thiếu thì HTTP 400.
    """
    # 1. Chọn đúng lô gợi ý -> Không cần lý do
    res_same = client.post(
        "/api/v1/lots/validate-override",
        json={"suggested_lot_ids": [101, 102], "selected_lot_id": 101, "lot_override_reason": None},
        headers=wh_mgr_headers,
    )
    assert res_same.status_code == 200
    assert res_same.json()["valid"] is True

    # 2. Chọn lô khác gợi ý (105 không nằm trong [101, 102]) mà không có lý do -> Bị từ chối HTTP 400!
    res_fail = client.post(
        "/api/v1/lots/validate-override",
        json={"suggested_lot_ids": [101, 102], "selected_lot_id": 105, "lot_override_reason": ""},
        headers=wh_mgr_headers,
    )
    assert res_fail.status_code == 400
    assert "bắt buộc phải cung cấp lý do (lot_override_reason)" in res_fail.json()["detail"]

    # 3. Chọn lô khác gợi ý nhưng có lý do rõ ràng -> Hợp lệ
    res_ok = client.post(
        "/api/v1/lots/validate-override",
        json={
            "suggested_lot_ids": [101, 102],
            "selected_lot_id": 105,
            "lot_override_reason": "Khách hàng đại lý yêu cầu xuất nguyên thùng lô LOT-105",
        },
        headers=wh_mgr_headers,
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["valid"] is True


def test_08_deduct_lot_stock_atomic_blocks_excess_and_preserves_transaction():
    """
    Quy tắc kỹ thuật S6-04:
    deduct_lot_stock_atomic dùng UPDATE có điều kiện (remaining_quantity >= qty),
    không dùng with_for_update, không tự commit, chặn trừ vượt tồn.
    """
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-DEDUCT-001",
        sku="SKU-DEDUCT-001",
        name="Ổ cứng di động 2TB",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)
    today = FEFOService.get_current_vn_date()
    lot = ProductLot(
        lot_number="LOT-DED-01",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=10),
        exp_date=today + timedelta(days=200),
        initial_quantity=50,
        remaining_quantity=30,
    )
    db.add(lot)
    db.commit()
    lot_id = lot.id

    # 1. Trừ 10 đơn vị hợp lệ (30 - 10 = 20)
    updated = FEFOService.deduct_lot_stock_atomic(db, lot_id=lot_id, quantity=10)
    assert updated.remaining_quantity == 20

    # 2. Thử rollback transaction ngoài caller -> Tồn kho phục hồi về 30 (chứng minh hàm không tự commit)
    db.rollback()
    lot_recheck = db.query(ProductLot).filter(ProductLot.id == lot_id).first()
    assert lot_recheck.remaining_quantity == 30

    # 3. Trừ vượt quá tồn hiện có (yêu cầu trừ 40 > 30) -> Bị ném lỗi HTTP 400
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        FEFOService.deduct_lot_stock_atomic(db, lot_id=lot_id, quantity=40)
    assert exc_info.value.status_code == 400
    assert "không đủ để trừ 40 đơn vị" in exc_info.value.detail
    db.close()


def test_09_deduct_lot_stock_consecutive_deductions_prevent_negative():
    """Trừ 2 lần liên tiếp không bao giờ làm âm kho."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-DED-002",
        sku="SKU-DED-002",
        name="Thẻ nhớ MicroSD 256GB",
        category="Phụ kiện",
        manage_by_lot=True,
    )
    db.add(prod)
    today = FEFOService.get_current_vn_date()
    lot = ProductLot(
        lot_number="LOT-CARD-01",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=10),
        exp_date=today + timedelta(days=200),
        initial_quantity=10,
        remaining_quantity=10,
    )
    db.add(lot)
    db.commit()
    lot_id = lot.id

    # Trừ lần 1: 6 cái -> thành công, còn 4
    lot_after_1 = FEFOService.deduct_lot_stock_atomic(db, lot_id=lot_id, quantity=6)
    assert lot_after_1.remaining_quantity == 4

    # Trừ lần 2: 5 cái (vượt quá 4) -> phải bị chặn, tồn vẫn là 4, không âm
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        FEFOService.deduct_lot_stock_atomic(db, lot_id=lot_id, quantity=5)
    assert exc.value.status_code == 400

    lot_after_fail = db.query(ProductLot).filter(ProductLot.id == lot_id).first()
    assert lot_after_fail.remaining_quantity == 4
    db.close()


def test_10_fefo_unmanaged_sku_returns_not_applicable(client, wh_mgr_headers):
    """Sản phẩm có manage_by_lot = False thì trả kết quả 'không áp dụng FEFO'."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-NO-LOT",
        sku="SKU-NO-LOT",
        name="Cáp sạc Type-C Anker",
        category="Phụ kiện",
        manage_by_lot=False,
    )
    db.add(prod)
    db.commit()
    db.close()

    res = client.post(
        "/api/v1/lots/fefo-suggest",
        json={"product_id": "PRD-NO-LOT", "warehouse_id": 1, "requested_quantity": 20},
        headers=wh_mgr_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["manage_by_lot"] is False
    assert data["allocated_total"] == 0
    assert "không áp dụng quản lý theo lô" in data["message"]
    assert len(data["suggested_lots"]) == 0


def test_11_suggest_fefo_does_not_modify_stock(client, wh_mgr_headers):
    """Gọi suggest_lots_fefo chỉ gợi ý, tuyệt đối không làm thay đổi tồn kho của các lô."""
    db = TestingSessionLocal()
    prod = Product(
        id="PRD-NO-DEDUCT",
        sku="SKU-NO-DEDUCT",
        name="Tản nhiệt khí DeepCool",
        category="Linh kiện",
        manage_by_lot=True,
    )
    db.add(prod)
    today = FEFOService.get_current_vn_date()
    lot = ProductLot(
        lot_number="LOT-COOL-01",
        product_id=prod.id,
        warehouse_id=1,
        mfg_date=today - timedelta(days=10),
        exp_date=today + timedelta(days=100),
        initial_quantity=50,
        remaining_quantity=50,
    )
    db.add(lot)
    db.commit()
    lot_id = lot.id
    db.close()

    # Gọi API gợi ý xuất 30 cái
    res = client.post(
        "/api/v1/lots/fefo-suggest",
        json={"product_id": "PRD-NO-DEDUCT", "warehouse_id": 1, "requested_quantity": 30},
        headers=wh_mgr_headers,
    )
    assert res.status_code == 200
    assert res.json()["allocated_total"] == 30

    # Kiểm tra lại DB: remaining_quantity VẪN NGUYÊN LÀ 50!
    db = TestingSessionLocal()
    lot_check = db.query(ProductLot).filter(ProductLot.id == lot_id).first()
    assert lot_check.remaining_quantity == 50
    db.close()
