from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class DeliveryMilestoneItem(BaseModel):
    """Chi tiết một mốc trong timeline giao hàng."""
    model_config = ConfigDict(from_attributes=True)

    step: int
    code: str
    name: str
    status: str  # PENDING, IN_PROGRESS, COMPLETED
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    notes: Optional[str] = None
    dispatch_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    license_plate: Optional[str] = None


class DeliveryItemLotDetail(BaseModel):
    """Chi tiết lô hàng được xuất cho dòng hàng."""
    model_config = ConfigDict(from_attributes=True)

    lot_id: int
    lot_number: str
    quantity: int


class DeliveryItemProgressResponse(BaseModel):
    """
    Tiến độ giao hàng của từng dòng hàng trong đơn (SCRUM-697).
    Expose:
    - ordered_quantity: Số lượng đặt
    - dispatched_quantity: Số lượng thực giao
    - difference_quantity: Chênh lệch nếu giao thiếu (ordered_quantity - dispatched_quantity)
    - is_short_delivery: Đánh dấu có bị thiếu hàng hay không
    - lots: Danh sách lô đã xuất
    """
    model_config = ConfigDict(from_attributes=True)

    item_id: Optional[int] = None
    product_id: str
    sku: Optional[str] = None
    name: str
    unit: str = "cái"
    ordered_quantity: int
    dispatched_quantity: int
    difference_quantity: int
    is_short_delivery: bool = False
    lots: List[DeliveryItemLotDetail] = []


class DeliveryTimelineResponse(BaseModel):
    """Timeline theo dõi tiến trình giao hàng của đơn hàng (SCRUM-694 & SCRUM-697)."""
    model_config = ConfigDict(from_attributes=True)

    order_id: str
    order_code: str
    current_status: str
    current_stage: str
    customer_id: str
    customer_name: Optional[str] = None
    delivery_address: Optional[str] = None
    receiver_name: Optional[str] = None
    receiver_phone: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    dispatch_id: Optional[str] = None
    milestones: List[DeliveryMilestoneItem] = []

    # Bổ sung dữ liệu số lượng thực giao theo từng dòng hàng (SCRUM-697)
    items: List[DeliveryItemProgressResponse] = []
    total_ordered_quantity: int = 0
    total_dispatched_quantity: int = 0
    has_short_delivery: bool = False
    updated_at: Optional[str] = None


class DeliveryTrackingListItem(BaseModel):
    """Thông tin tóm tắt tiến trình giao hàng trong danh sách (SCRUM-698)."""
    model_config = ConfigDict(from_attributes=True)

    order_id: str
    order_code: str
    current_status: str
    current_stage: str
    customer_id: str
    customer_name: Optional[str] = None
    delivery_address: Optional[str] = None
    receiver_name: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    total_ordered_quantity: int = 0
    total_dispatched_quantity: int = 0
    has_short_delivery: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DeliveryTrackingListResponse(BaseModel):
    """Danh sách đơn hàng theo dõi tiến trình giao hàng có phân trang (SCRUM-698)."""
    model_config = ConfigDict(from_attributes=True)

    items: List[DeliveryTrackingListItem]
    total: int
    page: int
    limit: int


class DeliveryMilestoneUpdateRequest(BaseModel):
    """Yêu cầu cập nhật tiến độ giao hàng."""
    milestone_code: str  # e.g. "DELIVERING", "DELIVERED", "PACKING", "EXPORTED"
    status: str = "COMPLETED"  # "COMPLETED", "IN_PROGRESS", "PENDING"
    notes: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    license_plate: Optional[str] = None
