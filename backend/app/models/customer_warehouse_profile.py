from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
)
from app.core.database import Base


class CustomerWarehouseProfile(Base):
    """
    Bảng Profile 1-1 quản lý kho phục vụ đại lý (Servicing Warehouse).
    Tuân thủ quy tắc Additive-Only của AGENTS.md (S4-03, SCRUM-505).
    """
    __tablename__ = "customer_warehouse_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), unique=True, nullable=False, index=True)
    warehouse_name = Column(String(255), nullable=False)
    warehouse_code = Column(String(50), nullable=False)
    is_default = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)

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
