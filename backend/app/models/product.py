from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, func
from app.core.database import Base


class ProductStatus:
    """Các trạng thái kinh doanh của sản phẩm."""
    ACTIVE = "ACTIVE"          # Đang kinh doanh
    INACTIVE = "INACTIVE"      # Ngừng kinh doanh


class Product(Base):
    """Mô hình dữ liệu sản phẩm trong danh mục (SCRUM-220).
    - SKU là duy nhất trên toàn hệ thống.
    - Lưu trữ tên, nhóm hàng, đơn vị tính cơ sở, quy cách đóng gói, giá vốn, ảnh và trạng thái.
    - Cờ `has_transactions` để quản lý điều kiện xóa vs ngừng kinh doanh (SCRUM-375).
    """
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sku = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)       # Nhóm hàng
    unit = Column(String(50), nullable=False)                         # Đơn vị tính cơ sở (Cái, Hộp, Kg,...)
    packaging_spec = Column(String(255), nullable=True)               # Quy cách đóng gói (vd: 12 hộp/thùng)
    cost_price = Column(Float, nullable=True, default=0.0)            # Giá vốn (Chỉ Quản lý kinh doanh xem/sửa)
    image_url = Column(String(500), nullable=True)                   # Đường dẫn ảnh sản phẩm
    status = Column(String(50), nullable=False, default=ProductStatus.ACTIVE, index=True)  # Trạng thái kinh doanh
    has_transactions = Column(Boolean, nullable=False, default=False) # Đã phát sinh giao dịch trong hệ thống

    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<Product id={self.id} sku={self.sku} name={self.name} status={self.status}>"
