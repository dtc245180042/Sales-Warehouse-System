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

    order = relationship("Order", back_populates="items")
