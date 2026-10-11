import pytest
from fastapi import HTTPException
from app.core.database import SessionLocal, Base, engine
from app.models.product import Product
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.services.stock_ledger import (
    record_stock_movement,
    get_sku_ledger_summary,
    get_ledger_pagination,
    StockMovementType,
    resolve_warehouse,
)


@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Tạo sản phẩm test
    prod = db.query(Product).filter(Product.id == "PRD-TEST-LEDGER").first()
    if not prod:
        prod = Product(
            id="PRD-TEST-LEDGER",
            sku="SKU-LEDGER-01",
            name="Sữa Tươi Test Ledger",
            unit="hộp",
            status="ACTIVE",
            is_active=True,
            stock=100,
            min_stock=10,
        )
        db.add(prod)
        db.commit()
    yield db
    db.close()


def test_invalid_quantity_rejected(setup_db):
    db = setup_db
    # 1. Số âm
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

    # 2. Số 0
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
    # Thử điều chỉnh hoặc đảo phiếu mà không có note
    with pytest.raises(HTTPException) as exc:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=10,
            movement_type=StockMovementType.IN_PURCHASE_REVERSAL,
            reference_code="PNK-REV-01",
            performer_id=1,
            note="",  # Không có lý do
        )
    assert exc.value.status_code == 400
    assert "bắt buộc phải có lý do" in exc.value.detail


def test_invalid_warehouse_rejected(setup_db):
    db = setup_db
    with pytest.raises(HTTPException) as exc:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=999,  # Mã kho không có trong map
            quantity_base=10,
            movement_type=StockMovementType.IN_PURCHASE,
            reference_code="PNK-TEST-02",
            performer_id=1,
        )
    assert exc.value.status_code == 400
    assert "Không tìm thấy kho hàng" in exc.value.detail


def test_record_movement_and_idempotency_409(setup_db):
    db = setup_db
    ref_code = "PNK-IDEMPOTENT-01"

    # Ghi lần đầu
    res1 = record_stock_movement(
        db,
        product_id="PRD-TEST-LEDGER",
        warehouse_id=1,
        quantity_base=50,
        movement_type=StockMovementType.IN_PURCHASE,
        reference_code=ref_code,
        line_ref="L1",
        performer_id=1,
        note="Nhập hàng kiểm thử",
        auto_commit=True,
    )
    assert res1.delta_quantity == 50
    assert res1.new_physical >= 50

    # Ghi lần 2 cùng bộ khóa -> Bắt buộc 409 Conflict
    with pytest.raises(HTTPException) as exc:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=50,
            movement_type=StockMovementType.IN_PURCHASE,
            reference_code=ref_code,
            line_ref="L1",
            performer_id=1,
            note="Nhập hàng kiểm thử lần 2",
            auto_commit=True,
        )
    assert exc.value.status_code == 409
    assert "đã được ghi nhận trước đó" in exc.value.detail


def test_prevent_negative_stock(setup_db):
    db = setup_db
    # Thử xuất kho vượt quá số lượng tồn hiện có
    with pytest.raises(HTTPException) as exc:
        record_stock_movement(
            db,
            product_id="PRD-TEST-LEDGER",
            warehouse_id=1,
            quantity_base=999999,  # Vượt quá tồn kho
            movement_type=StockMovementType.TRANSFER_OUT,
            reference_code="CK-OUT-FAIL-01",
            performer_id=1,
            note="Xuất quá số lượng",
            auto_commit=True,
        )
    assert exc.value.status_code == 400
    assert "Tồn kho tại" in exc.value.detail
    assert "không đủ" in exc.value.detail


def test_reversal_movement_success(setup_db):
    db = setup_db
    # Đảo phiếu nhập giảm 10 cái (có note)
    res = record_stock_movement(
        db,
        product_id="PRD-TEST-LEDGER",
        warehouse_id=1,
        quantity_base=10,
        movement_type=StockMovementType.IN_PURCHASE_REVERSAL,
        reference_code="PNK-REV-OK-01",
        performer_id=1,
        note="Điều chỉnh giảm số lượng nhập thực tế",
        auto_commit=True,
    )
    assert res.delta_quantity == -10


def test_get_sku_ledger_summary_and_low_stock(setup_db):
    db = setup_db
    summary = get_sku_ledger_summary(
        db,
        product_id="PRD-TEST-LEDGER",
        warehouse_id=1,
    )
    assert summary["product_id"] == "PRD-TEST-LEDGER"
    assert "physical_stock" in summary
    assert "reserved_stock" in summary
    assert "available_stock" in summary
    assert summary["available_stock"] == summary["physical_stock"] - summary["reserved_stock"]
    # min_stock=10, kiểm tra logic is_low_stock (< min_stock)
    assert summary["is_low_stock"] == (summary["available_stock"] < summary["min_stock"])
