from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    Boolean,
    ForeignKey,
)
from app.core.database import Base, engine


class DeliveryStatus(str, Enum):
    """Trạng thái giao hàng (S6-08 - SC-259)."""
    DELIVERED = "DELIVERED"               # Giao hàng thành công (kèm ảnh chứng từ POD)
    DELIVERY_FAILED = "DELIVERY_FAILED"   # Giao không thành công (chọn lý do, hoàn về kho)


class DeliveryFailureReason(str, Enum):
    """Danh mục lý do giao hàng không thành công chuẩn hóa."""
    RECIPIENT_UNAVAILABLE = "Khách hàng đi vắng / không liên lạc được"
    WRONG_ADDRESS = "Sai địa chỉ / không tìm thấy địa chỉ người nhận"
    RECIPIENT_REJECTED = "Khách hàng từ chối nhận hàng (đổi ý)"
    DAMAGED_IN_TRANSIT = "Hàng hóa bị hư hại / móp méo trong lúc vận chuyển"
    FORCE_MAJEURE = "Lý do bất khả kháng (thời tiết / tai nạn giao thông)"
    OTHER = "Lý do khác"


class DispatchDelivery(Base):
    """
    Bảng Xác nhận giao hàng & Chứng từ giao nhận POD (Proof of Delivery - S6-08 / SC-259).
    Tuân thủ nguyên tắc Additive-Only của AGENTS.md:
    - Bảng Profile 1-1 liên kết lỏng qua dispatch_id.
    - Ghi nhận họ tên người nhận, thời điểm giao thực tế, ảnh biên bản có chữ ký.
    - Xử lý giao thất bại: lưu lý do và ghi nhận hàng tự động quay về kho.
    - Căn cứ điều kiện kích hoạt phát hành hóa đơn ở Sprint 7.
    """
    __tablename__ = "dispatch_deliveries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dispatch_id = Column(String(50), unique=True, index=True, nullable=False)  # PXK-...
    order_id = Column(String(50), index=True, nullable=False)                 # ORD-...
    customer_id = Column(String(50), index=True, nullable=False)
    customer_name = Column(String(255), nullable=True)
    warehouse_id = Column(Integer, nullable=False, index=True)
    warehouse_name = Column(String(255), nullable=True)

    status = Column(String(50), default=DeliveryStatus.DELIVERED.value, nullable=False, index=True)

    # Dữ liệu xác nhận thành công (POD)
    receiver_name = Column(String(255), nullable=True)
    receiver_phone = Column(String(50), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    proof_image_path = Column(String(500), nullable=True)
    proof_image_url = Column(String(500), nullable=True)

    # Dữ liệu giao thất bại & hoàn hàng về kho
    failure_reason = Column(String(255), nullable=True)
    failure_notes = Column(Text, nullable=True)
    returned_to_warehouse = Column(Boolean, default=False, nullable=False)
    returned_warehouse_id = Column(Integer, nullable=True)
    returned_at = Column(DateTime(timezone=True), nullable=True)

    # Người xác nhận & ghi chú
    confirmed_by = Column(Integer, nullable=False)
    confirmed_by_name = Column(String(255), nullable=True)
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


# Tự động tạo bảng nếu chưa có
try:
    Base.metadata.create_all(bind=engine, tables=[DispatchDelivery.__table__])
except Exception:
    pass
