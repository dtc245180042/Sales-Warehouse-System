from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
)
from app.core.database import Base


class OrderDeliveryProfile(Base):
    """
    Bảng Profile 1-1 lưu thông tin điểm giao hàng của đơn hàng (S3-04, SCRUM-441).
    Tuân thủ nghiêm ngặt quy tắc Additive-Only của AGENTS.md (không sửa bảng orders gốc).
    """
    __tablename__ = "order_delivery_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(String(50), unique=True, nullable=False, index=True)
    
    delivery_address_id = Column(Integer, nullable=True, index=True)
    delivery_address_name = Column(String(255), nullable=True)
    delivery_receiver_name = Column(String(255), nullable=True)
    delivery_phone = Column(String(50), nullable=True)
    delivery_address = Column(Text, nullable=True)
    delivery_notes = Column(Text, nullable=True)
    dispatched_at = Column(DateTime(timezone=True), nullable=True)
    expected_delivery_date = Column(String(50), nullable=True)  # Ngày giao hàng mong muốn (S3-09, SCRUM-230)
    
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


# Đảm bảo các cột mới tự động tồn tại trong CSDL SQLite hiện hữu
try:
    from app.core.database import engine
    from sqlalchemy import text
    with engine.connect() as _conn:
        _res = _conn.execute(text("PRAGMA table_info(order_delivery_profiles)")).fetchall()
        _cols = [r[1] for r in _res]
        if _cols and "expected_delivery_date" not in _cols:
            _conn.execute(text("ALTER TABLE order_delivery_profiles ADD COLUMN expected_delivery_date VARCHAR(50)"))
            _conn.commit()
except Exception:
    pass

