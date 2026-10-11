import pytest
from fastapi import HTTPException
from app.core.database import SessionLocal, Base, engine
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.stock_reservation import StockReservation
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.services.stock_ledger import (
    record_stock_movement,
    get_sku_ledger_summary,
    get_ledger_pagination,
    check_ledger_drift,
    StockMovementType,
    FALLBACK_WAREHOUSE_MAP,
)


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # 1. Tạo sản phẩm test chính
    prod = db.query(Product).filter(Product.id == "PRD-TEST-LEDGER").first()
    if not prod:
        prod = Product(
            id="PRD-TEST-LEDGER",
            sku="SKU-LEDGER-01",
            name="Sữa Tươi Test Ledger",
            category="Đồ uống",
            unit="hộp",
            status="ACTIVE",
            is_active=True,
            stock=100,
            min_stock=10,
        )
        db.add(prod)
        db.commit()

    # 2. Tạo sản phẩm test cho Backfill
    prod_bf = db.query(Product).filter(Product.id == "PRD-TEST-BACKFILL").first()
    if not prod_bf:
        prod_bf = Product(
            id="PRD-TEST-BACKFILL",
            sku="SKU-BF-01",
            name="Bánh Test Backfill",
            category="Bánh kẹo",
            unit="gói",
            status="ACTIVE",
            is_active=True,
            stock=500,
            min_stock=20,
        )
        db.add(prod_bf)
        db.commit()

    # Giả lập tồn cũ 500 ở ProductStockProfile
    prof_bf = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == "PRD-TEST-BACKFILL").first()
    if not prof_bf:
        prof_bf = ProductStockProfile(
            product_id="PRD-TEST-BACKFILL",
            sku="SKU-BF-01",
            stock=500,
            physical_stock=500,
            reserved_stock=0,
            min_stock=20,
            warehouse="Kho Tổng Hà Nội",
        )
        db.add(prof_bf)
        db.commit()
    else:
        prof_bf.physical_stock = 500
        prof_bf.stock = 500
        db.commit()

    yield db
    db.close()


def test_invalid_quantity_rejected(setup_db):
    db = setup_db
    with pytest.raises(HTTPException) as exc1:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=-5,
            movement_type=StockMovementType.IN_PURCHASE,
            reference_code="PNK-TEST-01",
            performer_id=1,
        )
    assert exc1.value.status_code == 400

    with pytest.raises(HTTPException) as exc2:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=0,
            movement_type=StockMovementType.IN_PURCHASE,
            reference_code="PNK-TEST-01",
            performer_id=1,
        )
    assert exc2.value.status_code == 400


def test_note_required_for_reversal_and_adjustments(setup_db):
    db = setup_db
    with pytest.raises(HTTPException) as exc:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=10,
            movement_type=StockMovementType.IN_PURCHASE_REVERSAL,
            reference_code="PNK-REV-01",
            performer_id=1,
            note="",
        )
    assert exc.value.status_code == 400
    assert "bắt buộc phải có lý do" in exc.value.detail


def test_invalid_warehouse_rejected(setup_db):
    db = setup_db
    with pytest.raises(HTTPException) as exc:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=999,
            quantity_base=10,
            movement_type=StockMovementType.IN_PURCHASE,
            reference_code="PNK-TEST-02",
            performer_id=1,
        )
    assert exc.value.status_code == 400
    assert "Không tìm thấy kho hàng" in exc.value.detail


def test_prevent_negative_stock(setup_db):
    db = setup_db
    with pytest.raises(HTTPException) as exc:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=999999,
            movement_type=StockMovementType.TRANSFER_OUT,
            reference_code="CK-OUT-FAIL-01",
            performer_id=1,
            note="Xuất quá số lượng",
            auto_commit=True,
        )
    assert exc.value.status_code == 400
    assert "Tồn kho tại" in exc.value.detail
    assert "không đủ" in exc.value.detail


def test_idempotency_line_ref_behavior(setup_db):
    db = setup_db
    ref_code = "PNK-IDEMPOTENT-LINE-TEST"

    # Ghi dòng 1: line_ref="L1"
    res1 = record_stock_movement(
        db,
        product_id="PRD-TEST-LEDGER",
        warehouse_id=1,
        quantity_base=20,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code=ref_code,
        line_ref="L1",
        performer_id=1,
        note="Dòng 1",
        auto_commit=True,
    )
    assert res1.delta_quantity == 20

    # Ghi lại cùng bộ khóa và line_ref="L1" -> Bắt buộc 409
    with pytest.raises(HTTPException) as exc:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=20,
            movement_type=StockMovementType.IN_PURCHASE,
            reference_code=ref_code,
            line_ref="L1",
            performer_id=1,
            note="Dòng 1 lặp",
            auto_commit=True,
        )
    assert exc.value.status_code == 409

    # Ghi cùng chứng từ nhưng khác line_ref="L2" -> Phải cho qua!
    res2 = record_stock_movement(
        db,
        product_id="PRD-TEST-LEDGER",
        warehouse_id=1,
        quantity_base=30,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code=ref_code,
        line_ref="L2",
        performer_id=1,
        note="Dòng 2",
        auto_commit=True,
    )
    assert res2.delta_quantity == 30


