# backend/app/models/sales_target.py
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from app.models.reports import Base

class SalesTarget(Base):
    __tablename__ = "sales_targets"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, index=True, nullable=False)
    region_code = Column(String, index=True, nullable=False)
    month_year = Column(String, index=True, nullable=False) # Định dạng YYYY-MM
    target_amount = Column(Float, nullable=False, default=0.0)
    is_locked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SalesTargetAuditLog(Base):
    __tablename__ = "sales_target_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    target_id = Column(Integer, ForeignKey("sales_targets.id"), nullable=False)
    modified_by = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    old_amount = Column(Float, nullable=False)
    new_amount = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())