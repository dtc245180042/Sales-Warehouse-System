from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
)
from app.core.database import Base


class CustomerDeliveryAddress(Base):
    """
    Bảng quản lý nhiều điểm giao hàng cho một đại lý / khách hàng (S3-04, SCRUM-225).
    Tuân thủ nguyên tắc Additive-Only của AGENTS.md (không làm thay đổi cấu trúc bảng customers cũ).
    """
    __tablename__ = "customer_delivery_addresses"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), nullable=False, index=True)
    
    # Tên định danh điểm giao hàng (ví dụ: Kho số 1, Chi nhánh Cầu Giấy, Kho tổng miền Nam)
    name = Column(String(255), nullable=False)
    
    # Người nhận hàng tại điểm này
    receiver_name = Column(String(255), nullable=False)
    
    # Số điện thoại người nhận
    phone = Column(String(50), nullable=False)
    
    # Địa chỉ chi tiết điểm giao hàng
    address = Column(Text, nullable=False)
    
    # Ghi chú đường đi / chỉ dẫn giao nhận (ví dụ: Xe tải > 5 tấn đi cổng sau, giao giờ hành chính)
    directions_note = Column(Text, nullable=True)
    
    # Điểm giao hàng mặc định (mỗi khách hàng chỉ có tối đa 1 điểm mặc định)
    is_default = Column(Boolean, default=False, nullable=False, index=True)
    
    # Trạng thái: active, inactive
    status = Column(String(50), default="active", nullable=False)
    
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