def test_caller_rollback_preserves_stock_and_ledger(setup_db):
    db = setup_db
    summary_before = get_sku_ledger_summary(db, product_id="PRD-TEST-LEDGER", warehouse_id=1)
    physical_before = summary_before["physical_stock"]

    try:
        # Gọi với auto_commit=False
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=15,
            movement_type=StockMovementType.IN_PURCHASE,
            reference_code="PNK-FAIL-TRANSACTION",
            line_ref="L_ERR",
            performer_id=1,
            auto_commit=False,
        )
        # Giả lập lỗi nghiệp vụ phía caller sau khi ghi sổ
        raise RuntimeError("Giả lập lỗi hệ thống chứng từ phía caller!")
    except RuntimeError:
        db.rollback()

    # Kiểm tra: sau khi rollback, tồn kho và sổ cái không được thay đổi!
    summary_after = get_sku_ledger_summary(db, product_id="PRD-TEST-LEDGER", warehouse_id=1)
    assert summary_after["physical_stock"] == physical_before

    entry = db.query(StockLedgerEntry).filter(
        StockLedgerEntry.reference_code == "PNK-FAIL-TRANSACTION"
    ).first()
    assert entry is None


def test_backfill_before_sync_across_warehouses(setup_db):
    db = setup_db
    # Sản phẩm PRD-TEST-BACKFILL có tồn cũ 500 ở kho 1 (trong ProductStockProfile)
    # Lần đầu tiên ghi sổ phát sinh tại Kho 2 (Kho Đà Nẵng) với số lượng 100
    res = record_stock_movement(
        db,
        product_id="PRD-TEST-BACKFILL",
        warehouse_id=2,  # Kho Đà Nẵng
        quantity_base=100,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code="PNK-BF-WH2-01",
        performer_id=1,
        auto_commit=True,
    )

    # 1. Tồn tại kho 2 phải là 100
    assert res.new_physical == 100

    # 2. Kho 1 phải được tự động backfill 500
    wh1_stock = db.query(WarehouseStock).filter(
        WarehouseStock.product_id == "PRD-TEST-BACKFILL",
        WarehouseStock.warehouse_id == 1,
    ).first()
    assert wh1_stock is not None
    assert wh1_stock.physical_stock == 500

    # 3. ProductStockProfile.physical_stock phải bằng tổng các kho = 500 + 100 = 600
    prof = db.query(ProductStockProfile).filter(
        ProductStockProfile.product_id == "PRD-TEST-BACKFILL"
    ).first()
    assert prof.physical_stock == 600
    assert prof.stock == 600

    # 4. Product.stock cũng phải được đồng bộ lên 600
    prod = db.query(Product).filter(Product.id == "PRD-TEST-BACKFILL").first()
    assert prod.stock == 600


def test_dynamic_reserved_stock_matches_fallback_map(setup_db):
    db = setup_db
    wh_name = FALLBACK_WAREHOUSE_MAP[1]["name"]  # "Kho Tổng Hà Nội"

    # Tạo một StockReservation thật cho sản phẩm
    res_record = StockReservation(
        order_id="ORD-TEST-RES-01",
        order_code="DH-2026-TEST-RES",
        product_id="PRD-TEST-LEDGER",
        sku="SKU-LEDGER-01",
        warehouse=wh_name,
        reserved_quantity=25,
        status="active",
        note="Test giữ chỗ động",
    )
    db.add(res_record)
    db.commit()

    summary = get_sku_ledger_summary(db, product_id="PRD-TEST-LEDGER", warehouse_id=1)
    assert summary["reserved_stock"] >= 25
    assert summary["available_stock"] == summary["physical_stock"] - summary["reserved_stock"]


def test_low_stock_boundary_condition(setup_db):
    db = setup_db
    # Tìm dòng tồn của PRD-TEST-LEDGER tại kho 1 để test điều kiện biên
    stk_row = db.query(WarehouseStock).filter(
        WarehouseStock.product_id == "PRD-TEST-LEDGER",
        WarehouseStock.warehouse_id == 1,
    ).first()
    assert stk_row is not None
    stk_row.min_stock = 50
    stk_row.physical_stock = 50
    db.commit()

    # Xóa tạm reservation active nếu có để available = physical = 50
    db.query(StockReservation).filter(
        StockReservation.product_id == "PRD-TEST-LEDGER",
        StockReservation.warehouse == FALLBACK_WAREHOUSE_MAP[1]["name"],
    ).update({"status": "released"})
    db.commit()

    # Trường hợp 1: available == min_stock (50 == 50) => KHÔNG cảnh báo!
    s1 = get_sku_ledger_summary(db, product_id="PRD-TEST-LEDGER", warehouse_id=1)
    assert s1["available_stock"] == 50
    assert s1["min_stock"] == 50
    assert s1["is_low_stock"] is False

    # Trường hợp 2: available < min_stock (49 < 50) => BẮT BUỘC cảnh báo!
    stk_row.physical_stock = 49
    db.commit()
    s2 = get_sku_ledger_summary(db, product_id="PRD-TEST-LEDGER", warehouse_id=1)
    assert s2["available_stock"] == 49
    assert s2["is_low_stock"] is True


def test_get_ledger_pagination(setup_db):
    db = setup_db
    # Lấy phân trang theo kho 1
    page_data = get_ledger_pagination(db, warehouse_id=1, page=1, limit=10)
    assert "items" in page_data
    assert "total" in page_data
    assert page_data["warehouse_id"] == 1
    assert len(page_data["items"]) > 0

    # Lọc theo search
    search_data = get_ledger_pagination(db, warehouse_id=1, search="Sữa Tươi Test")
    assert any(item["product_id"] == "PRD-TEST-LEDGER" for item in search_data["items"])


def test_check_ledger_drift(setup_db):
    db = setup_db
    # Hàm check_ledger_drift chạy không lỗi và trả về list
    drifts = check_ledger_drift(db)
    assert isinstance(drifts, list)
