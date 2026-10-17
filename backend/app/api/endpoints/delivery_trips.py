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
    DeliveryTripListResponse,
    DeliveryTripPointResponse,
    PointDeliveryResultRequest,
    InTransitSummaryResponse,
)
from app.services.delivery_trip_service import DeliveryTripService

router = APIRouter(prefix="/delivery-trips", tags=["Phân Tuyến Giao Hàng & Theo Dõi Chuyến (S6-06 / S6-07)"])


# ==============================================================================
# 1. BÁO CÁO TỔNG QUAN TIỀN HÀNG TRÊN ĐƯỜNG (S6-07)
# ==============================================================================
@router.get(
    "/summary",
    response_model=InTransitSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Báo cáo tổng quan tiền hàng trên đường (S6-07 Dashboard)",
)
def bao_cao_hang_tren_duong(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Báo cáo tổng quan số tiền hàng nằm trên đường và tiến độ các chuyến."""
    return DeliveryTripService.get_in_transit_summary(db=db, warehouse_id=warehouse_id)


@router.get(
    "/in-transit-summary",
    response_model=InTransitSummaryResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def bao_cao_hang_tren_duong_alias(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Alias cho endpoint báo cáo tổng quan tiền hàng trên đường."""
    return DeliveryTripService.get_in_transit_summary(db=db, warehouse_id=warehouse_id)


# ==============================================================================
# 2. GỢI Ý GOM CHUYẾN THEO KHU VỰC & PHIẾU CHỜ ĐIỀU PHỐI (S6-06)
# ==============================================================================
@router.get(
    "/grouping-suggestions",
    response_model=List[AreaGroupingSuggestion],
    status_code=status.HTTP_200_OK,
    summary="Gợi ý đề xuất gom phiếu xuất kho theo cụm khu vực (S6-06)",
)
def lay_de_xuat_gom_chuyen_theo_khu_vuc(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho hàng"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Nhận diện địa chỉ và gom cụm phiếu xuất theo khu vực địa lý."""
    return DeliveryTripService.get_grouping_suggestions(
        db=db,
        warehouse_id=warehouse_id,
    )


@router.get(
    "/suggestions/grouping",
    response_model=List[AreaGroupingSuggestion],
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def lay_de_xuat_gom_chuyen_theo_khu_vuc_alias(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho hàng"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
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
    """Danh sách chi tiết các phiếu xuất kho CONFIRMED chưa gán chuyến."""
    return DeliveryTripService.get_pending_dispatches(
        db=db,
        warehouse_id=warehouse_id,
        area=area,
    )


# ==============================================================================
# 3. TẠO CHUYẾN GIAO HÀNG (S6-06 / S6-07)
# ==============================================================================
@router.post(
    "",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo chuyến giao hàng mới gom nhiều phiếu xuất",
)
def tao_chuyen_giao_hang(
    payload: DeliveryTripCreate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Tạo chuyến giao hàng mới gom nhiều phiếu xuất kho CONFIRMED."""
    return DeliveryTripService.create_trip(
        db=db,
        payload=payload,
        current_user=current_user,
    )


# ==============================================================================
# 4. DANH SÁCH CHUYẾN GIAO HÀNG (PHÂN TRANG & THỐNG KÊ)
# ==============================================================================
@router.get(
    "",
    response_model=DeliveryTripListResponse,
    status_code=status.HTTP_200_OK,
    summary="Danh sách chuyến giao đang chạy kèm tiến độ và cảnh báo trễ hạn",
)
def danh_sach_chuyen_giao(
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái"),
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    is_delayed: Optional[bool] = Query(None, description="Lọc chuyến bị trễ hạn dự kiến"),
    search: Optional[str] = Query(None, description="Tìm theo mã chuyến, tài xế, biển số xe"),
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(50, ge=1, le=100, description="Số bản ghi tối đa"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Tra cứu danh sách chuyến giao hàng."""
    items, total, total_val, active_count, delayed_count = DeliveryTripService.list_delivery_trips(
        db=db,
        status_filter=status_filter,
        warehouse_id=warehouse_id,
        is_delayed=is_delayed,
        search=search,
        skip=skip,
        limit=limit,
    )
    return DeliveryTripListResponse(
        items=items,
        total=total,
        total_in_transit_value=total_val,
        active_trips_count=active_count,
        delayed_trips_count=delayed_count,
    )


# ==============================================================================
# 5. CHI TIẾT & ĐIỀU PHỐI TỪNG CHUYẾN
# ==============================================================================
@router.get(
    "/{trip_id}/manifest",
    response_model=DeliveryManifestResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy danh sách điểm giao của chuyến kèm địa chỉ và SĐT để in ấn (S6-06)",
)
def lay_danh_sach_diem_giao_in_an(
    trip_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """In lệnh điều phối cho tài xế mang theo."""
    return DeliveryTripService.get_manifest(
        db=db,
        trip_id=trip_id,
    )


@router.put(
    "/{trip_id}/assign-driver-vehicle",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Gán, đổi hoặc bỏ gán tài xế và phương tiện cho chuyến giao (S6-06)",
)
def cap_nhat_tai_xe_phuong_tien(
    trip_id: str,
    payload: TripDriverVehicleAssign,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Gán hoặc đổi tài xế, xe cho chuyến."""
    return DeliveryTripService.assign_driver_vehicle(
        db=db,
        trip_id=trip_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/{trip_id}/start",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Xuất bến bắt đầu chuyến giao hàng (chuyển sang IN_TRANSIT)",
)
def xuat_ben_chuyen_giao_hang(
    trip_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Khởi động chuyến giao hàng."""
    return DeliveryTripService.start_trip(
        db=db,
        trip_id=trip_id,
        current_user=current_user,
    )


@router.post(
    "/{trip_id}/points/{point_id}/result",
    response_model=DeliveryTripPointResponse,
    status_code=status.HTTP_200_OK,
    summary="Cập nhật kết quả giao từng điểm (S6-07)",
)
def cap_nhat_ket_qua_diem_giao(
    trip_id: str,
    point_id: int,
    payload: PointDeliveryResultRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật kết quả giao hàng tại một điểm (DELIVERED, PARTIAL, FAILED)."""
    return DeliveryTripService.record_point_delivery_result(
        db=db,
        trip_id=trip_id,
        point_id=point_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/{trip_id}/points/{point_id}/delivery-result",
    response_model=DeliveryTripPointResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
def cap_nhat_ket_qua_diem_giao_alias(
    trip_id: str,
    point_id: int,
    payload: PointDeliveryResultRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    return DeliveryTripService.record_point_delivery_result(
        db=db,
        trip_id=trip_id,
        point_id=point_id,
        payload=payload,
        current_user=current_user,
    )


@router.get(
    "/{trip_id}",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết chuyến giao hàng kèm toàn bộ điểm dừng và hàng hóa",
)
def chi_tiet_chuyen_giao(
    trip_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Chi tiết chuyến giao hàng."""
    return DeliveryTripService.get_delivery_trip_by_id(db=db, trip_id=trip_id)


# ==============================================================================
# 6. HỦY CHUYẾN / CHẶN SỬA & XÓA KHI ĐÃ XUẤT BẾN
# ==============================================================================
@router.put(
    "/{trip_id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối chỉnh sửa trực tiếp chuyến giao hàng",
)
def sua_chuyen_giao_bi_tu_choi(trip_id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Chuyến giao hàng đã xuất bến không được phép chỉnh sửa trực tiếp để bảo vệ tính toàn vẹn hàng trên đường.",
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
    """
    Hủy chuyến giao hàng khi chưa xuất bến (PLANNED / READY).
    Nếu chuyến đã xuất bến (IN_TRANSIT / COMPLETED), từ chối với mã 405 Method Not Allowed.
    """
    return DeliveryTripService.cancel_trip(
        db=db,
        trip_id=trip_id,
        current_user=current_user,
    )
