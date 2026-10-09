import uuid
from datetime import datetime, timezone
from typing import List, Optional, Union, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_assignment import CustomerAssignment, CustomerAssignmentHistory
from app.schemas.customer_assignment import (
    CustomerAssignmentBrief,
    CustomerAssignmentHistoryResponse,
    SalesRepBrief,
)
from app.services.audit_service import log_activity


def ensure_seed_assignments(db: Session) -> None:
    """
    Khởi tạo dữ liệu phân công ban đầu cho toàn bộ khách hàng/đại lý hiện có.
    Đảm bảo tính Idempotent: chạy nhiều lần không gây lỗi trùng lặp dữ liệu.
    Sử dụng savepoint (begin_nested) và flush(), không commit sớm.
    """
    customers = db.query(Customer).all()
    for cus in customers:
        existing = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == cus.id
        ).first()
        if not existing:
            try:
                with db.begin_nested():
                    assignment = CustomerAssignment(
                        customer_id=cus.id,
                        assigned_staff_id=None,
                        assigned_by="Hệ thống khởi tạo",
                        assigned_at=datetime.now(timezone.utc),
                        notes="Khởi tạo tự động"
                    )
                    db.add(assignment)
                    db.flush()
            except IntegrityError:
                pass
    db.commit()


def get_active_sales_reps(db: Session) -> List[SalesRepBrief]:
    """
    Lấy danh sách nhân viên kinh doanh đang hoạt động (UserRole.SALES_REP và is_active=True).
    Kèm theo số lượng đại lý đang được phân công phụ trách.
    """
    sales_reps = db.query(User).filter(
        User.role == UserRole.SALES_REP.value,
        User.is_active == True
    ).order_by(User.full_name.asc(), User.username.asc()).all()

    result = []
    for sr in sales_reps:
        count = db.query(CustomerAssignment).filter(
            CustomerAssignment.assigned_staff_id == sr.id
        ).count()
        result.append(
            SalesRepBrief(
                id=str(sr.id),
                username=sr.username,
                full_name=sr.full_name or sr.username,
                email=sr.email,
                phone_number=sr.phone_number,
                is_active=sr.is_active,
                assigned_customer_count=count
            )
        )
    return result


