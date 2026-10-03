from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Text,
)
from app.core.database import Base


class Product(Base):
    """Bảng quản lý sản phẩm trong hệ thống (Additive Model)."""
    __tablename__ = "products"

    id = Column(String(50), primary_key=True, index=True)
    sku = Column(String(100), unique=True, nullable=False, index=True)
    barcode = Column(String(100), nullable=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, default="Khác", index=True)
    
    # Nhà cung cấp (Scalar ID & Name)
    supplier_id = Column(String(50), nullable=True, index=True)
    supplier_name = Column(String(255), nullable=True)
    
    # Giá bán & giá vốn
    cost_price = Column(Float, default=0.0, nullable=False)
    sale_price = Column(Float, default=0.0, nullable=False)
    
    # Tồn kho
    stock = Column(Integer, default=0, nullable=False)
    min_stock = Column(Integer, default=5, nullable=False)
    unit = Column(String(50), default="Chiếc", nullable=False)
    
    # Ảnh & mô tả
    image = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="active", nullable=False, index=True)  # active, out_of_stock, low_stock, inactive
    
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
