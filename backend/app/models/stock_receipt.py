from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Text,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class SupplierStockReceipt(Base):
    """
    Bảng quản lý phiếu nhập kho từ nhà cung cấp (Sprint 5 - S5-04).
    Trạng thái:
      - DRAFT: Phiếu nháp, chưa cộng tồn kho thực tế (AC-4).
      - CONFIRMED: Đã nhập kho thành công, đã ghi sổ tồn kho và cộng physical_stock (AC-4, AC-5).
      - CANCELLED: Đã hủy khi còn là DRAFT.
    """
    __tablename__ = "supplier_stock_receipts"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    receipt_code = Column(String(50), unique=True, nullable=False, index=True)  # PNK-YYYYMMDD-XXXX
    supplier_id = Column(String(50), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    warehouse_id = Column(Integer, nullable=False, index=True)  # Scalar warehouse ID (liên kết lỏng S5-03)

    status = Column(String(20), default="DRAFT", nullable=False, index=True)
    note = Column(Text, nullable=True)

    total_items = Column(Integer, default=0, nullable=False)
    total_quantity = Column(Integer, default=0, nullable=False)
    total_cost_amount = Column(Float, default=0.0, nullable=False)  # Giá trị vốn nhập kho (bảo mật phân quyền)

    created_by_id = Column(Integer, nullable=False, index=True)
    confirmed_by_id = Column(Integer, nullable=True, index=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)

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

    # Relationships
    supplier = relationship("Supplier", foreign_keys=[supplier_id], lazy="joined")
    items = relationship(
        "SupplierStockReceiptItem",
        back_populates="receipt",
        cascade="all, delete-orphan",
        lazy="joined",
    )


class SupplierStockReceiptItem(Base):
    """
    Dòng chi tiết mặt hàng trong phiếu nhập kho.
    Hỗ trợ quản lý số lô (lot_number) và hạn sử dụng (expiry_date) (AC-3).
    """
    __tablename__ = "supplier_stock_receipt_items"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    receipt_id = Column(Integer, ForeignKey("supplier_stock_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(50), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)

    quantity = Column(Integer, nullable=False)            # Số lượng nhập (đơn vị cơ sở, phải > 0)
    cost_price = Column(Float, default=0.0, nullable=False)  # Đơn giá vốn nhập

    lot_number = Column(String(100), nullable=True)        # Số lô sản xuất (AC-3)
    expiry_date = Column(DateTime(timezone=True), nullable=True)  # Hạn sử dụng (AC-3)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    receipt = relationship("SupplierStockReceipt", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id], lazy="joined")


# Aliases for backward compatibility and clean naming in service/schemas
StockReceipt = SupplierStockReceipt
StockReceiptItem = SupplierStockReceiptItem
