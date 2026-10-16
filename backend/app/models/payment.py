from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class PaymentMethod(str, Enum):
    """Hình thức thu tiền (AC-1)."""
    CASH = "CASH"                     # Tiền mặt
    BANK_TRANSFER = "BANK_TRANSFER"   # Chuyển khoản ngân hàng
    CARD = "CARD"                     # Thẻ ngân hàng / POS


class PaymentSequence(Base):
    """
    Bảng quản lý bộ đếm số phiếu thu liên tục không nhảy cóc trong cùng transaction (AC-1 / AC-2).
    Khi transaction bị rollback thì số đếm tự động quay về giá trị cũ, không tiêu số.
    """
    __tablename__ = "payment_sequences"

    period_key = Column(String(20), primary_key=True)  # Ví dụ: "2026"
    current_number = Column(Integer, default=0, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class Payment(Base):
    """
    Bảng Phiếu thu tiền & Ghi nhận thanh toán (Story S7-02).
    Tuân thủ quy tắc nghiệp vụ:
    - Bất biến: Không hỗ trợ sửa hoặc xóa (AC-5).
    - client_request_id: Chống gửi trùng lặp (Idempotent).
    - Không cascade delete.
    """
    __tablename__ = "payments"

    id = Column(String(50), primary_key=True)               # PT-YYYY-XXXXXXX
    client_request_id = Column(String(100), unique=True, index=True, nullable=True)
    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)

    # Tiền tệ: Lưu dạng BigInteger VNĐ để loại trừ sai số số thực Float
    amount = Column(BigInteger, nullable=False)             # Số tiền thu (VNĐ)
    payment_method = Column(String(50), default=PaymentMethod.BANK_TRANSFER.value, nullable=False)
    payment_date = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    collector_id = Column(Integer, nullable=False)          # User.id người thu / kế toán ghi nhận
    collector_name = Column(String(255), nullable=True)
    reference_code = Column(String(100), nullable=True)     # Mã bút toán / mã tham chiếu ngân hàng
    notes = Column(Text, nullable=True)

    # Lưu chuỗi hash payload để kiểm tra Idempotency khi trùng client_request_id
    payload_hash = Column(String(64), nullable=True)

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

    # Quan hệ vĩnh viễn, KHÔNG dùng cascade delete
    allocations = relationship("PaymentAllocation", back_populates="payment")


class PaymentAllocation(Base):
    """
    Bảng Chi tiết đối trừ công nợ giữa Phiếu thu và Hóa đơn bán hàng (Story S7-02).
    Lưu vết từng khoản tiền được phân bổ cho từng hóa đơn cụ thể (AC-2 / AC-3).
    KHÔNG dùng cascade delete.
    """
    __tablename__ = "payment_allocations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_id = Column(String(50), ForeignKey("payments.id"), nullable=False, index=True)
    invoice_id = Column(String(50), ForeignKey("invoices.id"), nullable=False, index=True)
    allocated_amount = Column(BigInteger, nullable=False)   # Số tiền đối trừ vào hóa đơn này (VNĐ)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    payment = relationship("Payment", back_populates="allocations")
    invoice = relationship("Invoice")
