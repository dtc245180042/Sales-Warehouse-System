from datetime import datetime, date, timezone
from enum import Enum
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    Float,
    String,
    Date,
    DateTime,
    Text,
    Boolean,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from app.core.database import Base, engine


class DebtStatementStatus(str, Enum):
    """Trạng thái biên bản đối chiếu công nợ (S7-06)."""
    DRAFT = "DRAFT"                             # Bản nháp
    SENT = "SENT"                               # Đã gửi đại lý (chờ đại lý phản hồi)
    CONFIRMED = "CONFIRMED"                     # Đại lý xác nhận đồng ý khớp số liệu
    DISPUTED = "DISPUTED"                       # Đại lý phản hồi có chênh lệch
    RESOLVED = "RESOLVED"                       # Kế toán và đại lý đã giải quyết chênh lệch


class DebtDocType(str, Enum):
    """Loại chứng từ phát sinh trong kỳ đối chiếu."""
    INVOICE = "INVOICE"                         # Hóa đơn bán hàng (Tăng nợ)
    PAYMENT = "PAYMENT"                         # Phiếu thu thanh toán (Giảm nợ)
    RETURN_CREDIT = "RETURN_CREDIT"             # Trả hàng / Chứng từ giảm nợ (Giảm nợ)
    ADJUSTMENT = "ADJUSTMENT"                   # Điều chỉnh công nợ


class DebtReconciliationStatement(Base):
    """
    Bảng Biên bản đối chiếu công nợ định kỳ với đại lý (Story S7-06 / SC-267).
    Tuân thủ quy tắc nghiệp vụ:
    - Sinh biên bản theo kỳ: số dư đầu kỳ, phát sinh tăng/giảm, số dư cuối kỳ.
    - Xuất PDF chuẩn có đầy đủ chữ ký 2 bên và bảng kê chứng từ chi tiết.
    - Đại lý xác nhận hoặc phản hồi lệch trực tiếp trên cổng đại lý.
    """
    __tablename__ = "debt_reconciliation_statements"

    id = Column(String(50), primary_key=True)                        # BB-YYYYMM-XXXX
    statement_code = Column(String(50), unique=True, index=True)     # Số biên bản đối chiếu

    # Thông tin khách hàng / Đại lý đối chiếu
    customer_id = Column(String(50), nullable=False, index=True)
    customer_code = Column(String(50), nullable=True)
    customer_name = Column(String(255), nullable=False)
    customer_tax_code = Column(String(50), nullable=True)
    customer_address = Column(String(500), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    representative = Column(String(255), nullable=True)              # Người đại diện pháp luật của đại lý

    # Kỳ đối chiếu
    period_from = Column(Date, nullable=False, index=True)           # Từ ngày (YYYY-MM-DD)
    period_to = Column(Date, nullable=False, index=True)             # Đến ngày (YYYY-MM-DD)

    # Số liệu tổng hợp công nợ (VNĐ)
    opening_balance = Column(BigInteger, default=0, nullable=False)  # Số dư nợ đầu kỳ
    period_increase = Column(BigInteger, default=0, nullable=False)  # Tổng phát sinh tăng trong kỳ
    period_decrease = Column(BigInteger, default=0, nullable=False)  # Tổng phát sinh giảm trong kỳ
    closing_balance = Column(BigInteger, default=0, nullable=False)  # Số dư nợ cuối kỳ chốt hai bên

    # Trạng thái biên bản
    status = Column(String(50), default=DebtStatementStatus.SENT.value, nullable=False, index=True)
    notes = Column(Text, nullable=True)

    # Thông tin người lập biên bản (Kế toán công nợ)
    created_by_id = Column(Integer, nullable=True)
    created_by_name = Column(String(255), nullable=True)

    # Phản hồi từ cổng đại lý (B2B Portal)
    customer_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    customer_feedback_notes = Column(Text, nullable=True)
    customer_claimed_balance = Column(BigInteger, nullable=True)     # Số dư do đại lý tự tính
    discrepancy_amount = Column(BigInteger, nullable=True)           # Số tiền chênh lệch giữa 2 bên
    dispute_reason = Column(Text, nullable=True)                     # Lý do đại lý báo lệch
    disputed_at = Column(DateTime(timezone=True), nullable=True)

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

    # Chi tiết các dòng chứng từ phát sinh trong kỳ
    entries = relationship(
        "DebtReconciliationEntry",
        back_populates="statement",
        cascade="all, delete-orphan",
        order_by="DebtReconciliationEntry.entry_date.asc(), DebtReconciliationEntry.id.asc()"
    )


class DebtReconciliationEntry(Base):
    """
    Dòng chứng từ chi tiết phát sinh trong kỳ của biên bản đối chiếu công nợ.
    """
    __tablename__ = "debt_reconciliation_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    statement_id = Column(String(50), ForeignKey("debt_reconciliation_statements.id", ondelete="CASCADE"), nullable=False, index=True)

    entry_date = Column(Date, nullable=False, index=True)            # Ngày chứng từ
    doc_type = Column(String(50), nullable=False)                    # INVOICE, PAYMENT, RETURN_CREDIT, ADJUSTMENT
    doc_number = Column(String(100), nullable=False)                 # Số hóa đơn / số phiếu thu
    description = Column(String(500), nullable=True)                 # Diễn giải nghiệp vụ
    increase_amount = Column(BigInteger, default=0, nullable=False)  # Phát sinh tăng (Tiền hàng mua)
    decrease_amount = Column(BigInteger, default=0, nullable=False)  # Phát sinh giảm (Thanh toán / Trả hàng)
    running_balance = Column(BigInteger, default=0, nullable=False)  # Số dư nợ lũy kế sau chứng từ này

    statement = relationship("DebtReconciliationStatement", back_populates="entries")


# Tự động tạo bảng nếu chưa có trong DB
try:
    Base.metadata.create_all(
        bind=engine,
        tables=[
            DebtReconciliationStatement.__table__,
            DebtReconciliationEntry.__table__,
        ]
    )
except Exception:
    pass
