from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    UniqueConstraint,
)
from app.core.database import Base


class OrderDeliveryMilestone(Base):
    """
    Bảng lưu vết các mốc tiến trình giao hàng theo từng đơn (S6-09 / SCRUM-694).
    Tuân thủ quy tắc Additive-Only của AGENTS.md (không sửa bảng cũ).
    5 mốc chính:
    1. APPROVED: Đã duyệt
    2. PACKING: Đang soạn
    3. EXPORTED: Đã xuất
    4. DELIVERING: Đang giao
    5. DELIVERED: Đã giao
    """
    __tablename__ = "order_delivery_milestones"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(String(50), nullable=False, index=True)
    milestone_code = Column(String(50), nullable=False, index=True)  # APPROVED, PACKING, EXPORTED, DELIVERING, DELIVERED
    milestone_name = Column(String(100), nullable=False)
    step_order = Column(Integer, nullable=False)  # 1..5
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, IN_PROGRESS, COMPLETED
    updated_at = Column(DateTime(timezone=True), nullable=True)
    updated_by = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    # Dữ liệu bổ trợ chuyến xe / phân tuyến (tích hợp S6-06 / S6-08)
    dispatch_id = Column(String(50), nullable=True, index=True)
    driver_name = Column(String(255), nullable=True)
    driver_phone = Column(String(50), nullable=True)
    license_plate = Column(String(50), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint("order_id", "milestone_code", name="uq_order_delivery_milestone"),
    )


# Tự động tạo bảng nếu chưa có trong DB hiện hữu
try:
    from app.core.database import engine
    OrderDeliveryMilestone.__table__.create(bind=engine, checkfirst=True)
except Exception:
    pass
