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
    Quyết định 5: Bỏ hoàn toàn cost_price và total_cost_amount khỏi phiếu nhập kho.
    """
    __tablename__ = "supplier_stock_receipts"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    receipt_code = Column(String(50), unique=True, nullable=False, index=True)  # PNK-YYYYMMDD-XXXX
    supplier_id = Column(String(50), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    warehouse_id = Column(Integer, nullable=False, index=True)  # Scalar warehouse ID (liên kết lỏng S5-03, không lưu tên)

    status = Column(String(20), default="DRAFT", nullable=False, index=True)
    note = Column(Text, nullable=True)

    total_items = Column(Integer, default=0, nullable=False)
    total_quantity = Column(Integer, default=0, nullable=False)  # Tổng số lượng theo đơn vị cơ sở (quantity_base)
    total_cost_amount = Column(Float, default=0.0, nullable=True)  # DB column compatibility (không hiển thị ở schema)

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
    AC-2: Quản lý quy đổi đơn vị (input_quantity, input_unit, conversion_rate, quantity_base).
    AC-3: Quản lý số lô (lot_number) và hạn sử dụng (expiry_date) bắt buộc cho hàng date.
    AC-5: adjusted_quantity để giám sát không cho phép đảo vượt số đã nhập.
    """
    __tablename__ = "supplier_stock_receipt_items"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    receipt_id = Column(Integer, ForeignKey("supplier_stock_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(50), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)

    # AC-2: Đơn vị quy đổi
    input_quantity = Column(Integer, nullable=False)        # Số lượng theo đơn vị nhập (vd: 10)
    input_unit = Column(String(50), nullable=True)          # Tên đơn vị nhập (vd: "thùng")
    conversion_rate = Column(Integer, default=1, nullable=False)  # Tỷ lệ quy đổi ra đơn vị cơ sở (vd: 24)
    quantity_base = Column(Integer, nullable=False)         # Số lượng cơ sở = input_quantity * conversion_rate (vd: 240)
    cost_price = Column(Float, default=0.0, nullable=True)  # DB column compatibility (không hiển thị ở schema)
    adjusted_quantity = Column(Integer, default=0, nullable=False)  # Số lượng đã đảo/điều chỉnh (AC-5)

    lot_number = Column(String(100), nullable=True)         # Số lô sản xuất (AC-3)
    expiry_date = Column(DateTime(timezone=True), nullable=True)  # Hạn sử dụng (AC-3)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    receipt = relationship("SupplierStockReceipt", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id], lazy="joined")


# Aliases
StockReceipt = SupplierStockReceipt
StockReceiptItem = SupplierStockReceiptItem
