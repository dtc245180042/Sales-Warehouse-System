import uuid
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


class Customer(Base):
    """Bảng quản lý khách hàng & đại lý (Additive Model)."""
    __tablename__ = "customers"

    id = Column(String(50), primary_key=True, index=True, default=lambda: f"CUS-{uuid.uuid4().hex[:8].upper()}")
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    phone = Column(String(50), nullable=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    address = Column(Text, nullable=True)
    
    # Nhóm khách hàng (TIER_1, TIER_2, WHOLESALE, VIP, RETAIL)
    customer_group = Column(String(50), default="RETAIL", nullable=False, index=True)
    # Mã số thuế & Khu vực (S3-03 / SCRUM-229)
    tax_code = Column(String(50), unique=True, nullable=True, index=True)
    region = Column(String(100), nullable=True, index=True)

    # Người phụ trách (SCRUM-229: Tên hoặc username của NVKD phụ trách)
    assigned_sales_rep = Column(String(100), nullable=True, index=True)

    total_orders = Column(Integer, default=0, nullable=False)
    total_spent = Column(Float, default=0.0, nullable=False)
    last_order_date = Column(String(50), nullable=True)
    status = Column(String(50), default="active", nullable=False)
    
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


# Đảm bảo các cột mới tự động tồn tại trong CSDL hiện hữu (Additive Migration-free)
try:
    from app.core.database import engine
    from sqlalchemy import inspect, text
    with engine.begin() as _conn:
        _insp = inspect(_conn)
        if "customers" in _insp.get_table_names():
            _cols = [c["name"] for c in _insp.get_columns("customers")]
            if "tax_code" not in _cols:
                _conn.execute(text("ALTER TABLE customers ADD COLUMN tax_code VARCHAR(50) NULL"))
            if "region" not in _cols:
                _conn.execute(text("ALTER TABLE customers ADD COLUMN region VARCHAR(100) NULL"))
            if "assigned_sales_rep" not in _cols:
                _conn.execute(text("ALTER TABLE customers ADD COLUMN assigned_sales_rep VARCHAR(100) NULL"))
except Exception:
    pass

