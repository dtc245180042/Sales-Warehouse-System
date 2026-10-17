import os
import hashlib
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, Query, Path, UploadFile, File, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.services.route_cash_collection_service import RouteCashCollectionService
from app.schemas.route_cash_collection import (
    RouteCashCollectionCreate,
    RouteCashCollectionUpdate,
    RemittanceConfirmRequest,
    CollectionAdjustmentRequest,
    RouteCashCollectionResponse,
    DailyReconciliationSummary,
)

router = APIRouter(
    prefix="/route-collections",
    tags=["Thu Tiền Theo Tuyến (S7-05 / SC-263)"],
)


@router.post(
    "",
    response_model=RouteCashCollectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ghi nhận khoản thu ngay tại cửa hàng kèm ảnh biên lai (Subtask 16)",
)
def ghi_nhan_khoan_thu_theo_tuyen(
    payload: RouteCashCollectionCreate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Ghi nhận một khoản thu ngay khi phát sinh tại cửa hàng.
    Khoản thu được khởi tạo ở trạng thái Chờ nộp (PENDING_REMITTANCE).
    """
    return RouteCashCollectionService.record_collection(
        db=db,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/upload-receipt",
    status_code=status.HTTP_200_OK,
    summary="Tải lên tệp ảnh biên lai thu tiền",
)
async def upload_anh_bien_lai(
    file: UploadFile = File(...),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Tải lên ảnh chụp biên lai/phiếu thu tay và sinh mã băm SHA256 để kiểm tra tính toàn vẹn."""
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Định dạng file không hợp lệ. Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.",
        )

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng file vượt quá giới hạn tối đa (10MB).",
        )

    file_hash = hashlib.sha256(content).hexdigest()
    file_name = f"receipt_{file_hash[:16]}_{file.filename}"

    # Lưu vào thư mục uploads
    upload_dir = os.path.join("uploads", "receipts")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file_name)
    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "file_url": f"/uploads/receipts/{file_name}",
        "file_hash": file_hash,
        "file_name": file.filename,
        "file_size": len(content),
    }


@router.get(
    "/reconciliation/daily",
    response_model=List[DailyReconciliationSummary],
    status_code=status.HTTP_200_OK,
    summary="Bảng đối chiếu tiền thu theo từng nhân viên và từng ngày (Subtask 10 & 8)",
)
def bang_doi_chieu_tien_thu_hang_ngay(
    date_query: date = Query(..., alias="date", description="Ngày đối chiếu định dạng YYYY-MM-DD"),
    collector_id: Optional[int] = Query(None, description="Lọc theo ID nhân viên thu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tổng hợp các khoản thu, khoản đã nộp và khoản còn chờ nộp theo nhân viên, theo ngày.
    Tự động kiểm tra và cảnh báo chênh lệch: nộp thiếu, nộp thừa hoặc khoản thu treo quá 24h.
    """
    return RouteCashCollectionService.get_daily_reconciliation(
        db=db,
        target_date=date_query,
        collector_id=collector_id,
    )


@router.get(
    "",
    response_model=List[RouteCashCollectionResponse],
    status_code=status.HTTP_200_OK,
    summary="Danh sách các khoản thu theo tuyến",
)
def danh_sach_khoan_thu_theo_tuyen(
    collector_id: Optional[int] = Query(None, description="Lọc theo nhân viên thu"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái"),
    route_name: Optional[str] = Query(None, description="Lọc theo tuyến bán hàng"),
    customer_id: Optional[str] = Query(None, description="Lọc theo mã khách hàng"),
    date_from: Optional[date] = Query(None, description="Từ ngày"),
    date_to: Optional[date] = Query(None, description="Đến ngày"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Truy vấn danh sách khoản thu có bộ lọc và phân trang."""
    items, _ = RouteCashCollectionService.list_collections(
        db=db,
        collector_id=collector_id,
        status_filter=status_filter,
        route_name=route_name,
        customer_id=customer_id,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    return items


@router.get(
    "/{collection_id}",
    response_model=RouteCashCollectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Chi tiết một khoản thu theo tuyến",
)
def chi_tiet_khoan_thu(
    collection_id: str = Path(..., description="Mã khoản thu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xem thông tin chi tiết chứng từ thu tiền theo tuyến."""
    return RouteCashCollectionService.get_collection(db=db, collection_id=collection_id)


@router.put(
    "/{collection_id}/confirm-remittance",
    response_model=RouteCashCollectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Kế toán xác nhận nhận tiền nộp về công ty (Chờ nộp -> Đã nộp) (Subtask 12)",
)
def ke_toan_xac_nhan_nop_tien(
    payload: RemittanceConfirmRequest,
    collection_id: str = Path(..., description="Mã khoản thu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Cho phép kế toán xác nhận khoản tiền đã nộp về công ty.
    Cập nhật trạng thái chứng từ sang Đã nộp, lưu dấu vết người xác nhận và thời điểm xác nhận.
    Khóa sửa/xóa trực tiếp chứng từ.
    """
    return RouteCashCollectionService.confirm_remittance(
        db=db,
        collection_id=collection_id,
        payload=payload,
        current_user=current_user,
    )


@router.put(
    "/{collection_id}",
    response_model=RouteCashCollectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Cập nhật khoản thu khi còn ở trạng thái Chờ nộp (Subtask 14)",
)
def cap_nhat_khoan_thu(
    payload: RouteCashCollectionUpdate,
    collection_id: str = Path(..., description="Mã khoản thu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Chỉnh sửa khoản thu khi chưa được kế toán xác nhận nộp tiền.
    CHẶN sửa nếu khoản thu đã được xác nhận.
    """
    return RouteCashCollectionService.update_collection(
        db=db,
        collection_id=collection_id,
        payload=payload,
        current_user=current_user,
    )


@router.delete(
    "/{collection_id}",
    status_code=status.HTTP_200_OK,
    summary="Xóa khoản thu khi còn ở trạng thái Chờ nộp (Subtask 14)",
)
def xoa_khoan_thu(
    collection_id: str = Path(..., description="Mã khoản thu"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Xóa khoản thu khi còn ở trạng thái Chờ nộp.
    CHẶN xóa nếu khoản thu đã được xác nhận nộp tiền.
    """
    return RouteCashCollectionService.delete_collection(
        db=db,
        collection_id=collection_id,
        current_user=current_user,
    )


@router.post(
    "/{collection_id}/adjust",
    response_model=RouteCashCollectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Lập chứng từ điều chỉnh hoặc hủy bù có kiểm soát (Subtask 14)",
)
def lap_dieu_chinh_hoac_huy_bu(
    payload: CollectionAdjustmentRequest,
    collection_id: str = Path(..., description="Mã khoản thu gốc"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Quy trình điều chỉnh / hủy bù có kiểm soát cho khoản thu đã được kế toán xác nhận.
    Đảm bảo tính toàn vẹn dữ liệu đối chiếu, bắt buộc lưu lý do và dấu vết người điều chỉnh.
    """
    return RouteCashCollectionService.create_adjustment(
        db=db,
        collection_id=collection_id,
        payload=payload,
        current_user=current_user,
    )
