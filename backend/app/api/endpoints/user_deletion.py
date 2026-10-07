from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import yeu_cau_vai_tro
from app.models.auth import User, UserRole
from app.schemas.user_deletion import (
    UserCanDeleteResponse,
    UserDeleteResponse,
)
from app.services.user_deletion_service import UserDeletionService

# Router tự động nạp theo quy tắc Auto-Discovery (AGENTS.md)
router = APIRouter(prefix="/users", tags=["Users Management - Deletion"])


@router.get(
    "/{user_id}/can-delete",
    response_model=UserCanDeleteResponse,
    summary="Kiểm tra tài khoản người dùng có phụ thuộc dữ liệu nghiệp vụ để xóa được không",
)
def kiem_tra_co_the_xoa_nguoi_dung(
    user_id: int,
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    db: Session = Depends(lay_phien_db),
):
    """
    Kiểm tra xem một tài khoản có bị ràng buộc bởi các giao dịch nghiệp vụ (đơn hàng, phiếu kho, bảng giá) hay không.
    - Nếu KHÔNG phụ thuộc dữ liệu: Cho phép xóa vĩnh viễn (Hard delete).
    - Nếu CÓ phụ thuộc dữ liệu: Chặn xóa và gợi ý chuyển sang Khóa tài khoản (Lock account).
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng có ID {user_id}.",
        )

    # Ràng buộc không thể tự xóa chính mình
    if target_user.id == current_user.id:
        return UserCanDeleteResponse(
            user_id=target_user.id,
            username=target_user.username,
            full_name=target_user.full_name,
            can_delete=False,
            has_dependencies=False,
            dependencies={
                "orders_count": 0,
                "stock_receipts_count": 0,
                "price_lists_count": 0,
                "audit_logs_count": 0,
            },
            reason="Không thể tự xóa tài khoản của chính mình.",
            suggested_action="none",
        )

    # Ràng buộc không xóa admin gốc
    if target_user.username.lower() == "admin" or target_user.id == 1:
        return UserCanDeleteResponse(
            user_id=target_user.id,
            username=target_user.username,
            full_name=target_user.full_name,
            can_delete=False,
            has_dependencies=True,
            dependencies={
                "orders_count": 0,
                "stock_receipts_count": 0,
                "price_lists_count": 0,
                "audit_logs_count": 0,
            },
            reason="Tài khoản Quản trị viên gốc của hệ thống ('admin') không được phép xóa.",
            suggested_action="none",
        )

    return UserDeletionService.check_user_dependencies(db, target_user)


@router.delete(
    "/{user_id}",
    response_model=UserDeleteResponse,
    summary="Xóa vĩnh viễn tài khoản người dùng nếu không phụ thuộc dữ liệu",
)
def xoa_nguoi_dung(
    user_id: int,
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    db: Session = Depends(lay_phien_db),
):
    """
    Xóa vĩnh viễn người dùng nếu không có dữ liệu giao dịch phát sinh.
    Nếu có dữ liệu (đơn hàng, phiếu kho, bảng giá), hệ thống từ chối xóa và trả về HTTP 409 Conflict.
    """
    return UserDeletionService.delete_user_if_safe(db, user_id, current_user)
