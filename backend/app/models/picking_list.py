"""Dữ liệu phiếu soạn S6-03; chỉ liên kết module khác qua ID."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class PickingLocation(Base):
    """Vị trí lấy hàng chính và thứ tự đi qua vị trí trong từng kho."""

    __tablename__ = "picking_locations"
    id = Column(Integer, primary_key=True)
    warehouse_id = Column(Integer, nullable=False, index=True)
    product_id = Column(String(50), nullable=False, index=True)
    location_code = Column(String(100), nullable=False)
    route_sequence = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
    __table_args__ = (UniqueConstraint("warehouse_id", "product_id", name="uq_picking_location_product"),)


class PickingList(Base):
    __tablename__ = "picking_lists"
    id = Column(String(50), primary_key=True)
    client_request_id = Column(String(100), unique=True, nullable=False)
    warehouse_id = Column(Integer, nullable=False, index=True)
    warehouse_name = Column(String(255), nullable=False)
    status = Column(String(30), nullable=False, default="pending", index=True)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class PickingListOrder(Base):
    __tablename__ = "picking_list_orders"
    id = Column(Integer, primary_key=True)
    picking_list_id = Column(String(50), ForeignKey("picking_lists.id"), nullable=False, index=True)
    order_id = Column(String(50), nullable=False, index=True)
    order_code = Column(String(50), nullable=False)
    original_status = Column(String(50), nullable=False)
    # Khóa duy nhất ngăn hai phiếu cùng nhận một đơn; hủy phiếu sẽ nhả khóa.
    active_order_key = Column(String(50), unique=True, nullable=True)
    __table_args__ = (UniqueConstraint("picking_list_id", "order_id", name="uq_picking_source_order"),)


class PickingListItem(Base):
    __tablename__ = "picking_list_items"
    id = Column(Integer, primary_key=True)
    picking_list_id = Column(String(50), ForeignKey("picking_lists.id"), nullable=False, index=True)
    order_id = Column(String(50), nullable=False, index=True)
    order_item_id = Column(Integer, nullable=False)
    product_id = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=False)
    product_name = Column(String(255), nullable=False)
    unit = Column(String(50), nullable=False)
    location_code = Column(String(100), nullable=False)
    route_sequence = Column(Integer, nullable=False)
    requested_quantity = Column(Integer, nullable=False)
    picked_quantity = Column(Integer, nullable=False, default=0)
    shortfall_quantity = Column(Integer, nullable=False, default=0)
    shortfall_reason = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="pending")
    version = Column(Integer, nullable=False, default=1)
    updated_by = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class PickingItemHistory(Base):
    """Nhật ký bất biến lưu đủ số lượng, trạng thái, lý do trước và sau."""

    __tablename__ = "picking_item_histories"
    id = Column(Integer, primary_key=True)
    picking_list_id = Column(String(50), ForeignKey("picking_lists.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("picking_list_items.id"), nullable=False, index=True)
    old_quantity = Column(Integer, nullable=False)
    new_quantity = Column(Integer, nullable=False)
    old_shortfall = Column(Integer, nullable=False)
    new_shortfall = Column(Integer, nullable=False)
    old_status = Column(String(30), nullable=False)
    new_status = Column(String(30), nullable=False)
    old_reason = Column(Text, nullable=True)
    new_reason = Column(Text, nullable=True)
    changed_by = Column(Integer, nullable=False)
    changed_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
