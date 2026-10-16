from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


# ==============================================================================
# SCHEMAS FOR CREATION & ASSIGNMENT (REQUEST)
# ==============================================================================
class DeliveryTripCreate(BaseModel):
    """Payload tạo chuyến giao hàng mới gom nhiều phiếu xuất (S6-06)."""
    warehouse_id: int = Field(..., description="ID kho hàng xuất phát")
    area: Optional[str] = Field(None, description="Khu vực tuyến đường gom chuyến (e.g. Cầu Giấy, Đống Đa...)")
    driver_id: Optional[int] = Field(None, description="ID tài xế nếu đã có")
    driver_name: Optional[str] = Field(None, description="Tên tài xế phân công")
    driver_phone: Optional[str] = Field(None, description="Số điện thoại tài xế")
    vehicle_id: Optional[str] = Field(None, description="Mã định danh phương tiện nếu có")
    license_plate: Optional[str] = Field(None, description="Biển số xe phân công")
    vehicle_type: Optional[str] = Field(None, description="Loại xe: Xe tải 1.25T, 2.5T, Xe máy...")
    expected_completion_time: Optional[datetime] = Field(None, description="Thời gian dự kiến hoàn thành chuyến")
    notes: Optional[str] = Field(None, description="Ghi chú điều phối chuyến")
    dispatch_ids: List[str] = Field(..., min_length=1, description="Danh sách các mã phiếu xuất kho (PXK-...) gom vào chuyến")


class TripDriverVehicleAssign(BaseModel):
    """Payload gán, đổi hoặc cập nhật tài xế & phương tiện cho chuyến giao (S6-06)."""
    driver_id: Optional[int] = Field(None, description="ID tài xế")
    driver_name: Optional[str] = Field(None, description="Tên tài xế (truyền rỗng hoặc null nếu bỏ gán)")
    driver_phone: Optional[str] = Field(None, description="Số điện thoại tài xế")
    vehicle_id: Optional[str] = Field(None, description="Mã phương tiện")
    license_plate: Optional[str] = Field(None, description="Biển số xe (truyền rỗng hoặc null nếu bỏ gán)")
    vehicle_type: Optional[str] = Field(None, description="Loại xe")
    notes: Optional[str] = Field(None, description="Ghi chú phân công / thay đổi")


# ==============================================================================
# SCHEMAS FOR GROUPING SUGGESTIONS (S6-06)
# ==============================================================================
class PendingDispatchForRouting(BaseModel):
    """Phiếu xuất kho chờ gom chuyến phân tuyến."""
    id: str
    order_id: str
    customer_id: str
    customer_name: Optional[str] = None
    customer_address: Optional[str] = None
    detected_area: Optional[str] = None
    total_items: int = 0
    total_dispatched_quantity: int = 0
    order_total_value: float = 0.0
    dispatched_at: Optional[datetime] = None


class AreaGroupingSuggestion(BaseModel):
    """Gợi ý gom phiếu xuất theo từng cụm khu vực địa lý."""
    area: str = Field(..., description="Tên khu vực nhận diện (e.g. Cầu Giấy, Hà Đông...)")
    dispatch_count: int = Field(..., description="Số lượng phiếu xuất trong khu vực này")
    total_packages: int = Field(..., description="Tổng số kiện/sản phẩm cần giao")
    total_value: float = Field(..., description="Tổng giá trị tiền hàng ước tính")
    dispatches: List[PendingDispatchForRouting] = Field(default_factory=list, description="Danh sách phiếu xuất")


# ==============================================================================
# SCHEMAS FOR DELIVERY MANIFEST & PRINTING (S6-06)
# ==============================================================================
class DeliveryManifestStopItem(BaseModel):
    """Chi tiết sản phẩm cần giao tại một điểm dừng."""
    product_id: str
    sku: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = "cái"
    quantity: int
    unit_price: float = 0.0
    total_price: float = 0.0


class DeliveryManifestStop(BaseModel):
    """Điểm giao hàng trong lệnh điều phối in ấn."""
    stop_order: int
    point_id: int
    dispatch_id: Optional[str] = None
    order_id: Optional[str] = None
    customer_name: Optional[str] = None
    delivery_address: Optional[str] = None
    area: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_person: Optional[str] = None
    total_items_count: int = 0
    point_value: float = 0.0
    items: List[DeliveryManifestStopItem] = []
    completion_notes: Optional[str] = None


class DeliveryManifestResponse(BaseModel):
    """Dữ liệu in danh sách điểm giao của chuyến (Manifest Printout)."""
    trip_id: str
    trip_code: str
    warehouse_id: int
    warehouse_name: Optional[str] = None
    area: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    license_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    expected_completion_time: Optional[datetime] = None
    notes: Optional[str] = None
    total_stops: int = 0
    total_packages: int = 0
    total_trip_value: float = 0.0
    stops: List[DeliveryManifestStop] = []


# ==============================================================================
# SCHEMAS FOR TRIP DETAILS & RESPONSES
# ==============================================================================
class DeliveryTripPointItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    point_id: int
    product_id: str
    sku: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = None
    dispatched_quantity: int
    delivered_quantity: int
    undelivered_quantity: int
    unit_price: float
    total_price: float
    delivered_amount: float
    in_transit_amount: float
    status: str
    notes: Optional[str] = None


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
    area: Optional[str] = None
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
    is_delayed: bool
    completion_notes: Optional[str] = None
    failure_reason: Optional[str] = None
    hold_on_trip: bool
    items: List[DeliveryTripPointItemResponse] = []


class DeliveryTripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_code: str
    warehouse_id: int
    warehouse_name: Optional[str] = None
    area: Optional[str] = None
    driver_id: Optional[int] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    vehicle_id: Optional[str] = None
    license_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    status: str
    started_at: Optional[datetime] = None
    expected_completion_time: Optional[datetime] = None
    actual_completion_time: Optional[datetime] = None
    total_points: int
    delivered_points: int
    remaining_points: int
    failed_points: int
    total_packages: int
    initial_total_value: float
    delivered_value: float
    in_transit_value: float
    is_delayed: bool
    delay_minutes: int
    delay_warning: Optional[str] = None
    delay_level: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    points: List[DeliveryTripPointResponse] = []
