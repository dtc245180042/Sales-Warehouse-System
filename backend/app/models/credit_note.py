from datetime import datetime, timezone
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


class CreditNoteSequence(Base):
    """
    Bảng quản lý bộ đếm số chứng từ giảm nợ liên tục không nhảy cóc trong cùng transaction (CN-YYYY-XXXXXXX).
    Khi transaction bị rollback thì số đếm tự động quay về giá trị cũ, không tiêu số.
    """
    __tablename__ = "credit_note_sequences"

    period_key = Column(String(20), primary_key=True)  # Ví dụ: "2026"
    current_number = Column(Integer, default=0, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class CreditNote(Base):
    """
    Bảng Chứng từ điều chỉnh giảm trừ công nợ khi trả hàng (Credit Note - Story S8-02).
    Tuân thủ quy tắc nghiệp vụ:
    - Bất biến: Không hỗ trợ sửa hoặc xóa qua PUT/DELETE (trả về HTTP 405).
    - Duy nhất: 1 Phiếu trả hàng (ReturnOrder) chỉ được lập duy nhất 1 Credit Note (return_order_id unique).
    - client_request_id: Chống gửi trùng lặp (Idempotent).
    - Không cascade delete.
    """
    __tablename__ = "credit_notes"

    id = Column(String(50), primary_key=True)               # CN-YYYY-XXXXXXX
    client_request_id = Column(String(100), unique=True, index=True, nullable=True)

    # Ràng buộc Unique: Mỗi phiếu trả hàng chỉ được tạo duy nhất một chứng từ giảm nợ
    return_order_id = Column(
        String(50),
        ForeignKey("return_orders.id"),
        unique=True,
        nullable=False,
        index=True
    )
    invoice_id = Column(String(50), ForeignKey("invoices.id"), nullable=False, index=True)

    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)

    # Tiền tệ: Lưu dạng BigInteger VNĐ để loại trừ sai số số thực Float
    adjustment_amount = Column(BigInteger, default=0, nullable=False)   # Tổng tiền giảm trừ
    adjustment_date = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    created_by = Column(Integer, nullable=False)                        # User.id Kế toán (Accountant) hoặc Admin
    created_by_name = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

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
    items = relationship("CreditNoteItem", back_populates="credit_note")
    return_order = relationship("ReturnOrder")
    invoice = relationship("Invoice")


class CreditNoteItem(Base):
    """
    Chi tiết dòng sản phẩm giảm trừ trong Chứng từ giảm nợ.
    Sao lưu chính xác số lượng, đơn giá gốc, chiết khấu và thuế từ dòng hàng trả về.
    KHÔNG dùng cascade delete.
    """
    __tablename__ = "credit_note_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    credit_note_id = Column(String(50), ForeignKey("credit_notes.id"), nullable=False, index=True)
    return_order_item_id = Column(Integer, ForeignKey("return_order_items.id"), nullable=False, index=True)

    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=False)
    product_name = Column(String(255), nullable=True)
    unit = Column(String(50), default="cái")

    quantity = Column(Integer, nullable=False)              # Số lượng hàng trả giảm nợ
    unit_price = Column(BigInteger, nullable=False)         # Đơn giá gốc từ hoá đơn
    discount_amount = Column(BigInteger, default=0, nullable=False) # Chiết khấu phân bổ
    vat_amount = Column(BigInteger, default=0, nullable=False)      # Thuế VAT phân bổ
    subtotal = Column(BigInteger, nullable=False)           # Thành tiền giảm trừ của dòng

    credit_note = relationship("CreditNote", back_populates="items")
    return_order_item = relationship("ReturnOrderItem")
