from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    func,
)
from sqlalchemy.orm import relationship
from app.core.database import Base

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class ProductLot(Base):
    """
    Model quản lý lô hàng và hạn sử dụng (S6-01).
    - Khóa chính: id kiểu Integer tự tăng.
    - product_id: String(50) khớp với products.id.
    - UniqueConstraint: (product_id, warehouse_id, lot_number).
    - Ràng buộc: exp_date > mfg_date, remaining_quantity <= initial_quantity, các quantity >= 0.
    """
    __tablename__ = "product_lots"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    lot_number = Column(String(100), nullable=False, index=True)
    product_id = Column(String(50), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, nullable=False, default=1, index=True)

    mfg_date = Column(Date, nullable=False)
    exp_date = Column(Date, nullable=False)

    initial_quantity = Column(Integer, nullable=False, default=0)
    remaining_quantity = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(VN_TZ), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(VN_TZ), onupdate=lambda: datetime.now(VN_TZ), nullable=False)

    # Quan hệ với Product
    product = relationship("Product", backref="lots")

    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_id", "lot_number", name="uq_product_lot_wh_num"),
        CheckConstraint("exp_date > mfg_date", name="chk_lot_exp_after_mfg"),
        CheckConstraint("initial_quantity >= 0", name="chk_lot_initial_qty_nonneg"),
        CheckConstraint("remaining_quantity >= 0", name="chk_lot_remaining_qty_nonneg"),
        CheckConstraint("remaining_quantity <= initial_quantity", name="chk_lot_remaining_le_initial"),
    )

    def __repr__(self):
        return (
            f"<ProductLot id={self.id} lot_number={self.lot_number} "
            f"product_id={self.product_id} warehouse_id={self.warehouse_id} "
            f"remaining={self.remaining_quantity}/{self.initial_quantity}>"
        )


# Đảm bảo bảng tự động được tạo nếu chưa có
try:
    from app.core.database import engine
    Base.metadata.create_all(bind=engine, tables=[ProductLot.__table__])
except Exception:
    pass
