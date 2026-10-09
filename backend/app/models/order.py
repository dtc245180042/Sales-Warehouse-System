from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    Numeric,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class Order(Base):
    """Bảng quản lý đơn hàng bán lẻ và đơn bán đại lý (Additive Model)."""
    __tablename__ = "orders"

    id = Column(String(50), primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    
    # Khách hàng
    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(50), nullable=True)
    customer_address = Column(Text, nullable=True)
    
    # Bảng giá áp dụng (nếu có)
    price_list_id = Column(Integer, nullable=True, index=True)
    
    # Tài chính
    subtotal = Column(Float, default=0.0, nullable=False)
    discount = Column(Float, default=0.0, nullable=False)
    tax = Column(Float, default=0.0, nullable=False)
    total = Column(Float, default=0.0, nullable=False)
    paid_amount = Column(Float, default=0.0, nullable=False)
    change_amount = Column(Float, default=0.0, nullable=False)
    
    # Phương thức thanh toán & trạng thái
    payment_method = Column(String(50), default="cash", nullable=False)  # cash, transfer, card
    payment_status = Column(String(50), default="paid", nullable=False)  # paid, unpaid, partial
    status = Column(String(50), default="pending", nullable=False, index=True)  # pending, confirmed, shipping, completed, cancelled
    
    # Nhân viên tạo / phụ trách đơn (SCRUM-364 nhận diện avatar nhân viên tạo)
    staff_id = Column(String(50), nullable=True, index=True)
    staff_name = Column(String(255), nullable=True)
    
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

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", lazy="joined")


class OrderItem(Base):
    """Bảng chi tiết các sản phẩm trong đơn hàng."""
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(String(50), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True)
    name = Column(String(255), nullable=False)
    price = Column(Float, default=0.0, nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    discount = Column(Float, default=0.0, nullable=False)
    subtotal = Column(Float, default=0.0, nullable=False)
    # Đơn vị tính (S3-09: cái, hộp, thùng...)
    unit = Column(String(50), nullable=True, default="cái")

    # Snapshot chính sách chiết khấu sản lượng lúc chốt đơn (S3-01)
    applied_discount_policy_id = Column(Integer, nullable=True, index=True)
    applied_discount_policy_name = Column(String(255), nullable=True)
    discount_rate = Column(Numeric(5, 2), nullable=True)      # % chiết khấu nếu áp dụng PERCENT
    discount_amount = Column(BigInteger, nullable=True)        # Tiền chiết khấu VND nếu áp dụng FIXED_AMOUNT

    order = relationship("Order", back_populates="items")


# Đảm bảo các cột mới của order_items tự động tồn tại trong CSDL hiện hữu
try:
    from app.core.database import engine
    from sqlalchemy import inspect, text
    with engine.connect() as _conn:
        _cols = [c["name"] for c in inspect(_conn).get_columns("order_items")]
        if _cols:
            if "unit" not in _cols:
                _conn.execute(text("ALTER TABLE order_items ADD COLUMN unit VARCHAR(50)"))
            if "applied_discount_policy_id" not in _cols:
                _conn.execute(text("ALTER TABLE order_items ADD COLUMN applied_discount_policy_id INTEGER"))
            if "applied_discount_policy_name" not in _cols:
                _conn.execute(text("ALTER TABLE order_items ADD COLUMN applied_discount_policy_name VARCHAR(255)"))
            if "discount_rate" not in _cols:
                _conn.execute(text("ALTER TABLE order_items ADD COLUMN discount_rate NUMERIC(5, 2)"))
            if "discount_amount" not in _cols:
                _conn.execute(text("ALTER TABLE order_items ADD COLUMN discount_amount BIGINT"))
            _conn.commit()
except Exception:
    pass
