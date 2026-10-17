import os
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.models.dispatch_delivery import DeliveryFailureReason
from app.schemas.dispatch_delivery import (
    DeliveryConfirmRequest,
    DeliveryFailedRequest,
    DispatchDeliveryResponse,
    UploadProofResponse,
)
from app.services.dispatch_delivery_service import (
    DispatchDeliveryService,
    PROOF_UPLOAD_DIR,
)

router = APIRouter(
    prefix="/dispatch-deliveries",
    tags=["Quản lý Xác nhận Giao hàng & POD (S6-08 - SC-259)"],
)


@router.get(
    "/failure-reasons",
    status_code=status.HTTP_200_OK,
    summary="Danh mục lý do giao hàng thất bại chuẩn hóa (S6-08)",
)
def danh_sach_ly_do_that_bai():
    """
    Trả về danh mục các lý do không giao được hàng để nhân viên kho lựa chọn.
    """
    return [{"code": reason.name, "label": reason.value} for reason in DeliveryFailureReason]


@router.post(
    "/upload-proof",
    response_model=UploadProofResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tải lên ảnh biên bản giao nhận có chữ ký (POD) (S6-08)",
)
async def tai_len_anh_chung_tu_pod(
    file: UploadFile = File(..., description="Tệp ảnh biên bản ký nhận (JPG, PNG, WEBP, PDF tối đa 5MB)"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Tải lên tệp biên bản/ảnh chụp chữ ký nhận hàng của khách/đại lý (POD).
    """
    file_bytes = await file.read()
    filename = file.filename or "proof.jpg"
    proof_url, saved_path, file_size = DispatchDeliveryService.save_proof_file(
        file_bytes=file_bytes,
        filename=filename,
        content_type=file.content_type,
    )
    return UploadProofResponse(
        proof_image_url=proof_url,
        original_filename=filename,
        file_size=file_size,
    )


@router.get(
    "/proof-file/{filename}",
    summary="Xem hoặc tải tệp biên bản chứng từ giao nhận POD",
)
def xem_file_chung_tu_pod(filename: str):
    """
    Truy xuất tệp ảnh/tệp PDF biên bản giao nhận phục vụ đối soát chứng từ.
    """
    safe_name = Path(filename).name
    file_path = PROOF_UPLOAD_DIR / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy tệp chứng từ '{safe_name}'.",
        )

    # Đoán content type
    ext = file_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post(
    "/{dispatch_id}/confirm",
    response_model=DispatchDeliveryResponse,
    status_code=status.HTTP_200_OK,
    summary="Xác nhận giao hàng thành công kèm ảnh chứng từ có chữ ký (S6-08)",
)
def xac_nhan_giao_hang_thanh_cong(
    dispatch_id: str,
    payload: DeliveryConfirmRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xác nhận giao hàng thành công:
    - Ghi nhận họ tên người nhận, thời điểm giao thực tế, ảnh biên bản có chữ ký (POD).
    - Cập nhật trạng thái phiếu xuất sang DELIVERED.
    - Ghi nhận số lượng thực giao (delivered_quantity).
    - Kích hoạt điều kiện để Sprint 7 phát hành hóa đơn.
    """
    return DispatchDeliveryService.confirm_delivery_success(
        db=db,
        dispatch_id=dispatch_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/{dispatch_id}/fail",
    response_model=DispatchDeliveryResponse,
    status_code=status.HTTP_200_OK,
    summary="Báo giao hàng thất bại, lưu lý do và tự động hoàn hàng về kho (S6-08)",
)
def bao_giao_hang_that_bai(
    dispatch_id: str,
    payload: DeliveryFailedRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xử lý giao hàng không thành công:
    - Bắt buộc chọn hoặc ghi nhận lý do giao thất bại.
    - Cập nhật trạng thái phiếu xuất và đơn hàng sang DELIVERY_FAILED.
    - Tự động hoàn trả 100% số lượng xuất về lại kho (IN_RETURN) và khôi phục tồn lô.
    - Tuyệt đối chặn phát hành hóa đơn ở Sprint 7.
    """
    return DispatchDeliveryService.record_delivery_failure(
        db=db,
        dispatch_id=dispatch_id,
        payload=payload,
        current_user=current_user,
    )


@router.get(
    "/{dispatch_id}",
    response_model=DispatchDeliveryResponse,
    status_code=status.HTTP_200_OK,
    summary="Chi tiết xác nhận giao hàng và thông tin chứng từ POD",
)
def chi_tiet_xac_nhan_giao_hang(
    dispatch_id: str,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu thông tin xác nhận giao hàng hoặc lý do giao thất bại của phiếu xuất kho.
    """
    delivery = DispatchDeliveryService.get_delivery_by_dispatch_id(db=db, dispatch_id=dispatch_id)
    if not delivery:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phiếu xuất kho '{dispatch_id}' chưa có thông tin xác nhận giao nhận.",
        )
    return delivery
