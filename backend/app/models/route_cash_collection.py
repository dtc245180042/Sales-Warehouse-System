from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    DateTime,
    Text,
    Boolean,
    Float,
)
from app.core.database import Base, engine


class CollectionStatus(str, Enum):
    """Trạng thái khoản thu theo tuyến (S7-05)."""
    PENDING_REMITTANCE = "PENDING_REMITTANCE"   # Chờ nộp về công ty
    REMITTED = "REMITTED"                       # Đã nộp tiền về công ty (kế toán đã xác nhận)
    ADJUSTED = "ADJUSTED"                       # Đã điều chỉnh có kiểm soát
    CANCELLED = "CANCELLED"                     # Đã hủy bù có kiểm soát


class CollectionPaymentMethod(str, Enum):
    """Phương thức thu tiền tại cửa hàng."""
    CASH = "CASH"                               # Tiền mặt
    BANK_TRANSFER = "BANK_TRANSFER"             # Chuyển khoản tại chỗ


class DiscrepancyType(str, Enum):
    """Phân loại chênh lệch đối chiếu."""
    BALANCED = "BALANCED"                       # Khớp chính xác
    UNDER_REMITTED = "UNDER_REMITTED"           # Nộp thiếu so với thực thu
    OVER_REMITTED = "OVER_REMITTED"             # Nộp thừa so với thực thu
    PENDING_OVERDUE = "PENDING_OVERDUE"         # Khoản thu bị treo quá lâu chưa nộp (>24h)


class RouteCashCollection(Base):
    """
    Bảng Ghi nhận khoản thu theo tuyến (Route Cash Collection - Story S7-05 / SC-263).
    Tuân thủ quy tắc nghiệp vụ:
    - Ghi nhận khoản thu tại cửa hàng kèm ảnh biên lai.
    - Trạng thái mặc định: PENDING_REMITTANCE (Chờ nộp).
    - Chuyển sang REMITTED khi kế toán xác nhận nộp tiền.
    - Tính bất biến: Không cho sửa/xóa khoản thu đã được xác nhận (is_locked=True).
    - Hỗ trợ lập điều chỉnh / hủy bù có kiểm soát và lưu vết.
    """
    __tablename__ = "route_cash_collections"

    id = Column(String(50), primary_key=True)                      # TT-YYYYMMDD-XXXX
    collection_code = Column(String(50), unique=True, index=True)   # Mã chứng từ thu tuyến

    # Số tiền thu và phương thức
    amount = Column(BigInteger, nullable=False)                     # Số tiền thực thu tại điểm (VNĐ)
    payment_method = Column(String(50), default=CollectionPaymentMethod.CASH.value, nullable=False)
    collection_date = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

    # Thông tin nhân viên kinh doanh thu tiền
    collector_id = Column(Integer, nullable=False, index=True)      # User.id nhân viên thu
    collector_name = Column(String(255), nullable=True)             # Tên nhân viên
    collector_phone = Column(String(50), nullable=True)

    # Thông tin cửa hàng / Điểm thu tiền
    customer_id = Column(String(50), nullable=False, index=True)    # Mã đại lý / cửa hàng
    customer_name = Column(String(255), nullable=True)              # Tên cửa hàng
    customer_address = Column(String(500), nullable=True)           # Địa chỉ cửa hàng
    route_name = Column(String(255), nullable=True, index=True)     # Tuyến bán hàng / khu vực

    # Tham chiếu chứng từ bán hàng (nếu có)
    order_id = Column(String(50), nullable=True, index=True)
    invoice_id = Column(String(50), nullable=True, index=True)

    # Ảnh biên lai thu tiền phục vụ đối soát
    receipt_image_url = Column(String(1000), nullable=True)         # Link ảnh chụp biên lai/phiếu thu tay
    receipt_image_hash = Column(String(64), nullable=True)          # Hash xác thực ảnh

    # Trạng thái và tính bảo vệ dữ liệu (Bất biến sau xác nhận)
    status = Column(String(50), default=CollectionStatus.PENDING_REMITTANCE.value, nullable=False, index=True)
    is_locked = Column(Boolean, default=False, nullable=False)      # True khi kế toán đã xác nhận -> CẤM sửa/xóa

    # Dấu vết Kế toán xác nhận nộp tiền về công ty
    confirmed_by_id = Column(Integer, nullable=True)                # User.id kế toán xác nhận
    confirmed_by_name = Column(String(255), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    remittance_notes = Column(Text, nullable=True)                  # Ghi chú khi nộp tiền
    remitted_amount = Column(BigInteger, nullable=True)             # Số tiền thực nộp về công ty (VNĐ)

    # Quy trình điều chỉnh / hủy bù có kiểm soát
    is_adjustment = Column(Boolean, default=False, nullable=False)  # Đánh dấu đây là phiếu điều chỉnh bù
    original_collection_id = Column(String(50), nullable=True, index=True) # Phiếu gốc bị điều chỉnh
    adjustment_reason = Column(Text, nullable=True)                 # Lý do điều chỉnh
    adjusted_by_id = Column(Integer, nullable=True)
    adjusted_by_name = Column(String(255), nullable=True)
    adjusted_at = Column(DateTime(timezone=True), nullable=True)

    notes = Column(Text, nullable=True)

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


# Tự động tạo bảng nếu chưa có trong DB
try:
    Base.metadata.create_all(
        bind=engine,
        tables=[RouteCashCollection.__table__]
    )
except Exception:
    pass
