from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    UniqueConstraint,
)
from app.core.database import Base


class PortalIdempotencyRecord(Base):
    """Bảng lưu trữ Idempotency Key theo đại lý để chống gửi trùng đơn (S4-10, SCRUM-242)."""
    __tablename__ = "portal_idempotency_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_id = Column(String(50), nullable=False, index=True)
    idempotency_key = Column(String(100), nullable=False, index=True)
    request_hash = Column(String(64), nullable=False)
    order_id = Column(String(50), nullable=True)
    response_payload = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint("customer_id", "idempotency_key", name="uq_portal_customer_idempotency"),
    )


# Đảm bảo bảng tự động tạo nếu chưa có
try:
    from app.core.database import engine
    Base.metadata.create_all(bind=engine, tables=[PortalIdempotencyRecord.__table__])
except Exception:
    pass
