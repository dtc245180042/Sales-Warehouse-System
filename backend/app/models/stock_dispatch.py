from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    Boolean,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class DispatchStatus(str, Enum):
    CONFIRMED = "CONFIRMED"


class StockDispatch(Base):
    """
    Bảng Phiếu xuất kho (Stock Dispatch).
    Tuân thủ quy tắc nghiệp vụ S6-05:
    - Trạng thái duy nhất: CONFIRMED (tạo và xác nhận trong một bước).
    - client_request_id: chống bấm hai lần (Idempotency).
    - Mã phiếu: PXK-YYYYMMDD-XXXX.
    """
    __tablename__ = "stock_dispatches"

    id = Column(String(50), primary_key=True)  # PXK-YYYYMMDD-XXXX
    client_request_id = Column(String(100), unique=True, index=True, nullable=True)
    order_id = Column(String(50), nullable=False, index=True)
    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)
    customer_address = Column(String(500), nullable=True)
    warehouse_id = Column(Integer, nullable=False, index=True)
    warehouse_name = Column(String(255), nullable=True)
    status = Column(String(50), default=DispatchStatus.CONFIRMED.value, nullable=False, index=True)
    delivery_type = Column(String(50), nullable=True)
    total_items = Column(Integer, default=0, nullable=False)
    total_dispatched_quantity = Column(Integer, default=0, nullable=False)
    is_partial = Column(Boolean, default=False, nullable=False)
    has_shortfall = Column(Boolean, default=False, nullable=False)
    dispatched_by = Column(Integer, nullable=False)  # User.id người xuất
    dispatched_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    notes = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    items = relationship("StockDispatchItem", back_populates="dispatch", cascade="all, delete-orphan")


class StockDispatchItem(Base):
    """
    Dòng sản phẩm trong Phiếu xuất kho.
    Lưu rõ số đặt ban đầu (ordered_quantity), số thực xuất đợt này (dispatched_quantity)
    và số còn nợ lại sau đợt này (shortfall_quantity).
    """
    __tablename__ = "stock_dispatch_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dispatch_id = Column(String(50), ForeignKey("stock_dispatches.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=False, index=True)
    product_name = Column(String(255), nullable=True)
    ordered_quantity = Column(Integer, nullable=False)
    dispatched_quantity = Column(Integer, nullable=False)
    shortfall_quantity = Column(Integer, default=0, nullable=False)
    delivered_quantity = Column(Integer, default=0, nullable=True)  # S6-08 / SC-259
    lot_override_reason = Column(Text, nullable=True)

    dispatch = relationship("StockDispatch", back_populates="items")
    lots = relationship("StockDispatchLot", back_populates="item", cascade="all, delete-orphan")


class StockDispatchLot(Base):
    """
    Chi tiết lô hàng được xuất cho từng dòng sản phẩm.
    Tách biệt rõ:
    - expiry_override_reason: Lý do xuất lô hết hạn (chỉ Admin/WH Manager).
    - lot_override_reason: Lý do chọn lô khác gợi ý FEFO.
    """
    __tablename__ = "stock_dispatch_lots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dispatch_item_id = Column(Integer, ForeignKey("stock_dispatch_items.id", ondelete="CASCADE"), nullable=False, index=True)
    lot_id = Column(Integer, nullable=False, index=True)
    lot_number = Column(String(100), nullable=False)
    quantity = Column(Integer, nullable=False)
    expiry_override_reason = Column(Text, nullable=True)
    lot_override_reason = Column(Text, nullable=True)

    item = relationship("StockDispatchItem", back_populates="lots")


try:
    from app.core.database import engine
    from sqlalchemy import inspect, text
    with engine.connect() as _conn:
        _cols = [c["name"] for c in inspect(_conn).get_columns("stock_dispatch_items")]
        if _cols and "delivered_quantity" not in _cols:
            _conn.execute(text("ALTER TABLE stock_dispatch_items ADD COLUMN delivered_quantity INTEGER DEFAULT 0"))
            _conn.commit()
except Exception:
    pass
