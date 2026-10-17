from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.delivery_trip import (
    DeliveryTripCreate,
    TripDriverVehicleAssign,
    PendingDispatchForRouting,
    AreaGroupingSuggestion,
    DeliveryManifestResponse,
    DeliveryTripResponse,
)
from app.services.delivery_trip_service import DeliveryTripService

router = APIRouter(prefix="/delivery-trips", tags=["Phân Tuyến Giao Hàng & Điều Xe (Delivery Routing - S6-06)"])


@router.get(
    "/grouping-suggestions",
    response_model=List[AreaGroupingSuggestion],
    status_code=status.HTTP_200_OK,
    summary="Gợi ý đề xuất gom phiếu xuất kho theo cụm khu vực (S6-06 Subtask 10)",
)
def lay_de_xuat_gom_chuyen_theo_khu_vuc(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho hàng"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Quét toàn bộ các phiếu xuất kho đang ở trạng thái CONFIRMED chưa thuộc chuyến nào,
    nhận diện địa chỉ và gom cụm theo khu vực địa lý để xe chạy một vòng giao được nhiều điểm.
    """
    return DeliveryTripService.get_grouping_suggestions(
        db=db,
        warehouse_id=warehouse_id,
    )


@router.get(
    "/pending-dispatches",
    response_model=List[PendingDispatchForRouting],
    status_code=status.HTTP_200_OK,
    summary="Danh sách phiếu xuất kho chờ điều phối chưa gán chuyến",
)
def danh_sach_phieu_cho_dieu_phoi(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho hàng"),
    area: Optional[str] = Query(None, description="Lọc theo khu vực nhận diện"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Lấy danh sách chi tiết các phiếu xuất kho CONFIRMED chưa gán chuyến để thủ kho chọn lọc thủ công.
    """
    return DeliveryTripService.get_pending_dispatches(
        db=db,
        warehouse_id=warehouse_id,
        area=area,
    )


@router.post(
    "",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo chuyến giao hàng mới gom nhiều phiếu xuất và gán tài xế/xe (S6-06 Subtask 8)",
)
def tao_chuyen_giao_hang(
    payload: DeliveryTripCreate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tạo một chuyến giao hàng mới:
    - Gom danh sách phiếu xuất kho theo khu vực tuyến đường.
    - Phân công tài xế và phương tiện.
    - Tự động sinh danh sách các điểm dừng (stops) và dòng sản phẩm trên chuyến.
    """
    return DeliveryTripService.create_trip(
        db=db,
        payload=payload,
        current_user=current_user,
    )


@router.put(
    "/{trip_id}/assign-driver-vehicle",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Gán, đổi hoặc bỏ gán tài xế và phương tiện cho chuyến giao (S6-06 Subtask 14)",
)
def cap_nhat_tai_xe_phuong_tien(
    trip_id: str,
    payload: TripDriverVehicleAssign,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Cho phép điều phối viên hoặc quản lý kho gán, thay đổi hoặc bỏ gán tài xế và xe.
    Kiểm tra trạng thái chuyến trước khi cập nhật (chặn nếu đã COMPLETED hoặc CANCELLED).
    """
    return DeliveryTripService.assign_driver_and_vehicle(
        db=db,
        trip_id=trip_id,
        payload=payload,
        current_user=current_user,
    )


@router.get(
    "/{trip_id}/manifest",
    response_model=DeliveryManifestResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy danh sách điểm giao của chuyến kèm địa chỉ và SĐT để in ấn (S6-06 Subtask 18)",
)
def lay_danh_sach_diem_giao_in_an(
    trip_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Trả về dữ liệu danh sách các điểm giao thuộc chuyến theo đúng thứ tự (Stop 1, Stop 2...),
    kèm người nhận, địa chỉ, số điện thoại và danh mục hàng hóa để in ấn biên bản điều phối.
    """
    return DeliveryTripService.get_manifest(
        db=db,
        trip_id=trip_id,
    )


@router.post(
    "/{trip_id}/start",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Xuất bến bắt đầu chuyến giao hàng (READY -> IN_TRANSIT)",
)
def xuat_ben_chuyen_giao_hang(
    trip_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xác nhận xe đã rời kho bắt đầu lộ trình giao hàng."""
    return DeliveryTripService.start_trip(
        db=db,
        trip_id=trip_id,
        current_user=current_user,
    )


@router.delete(
    "/{trip_id}",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Hủy chuyến giao hàng khi chưa xuất bến và nhả phiếu xuất về hàng đợi",
)
def huy_chuyen_giao_hang(
    trip_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Hủy chuyến giao khi chưa xuất bến, các phiếu xuất kho sẽ được nhả ra để phân chuyến khác."""
    return DeliveryTripService.cancel_trip(
        db=db,
        trip_id=trip_id,
        current_user=current_user,
    )


@router.get(
    "/{trip_id}",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy chi tiết chuyến giao hàng và các điểm dừng (S6-06 Subtask 16)",
)
def chi_tiet_chuyen_giao_hang(
    trip_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xem đầy đủ thông tin chuyến giao, tiến độ, tài xế, xe và các điểm giao."""
    return DeliveryTripService.get_trip(db=db, trip_id=trip_id)


@router.get(
    "",
    response_model=List[DeliveryTripResponse],
    status_code=status.HTTP_200_OK,
    summary="Danh sách các chuyến giao hàng có bộ lọc và phân trang",
)
def danh_sach_chuyen_giao_hang(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái chuyến"),
    area: Optional[str] = Query(None, description="Lọc theo khu vực tuyến đường"),
    driver_name: Optional[str] = Query(None, description="Lọc theo tên tài xế"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Truy vấn danh sách chuyến giao hàng phục vụ màn hình điều phối."""
    items, _ = DeliveryTripService.list_trips(
        db=db,
        warehouse_id=warehouse_id,
        status_filter=status_filter,
        area=area,
        driver_name=driver_name,
        skip=skip,
        limit=limit,
    )
    return items
