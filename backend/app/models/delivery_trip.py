from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
    Boolean,
)
from sqlalchemy.orm import relationship
from app.core.database import Base, engine


class TripStatus(str, Enum):
    """Trạng thái Chuyến giao hàng (S6-06 / S6-07)."""
    PLANNED = "PLANNED"                              # Mới lập kế hoạch / gom phiếu (S6-06)
    READY = "READY"                                  # Sẵn sàng xuất bến (đã phân công tài xế & xe) (S6-06)
    PREPARING = "PREPARING"                          # Đang chuẩn bị / chờ xuất bến (S6-07)
    IN_TRANSIT = "IN_TRANSIT"                        # Đang trên đường giao (xe đã rời kho)
    COMPLETED = "COMPLETED"                          # Đã hoàn thành chuyến giao
    COMPLETED_WITH_ISSUES = "COMPLETED_WITH_ISSUES"  # Hoàn tất chuyến nhưng còn hàng chưa giao xong (S6-07)
    CANCELLED = "CANCELLED"                          # Đã hủy chuyến


class PointStatus(str, Enum):
    """Trạng thái điểm giao hàng (Stop) trong chuyến."""
    PENDING = "PENDING"          # Chờ giao
    DELIVERING = "DELIVERING"    # Đang tới / đang giao
    DELIVERED = "DELIVERED"      # Đã giao thành công
    PARTIAL = "PARTIAL"          # Giao một phần
    FAILED = "FAILED"            # Giao không thành công / thất bại


class ItemTransitStatus(str, Enum):
    """Trạng thái hàng hóa trên chuyến giao."""
    IN_TRANSIT = "IN_TRANSIT"                              # Đang trên đường
    DELIVERED = "DELIVERED"                                # Đã giao cho khách
    UNDELIVERED_HELD_ON_TRIP = "UNDELIVERED_HELD_ON_TRIP"  # Chưa giao xong - Treo trên chuyến


