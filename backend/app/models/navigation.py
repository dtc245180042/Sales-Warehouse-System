from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)        # Định danh menu: 'dashboard', 'orders', 'stock_in'
    title = Column(String(100), nullable=False)                              # Tên hiển thị: 'Quản lý đơn hàng'
    path = Column(String(200), nullable=True)                                # Đường dẫn route frontend: '/orders'
    icon = Column(String(50), nullable=True)                                 # Tên icon UI: 'ShoppingBag', 'Warehouse'
    parent_id = Column(Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=True, index=True)
    order = Column(Integer, default=0)                                       # Thứ tự sắp xếp hiển thị
    is_active = Column(Boolean, default=True)                                # Trạng thái kích hoạt
    required_permission_code = Column(String(100), nullable=True, index=True) # Mã quyền cần thiết: 'order:view' (None = Public)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Quan hệ cha - con (Hierarchical Menu)
    parent = relationship("MenuItem", remote_side=[id], back_populates="children")
    children = relationship("MenuItem", back_populates="parent", cascade="all, delete-orphan", order_by="MenuItem.order")

    def __repr__(self):
        return f"<MenuItem code={self.code} title={self.title} perm={self.required_permission_code}>"
