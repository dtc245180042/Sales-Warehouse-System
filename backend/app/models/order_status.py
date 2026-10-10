from enum import Enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from app.core.database import Base

class OrderStatus(str, Enum):
    DRAFT = "DRAFT"                  # Nháp
    PENDING_APPROVAL = "PENDING"    # Chờ duyệt
    APPROVED = "APPROVED"            # Đã duyệt
    PACKING = "PACKING"              # Đang soạn hàng
    EXPORTED = "EXPORTED"            # Đã xuất
    DELIVERED = "DELIVERED"          # Đã giao
    CLOSED = "CLOSED"                # Đóng
    CANCELLED = "CANCELLED"          # Hủy

ALLOWED_TRANSITIONS = {
    OrderStatus.DRAFT: [OrderStatus.PENDING_APPROVAL, OrderStatus.CANCELLED],
    OrderStatus.PENDING_APPROVAL: [OrderStatus.APPROVED, OrderStatus.CANCELLED],
    OrderStatus.APPROVED: [OrderStatus.PACKING, OrderStatus.CANCELLED],
    OrderStatus.PACKING: [OrderStatus.EXPORTED, OrderStatus.CANCELLED],
    OrderStatus.EXPORTED: [OrderStatus.DELIVERED],
    OrderStatus.DELIVERED: [OrderStatus.CLOSED],
    OrderStatus.CANCELLED: [],
    OrderStatus.CLOSED: []
}

class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(String(50), ForeignKey("orders.id"), nullable=False)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    changed_by = Column(String(255), nullable=False)
    changed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    note = Column(Text, nullable=True)