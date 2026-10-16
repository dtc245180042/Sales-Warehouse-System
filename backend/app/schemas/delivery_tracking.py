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


class DeliveryTimelineResponse(BaseModel):
    """Timeline theo dõi tiến trình giao hàng của đơn hàng (SCRUM-694)."""
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
    milestones: List[DeliveryMilestoneItem]
    updated_at: Optional[str] = None


class DeliveryMilestoneUpdateRequest(BaseModel):
    """Yêu cầu cập nhật tiến độ giao hàng."""
    milestone_code: str  # e.g. "DELIVERING", "DELIVERED", "PACKING", "EXPORTED"
    status: str = "COMPLETED"  # "COMPLETED", "IN_PROGRESS", "PENDING"
    notes: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    license_plate: Optional[str] = None
