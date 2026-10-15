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


class ReturnStatus(str, Enum):
    """Trạng thái Phiếu trả hàng (Story S8-01)."""
    REQUESTED = "REQUESTED"   # Đã lập yêu cầu, chờ Quản lý kho kiểm đếm nhận hàng
    CONFIRMED = "CONFIRMED"   # Quản lý kho đã nhận hàng vào kho và ghi thẻ kho
    CANCELLED = "CANCELLED"   # Yêu cầu đã bị hủy, giải phóng hạn mức trả


class ReturnReason(str, Enum):
    """Lý do trả hàng từ đại lý (AC-1)."""
    DEFECTIVE_PRODUCT = "DEFECTIVE_PRODUCT"     # Hàng lỗi kỹ thuật / lỗi bao bì nhà sản xuất
    DAMAGED_IN_TRANSIT = "DAMAGED_IN_TRANSIT"   # Hàng hỏng vỡ trong quá trình vận chuyển
    WRONG_DELIVERY = "WRONG_DELIVERY"           # Giao sai sản phẩm / quy cách
    EXPIRY_NEAR = "EXPIRY_NEAR"                 # Hàng cận date / quá hạn bảo hành
    CUSTOMER_RETURN = "CUSTOMER_RETURN"         # Đại lý trả theo thỏa thuận
    OTHER = "OTHER"                             # Lý do khác (Bắt buộc có notes)


class ItemCondition(str, Enum):
    """Tình trạng hàng trả về (AC-3)."""
    GOOD = "GOOD"         # Hàng tốt nguyên vẹn -> Nhập lại kho xuất gốc
    DAMAGED = "DAMAGED"   # Hàng lỗi/hỏng -> Nhập vào kho hàng lỗi (DAMAGED_WAREHOUSE_ID = 99)


class ReturnSequence(Base):
    """
    Bảng quản lý bộ đếm số phiếu trả hàng liên tục không nhảy cóc trong cùng transaction (TH-YYYY-XXXXXXX).
    Khi transaction bị rollback thì số đếm tự động quay về giá trị cũ, không tiêu số.
    """
    __tablename__ = "return_sequences"

    period_key = Column(String(20), primary_key=True)  # Ví dụ: "2026"
    current_number = Column(Integer, default=0, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class ReturnOrder(Base):
    """
    Bảng Phiếu trả hàng từ đại lý (Story S8-01).
    Tuân thủ quy tắc nghiệp vụ:
    - Bất biến: Không hỗ trợ sửa hoặc xóa qua PUT/DELETE (trả về 405).
    - Hủy phiếu có kiểm soát qua POST /returns/{id}/cancel (giải phóng hạn mức trả).
    - client_request_id: Chống gửi trùng lặp (Idempotent).
    - Không cascade delete.
    """
    __tablename__ = "return_orders"

    id = Column(String(50), primary_key=True)               # TH-YYYY-XXXXXXX
    client_request_id = Column(String(100), unique=True, index=True, nullable=True)
    invoice_id = Column(String(50), ForeignKey("invoices.id"), nullable=False, index=True)
    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)

    status = Column(String(50), default=ReturnStatus.REQUESTED.value, nullable=False, index=True)
    return_reason = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)

    # Kho xuất gốc nhận hàng tốt (lấy từ phiếu xuất gốc của hoá đơn)
    origin_warehouse_id = Column(Integer, nullable=False, index=True)

    requested_by = Column(Integer, nullable=False)          # User.id người lập (Sales Rep, Sales Manager, Admin)
    requested_by_name = Column(String(255), nullable=True)
    requested_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    confirmed_by = Column(Integer, nullable=True)          # User.id Quản lý kho / Admin xác nhận
    confirmed_by_name = Column(String(255), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)

    cancelled_by = Column(Integer, nullable=True)          # User.id người hủy (WH Manager / Admin)
    cancelled_by_name = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancel_reason = Column(Text, nullable=True)

    # Tổng giá trị hàng trả tính theo tỷ lệ hoá đơn gốc
    total_returned_value = Column(BigInteger, default=0, nullable=False)

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

    items = relationship("ReturnOrderItem", back_populates="return_order")
    invoice = relationship("Invoice")


class ReturnOrderItem(Base):
    """
    Chi tiết dòng sản phẩm trả về trong Phiếu trả hàng.
    Lưu rõ số lượng, lô, tình trạng hàng, và số tiền hoàn tương ứng từ hoá đơn gốc.
    KHÔNG dùng cascade delete.
    """
    __tablename__ = "return_order_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    return_id = Column(String(50), ForeignKey("return_orders.id"), nullable=False, index=True)
    invoice_item_id = Column(Integer, ForeignKey("invoice_items.id"), nullable=False, index=True)

    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=False)
    product_name = Column(String(255), nullable=True)
    unit = Column(String(50), default="cái")

    quantity = Column(Integer, nullable=False)              # Số lượng trả (AC-2)
    condition = Column(String(50), default=ItemCondition.GOOD.value, nullable=False)  # GOOD / DAMAGED

    lot_id = Column(Integer, ForeignKey("product_lots.id"), nullable=True, index=True) # AC-3
    lot_number = Column(String(100), nullable=True)

    # Giá trị tài chính phân bổ từ dòng hoá đơn gốc (để lại cho Story S8-02)
    unit_price = Column(BigInteger, nullable=False)
    discount_amount = Column(BigInteger, default=0, nullable=False)
    vat_amount = Column(BigInteger, default=0, nullable=False)
    subtotal = Column(BigInteger, nullable=False)           # Thành tiền hàng trả (đã trừ chiết khấu + thuế)

    return_order = relationship("ReturnOrder", back_populates="items")
    invoice_item = relationship("InvoiceItem")
    lot = relationship("ProductLot")
