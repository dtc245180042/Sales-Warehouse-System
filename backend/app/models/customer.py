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

    id = Column(String(50), primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    phone = Column(String(50), nullable=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    address = Column(Text, nullable=True)
    
    # Nhóm khách hàng (TIER_1, TIER_2, WHOLESALE, VIP, RETAIL)
    customer_group = Column(String(50), default="RETAIL", nullable=False, index=True)
    
    # Khu vực địa bàn (SCRUM-229: Miền Bắc, Miền Trung, Miền Nam, Tây Nguyên...)
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


# Đảm bảo các cột mới tự động tồn tại trong CSDL SQLite hiện hữu (Additive Migration-free)
try:
    from app.core.database import engine
    from sqlalchemy import text
    with engine.connect() as _conn:
        _res = _conn.execute(text("PRAGMA table_info(customers)")).fetchall()
        _cols = [r[1] for r in _res]
        if _cols:
            if "region" not in _cols:
                _conn.execute(text("ALTER TABLE customers ADD COLUMN region VARCHAR(100)"))
            if "assigned_sales_rep" not in _cols:
                _conn.execute(text("ALTER TABLE customers ADD COLUMN assigned_sales_rep VARCHAR(100)"))
            _conn.commit()
except Exception:
    pass
