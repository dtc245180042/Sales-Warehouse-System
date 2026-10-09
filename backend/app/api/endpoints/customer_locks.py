from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro
from app.models.auth import User, UserRole
from app.schemas.customer_lock import (
    CustomerLockRequest,
    CustomerUnlockRequest,
    CustomerLockStatusResponse,
    CustomerLockHistoryItem,
)
from app.services import customer_lock_service

# Auto-Discovery Router theo quy tắc AGENTS.md
router = APIRouter(prefix="/customer-locks", tags=["Khoá & Mở giao dịch đại lý (SC-228)"])


@router.get(
    "/{customer_id}/status",
    response_model=CustomerLockStatusResponse,
    summary="Tra cứu trạng thái khoá giao dịch của đại lý",
)
def get_lock_status(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
):
    """
    Tra cứu trạng thái khoá giao dịch của một đại lý để hệ thống đặt hàng và
    các màn hình hiển thị chính xác (SC-228 Subtask 1).
    """
    return customer_lock_service.get_customer_lock_status(customer_id=customer_id, db=db)


@router.post(
    "/{customer_id}/lock",
    response_model=CustomerLockStatusResponse,
    summary="Khoá giao dịch đại lý (Bắt buộc nhập lý do)",
)
def lock_customer_transaction(
    customer_id: str,
    payload: CustomerLockRequest,
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ACCOUNTANT, UserRole.ADMIN)),
    db: Session = Depends(lay_phien_db),
):
    """
    Dành cho Kế toán công nợ / Quản trị viên khoá giao dịch một đại lý.
    Bắt buộc nhập lý do khoá và lưu vết lịch sử (SC-228 Subtask 1, 2).
    """
    return customer_lock_service.lock_customer(
        customer_id=customer_id,
        reason=payload.reason,
        actor_username=current_user.username,
        actor_name=current_user.full_name or current_user.username,
        actor_role=current_user.role,
        db=db,
    )


@router.post(
    "/{customer_id}/unlock",
    response_model=CustomerLockStatusResponse,
    summary="Mở khoá giao dịch đại lý",
)
def unlock_customer_transaction(
    customer_id: str,
    payload: Optional[CustomerUnlockRequest] = None,
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ACCOUNTANT, UserRole.ADMIN)),
    db: Session = Depends(lay_phien_db),
):
    """
    Dành cho Kế toán công nợ / Quản trị viên mở lại giao dịch cho đại lý (SC-228 Subtask 1).
    """
    reason = payload.reason if payload else None
    return customer_lock_service.unlock_customer(
        customer_id=customer_id,
        reason=reason,
        actor_username=current_user.username,
        actor_name=current_user.full_name or current_user.username,
        actor_role=current_user.role,
        db=db,
    )


@router.get(
    "/{customer_id}/history",
    response_model=List[CustomerLockHistoryItem],
    summary="Lấy lịch sử các lần khoá / mở giao dịch đại lý",
)
def get_lock_history(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
):
    """
    Xem toàn bộ lịch sử các lần khoá và mở khoá để phục vụ kiểm soát và truy vết (SC-228 Subtask 2).
    """
    return customer_lock_service.get_customer_lock_history(customer_id=customer_id, db=db)
