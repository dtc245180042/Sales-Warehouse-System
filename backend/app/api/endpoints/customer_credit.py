from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon, lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.customer_credit_profile import (
    CreditProfileUpdate,
    CreditProfileResponse,
    CreditHistoryResponse,
    CreditCheckRequest,
    CreditCheckResponse,
)
from app.services import customer_credit_service
from app.services.customer_assignment_service import check_sales_rep_customer_scope

router = APIRouter(tags=["Hạn mức công nợ đại lý"])


@router.get(
    "/customers/{customer_id}/credit-profile",
    response_model=CreditProfileResponse,
    summary="Lấy thông tin hạn mức công nợ của đại lý"
)
def get_customer_credit_profile(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Xem hạn mức công nợ tối đa, số ngày nợ tối đa và dư nợ hiện tại của đại lý (S4-02, SCRUM-499)."""
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    profile = customer_credit_service.get_or_create_credit_profile(db=db, customer_id=customer_id)
    # Tự động đồng bộ dư nợ thực tế
    actual_debt = customer_credit_service.calculate_actual_customer_debt(db=db, customer_id=customer_id)
    if profile.current_debt != actual_debt:
        profile.current_debt = actual_debt
        db.commit()
        db.refresh(profile)

    # Đính kèm thông tin nợ quá hạn và trạng thái chặn nợ (S4-02)
    overdue_info = customer_credit_service.check_customer_overdue_debt(db=db, customer_id=customer_id)
    profile.has_overdue = overdue_info["has_overdue"]
    profile.overdue_days = overdue_info["overdue_days"]
    profile.overdue_order_code = overdue_info["overdue_order_code"]
    profile.is_blocked = overdue_info["is_blocked"]
    profile.block_reason = overdue_info["block_reason"]
    return profile


@router.get(
    "/customers/{customer_id}/credit-summary",
    response_model=CreditProfileResponse,
    summary="Lấy tóm tắt công nợ và hạn mức cho màn hình tạo đơn (SCRUM-499)"
)
def get_customer_credit_summary(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Cung cấp API lấy công nợ hiện tại, hạn mức và phần còn lại cho màn hình tạo đơn."""
    return get_customer_credit_profile(customer_id=customer_id, db=db, current_user=current_user)


@router.put(
    "/customers/{customer_id}/credit-profile",
    response_model=CreditProfileResponse,
    summary="Cập nhật hạn mức công nợ và số ngày nợ cho phép"
)
def update_customer_credit_profile(
    customer_id: str,
    data: CreditProfileUpdate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Điều chỉnh hạn mức nợ (VNĐ) và số ngày nợ tối đa.
    - Bắt buộc nhập lý do thay đổi.
    - Chỉ Kế toán công nợ và Quản lý kinh doanh mới có quyền thực hiện.
    """
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    return customer_credit_service.update_credit_profile(
        db=db,
        customer_id=customer_id,
        data=data,
        current_user=current_user,
    )


@router.get(
    "/customers/{customer_id}/credit-history",
    response_model=List[CreditHistoryResponse],
    summary="Xem lịch sử điều chỉnh hạn mức công nợ của đại lý"
)
def get_customer_credit_history(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy danh sách các lần thay đổi hạn mức công nợ kèm lý do giải trình và người thực hiện."""
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    return customer_credit_service.get_credit_history(db=db, customer_id=customer_id)


@router.post(
    "/customers/{customer_id}/check-credit",
    response_model=CreditCheckResponse,
    summary="Kiểm tra hạn mức công nợ trước khi xuất kho / tạo đơn"
)
def check_customer_credit(
    customer_id: str,
    data: CreditCheckRequest,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Kiểm tra xem đơn hàng có giá trị nợ tương ứng có đủ điều kiện xuất kho hay tạo đơn hay không (SCRUM-497)."""
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    if getattr(data, "context", None) == "order":
        return customer_credit_service.check_credit_for_order_placement(
            db=db,
            customer_id=customer_id,
            unpaid_amount=data.unpaid_amount,
            order_id=data.order_id,
        )
    return customer_credit_service.check_credit_for_dispatch(
        db=db,
        customer_id=customer_id,
        unpaid_amount=data.unpaid_amount,
        order_id=data.order_id,
    )
