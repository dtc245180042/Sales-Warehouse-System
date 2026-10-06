from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
)
from app.core.database import Base


class ProductStockProfile(Base):
    """
    Bảng Profile 1-1 quản lý số lượng tồn kho và hạn mức cảnh báo tồn tối thiểu của sản phẩm.
    Tuân thủ quy tắc Additive-Only của AGENTS.md (không sửa bảng products của module khác).
    """
    __tablename__ = "product_stock_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    product_id = Column(Integer, unique=True, nullable=False, index=True)
    sku = Column(String(50), nullable=True, index=True)
    
    # Số lượng tồn kho thực tế
    stock = Column(Integer, default=0, nullable=False)
    
    # Định mức tồn tối thiểu
    min_stock = Column(Integer, default=0, nullable=False)
    
    warehouse = Column(String(255), default="Kho Tổng Hà Nội", nullable=False)
    
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
