from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
    Boolean,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class StockTransfer(Base):
    """
    Bảng quản lý phiếu chuyển kho nội bộ (S5-07, SCRUM-574).
    Tuân thủ quy tắc Additive-Only của AGENTS.md.
    """
    __tablename__ = "stock_transfers"

    id = Column(String(50), primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # PCK-2026-0001
    
    # Kho hàng
    source_warehouse = Column(String(255), nullable=False, index=True)
    destination_warehouse = Column(String(255), nullable=False, index=True)
    
    # Trạng thái: draft (nháp), in_transit (đang chuyển), completed (đã nhận đủ/chốt), cancelled (đã hủy)
    status = Column(String(50), default="draft", nullable=False, index=True)
    
    transfer_date = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    # Tổng kết số lượng
    total_items = Column(Integer, default=0, nullable=False)
    total_received_items = Column(Integer, default=0, nullable=False)
    
    # Xử lý chênh lệch (SCRUM-573)
    has_discrepancy = Column(Boolean, default=False, nullable=False)
    discrepancy_reason = Column(Text, nullable=True)
    
    note = Column(Text, nullable=True)
    
    # Nhân sự thực hiện
    created_by = Column(String(255), nullable=True)
    created_by_id = Column(Integer, nullable=True)
    
    shipped_by = Column(String(255), nullable=True)
    shipped_at = Column(DateTime(timezone=True), nullable=True)
    
    received_by = Column(String(255), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancel_reason = Column(Text, nullable=True)
    
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

    items = relationship(
        "StockTransferItem",
        back_populates="transfer",
        cascade="all, delete-orphan",
        lazy="joined"
    )


class StockTransferItem(Base):
    """
    Bảng chi tiết mặt hàng trong phiếu chuyển kho nội bộ (S5-07, SCRUM-574).
    """
    __tablename__ = "stock_transfer_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    transfer_id = Column(
        String(50),
        ForeignKey("stock_transfers.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)
    product_name = Column(String(255), nullable=False)
    unit = Column(String(50), default="cái", nullable=False)
    
    # Số lượng
    transfer_quantity = Column(Integer, nullable=False)  # Số lượng xuất chuyển (>0)
    received_quantity = Column(Integer, nullable=True)   # Số lượng thực nhận tại kho đến
    discrepancy_quantity = Column(Integer, default=0, nullable=False)  # received - transfer
    discrepancy_reason = Column(String(255), nullable=True)  # Bắt buộc khi có chênh lệch
    
    cost_price = Column(Float, default=0.0, nullable=False)
    
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    transfer = relationship("StockTransfer", back_populates="items")


from app.models.warehouse_stock import WarehouseStock
