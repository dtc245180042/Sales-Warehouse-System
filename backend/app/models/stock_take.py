from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Float,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class StockTakeScope:
    WAREHOUSE = "WAREHOUSE"
    CATEGORY = "CATEGORY"
    CUSTOM = "CUSTOM"


class StockTakeStatus:
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StockTake(Base):
    """
    Bảng Phiếu kiểm kê kho hàng (S5-08 / SCRUM-582).
    Lưu trữ thông tin đợt kiểm kê, phạm vi kiểm kê, trạng thái và tổng hợp chênh lệch.
    """
    __tablename__ = "stock_takes"

    id = Column(String(50), primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    
    # Kho hàng thực hiện kiểm kê
    warehouse = Column(String(255), nullable=False, default="Kho Tổng Hà Nội")
    
    # Phạm vi kiểm kê: WAREHOUSE (toàn kho), CATEGORY (theo nhóm hàng), CUSTOM (sản phẩm tùy chọn)
    scope_type = Column(String(50), nullable=False, default=StockTakeScope.WAREHOUSE, index=True)
    category_id = Column(Integer, nullable=True, index=True)
    category_name = Column(String(100), nullable=True)
    
    # Trạng thái: draft, in_progress, completed, cancelled
    status = Column(String(50), nullable=False, default=StockTakeStatus.DRAFT, index=True)
    
    # Thống kê tổng quan
    total_items = Column(Integer, default=0, nullable=False)
    total_system_qty = Column(Integer, default=0, nullable=False)
    total_actual_qty = Column(Integer, default=0, nullable=False)
    total_discrepancy_qty = Column(Integer, default=0, nullable=False)
    has_discrepancy = Column(Boolean, default=False, nullable=False)
    
    # Lý do điều chỉnh khi có chênh lệch tồn (bắt buộc khi chốt có chênh lệch - SCRUM-584)
    adjustment_reason = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    cancel_reason = Column(Text, nullable=True)
    
    # Thông tin người tạo và người chốt (SCRUM-585)
    created_by_id = Column(Integer, nullable=True)
    created_by_name = Column(String(255), nullable=True)
    confirmed_by_id = Column(Integer, nullable=True)
    confirmed_by_name = Column(String(255), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by_name = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

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

    items = relationship(
        "StockTakeItem",
        back_populates="stock_take",
        cascade="all, delete-orphan",
        lazy="joined"
    )


class StockTakeItem(Base):
    """
    Bảng chi tiết các dòng hàng trong phiếu kiểm kê (S5-08 / SCRUM-580 & SCRUM-581).
    Snapshot số tồn sổ tại thời điểm tạo và lưu số đếm thực tế cùng chênh lệch.
    """
    __tablename__ = "stock_take_items"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    stock_take_id = Column(String(50), ForeignKey("stock_takes.id", ondelete="CASCADE"), nullable=False, index=True)
    
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)
    product_name = Column(String(255), nullable=False)
    category_name = Column(String(100), nullable=True)
    unit = Column(String(50), default="cái", nullable=False)
    
    # Số tồn sổ sách snapshot tại thời điểm lập phiếu (SCRUM-581)
    system_quantity = Column(Integer, default=0, nullable=False)
    
    # Số đếm thực tế (SCRUM-580)
    actual_quantity = Column(Integer, nullable=True)
    
    # Chênh lệch = actual_quantity - system_quantity
    discrepancy_quantity = Column(Integer, default=0, nullable=False)
    is_counted = Column(Boolean, default=False, nullable=False)
    
    cost_price = Column(Float, default=0.0, nullable=True)
    note = Column(String(255), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    stock_take = relationship("StockTake", back_populates="items")
