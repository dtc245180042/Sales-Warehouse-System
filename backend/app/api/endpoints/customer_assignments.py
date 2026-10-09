from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro
from app.models.auth import User, UserRole
from app.schemas.customer_assignment import (
    CustomerAssignRequest,
    CustomerUnassignRequest,
    BulkTransferRequest,
    CustomerAssignmentBrief,
    CustomerAssignmentHistoryResponse,
    SalesRepBrief,
)
from app.services import customer_assignment_service

router = APIRouter(tags=["Phân công & Chuyển giao đại lý"])


@router.get(
    "/sales-reps",
    response_model=List[SalesRepBrief],
    summary="Danh sách nhân viên kinh doanh đang hoạt động"
)
def get_sales_reps(
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Lấy danh sách nhân viên kinh doanh (Sales Rep) đang hoạt động kèm số đại lý đang phụ trách."""
    return customer_assignment_service.get_active_sales_reps(db=db)


# LƯU Ý: Khai báo endpoint bulk-transfer TRƯỚC /customers/{customer_id}/... để tránh xung đột routing
@router.post(
    "/customers/assignments/bulk-transfer",
    summary="Chuyển giao địa bàn và danh sách đại lý hàng loạt"
)
def bulk_transfer_assignments(
    payload: BulkTransferRequest,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN, UserRole.SALES_MANAGER)),
):
    """
    Chuyển giao hàng loạt đại lý giữa 2 nhân viên kinh doanh khi nhân viên nghỉ việc hoặc điều chuyển địa bàn.
    - Chỉ Quản lý kinh doanh (Sales Manager) và Quản trị viên (Admin) mới có quyền thực hiện.
    - Bắt buộc kiểm tra tính hợp lệ, khóa dòng đồng thời (with_for_update) và ghi nhận kiểm toán nguyên tử.
    """
    return customer_assignment_service.bulk_transfer_assignments(
        db=db,
        from_staff_id=payload.from_staff_id,
        to_staff_id=payload.to_staff_id,
        transfer_all=payload.transfer_all,
        customer_ids=payload.customer_ids,
        reason=payload.reason,
        performed_by_user=current_user,
    )


@router.get(
    "/customers/assignment-history/logs",
    response_model=List[CustomerAssignmentHistoryResponse],
    summary="Tra cứu lịch sử phân công và chuyển giao toàn hệ thống"
)
def get_assignment_history_logs(
    batch_id: Optional[str] = Query(None, description="Lọc theo mã đợt chuyển giao"),
    staff_id: Optional[str] = Query(None, description="Lọc theo mã nhân viên liên quan"),
    limit: int = Query(100, ge=1, le=500, description="Số lượng bản ghi tối đa"),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN, UserRole.SALES_MANAGER, UserRole.ACCOUNTANT)),
):
    """Tra cứu nhật ký phân công & chuyển giao đại lý (dành cho cấp Quản lý)."""
    return customer_assignment_service.get_all_histories(
        db=db,
        batch_id=batch_id,
        staff_id=staff_id,
        limit=limit,
    )


@router.get(
    "/customers/{customer_id}/assignment",
    response_model=CustomerAssignmentBrief,
    summary="Lấy thông tin người phụ trách hiện tại của đại lý"
)
def get_customer_assignment(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Xem thông tin nhân viên kinh doanh đang trực tiếp phụ trách đại lý."""
    customer_assignment_service.check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    return customer_assignment_service.get_assignment_brief(db=db, customer_id=customer_id)


@router.post(
    "/customers/{customer_id}/assign",
    response_model=CustomerAssignmentBrief,
    summary="Phân công hoặc đổi nhân viên phụ trách đại lý"
)
def assign_customer(
    customer_id: str,
    payload: CustomerAssignRequest,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN, UserRole.SALES_MANAGER)),
):
    """Gán hoặc đổi người phụ trách cho đại lý đơn lẻ. Bắt buộc nhập lý do giải trình."""
    return customer_assignment_service.assign_single_customer(
        db=db,
        customer_id=customer_id,
        assigned_staff_id=payload.assigned_staff_id,
        reason=payload.reason,
        performed_by_user=current_user,
    )


@router.post(
    "/customers/{customer_id}/unassign",
    response_model=CustomerAssignmentBrief,
    summary="Hủy phân công người phụ trách đại lý"
)
def unassign_customer(
    customer_id: str,
    payload: CustomerUnassignRequest,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN, UserRole.SALES_MANAGER)),
):
    """Hủy phân công người phụ trách đưa đại lý về trạng thái chưa phân công."""
    return customer_assignment_service.unassign_single_customer(
        db=db,
        customer_id=customer_id,
        reason=payload.reason,
        performed_by_user=current_user,
    )


@router.get(
    "/customers/{customer_id}/assignment-history",
    response_model=List[CustomerAssignmentHistoryResponse],
    summary="Lấy lịch sử phân công và chuyển giao của đại lý"
)
def get_customer_assignment_history(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Xem dòng thời gian các lần thay đổi người phụ trách của một đại lý."""
    customer_assignment_service.check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    return customer_assignment_service.get_customer_history(db=db, customer_id=customer_id)
