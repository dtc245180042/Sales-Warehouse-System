from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


# ==============================================================================
# SCHEMAS CHO HÀNG HÓA TỪNG ĐIỂM GIAO
# ==============================================================================
class DeliveryTripPointItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    point_id: int
    product_id: str
    sku: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = "cái"
    dispatched_quantity: int
    delivered_quantity: int
    undelivered_quantity: int
    unit_price: float
    total_price: float
    delivered_amount: float
    in_transit_amount: float
    status: str
    notes: Optional[str] = None


# ==============================================================================
# SCHEMAS CHO TỪNG ĐIỂM GIAO TRONG CHUYẾN
# ==============================================================================
class DeliveryTripPointResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trip_id: str
    stop_order: int
    dispatch_id: Optional[str] = None
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    delivery_address: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_person: Optional[str] = None
    expected_arrival_time: Optional[datetime] = None
    actual_arrival_time: Optional[datetime] = None
    status: str
    total_items_count: int
    delivered_items_count: int
    undelivered_items_count: int
    point_value: float
    delivered_value: float
    remaining_value: float
    is_delayed: bool = False
    completion_notes: Optional[str] = None
    failure_reason: Optional[str] = None
    hold_on_trip: bool = True
    items: List[DeliveryTripPointItemResponse] = []


# ==============================================================================
# SCHEMAS CHO CHUYẾN GIAO HÀNG
# ==============================================================================
class DeliveryTripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_code: str
    warehouse_id: int
    warehouse_name: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    license_plate: Optional[str] = None
    status: str
    started_at: datetime
    expected_completion_time: datetime
    actual_completion_time: Optional[datetime] = None
    total_points: int
    delivered_points: int
    remaining_points: int
    failed_points: int
    total_packages: int
    initial_total_value: float
    delivered_value: float
    in_transit_value: float
    is_delayed: bool = False
    delay_minutes: int = 0
    delay_warning: Optional[str] = None
    delay_level: Optional[str] = "ON_TIME"  # ON_TIME, WARNING, CRITICAL
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    points: List[DeliveryTripPointResponse] = []


class DeliveryTripListResponse(BaseModel):
    items: List[DeliveryTripResponse]
    total: int
    total_in_transit_value: float
    active_trips_count: int
    delayed_trips_count: int


# ==============================================================================
# SCHEMAS CHO REQUEST TẠO & CẬP NHẬT
# ==============================================================================
class DeliveryTripCreate(BaseModel):
    warehouse_id: int = Field(..., description="ID kho hàng xuất phát")
    driver_name: Optional[str] = Field(None, description="Tên tài xế phụ trách")
    driver_phone: Optional[str] = Field(None, description="SĐT tài xế")
    license_plate: Optional[str] = Field(None, description="Biển số xe giao hàng")
    dispatch_ids: List[str] = Field(..., min_length=1, description="Danh sách mã phiếu xuất kho PXK-... gom vào chuyến")
    expected_completion_time: Optional[datetime] = Field(None, description="Thời gian dự kiến hoàn tất chuyến")
    estimated_duration_hours: Optional[float] = Field(None, description="Số giờ dự kiến giao (nếu không truyền thời gian cụ thể)")
    notes: Optional[str] = Field(None, description="Ghi chú chuyến giao")


class PointItemResultUpdate(BaseModel):
    product_id: str = Field(..., description="Mã sản phẩm")
    delivered_quantity: int = Field(..., ge=0, description="Số lượng thực tế đã giao cho khách")
    failure_reason: Optional[str] = Field(None, description="Lý do nếu giao thiếu hoặc hỏng")


class PointDeliveryResultRequest(BaseModel):
    status: str = Field(..., description="Trạng thái điểm giao: DELIVERED, PARTIAL, hoặc FAILED")
    completion_notes: Optional[str] = Field(None, description="Ghi chú xác nhận giao hàng")
    failure_reason: Optional[str] = Field(None, description="Lý do giao thất bại hoặc giao một phần")
    delivered_items: Optional[List[PointItemResultUpdate]] = Field(
        None,
        description="Chi tiết số lượng giao từng sản phẩm (nếu rỗng và DELIVERED, mặc định giao đủ)"
    )


class InTransitSummaryResponse(BaseModel):
    total_active_trips: int
    total_in_transit_value: float
    total_delayed_trips: int
    total_remaining_points: int
    total_delivered_points: int
    by_warehouse: List[Dict[str, Any]] = []
