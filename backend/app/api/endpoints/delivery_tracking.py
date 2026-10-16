from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.delivery_tracking import (
    DeliveryTimelineResponse,
    DeliveryMilestoneUpdateRequest,
)
from app.services.delivery_tracking_service import DeliveryTrackingService


router = APIRouter(prefix="/delivery-tracking", tags=["Theo dõi Giao hàng (Delivery Tracking - S6-09 / SCRUM-694)"])


@router.get(
    "/{order_id}",
    response_model=DeliveryTimelineResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy timeline tiến trình giao hàng theo từng đơn (S6-09 / SCRUM-694)",
)
def lay_timeline_giao_hang(
    order_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Trả về timeline trạng thái giao hàng theo từng đơn với 5 mốc chuẩn:
    1. Đã duyệt (APPROVED)
    2. Đang soạn (PACKING)
    3. Đã xuất (EXPORTED)
    4. Đang giao (DELIVERING)
    5. Đã giao (DELIVERED)

    Bao gồm thời gian cập nhật ở mỗi mốc và trạng thái hiện tại.
    """
    return DeliveryTrackingService.get_delivery_timeline(
        db=db,
        order_id=order_id,
        current_user=current_user,
    )


@router.get(
    "/{order_id}/timeline",
    response_model=DeliveryTimelineResponse,
    status_code=status.HTTP_200_OK,
    summary="Bí danh lấy timeline tiến trình giao hàng theo đơn",
)
def lay_timeline_giao_hang_alias(
    order_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Bí danh của endpoint /api/v1/delivery-tracking/{order_id}."""
    return DeliveryTrackingService.get_delivery_timeline(
        db=db,
        order_id=order_id,
        current_user=current_user,
    )


@router.patch(
    "/{order_id}/milestones",
    response_model=DeliveryTimelineResponse,
    status_code=status.HTTP_200_OK,
    summary="Cập nhật tiến trình mốc giao hàng (Dành cho Kho / Vận tải / Quản lý)",
)
def cap_nhat_moc_giao_hang(
    order_id: str,
    payload: DeliveryMilestoneUpdateRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Cập nhật mốc giao hàng (VD: chuyển sang DELIVERING khi xe xuất bến, hoặc DELIVERED khi khách đã nhận).
    """
    return DeliveryTrackingService.update_delivery_milestone(
        db=db,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
    )
