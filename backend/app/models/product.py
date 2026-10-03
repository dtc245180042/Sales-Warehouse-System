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


class Product(Base):
    """Model sản phẩm phục vụ việc gán nhóm hàng và chuyển đổi nhóm hàng (SCRUM-214)."""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sku = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    price = Column(Float, default=0.0, nullable=False)
    unit = Column(String(20), default="cái", nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Product id={self.id} sku='{self.sku}' name='{self.name}' category_id={self.category_id}>"
