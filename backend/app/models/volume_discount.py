from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Numeric,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class VolumeDiscountScope:
    ALL_PRODUCTS = "ALL_PRODUCTS"
    CATEGORY = "CATEGORY"
    PRODUCT = "PRODUCT"


class VolumeDiscountType:
    PERCENT = "PERCENT"
    FIXED_AMOUNT = "FIXED_AMOUNT"


class VolumeDiscountPolicy(Base):
    """
    Bảng chính sách chiết khấu theo sản lượng (S3-01 / SCRUM-347).
    Cho phép khai báo chiết khấu lũy tiến theo số lượng đặt hàng.
    """
    __tablename__ = "volume_discount_policies"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Phạm vi áp dụng: ALL_PRODUCTS, CATEGORY, PRODUCT
    applied_scope = Column(String(50), default=VolumeDiscountScope.ALL_PRODUCTS, nullable=False, index=True)
    target_id = Column(String(50), nullable=True, index=True)

    # Nhóm khách hàng áp dụng: ALL hoặc TIER_1, TIER_2, WHOLESALE, RETAIL, VIP
    customer_group = Column(String(50), default="ALL", nullable=True, index=True)

    valid_from = Column(DateTime(timezone=True), nullable=False, index=True)
    valid_to = Column(DateTime(timezone=True), nullable=True, index=True)

    is_active = Column(Boolean, default=True, nullable=False, index=True)
    
    # Số lần chính sách đã được áp dụng vào đơn hàng thật (nếu > 0 -> cấm xóa cứng)
    applied_count = Column(Integer, default=0, nullable=False)

    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name = Column(String(100), nullable=True)

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

    tiers = relationship(
        "VolumeDiscountTier",
        back_populates="policy",
        cascade="all, delete-orphan",
        order_by="VolumeDiscountTier.min_quantity"
    )


class VolumeDiscountTier(Base):
    """
    Bảng các bậc thang số lượng của chính sách chiết khấu.
    """
    __tablename__ = "volume_discount_tiers"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    policy_id = Column(
        Integer,
        ForeignKey("volume_discount_policies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    min_quantity = Column(Integer, nullable=False)
    max_quantity = Column(Integer, nullable=True)  # Nullable: từ min_quantity trở lên không giới hạn

    # Loại chiết khấu: PERCENT (% chiết khấu) hoặc FIXED_AMOUNT (giảm số tiền VND / sản phẩm)
    discount_type = Column(String(20), default=VolumeDiscountType.PERCENT, nullable=False)
    discount_value = Column(Numeric(18, 2), nullable=False)

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

    policy = relationship("VolumeDiscountPolicy", back_populates="tiers")
