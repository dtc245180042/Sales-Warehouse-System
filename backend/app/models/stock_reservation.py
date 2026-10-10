from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
)
from app.core.database import Base


class StockReservation(Base):
    """
    Bảng quản lý giữ chỗ tồn kho (Stock Reservation) cho đơn hàng.
    Tuân thủ quy tắc Additive-Only của AGENTS.md (S4-03, SCRUM-504, SCRUM-505).
    """
    __tablename__ = "stock_reservations"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(String(50), nullable=False, index=True)
    order_code = Column(String(50), nullable=True, index=True)
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)
    warehouse = Column(String(255), nullable=False, index=True)
    reserved_quantity = Column(Integer, default=0, nullable=False)
    status = Column(String(50), default="active", nullable=False, index=True)  # active, fulfilled, released
    note = Column(Text, nullable=True)

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
