from datetime import datetime, timezone, timedelta
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class PriceList(Base):
    """Bảng quản lý bảng giá theo nhóm khách hàng và thời hạn hiệu lực (SCRUM-416, SCRUM-417, SCRUM-419)."""
    __tablename__ = "price_lists"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    
    # Nhóm khách hàng áp dụng: TIER_1 (Cấp 1), TIER_2 (Cấp 2), RETAIL (Bán lẻ), VIP, WHOLESALE
    customer_group = Column(String(50), nullable=False, index=True)
    
    # Quản lý phiên bản kế thừa (SCRUM-416)
    version = Column(Integer, default=1, nullable=False)
    parent_id = Column(Integer, nullable=True, index=True)  # ID bảng giá cha nếu được nhân bản
    
    # Trạng thái bảng giá: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, EXPIRED (SCRUM-415, SCRUM-418)
    status = Column(String(50), default="DRAFT", nullable=False, index=True)
    
    # Thời gian hiệu lực (SCRUM-417)
    valid_from = Column(DateTime(timezone=True), nullable=False, index=True)
    valid_to = Column(DateTime(timezone=True), nullable=True, index=True)
    
    # Khóa sửa đổi khi đã phát sinh đơn hàng (SCRUM-416)
    has_orders = Column(Boolean, default=False, nullable=False)
    orders_count = Column(Integer, default=0, nullable=False)
    
    # Cờ cảnh báo giá bán dưới giá sàn cần duyệt (SCRUM-418)
    requires_approval = Column(Boolean, default=False, nullable=False)
    
    # Phê duyệt bảng giá
    approved_by_id = Column(Integer, nullable=True)  # Scalar ID người duyệt
    approved_by_name = Column(String(100), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approval_note = Column(Text, nullable=True)
    
    # Người tạo
    created_by_id = Column(Integer, nullable=True)
    created_by_name = Column(String(100), nullable=True)
    
    is_active = Column(Boolean, default=True, nullable=False)
    
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

    # Quan hệ với các dòng giá chi tiết trong cùng model
    items = relationship(
        "PriceListItem",
        back_populates="price_list",
        cascade="all, delete-orphan",
        order_by="PriceListItem.id"
    )

    @property
    def is_locked(self) -> bool:
        """Kiểm tra bảng giá có bị khóa sửa đổi khi đã phát sinh đơn hàng hay không (SCRUM-416)."""
        return bool(self.has_orders or (self.orders_count and self.orders_count > 0))

    @property
    def is_expired(self) -> bool:
        """Kiểm tra bảng giá đã hết hạn hiệu lực hay chưa (SCRUM-417)."""
        if not self.valid_to:
            return False
        now_utc = datetime.now(timezone.utc)
        val_to = self.valid_to
        if val_to.tzinfo is None:
            val_to = val_to.replace(tzinfo=timezone.utc)
        return now_utc > val_to

    @property
    def is_effective(self) -> bool:
        """Kiểm tra bảng giá có đang trong khoảng thời gian hiệu lực và đã được duyệt hay không (SCRUM-417)."""
        if self.status != "APPROVED" or not self.is_active:
            return False
        now_utc = datetime.now(timezone.utc)
        val_from = self.valid_from
        if val_from.tzinfo is None:
            val_from = val_from.replace(tzinfo=timezone.utc)
        tolerance = timedelta(seconds=5)
        if now_utc < val_from - tolerance:
            return False
        if self.valid_to:
            val_to = self.valid_to
            if val_to.tzinfo is None:
                val_to = val_to.replace(tzinfo=timezone.utc)
            if now_utc > val_to:
                return False
        return True


class PriceListItem(Base):
    """Bảng chi tiết dòng giá với giá bán, giá sàn và trạng thái duyệt (SCRUM-415, SCRUM-418)."""
    __tablename__ = "price_list_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    price_list_id = Column(
        Integer,
        ForeignKey("price_lists.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Thông tin sản phẩm (liên kết lỏng qua Product ID & SKU)
    product_id = Column(String(50), nullable=False, index=True)
    product_sku = Column(String(50), nullable=True)
    product_name = Column(String(255), nullable=False)
    unit = Column(String(50), default="Chiếc", nullable=False)
    
    # Giá niêm yết, giá sàn và giá bán quy định (SCRUM-415)
    listed_price = Column(Float, nullable=False)  # Giá niêm yết gốc
    floor_price = Column(Float, nullable=False)   # Giá sàn tối thiểu cho phép bán
    sale_price = Column(Float, nullable=False)    # Giá bán áp dụng cho nhóm khách hàng này
    
    discount_percent = Column(Float, default=0.0, nullable=False)
    
    # Đánh dấu dòng giá bán dưới giá sàn (SCRUM-415, SCRUM-418)
    requires_approval = Column(Boolean, default=False, nullable=False)
    status = Column(String(50), default="DRAFT", nullable=False)  # DRAFT, PENDING_APPROVAL, APPROVED, REJECTED
    note = Column(String(255), nullable=True)

    # Phê duyệt riêng lẻ dòng giá bán dưới giá sàn (SCRUM-418)
    approved_by_id = Column(Integer, nullable=True)
    approved_by_name = Column(String(100), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approval_note = Column(Text, nullable=True)
    
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

    price_list = relationship("PriceList", back_populates="items")
