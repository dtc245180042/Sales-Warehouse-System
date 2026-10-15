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


class InvoiceStatus(str, Enum):
    """Trạng thái Hóa đơn bán hàng (S7-01 / S7-02)."""
    UNPAID = "UNPAID"                   # Chưa thanh toán
    PARTIALLY_PAID = "PARTIALLY_PAID"   # Thanh toán một phần
    PAID = "PAID"                       # Đã thanh toán đủ


class InvoiceSequence(Base):
    """
    Bảng quản lý bộ đếm số hóa đơn liên tục không nhảy cóc trong cùng transaction (AC-2).
    Khi transaction bị rollback thì số đếm tự động quay về giá trị cũ, không tiêu số.
    """
    __tablename__ = "invoice_sequences"

    period_key = Column(String(20), primary_key=True)  # Ví dụ: "2026"
    current_number = Column(Integer, default=0, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class Invoice(Base):
    """
    Bảng Hóa đơn bán hàng (Invoices - Story S7-01).
    Tuân thủ quy tắc nghiệp vụ:
    - Bất biến: Không hỗ trợ sửa hoặc xóa (AC-4).
    - client_request_id: Chống gửi trùng lặp (Idempotent).
    - Không cascade delete.
    """
    __tablename__ = "invoices"

    id = Column(String(50), primary_key=True)               # HD-YYYY-XXXXXXX
    client_request_id = Column(String(100), unique=True, index=True, nullable=True)
    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)
    customer_address = Column(String(500), nullable=True)
    customer_tax_code = Column(String(50), nullable=True)

    # Tiền tệ: Lưu dạng BigInteger VNĐ để loại trừ sai số số thực Float
    subtotal_amount = Column(BigInteger, default=0, nullable=False)
    discount_amount = Column(BigInteger, default=0, nullable=False)
    vat_amount = Column(BigInteger, default=0, nullable=False)
    total_amount = Column(BigInteger, default=0, nullable=False)      # Tổng tiền phải thu
    paid_amount = Column(BigInteger, default=0, nullable=False)       # Đã thanh toán (mặc định 0)
    remaining_amount = Column(BigInteger, default=0, nullable=False)  # Còn nợ

    status = Column(String(50), default=InvoiceStatus.UNPAID.value, nullable=False, index=True)

    issued_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    due_date = Column(DateTime(timezone=True), nullable=False)        # Hạn thanh toán theo hạn mức đại lý
    issued_by = Column(Integer, nullable=False)                       # User.id người lập hóa đơn
    notes = Column(Text, nullable=True)

    # Lưu chuỗi hash hoặc danh sách dispatch_ids để kiểm tra Idempotency khi trùng client_request_id
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
    items = relationship("InvoiceItem", back_populates="invoice")


class InvoiceItem(Base):
    """
    Chi tiết dòng hàng trên Hóa đơn.
    Ràng buộc Unique trên dispatch_item_id: Chống lập hóa đơn 2 lần cho cùng một dòng phiếu xuất.
    KHÔNG dùng cascade delete.
    """
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(50), ForeignKey("invoices.id"), nullable=False, index=True)
    dispatch_id = Column(String(50), nullable=False, index=True)
    dispatch_item_id = Column(Integer, unique=True, nullable=False, index=True) # UNIQUE CONSTRAINT
    order_id = Column(String(50), nullable=False, index=True)
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=False)
    product_name = Column(String(255), nullable=True)
    unit = Column(String(50), default="cái")

    quantity = Column(Integer, nullable=False)                        # Số lượng thực xuất tính tiền (AC-1)
    unit_price = Column(BigInteger, nullable=False)                   # Đơn giá bán (VNĐ)
    discount_amount = Column(BigInteger, default=0, nullable=False)   # Chiết khấu dòng
    vat_amount = Column(BigInteger, default=0, nullable=False)        # Thuế VAT dòng
    subtotal = Column(BigInteger, nullable=False)                     # Thành tiền dòng (sau chiết khấu + thuế)

    invoice = relationship("Invoice", back_populates="items")