def get_assignment_brief(db: Session, customer_id: str) -> CustomerAssignmentBrief:
    """Lấy thông tin chi tiết người phụ trách hiện tại của một đại lý."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với mã '{customer_id}'."
        )

    assignment = db.query(CustomerAssignment).filter(
        CustomerAssignment.customer_id == customer_id
    ).first()

    if not assignment:
        return CustomerAssignmentBrief(
            id=None,
            customer_id=customer.id,
            customer_name=customer.name,
            assigned_staff_id=None,
            assigned_staff_name=None,
            assigned_staff_phone=None,
            assigned_by=None,
            assigned_at=None,
        )

    staff_name = None
    staff_phone = None
    if assignment.assigned_staff_id:
        staff = db.query(User).filter(User.id == assignment.assigned_staff_id).first()
        if staff:
            staff_name = staff.full_name or staff.username
            staff_phone = staff.phone_number

    return CustomerAssignmentBrief(
        id=assignment.id,
        customer_id=customer.id,
        customer_name=customer.name,
        assigned_staff_id=str(assignment.assigned_staff_id) if assignment.assigned_staff_id is not None else None,
        assigned_staff_name=staff_name,
        assigned_staff_phone=staff_phone,
        assigned_by=assignment.assigned_by,
        assigned_at=assignment.assigned_at,
    )


def assign_single_customer(
    db: Session,
    customer_id: str,
    assigned_staff_id: Union[int, str],
    reason: str,
    performed_by_user: User,
) -> CustomerAssignmentBrief:
    """
    Gán hoặc đổi nhân viên phụ trách cho 1 đại lý cụ thể.
    Bắt buộc nhập lý do (5 - 500 ký tự). Ghi nhận lịch sử và AuditLog trong cùng transaction.
    """
    cleaned_reason = reason.strip()
    if len(cleaned_reason) < 5 or len(cleaned_reason) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lý do phân công phải chứa từ 5 đến 500 ký tự hợp lệ."
        )

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với mã '{customer_id}'."
        )

    try:
        staff_id_int = int(assigned_staff_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã nhân viên phụ trách không hợp lệ."
        )

    target_staff = db.query(User).filter(User.id == staff_id_int).first()
    if not target_staff:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhân viên được chọn không tồn tại trong hệ thống."
        )

    if not target_staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể phân công cho nhân viên đã bị vô hiệu hóa hoặc khóa tài khoản."
        )

    if target_staff.role != UserRole.SALES_REP.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người phụ trách đại lý bắt buộc phải có vai trò là Nhân viên kinh doanh (Sales Rep)."
        )

    assignment = db.query(CustomerAssignment).filter(
        CustomerAssignment.customer_id == customer_id
    ).with_for_update().first()

    old_staff_id = None
    old_staff_name = None
    action_type = "ASSIGN"

    if assignment:
        if assignment.assigned_staff_id:
            old_staff_id = str(assignment.assigned_staff_id)
            old_staff_user = db.query(User).filter(User.id == assignment.assigned_staff_id).first()
            if old_staff_user:
                old_staff_name = old_staff_user.full_name or old_staff_user.username
            action_type = "REASSIGN"
        assignment.assigned_staff_id = target_staff.id
        assignment.assigned_by = performed_by_user.username
        assignment.assigned_at = datetime.now(timezone.utc)
    else:
        assignment = CustomerAssignment(
            customer_id=customer_id,
            assigned_staff_id=target_staff.id,
            assigned_by=performed_by_user.username,
            assigned_at=datetime.now(timezone.utc),
        )
        db.add(assignment)

    # Ghi nhận lịch sử điều chỉnh
    history = CustomerAssignmentHistory(
        customer_id=customer.id,
        customer_name=customer.name,
        from_staff_id=old_staff_id,
        from_staff_name=old_staff_name,
        to_staff_id=str(target_staff.id),
        to_staff_name=target_staff.full_name or target_staff.username,
        action_type=action_type,
        reason=cleaned_reason,
        performed_by=performed_by_user.username,
        created_at=datetime.now(timezone.utc),
    )
    db.add(history)

    # Ghi nhận AuditLog trong cùng transaction
    log_activity(
        db=db,
        entity_type="CUSTOMER_ASSIGNMENT",
        entity_id=customer.id,
        action=action_type,
        old_values={"assigned_staff_id": old_staff_id, "assigned_staff_name": old_staff_name},
        new_values={"assigned_staff_id": str(target_staff.id), "assigned_staff_name": target_staff.full_name or target_staff.username},
        entity_name=customer.name,
        change_summary=f"Phân công đại lý '{customer.name}' cho nhân viên '{target_staff.full_name or target_staff.username}'",
        user_id=performed_by_user.id,
        username=performed_by_user.username,
        user_fullname=performed_by_user.full_name,
        user_role=performed_by_user.role,
        reason=cleaned_reason,
    )

    db.commit()
    db.refresh(assignment)

    return CustomerAssignmentBrief(
        id=assignment.id,
        customer_id=customer.id,
        customer_name=customer.name,
        assigned_staff_id=str(assignment.assigned_staff_id),
        assigned_staff_name=target_staff.full_name or target_staff.username,
        assigned_staff_phone=target_staff.phone_number,
        assigned_by=assignment.assigned_by,
        assigned_at=assignment.assigned_at,
    )


def unassign_single_customer(
    db: Session,
    customer_id: str,
    reason: str,
    performed_by_user: User,
) -> CustomerAssignmentBrief:
    """
    Hủy phân công người phụ trách của một đại lý (đưa về trạng thái chưa phân công).
    Bắt buộc nhập lý do (5 - 500 ký tự). Ghi nhận lịch sử UNASSIGN và AuditLog.
    """
    cleaned_reason = reason.strip()
    if len(cleaned_reason) < 5 or len(cleaned_reason) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lý do hủy phân công phải chứa từ 5 đến 500 ký tự hợp lệ."
        )

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với mã '{customer_id}'."
        )

    assignment = db.query(CustomerAssignment).filter(
        CustomerAssignment.customer_id == customer_id
    ).with_for_update().first()

    if not assignment or assignment.assigned_staff_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đại lý này hiện tại chưa có nhân viên phụ trách để hủy phân công."
        )

    old_staff = db.query(User).filter(User.id == assignment.assigned_staff_id).first()
    old_staff_id = str(assignment.assigned_staff_id)
    old_staff_name = (old_staff.full_name or old_staff.username) if old_staff else "Không rõ"

    assignment.assigned_staff_id = None
    assignment.assigned_by = performed_by_user.username
    assignment.assigned_at = datetime.now(timezone.utc)

    history = CustomerAssignmentHistory(
        customer_id=customer.id,
        customer_name=customer.name,
        from_staff_id=old_staff_id,
        from_staff_name=old_staff_name,
        to_staff_id=None,
        to_staff_name=None,
        action_type="UNASSIGN",
        reason=cleaned_reason,
        performed_by=performed_by_user.username,
        created_at=datetime.now(timezone.utc),
    )
    db.add(history)

    log_activity(
        db=db,
        entity_type="CUSTOMER_ASSIGNMENT",
        entity_id=customer.id,
        action="UNASSIGN",
        old_values={"assigned_staff_id": old_staff_id, "assigned_staff_name": old_staff_name},
        new_values={"assigned_staff_id": None, "assigned_staff_name": None},
        entity_name=customer.name,
        change_summary=f"Hủy phân công phụ trách đại lý '{customer.name}' của nhân viên '{old_staff_name}'",
        user_id=performed_by_user.id,
        username=performed_by_user.username,
        user_fullname=performed_by_user.full_name,
        user_role=performed_by_user.role,
        reason=cleaned_reason,
    )

    db.commit()
    db.refresh(assignment)

    return CustomerAssignmentBrief(
        id=assignment.id,
        customer_id=customer.id,
        customer_name=customer.name,
        assigned_staff_id=None,
        assigned_staff_name=None,
        assigned_staff_phone=None,
        assigned_by=assignment.assigned_by,
        assigned_at=assignment.assigned_at,
    )


def bulk_transfer_assignments(
    db: Session,
    from_staff_id: Union[int, str],
    to_staff_id: Union[int, str],
    transfer_all: bool,
    customer_ids: List[str],
    reason: str,
    performed_by_user: User,
) -> Dict[str, Any]:
    """
    Chuyển giao địa bàn / danh sách đại lý hàng loạt từ nhân viên cũ sang nhân viên mới.
    Quy tắc chặt chẽ:
    - transfer_all=True: customer_ids phải rỗng.
    - transfer_all=False: customer_ids không được rỗng.
    - to_staff phải là Sales Rep, is_active=True, khác from_staff.
    - with_for_update() khóa dòng đồng thời trong cùng transaction.
    - Mọi customer_ids phải đang thuộc from_staff, sai dù 1 đại lý -> rollback 100%.
    - Sinh 1 batch_id duy nhất; ghi đủ bản ghi lịch sử + 1 AuditLog + cập nhật trong 1 transaction.
    - Nếu AuditLog lỗi -> rollback toàn bộ.
    """
    cleaned_reason = reason.strip() if reason else ""
    if len(cleaned_reason) < 5 or len(cleaned_reason) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lý do chuyển giao phải chứa từ 5 đến 500 ký tự hợp lệ."
        )

    # Kiểm tra cờ transfer_all và danh sách customer_ids
    if transfer_all and customer_ids and len(customer_ids) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Khi đã chọn chuyển giao toàn bộ (transfer_all: true), danh sách customer_ids phải để trống."
        )

    if not transfer_all and (not customer_ids or len(customer_ids) == 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng cung cấp danh sách đại lý cần chuyển giao hoặc chọn cờ chuyển giao toàn bộ."
        )

    try:
        from_id_int = int(from_staff_id)
        to_id_int = int(to_staff_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã định danh nhân viên bàn giao hoặc tiếp nhận không hợp lệ."
        )

    if from_id_int == to_id_int:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhân viên tiếp nhận không được trùng với nhân viên bàn giao."
        )

    from_staff = db.query(User).filter(User.id == from_id_int).first()
    if not from_staff:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhân viên bàn giao không tồn tại trong hệ thống."
        )

    to_staff = db.query(User).filter(User.id == to_id_int).first()
    if not to_staff:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhân viên tiếp nhận không tồn tại trong hệ thống."
        )

    if not to_staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhân viên tiếp nhận đã bị vô hiệu hóa hoặc khóa tài khoản."
        )

    if to_staff.role != UserRole.SALES_REP.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhân viên tiếp nhận bắt buộc phải có vai trò là Nhân viên kinh doanh (Sales Rep)."
        )

    # Truy vấn và khóa các bản ghi phân công bằng with_for_update()
    if transfer_all:
        target_assignments = db.query(CustomerAssignment).filter(
            CustomerAssignment.assigned_staff_id == from_id_int
        ).with_for_update().all()

        if not target_assignments:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nhân viên '{from_staff.full_name or from_staff.username}' hiện tại không có đại lý nào để chuyển giao."
            )
    else:
        # Lọc theo danh sách customer_ids và khóa
        target_assignments = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id.in_(customer_ids)
        ).with_for_update().all()

        if len(target_assignments) != len(customer_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Một số đại lý trong danh sách yêu cầu chuyển giao không tồn tại trong hệ thống phân công."
            )

        # Kiểm tra tính toàn vẹn: 100% đại lý phải đang thuộc from_staff
        for assign in target_assignments:
            if assign.assigned_staff_id != from_id_int:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Đại lý '{assign.customer_id}' không thuộc quyền phụ trách của nhân viên "
                        f"'{from_staff.full_name or from_staff.username}'. Toàn bộ thao tác bị hủy bỏ."
                    )
                )

    batch_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)
    from_name = from_staff.full_name or from_staff.username
    to_name = to_staff.full_name or to_staff.username

    transferred_customer_ids = []
    # Cập nhật từng assignment và ghi lịch sử
    for assign in target_assignments:
        assign.assigned_staff_id = to_id_int
        assign.assigned_by = performed_by_user.username
        assign.assigned_at = now_utc
        transferred_customer_ids.append(assign.customer_id)

        cus = db.query(Customer).filter(Customer.id == assign.customer_id).first()
        cus_name = cus.name if cus else assign.customer_id

        history = CustomerAssignmentHistory(
            batch_id=batch_id,
            customer_id=assign.customer_id,
            customer_name=cus_name,
            from_staff_id=str(from_id_int),
            from_staff_name=from_name,
            to_staff_id=str(to_id_int),
            to_staff_name=to_name,
            action_type="BULK_TRANSFER",
            reason=cleaned_reason,
            performed_by=performed_by_user.username,
            created_at=now_utc,
        )
        db.add(history)

    # Ghi nhận 1 AuditLog duy nhất cho toàn bộ đợt bulk transfer
    log_activity(
        db=db,
        entity_type="CUSTOMER_ASSIGNMENT_BULK",
        entity_id=batch_id,
        action="BULK_TRANSFER",
        old_values={"from_staff_id": str(from_id_int), "from_staff_name": from_name},
        new_values={
            "to_staff_id": str(to_id_int),
            "to_staff_name": to_name,
            "transferred_customers": transferred_customer_ids
        },
        entity_name=f"Đợt chuyển giao địa bàn ({len(target_assignments)} đại lý)",
        change_summary=(
            f"Chuyển giao hàng loạt {len(target_assignments)} đại lý từ nhân viên "
            f"'{from_name}' sang '{to_name}' [Đợt chuyển giao: {batch_id}]"
        ),
        user_id=performed_by_user.id,
        username=performed_by_user.username,
        user_fullname=performed_by_user.full_name,
        user_role=performed_by_user.role,
        reason=cleaned_reason,
    )

    db.commit()

    return {
        "status": "success",
        "batch_id": batch_id,
        "transferred_count": len(target_assignments),
        "from_staff_name": from_name,
        "to_staff_name": to_name,
        "transferred_customer_ids": transferred_customer_ids,
        "message": f"Chuyển giao thành công {len(target_assignments)} đại lý sang nhân viên {to_name}."
    }


def get_customer_history(db: Session, customer_id: str) -> List[CustomerAssignmentHistoryResponse]:
    """Lấy danh sách lịch sử phân công và chuyển giao của 1 đại lý."""
    histories = db.query(CustomerAssignmentHistory).filter(
        CustomerAssignmentHistory.customer_id == customer_id
    ).order_by(CustomerAssignmentHistory.created_at.desc()).all()

    return [CustomerAssignmentHistoryResponse.model_validate(h) for h in histories]


def get_all_histories(
    db: Session,
    batch_id: Optional[str] = None,
    staff_id: Optional[str] = None,
    limit: int = 100,
) -> List[CustomerAssignmentHistoryResponse]:
    """Lấy danh sách nhật ký phân công & chuyển giao hệ thống (dành cho Quản lý / Quản trị viên)."""
    query = db.query(CustomerAssignmentHistory)
    if batch_id:
        query = query.filter(CustomerAssignmentHistory.batch_id == batch_id)
    if staff_id:
        query = query.filter(
            (CustomerAssignmentHistory.from_staff_id == staff_id) |
            (CustomerAssignmentHistory.to_staff_id == staff_id)
        )
    histories = query.order_by(CustomerAssignmentHistory.created_at.desc()).limit(limit).all()
    return [CustomerAssignmentHistoryResponse.model_validate(h) for h in histories]


def check_sales_rep_customer_scope(
    db: Session,
    customer_id: str,
    current_user: Optional[User],
) -> Customer:
    """
    Kiểm tra quyền truy cập phạm vi đại lý (Scope Guard chống IDOR).
    - Nếu là Sales Rep: Chỉ cho phép xem nếu customer_id được phân công cho user.id.
      Nếu không thuộc quyền: Trả về 404 Not Found (quy tắc bảo mật chống lộ IDOR).
    - Nếu là Manager, Admin, Director, Accountant: Cho phép xem 100%.
    """
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
        )

    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == customer.id,
            CustomerAssignment.assigned_staff_id == current_user.id
        ).first()
        if not assignment:
            # Quy tắc bắt buộc: Trả 404 thay vì 403 để tránh rò rỉ IDOR
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
            )

    return customer
