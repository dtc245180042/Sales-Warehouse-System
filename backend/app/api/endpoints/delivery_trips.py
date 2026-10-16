from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.delivery_trip import (
    DeliveryTripCreate,
    DeliveryTripResponse,
    DeliveryTripListResponse,
    DeliveryTripPointResponse,
    PointDeliveryResultRequest,
    InTransitSummaryResponse,
)
from app.services.delivery_trip_service import DeliveryTripService

router = APIRouter(prefix="/delivery-trips", tags=["Theo dõi Chuyến giao & Hàng trên đường (S6-07)"])


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
    """
    Trả về số liệu tổng quan tiền hàng đang nằm trên đường,
    số chuyến đang chạy, số chuyến trễ hạn và phân bổ theo từng kho.
    """
    return DeliveryTripService.get_in_transit_summary(db=db, warehouse_id=warehouse_id)


@router.post(
    "",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo và khởi động chuyến giao hàng gom từ các phiếu xuất kho (S6-07)",
)
def tao_chuyen_giao_hang(
    data: DeliveryTripCreate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tạo chuyến giao hàng mới gom từ danh sách phiếu xuất kho đã xác nhận (CONFIRMED):
    - Tự động sinh mã chuyến TRIP-YYYYMMDD-XXXX.
    - Khởi tạo danh sách các điểm giao tương ứng với phiếu xuất.
    - Tính toán tổng tiền hàng trên đường ban đầu.
    - Thiết lập thời gian dự kiến hoàn tất và bắt đầu theo dõi tiến độ.
    """
    return DeliveryTripService.create_delivery_trip(
        db=db,
        payload=data,
        current_user=current_user,
    )


@router.get(
    "",
    response_model=DeliveryTripListResponse,
    status_code=status.HTTP_200_OK,
    summary="Danh sách chuyến giao đang chạy kèm tiến độ và cảnh báo trễ hạn (S6-07)",
)
def danh_sach_chuyen_giao(
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái (IN_TRANSIT, COMPLETED, all)"),
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    is_delayed: Optional[bool] = Query(None, description="Lọc chuyến bị trễ hạn dự kiến"),
    search: Optional[str] = Query(None, description="Tìm theo mã chuyến, tài xế, biển số xe"),
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(50, ge=1, le=100, description="Số bản ghi tối đa"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu danh sách chuyến giao hàng:
    - Hiển thị tiến độ: số điểm đã giao, số điểm còn lại.
    - Hiển thị tổng tiền hàng đang nằm trên đường.
    - Cảnh báo trễ hạn nếu vượt quá thời gian dự kiến.
    """
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


@router.get(
    "/{id}",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết chuyến giao hàng kèm toàn bộ điểm dừng và hàng hóa (S6-07)",
)
def chi_tiet_chuyen_giao(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu chi tiết chuyến giao hàng:
    - Tiến độ giao hàng theo từng điểm.
    - Danh sách hàng hóa chi tiết tại mỗi điểm.
    - Thời gian dự kiến và cảnh báo quá hạn.
    """
    return DeliveryTripService.get_delivery_trip_by_id(db=db, trip_id=id)


@router.post(
    "/{trip_id}/points/{point_id}/result",
    response_model=DeliveryTripPointResponse,
    status_code=status.HTTP_200_OK,
    summary="Cập nhật kết quả giao từng điểm và đồng bộ số điểm còn lại của chuyến (S6-07)",
)
def cap_nhat_ket_qua_diem_giao(
    trip_id: str,
    point_id: int,
    data: PointDeliveryResultRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Cập nhật kết quả giao tại một điểm trong chuyến:
    - Trạng thái: DELIVERED (Đã giao), PARTIAL (Giao một phần), FAILED (Thất bại).
    - QUY TẮC CỐT LÕI (S6-07): Hàng chưa giao được VẪN THUỘC TRÁCH NHIỆM CỦA CHUYẾN, KHÔNG tự động trả về kho.
    - Tự động đồng bộ số điểm còn lại và tổng tiền hàng trên đường của chuyến.
    """
    return DeliveryTripService.record_point_delivery_result(
        db=db,
        trip_id=trip_id,
        point_id=point_id,
        payload=data,
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
    data: PointDeliveryResultRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Alias cho endpoint cập nhật kết quả giao điểm."""
    return DeliveryTripService.record_point_delivery_result(
        db=db,
        trip_id=trip_id,
        point_id=point_id,
        payload=data,
        current_user=current_user,
    )


@router.post(
    "/{id}/start",
    response_model=DeliveryTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Khởi động chuyến giao hàng (chuyển sang IN_TRANSIT)",
)
def khoi_dong_chuyen_giao(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Bắt đầu chạy chuyến giao hàng."""
    return DeliveryTripService.start_delivery_trip(db=db, trip_id=id, current_user=current_user)


# ==============================================================================
# CHẶN SỬA VÀ XOÁ CHUYẾN GIAO HÀNG ĐỂ BẢO VỆ TOÀN VẸN DỮ LIỆU
# ==============================================================================
@router.put(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối chỉnh sửa trực tiếp chuyến giao hàng",
)
def sua_chuyen_giao_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Chuyến giao hàng đã xuất bến không được phép chỉnh sửa trực tiếp để bảo vệ tính toàn vẹn hàng trên đường.",
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối xoá chuyến giao hàng",
)
def xoa_chuyen_giao_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Chuyến giao hàng một khi đã xuất bến không được phép xóa.",
    )

