from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime
from sqlalchemy.orm import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()

class InventoryReportConfig(Base):
    __tablename__ = "inventory_report_configs"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String, unique=True, index=True)
    min_days = Column(Integer, default=30)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())