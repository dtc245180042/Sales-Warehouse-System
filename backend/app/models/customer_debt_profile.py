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


class CustomerDebtProfile(Base):
    """
    Bảng Profile 1-1 quản lý hạn mức công nợ và số dư công nợ của khách hàng.
    Tuân thủ quy tắc Additive-Only của AGENTS.md (không sửa bảng customers gốc).
    """
    __tablename__ = "customer_debt_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), unique=True, nullable=False, index=True)
    
    # Hạn mức công nợ cho phép (VNĐ)
    credit_limit = Column(Float, default=0.0, nullable=False)
    
    # Công nợ hiện tại (VNĐ)
    current_debt = Column(Float, default=0.0, nullable=False)
    
    notes = Column(Text, nullable=True)
    updated_by = Column(String(255), nullable=True)
    
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
