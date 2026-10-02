from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base # Hoặc từ Base chung của bạn

class SKUUnitConfig(Base):
    __tablename__ = "sku_unit_configs"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, index=True, nullable=False) # Mã SKU
    base_unit = Column(String, nullable=False) # Đơn vị cơ sở (VD: Lon, Chai)
    created_at = Column(DateTime, default=datetime.utcnow)

class UnitConversion(Base):
    __tablename__ = "unit_conversions"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, index=True, nullable=False) # Mã SKU liên kết
    unit_name = Column(String, nullable=False) # Tên đơn vị quy đổi (Loc, Thung, ...)
    conversion_rate = Column(Float, nullable=False) # Tỷ lệ quy đổi về đơn vị cơ sở (VD: 1 Thùng = 24 Lon -> 24.0)
    is_base = Column(Boolean, default=False) # Cờ đánh dấu nếu đây là đơn vị cơ sở
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)