class DeliveryTrip(Base):
    """
    Bảng Chuyến giao hàng (Delivery Trip - S6-06 / S6-07).
    Gom nhiều phiếu xuất kho theo khu vực giao, phân công tài xế & phương tiện,
    in danh sách điểm giao và theo dõi tiến độ vận chuyển.
    """
    __tablename__ = "delivery_trips"

    id = Column(String(50), primary_key=True)  # TRIP-YYYYMMDD-XXXX
    trip_code = Column(String(50), unique=True, index=True, nullable=False)
    warehouse_id = Column(Integer, nullable=False, index=True)
    warehouse_name = Column(String(255), nullable=True)

    # Khu vực tuyến đường gom chuyến (S6-06)
    area = Column(String(255), nullable=True, index=True)

    # Phân công Tài xế & Phương tiện (S6-06)
    driver_id = Column(Integer, nullable=True, index=True)
    driver_name = Column(String(255), nullable=True)
    driver_phone = Column(String(50), nullable=True)

    vehicle_id = Column(String(50), nullable=True, index=True)
    license_plate = Column(String(50), nullable=True)  # Biển số xe
    vehicle_type = Column(String(100), nullable=True)  # Loại xe: Xe tải 1.25T, 2.5T, Xe máy...

    # Trạng thái & Tiến độ
    status = Column(String(50), default=TripStatus.PLANNED.value, nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    expected_completion_time = Column(DateTime(timezone=True), nullable=True)
    actual_completion_time = Column(DateTime(timezone=True), nullable=True)

    # Bộ đếm điểm giao
    total_points = Column(Integer, default=0, nullable=False)
    delivered_points = Column(Integer, default=0, nullable=False)
    remaining_points = Column(Integer, default=0, nullable=False)
    failed_points = Column(Integer, default=0, nullable=False)

    # Giá trị tài chính hàng hóa
    total_packages = Column(Integer, default=0, nullable=False)
    initial_total_value = Column(Float, default=0.0, nullable=False)  # Tổng tiền hàng khi xuất kho
    delivered_value = Column(Float, default=0.0, nullable=False)      # Tiền hàng đã giao thành công
    in_transit_value = Column(Float, default=0.0, nullable=False)     # Tiền hàng đang trên đường

    # Cảnh báo trễ hạn
    is_delayed = Column(Boolean, default=False, nullable=False, index=True)
    delay_minutes = Column(Integer, default=0, nullable=False)
    delay_warning = Column(String(255), nullable=True)
    delay_level = Column(String(50), default="ON_TIME", nullable=True)

    notes = Column(Text, nullable=True)
    created_by = Column(Integer, nullable=True)

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

    points = relationship(
        "DeliveryTripPoint",
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="DeliveryTripPoint.stop_order",
        lazy="selectin",
    )


class DeliveryTripPoint(Base):
    """
    Điểm giao hàng trong chuyến (Delivery Trip Point / Stop).
    Mỗi điểm giao tương ứng với một phiếu xuất kho gom vào chuyến.
    """
    __tablename__ = "delivery_trip_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    trip_id = Column(String(50), ForeignKey("delivery_trips.id", ondelete="CASCADE"), nullable=False, index=True)
    stop_order = Column(Integer, default=1, nullable=False)  # Thứ tự giao: 1, 2, 3...

    # Liên kết chứng từ & người nhận (S6-06)
    dispatch_id = Column(String(50), nullable=True, index=True)  # PXK-YYYYMMDD-XXXX
    order_id = Column(String(50), nullable=True, index=True)     # ORD-...
    customer_id = Column(String(50), nullable=True, index=True)
    customer_name = Column(String(255), nullable=True)
    delivery_address = Column(Text, nullable=True)
    area = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    contact_person = Column(String(255), nullable=True)

    # Thời gian & Trạng thái
    expected_arrival_time = Column(DateTime(timezone=True), nullable=True)
    actual_arrival_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default=PointStatus.PENDING.value, nullable=False, index=True)

    # Thống kê sản phẩm & giá trị tại điểm
    total_items_count = Column(Integer, default=0, nullable=False)
    delivered_items_count = Column(Integer, default=0, nullable=False)
    undelivered_items_count = Column(Integer, default=0, nullable=False)

    point_value = Column(Float, default=0.0, nullable=False)      # Giá trị hàng tại điểm giao này
    delivered_value = Column(Float, default=0.0, nullable=False)  # Giá trị hàng đã giao thành công
    remaining_value = Column(Float, default=0.0, nullable=False)  # Giá trị hàng chưa giao

    # Cảnh báo & Trách nhiệm chuyến
    is_delayed = Column(Boolean, default=False, nullable=False)
    completion_notes = Column(Text, nullable=True)
    failure_reason = Column(Text, nullable=True)
    hold_on_trip = Column(Boolean, default=True, nullable=False)

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

    trip = relationship("DeliveryTrip", back_populates="points")
    items = relationship(
        "DeliveryTripPointItem",
        back_populates="point",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class DeliveryTripPointItem(Base):
    """
    Dòng sản phẩm cụ thể tại từng điểm giao trong chuyến.
    Lưu rõ số bốc lên xe, số đã giao và số còn tồn treo trên xe.
    """
    __tablename__ = "delivery_trip_point_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    point_id = Column(Integer, ForeignKey("delivery_trip_points.id", ondelete="CASCADE"), nullable=False, index=True)

    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True, index=True)
    product_name = Column(String(255), nullable=True)
    unit = Column(String(50), default="cái", nullable=True)

    dispatched_quantity = Column(Integer, nullable=False)            # Số lượng bốc lên xe
    delivered_quantity = Column(Integer, default=0, nullable=False)   # Số lượng đã giao cho khách
    undelivered_quantity = Column(Integer, default=0, nullable=False) # Số lượng chưa giao xong

    unit_price = Column(Float, default=0.0, nullable=False)
    total_price = Column(Float, default=0.0, nullable=False)        # dispatched_quantity * unit_price
    delivered_amount = Column(Float, default=0.0, nullable=False)   # delivered_quantity * unit_price
    in_transit_amount = Column(Float, default=0.0, nullable=False)  # undelivered_quantity * unit_price

    status = Column(String(50), default=ItemTransitStatus.IN_TRANSIT.value, nullable=False, index=True)
    notes = Column(Text, nullable=True)

    point = relationship("DeliveryTripPoint", back_populates="items")


# Tự động tạo bảng nếu chưa có trong DB và bổ sung cột còn thiếu
try:
    Base.metadata.create_all(
        bind=engine,
        tables=[
            DeliveryTrip.__table__,
            DeliveryTripPoint.__table__,
            DeliveryTripPointItem.__table__,
        ]
    )
    from sqlalchemy import inspect, text
    with engine.connect() as _conn:
        # Cập nhật delivery_trips
        _trip_cols = [c["name"] for c in inspect(_conn).get_columns("delivery_trips")]
        if _trip_cols:
            if "area" not in _trip_cols:
                _conn.execute(text("ALTER TABLE delivery_trips ADD COLUMN area VARCHAR(100)"))
            if "driver_id" not in _trip_cols:
                _conn.execute(text("ALTER TABLE delivery_trips ADD COLUMN driver_id INTEGER"))
            if "vehicle_id" not in _trip_cols:
                _conn.execute(text("ALTER TABLE delivery_trips ADD COLUMN vehicle_id VARCHAR(50)"))
            if "vehicle_type" not in _trip_cols:
                _conn.execute(text("ALTER TABLE delivery_trips ADD COLUMN vehicle_type VARCHAR(100)"))
            if "delay_level" not in _trip_cols:
                _conn.execute(text("ALTER TABLE delivery_trips ADD COLUMN delay_level VARCHAR(50)"))
            _conn.commit()

        # Cập nhật delivery_trip_points
        _pt_cols = [c["name"] for c in inspect(_conn).get_columns("delivery_trip_points")]
        if _pt_cols:
            if "area" not in _pt_cols:
                _conn.execute(text("ALTER TABLE delivery_trip_points ADD COLUMN area VARCHAR(100)"))
            _conn.commit()
except Exception:
    pass
