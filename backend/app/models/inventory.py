from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class StockReceipt(Base):
    """Bảng quản lý phiếu nhập và xuất kho (Additive Model)."""
    __tablename__ = "stock_receipts"

    id = Column(String(50), primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    type = Column(String(20), nullable=False, index=True)  # 'in' hoặc 'out'
    
    # Đối tác
    supplier_id = Column(String(50), nullable=True)
    supplier_name = Column(String(255), nullable=True)
    customer_id = Column(String(50), nullable=True)
    customer_name = Column(String(255), nullable=True)
    
    # Kho hàng
    warehouse = Column(String(255), nullable=False, default="Kho Tổng Hà Nội")
    target_warehouse = Column(String(255), nullable=True)
    reason = Column(String(100), nullable=True)
    
    # Tổng kết
    total_items = Column(Integer, default=0, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)
    created_by = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    status = Column(String(50), default="completed", nullable=False)
    
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    items = relationship("StockReceiptItem", back_populates="receipt", cascade="all, delete-orphan", lazy="joined")


class StockReceiptItem(Base):
    """Bảng chi tiết mặt hàng trong phiếu nhập/xuất kho."""
    __tablename__ = "stock_receipt_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    receipt_id = Column(String(50), ForeignKey("stock_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True)
    name = Column(String(255), nullable=False)
    unit = Column(String(50), default="Chiếc", nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    cost_price = Column(Float, default=0.0, nullable=False)
    subtotal = Column(Float, default=0.0, nullable=False)

    receipt = relationship("StockReceipt", back_populates="items")


class InventoryHistory(Base):
    """Bảng lưu trữ lịch sử biến động kho hàng (thẻ kho)."""
    __tablename__ = "inventory_history"

    id = Column(String(50), primary_key=True, index=True)
    code = Column(String(50), nullable=False, index=True)
    type = Column(String(20), nullable=False, index=True)  # 'in', 'out', 'transfer'
    
    product_id = Column(String(50), nullable=False, index=True)
    product_name = Column(String(255), nullable=False)
    sku = Column(String(100), nullable=True)
    quantity = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    warehouse = Column(String(255), nullable=False)
    performer = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)
    
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
