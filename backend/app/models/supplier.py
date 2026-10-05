from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    Text,
)
from app.core.database import Base


class Supplier(Base):
    """Bảng quản lý nhà cung cấp (SCRUM-217 — Additive Model)."""
    __tablename__ = "suppliers"

    id = Column(String(50), primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)

    # SCRUM-409: Bổ sung mã số thuế và điều khoản thanh toán
    tax_code = Column(String(50), nullable=True, unique=True, index=True)
    payment_terms = Column(String(255), nullable=True)

    contact_person = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    address = Column(Text, nullable=True)

    total_imports = Column(Integer, default=0, nullable=False)
    total_spent = Column(Float, default=0.0, nullable=False)

    # SCRUM-412: Dùng is_active=False thay vì xóa cứng khi có phiếu nhập
    status = Column(String(50), default="active", nullable=False)
    has_receipts = Column(Boolean, default=False, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
