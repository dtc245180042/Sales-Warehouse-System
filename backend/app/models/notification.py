from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
    Index,
)
from app.core.database import Base


class AppNotification(Base):
    """
    Bảng thông báo trong ứng dụng (In-app Notifications - SCRUM-759).
    Cho phép hệ thống gửi thông báo nhắc hạn thanh toán, biến động đơn hàng, hoặc thông báo hệ thống đến đại lý / người dùng.
    """
    __tablename__ = "app_notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True, index=True)               # ID người dùng nhận (nếu gửi đích danh user)
    customer_id = Column(String(50), nullable=True, index=True)         # ID đại lý nhận thông báo (phục vụ Portal đại lý)
    title = Column(String(255), nullable=False)                        # Tiêu đề thông báo
    content = Column(Text, nullable=False)                             # Nội dung chi tiết thông báo
    type = Column(String(50), default="PAYMENT_REMINDER", index=True)   # PAYMENT_REMINDER, ORDER_UPDATE, SYSTEM
    reference_type = Column(String(50), default="INVOICE", index=True) # INVOICE, ORDER, DELIVERY
    reference_id = Column(String(50), nullable=True, index=True)       # Mã liên kết (ví dụ: mã hoá đơn HD-2026-...)

    is_read = Column(Boolean, default=False, nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_app_notif_customer_unread", "customer_id", "is_read"),
    )
