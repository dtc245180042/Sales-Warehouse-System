# backend/app/models/inventory_turnover.py
from sqlalchemy import Column, String, Integer, Float, DateTime
from sqlalchemy.sql import func
from app.models.reports import Base

class InventoryTurnoverReport(Base):
    __tablename__ = "inventory_turnover_reports"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(String, index=True, nullable=False)
    warehouse_id = Column(String, index=True, nullable=False)
    avg_inventory = Column(Float, nullable=False)   # Tồn kho trung bình
    cogs_amount = Column(Float, nullable=False)      # Giá vốn hàng bán (COGS)
    turnover_ratio = Column(Float, nullable=False)  # Hệ số vòng quay tồn kho
    turnover_days = Column(Float, nullable=False)   # Số ngày quay vòng 1 vòng
    created_at = Column(DateTime(timezone=True), server_default=func.now())