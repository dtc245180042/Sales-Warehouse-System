from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    DateTime,
    Text,
    Index,
    UniqueConstraint,
)
from app.core.database import Base


class ReminderType(str, Enum):
    """Loại nhắc hạn thanh toán (S7-08)."""
    BEFORE_DUE_3_DAYS = "BEFORE_DUE_3_DAYS"   # Nhắc trước hạn 3 ngày
    OVERDUE = "OVERDUE"                       # Nhắc khi đã quá hạn thanh toán


class PaymentReminderLog(Base):
    """
    Bảng nhật ký gửi nhắc hạn thanh toán (SCRUM-763).
    Lưu vết từng lần gửi email và tạo thông báo in-app cho từng hoá đơn.
    Cơ chế UniqueConstraint trên (invoice_id, reminder_type, run_date) chống gửi trùng lặp trong cùng một ngày.
    """
    __tablename__ = "payment_reminder_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(50), nullable=False, index=True)        # Mã hoá đơn
    customer_id = Column(String(50), nullable=False, index=True)      # Mã đại lý
    reminder_type = Column(String(50), nullable=False, index=True)    # BEFORE_DUE_3_DAYS, OVERDUE
    run_date = Column(String(10), nullable=False, index=True)          # Ngày chạy job (định dạng YYYY-MM-DD)

    # Thông tin tài chính tại thời điểm quét
    amount_due = Column(BigInteger, default=0, nullable=False)        # Số tiền còn nợ tại thời điểm nhắc
    due_date = Column(DateTime(timezone=True), nullable=False)        # Hạn thanh toán của hoá đơn
    days_overdue = Column(Integer, default=0, nullable=False)         # Số ngày quá hạn (nếu quá hạn)

    # Kênh thông báo và trạng thái
    channel = Column(String(20), default="ALL", nullable=False)       # EMAIL, IN_APP, ALL
    email_to = Column(String(255), nullable=True)                     # Email người nhận
    email_status = Column(String(50), default="SENT", nullable=False) # SENT, FAILED, SKIPPED
    email_error = Column(Text, nullable=True)                         # Chi tiết lỗi nếu gửi mail thất bại

    in_app_status = Column(String(50), default="CREATED", nullable=False) # CREATED, FAILED, SKIPPED
    notification_id = Column(Integer, nullable=True)                  # Khóa ngoại logic tới app_notifications.id

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    __table_args__ = (
        # Ràng buộc chống trùng trong cùng một ngày cho cùng hoá đơn và loại nhắc
        UniqueConstraint("invoice_id", "reminder_type", "run_date", name="uq_invoice_reminder_day"),
        Index("idx_reminder_customer_date", "customer_id", "run_date"),
    )
