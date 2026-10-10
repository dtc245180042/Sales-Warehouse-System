from typing import List, Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.customer import Customer
from app.models.customer_lock import CustomerLockProfile, CustomerLockHistory
from app.schemas.customer_lock import (
    CustomerLockStatusResponse,
    CustomerLockHistoryItem,
)


def get_lock_profile(customer_id: str, db: Session) -> Optional[CustomerLockProfile]:
    return db.query(CustomerLockProfile).filter(
        CustomerLockProfile.customer_id == customer_id
    ).first()


def get_or_create_lock_profile(customer_id: str, db: Session) -> CustomerLockProfile:
    profile = get_lock_profile(customer_id, db)
    if not profile:
        profile = CustomerLockProfile(
            customer_id=customer_id,
            is_locked=False,
            lock_reason=None,
        )
        db.add(profile)
        db.flush()
    return profile


def get_customer_or_404(customer_id: str, db: Session) -> Customer:
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý/khách hàng với mã '{customer_id}'."
        )
    return customer


def get_customer_lock_status(customer_id: str, db: Session) -> CustomerLockStatusResponse:
    customer = get_customer_or_404(customer_id, db)
    profile = get_lock_profile(customer.id, db)

    is_locked = bool(profile and profile.is_locked) or (customer.status == "locked")
    reason = profile.lock_reason if (profile and profile.is_locked) else None
    locked_at = profile.locked_at if (profile and profile.is_locked) else None
    locked_by = profile.locked_by if (profile and profile.is_locked) else None

    warning = None
    if is_locked:
        warning = f"Đại lý '{customer.name}' đang bị khoá giao dịch. Lý do: {reason or 'Chưa cập nhật lý do'}."

    return CustomerLockStatusResponse(
        customer_id=customer.id,
        customer_name=customer.name,
        is_locked=is_locked,
        status="locked" if is_locked else customer.status,
        lock_reason=reason,
        locked_at=locked_at,
        locked_by=locked_by,
        warning_message=warning,
    )


def lock_customer(
    customer_id: str,
    reason: str,
    actor_username: str,
    actor_name: Optional[str],
    actor_role: Optional[str],
    db: Session,
) -> CustomerLockStatusResponse:
    cleaned_reason = reason.strip() if reason else ""
    if len(cleaned_reason) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc nhập lý do khoá giao dịch đại lý (tối thiểu 3 ký tự)."
        )

    customer = get_customer_or_404(customer_id, db)
    profile = get_or_create_lock_profile(customer.id, db)

    now = datetime.now(timezone.utc)
    display_actor = actor_name or actor_username or "Kế toán công nợ"

    profile.is_locked = True
    profile.lock_reason = cleaned_reason
    profile.locked_at = now
    profile.locked_by = display_actor

    # Đồng bộ trạng thái trên bảng Customer
    customer.status = "locked"

    # Ghi log lịch sử kiểm soát và truy vết (SC-228 Subtask 2)
    history = CustomerLockHistory(
        customer_id=customer.id,
        action="lock",
        reason=cleaned_reason,
        actor_username=actor_username,
        actor_name=display_actor,
        actor_role=actor_role or "Accountant",
        created_at=now,
    )
    db.add(history)
    db.commit()
    db.refresh(profile)
    db.refresh(customer)

    return get_customer_lock_status(customer.id, db)


def unlock_customer(
    customer_id: str,
    reason: Optional[str],
    actor_username: str,
    actor_name: Optional[str],
    actor_role: Optional[str],
    db: Session,
) -> CustomerLockStatusResponse:
    customer = get_customer_or_404(customer_id, db)
    profile = get_or_create_lock_profile(customer.id, db)

    now = datetime.now(timezone.utc)
    display_actor = actor_name or actor_username or "Kế toán công nợ"
    unlock_reason = (reason.strip() if reason else None) or "Mở lại giao dịch cho đại lý"

    profile.is_locked = False
    profile.unlocked_at = now
    profile.unlocked_by = display_actor
    profile.unlock_reason = unlock_reason

    # Khôi phục trạng thái active trên bảng Customer
    customer.status = "active"

    # Ghi log lịch sử
    history = CustomerLockHistory(
        customer_id=customer.id,
        action="unlock",
        reason=unlock_reason,
        actor_username=actor_username,
        actor_name=display_actor,
        actor_role=actor_role or "Accountant",
        created_at=now,
    )
    db.add(history)
    db.commit()
    db.refresh(profile)
    db.refresh(customer)

    return get_customer_lock_status(customer.id, db)


def get_customer_lock_history(customer_id: str, db: Session) -> List[CustomerLockHistoryItem]:
    customer = get_customer_or_404(customer_id, db)
    records = db.query(CustomerLockHistory).filter(
        CustomerLockHistory.customer_id == customer.id
    ).order_by(CustomerLockHistory.id.desc()).all()

    return [
        CustomerLockHistoryItem(
            id=r.id,
            customer_id=r.customer_id,
            action=r.action,
            reason=r.reason,
            actor_username=r.actor_username,
            actor_name=r.actor_name,
            actor_role=r.actor_role,
            created_at=r.created_at,
        )
        for r in records
    ]


def check_customer_order_allowed(customer_id: str, db: Session) -> Tuple[bool, Optional[str]]:
    """
    Kiểm tra tập trung cho toàn bộ kênh đặt hàng (API, Cổng Portal, POS).
    Đại lý bị khoá không được tạo đơn mới (SC-228 Subtask 3 & 8).
    """
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()

    if not customer:
        return True, None  # Nếu không tìm thấy khách, để tầng order xử lý 404

    profile = get_lock_profile(customer.id, db)
    if (profile and profile.is_locked) or (customer.status == "locked"):
        reason = (profile.lock_reason if profile else None) or "Mất khả năng thanh toán/Quá hạn nợ"
        return False, f"Đại lý '{customer.name}' ({customer.code}) đang bị khoá giao dịch (Lý do: {reason}). Không thể tạo đơn mới."

    return True, None
