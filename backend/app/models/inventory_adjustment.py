# backend/app/models/inventory_adjustment.py
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from app.models.reports import Base

class InventoryAdjustment(Base):
    __tablename__ = "inventory_adjustments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False) # Mã phiếu
    warehouse_id = Column(String, nullable=False)
    product_id = Column(String, nullable=False)
    adjustment_type = Column(String, nullable=False) # DAMAGED, LOST, EXPIRED
    quantity_adjusted = Column(Integer, nullable=False) # Số lượng điều chỉnh (+/-)
    loss_value = Column(Float, nullable=False, default=0.0) # Giá trị tổn thất
    reason = Column(Text, nullable=False) # Lý do điều chỉnh
    created_by = Column(String, nullable=False) # Người lập
    approved_by = Column(String, nullable=True) # Người duyệt
    status = Column(String, nullable=False, default="PENDING") # PENDING, APPROVED, REJECTED
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())