from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.return_order import (
    ReturnOrderCreateRequest,
    ReturnConfirmRequest,
    ReturnCancelRequest,
    ReturnOrderResponse,
)
from app.services.return_service import ReturnService

router = APIRouter(prefix="/returns", tags=["Phiếu trả hàng & Nhập kho"])


@router.post(
    "",
    response_model=ReturnOrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Lập phiếu yêu cầu trả hàng từ đại lý",
)
def lap_yeu_cau_tra_hang(
    data: ReturnOrderCreateRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Bước 1: Tiếp nhận yêu cầu trả hàng từ đại lý:
    - Quyền: Sales Rep, Sales Manager, Admin (Customer chỉ lập cho hoá đơn của mình).
    - Kiểm tra hoá đơn gốc, chọn dòng hàng và số lượng trả, bắt buộc chọn lý do trả (AC-1).
    - Lý do 'OTHER' bắt buộc có ghi chú (notes).
    - Hạn mức trả tính theo từng lô: Không vượt số lượng đã xuất trừ phần đã trả trước đó (AC-2).
    - SKU quản lý lô bắt buộc có lot_id thuộc các lô đã xuất; SKU không quản lý lô cấm truyền lot_id.
    - Một phiếu trả chỉ lập cho một hoá đơn gốc.
    - Lưu ở trạng thái REQUESTED. TUYỆT ĐỐI CHƯA CỘNG TỒN VÀ CHƯA GHI SỔ CÁI KHO.
    """
    return ReturnService.create_return_request(
        db=db,
        payload=data,
        current_user=current_user,
    )


@router.post(
    "/{id}/confirm",
    response_model=ReturnOrderResponse,
    status_code=status.HTTP_200_OK,
    summary="Quản lý kho xác nhận nhận hàng và cập nhật tồn kho",
)
def xac_nhan_nhan_hang_tra(
    id: str,
    data: ReturnConfirmRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Bước 2: Quản lý kho kiểm đếm và xác nhận nhận hàng vào kho:
    - Quyền: CHỈ Quản lý kho (WH Manager) hoặc Admin. Thủ kho thường (Warehouse) bị từ chối 403 (AC-4).
    - UPDATE nguyên tử kiểm tra rowcount chống xác nhận hai lần.
    - Hàng tốt (GOOD): Nhập lại đúng kho xuất gốc (origin_warehouse_id).
    - Hàng hỏng (DAMAGED): Nhập vào kho hàng lỗi (DAMAGED_WAREHOUSE_ID = 99), KHÔNG tăng tồn bán khả dụng (Product.stock).
    - Giữ thông tin lô và cập nhật ProductLot.remaining_quantity đúng quy định.
    - Ghi sổ cái kho bằng record_stock_movement duy nhất với loại biến động IN_RETURN.
    """
    return ReturnService.confirm_return_receipt(
        db=db,
        return_id=id,
        payload=data,
        current_user=current_user,
    )


@router.post(
    "/{id}/cancel",
    response_model=ReturnOrderResponse,
    status_code=status.HTTP_200_OK,
    summary="Hủy phiếu yêu cầu trả hàng",
)
def huy_yeu_cau_tra_hang(
    id: str,
    data: ReturnCancelRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Hủy yêu cầu trả hàng đang ở trạng thái REQUESTED:
    - Bắt buộc có lý do hủy (cancel_reason).
    - Hủy phiếu tự động giải phóng hạn mức trả hàng cho đại lý.
    """
    return ReturnService.cancel_return_order(
        db=db,
        return_id=id,
        payload=data,
        current_user=current_user,
    )


@router.get(
    "",
    response_model=List[ReturnOrderResponse],
    status_code=status.HTTP_200_OK,
    summary="Danh sách phiếu trả hàng có bộ lọc và Customer Scope",
)
def danh_sach_phieu_tra(
    customer_id: Optional[str] = Query(None, description="Lọc theo ID đại lý"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái (REQUESTED, CONFIRMED, CANCELLED)"),
    from_date: Optional[datetime] = Query(None, description="Từ ngày lập"),
    to_date: Optional[datetime] = Query(None, description="Đến ngày lập"),
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua"),
    limit: int = Query(50, ge=1, le=100, description="Số bản ghi tối đa"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu danh sách phiếu trả hàng:
    - Bàn giao dữ liệu cho Trung ráp giao diện Trả hàng.
    - Phân quyền Customer Scope: Đại lý chỉ xem được các phiếu trả của chính mình.
    """
    items, _ = ReturnService.list_return_orders(
        db=db,
        current_user=current_user,
        customer_id=customer_id,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
        skip=skip,
        limit=limit,
    )
    return items


@router.get(
    "/{id}",
    response_model=ReturnOrderResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết phiếu trả hàng",
)
def chi_tiet_phieu_tra(
    id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xem chi tiết phiếu trả hàng kèm danh sách dòng hàng trả (chống IDOR)."""
    return ReturnService.get_return_order_by_id(db=db, return_id=id, current_user=current_user)


# ==============================================================================
# CHẶN SỬA VÀ XOÁ PHIẾU TRẢ HÀNG Ở MỌI TRẠNG THÁI (YÊU CẦU 5)
# ==============================================================================
@router.put(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối chỉnh sửa phiếu trả hàng (Bất biến)",
)
def sua_phieu_tra_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Phiếu trả hàng không được phép chỉnh sửa qua PUT. Chỉ được lập yêu cầu hoặc hủy qua workflow.",
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
    summary="Từ chối xóa phiếu trả hàng (Bất biến)",
)
def xoa_phieu_tra_bi_tu_choi(id: str):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Phiếu trả hàng không được phép xóa qua DELETE. Chỉ được hủy yêu cầu qua POST /returns/{id}/cancel.",
    )
