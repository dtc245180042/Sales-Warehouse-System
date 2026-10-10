from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    func
)
from app.core.database import Base


import uuid

def generate_product_id():
    return f"PRD-{uuid.uuid4().hex[:8].upper()}"


class ProductStatus:
    """Các trạng thái kinh doanh của sản phẩm."""
    ACTIVE = "ACTIVE"          # Đang kinh doanh
    INACTIVE = "INACTIVE"      # Ngừng kinh doanh


class Product(Base):
    """Mô hình dữ liệu sản phẩm trong danh mục (SCRUM-220 & SCRUM-214).
    - SKU là duy nhất trên toàn hệ thống.
    - Hỗ trợ cả nhóm hàng văn bản và phân cấp cây nhóm hàng (category_id).
    - Cờ has_transactions để quản lý điều kiện xóa vs ngừng kinh doanh.
    """
    __tablename__ = "products"

    id = Column(String(50), primary_key=True, index=True, default=generate_product_id)
    sku = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, default="Mặc định", index=True)         # Tên nhóm hàng (text)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True) # Cây nhóm hàng đa cấp (SCRUM-214)
    unit = Column(String(50), nullable=False, default="cái")          # Đơn vị tính cơ sở (Cái, Hộp, Kg,...)
    packaging_spec = Column(String(255), nullable=True)               # Quy cách đóng gói (vd: 12 hộp/thùng)
    cost_price = Column(Float, nullable=True, default=0.0)            # Giá vốn (Chỉ Quản lý kinh doanh xem/sửa)
    price = Column(Float, nullable=True, default=0.0)                 # Giá bán niêm yết (SCRUM-214)
    sale_price = Column(Float, nullable=True, default=0.0)            # Giá bán niêm yết (tương thích ngược)
    stock = Column(Integer, nullable=True, default=100)               # Số lượng tồn kho
    min_stock = Column(Integer, nullable=True, default=10)            # Tồn kho tối thiểu
    description = Column(String(255), nullable=True)                  # Mô tả sản phẩm
    image_url = Column(String(500), nullable=True)                   # Đường dẫn ảnh sản phẩm
    status = Column(String(50), nullable=False, default=ProductStatus.ACTIVE, index=True)  # Trạng thái kinh doanh
    is_active = Column(Boolean, nullable=False, default=True)         # Trạng thái hoạt động
    has_transactions = Column(Boolean, nullable=False, default=False) # Đã phát sinh giao dịch trong hệ thống

    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<Product id={self.id} sku={self.sku} name={self.name} category_id={self.category_id} status={self.status}>"
