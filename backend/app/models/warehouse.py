from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

class UnitConversion(Base):
    __tablename__ = "unit_conversions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(String, index=True)
    input_unit = Column(String)       # Ví dụ: Thùng
    base_unit = Column(String)        # Ví dụ: Chai
    conversion_rate = Column(Float)   # Tỷ lệ: 24
    version = Column(Integer, default=1) # Versioning (SCRUM-393)
    effective_from = Column(DateTime(timezone=True), server_default=func.now())
    effective_to = Column(DateTime(timezone=True), nullable=True) # null = đang dùng
    is_active = Column(Boolean, default=True)

class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(String, index=True)
    transaction_type = Column(String) # IMPORT, EXPORT, ADJUSTMENT
    input_quantity = Column(Float)   # Số lượng theo đơn vị nhập
    input_unit = Column(String)       # Đơn vị nhập
    base_quantity = Column(Float)    # Quy đổi về đơn vị cơ sở (SCRUM-391)
    base_unit = Column(String)       # Đơn vị cơ sở
    conversion_rate_used = Column(Float)
    conversion_version_used = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())