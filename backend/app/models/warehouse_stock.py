from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from app.core.database import Base


class WarehouseStock(Base):
    """
    Bảng quản lý tồn kho vật lý đa kho theo từng sản phẩm và kho hàng.
    Khóa duy nhất: (product_id, warehouse_id).
    Lưu ý: Không lưu reserved_stock ở đây; reserved_stock được tính động từ bảng stock_reservations.
    """
    __tablename__ = "warehouse_stocks"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)
    warehouse_id = Column(Integer, nullable=True, default=1, index=True)
    warehouse = Column(String(255), nullable=True, index=True)

    stock = Column(Integer, default=0, nullable=False)            # Tồn khả dụng tại kho (S5-07)
    physical_stock = Column(Integer, default=0, nullable=False)   # Cột 1: Tồn thực tế trong kho
    in_transit_stock = Column(Integer, default=0, nullable=False) # Hàng đang trên đường tới kho này (S5-07)
    min_stock = Column(Integer, default=10, nullable=False)        # Hạn mức tối thiểu

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_id", name="uq_product_warehouse_stock"),
    )


class StockLedgerEntry(Base):
    """
    Sổ cái chi tiết lưu từng bút toán biến động và khóa chống ghi trùng (Idempotency Key).
    Chỉ lưu performer_id (int), không lưu performer_name (Quyết định S5 số 6).
    """
    __tablename__ = "stock_ledger_entries"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    idempotency_key = Column(String(255), unique=True, nullable=False, index=True)

    reference_code = Column(String(100), nullable=False, index=True)
    line_ref = Column(String(100), default="", nullable=False)
    movement_type = Column(String(50), nullable=False, index=True)

    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True)
    warehouse_id = Column(Integer, nullable=False, index=True)

    quantity_base = Column(Integer, nullable=False)
    previous_physical = Column(Integer, nullable=False)
    new_physical = Column(Integer, nullable=False)

    performer_id = Column(Integer, nullable=False)
    note = Column(String(500), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
