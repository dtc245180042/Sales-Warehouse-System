from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile, CustomerCreditHistory
from app.models.order import Order
from app.models.order_delivery_profile import OrderDeliveryProfile
from app.models.audit_log import AuditLog
from app.schemas.customer_credit_profile import CreditProfileUpdate


ALLOWED_ROLES_FOR_CREDIT_UPDATE = {
    UserRole.ACCOUNTANT.value.lower(),
    UserRole.SALES_MANAGER.value.lower(),
    UserRole.ADMIN.value.lower(),
    "accountant",
    "kế toán",
    "kế toán công nợ",
    "ke toan cong no",
    "sales_manager",
    "quản lý kinh doanh",
    "quan ly kinh doanh",
    "admin",
}


def _is_allowed_to_update_credit(user: Optional[User]) -> bool:
    if not user:
        return False
    raw_role = (user.role or "").strip().lower()
    normalized_role = raw_role.replace(" ", "_")
    allowed = {
        "accountant",
        "sales_manager",
        "admin",
        "kế_toán",
        "quản_lý_kinh_doanh",
    }
    return normalized_role in allowed or raw_role in ALLOWED_ROLES_FOR_CREDIT_UPDATE


def _get_customer(db: Session, customer_id: str) -> Customer:
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý / khách hàng với mã '{customer_id}'."
        )
    return customer


def get_or_create_credit_profile(
    db: Session,
    customer_id: str,
    for_update: bool = False
) -> CustomerCreditProfile:
    """
    Lấy hồ sơ hạn mức công nợ hoặc tạo mới an toàn nếu chưa có.
    Dùng db.flush() thay vì db.commit() để bảo vệ tính nguyên tử của Transaction.
    Bắt IntegrityError nếu 2 luồng cùng chèn đồng thời.
    """
    customer = _get_customer(db, customer_id)
    
    query = db.query(CustomerCreditProfile).filter(
        CustomerCreditProfile.customer_id == customer.id
    )
    if for_update:
        query = query.with_for_update()
        
    profile = query.first()
    if not profile:
        try:
            profile = CustomerCreditProfile(
                customer_id=customer.id,
                credit_limit=0,
                max_debt_days=0,
                current_debt=0,
                updated_by="system"
            )
            db.add(profile)
            db.flush()
        except IntegrityError:
            db.rollback()
            query = db.query(CustomerCreditProfile).filter(
                CustomerCreditProfile.customer_id == customer.id
            )
            if for_update:
                query = query.with_for_update()
            profile = query.first()
            if not profile:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Không thể khởi tạo hồ sơ công nợ đại lý."
                )

    return profile


def calculate_actual_customer_debt(db: Session, customer_id: str) -> int:
    """
    Tính toán dư nợ thực tế đã nhận hàng (dispatched_debt) trực tiếp từ các đơn hàng.
    Điều kiện:
    - Thuộc khách hàng này
    - Trạng thái đã xuất kho / đang giao / hoàn tất (shipping, completed)
    - Không phải đơn đã hủy (status != 'cancelled')
    - Còn số tiền chưa thanh toán: total - paid_amount > 0
    """
    customer = _get_customer(db, customer_id)
    orders = db.query(Order).filter(
        Order.customer_id == customer.id,
        Order.status.in_(["shipping", "completed"]),
        Order.status != "cancelled"
    ).all()

    total_unpaid = 0.0
    for o in orders:
        rem = max(0.0, float(o.total or 0.0) - float(o.paid_amount or 0.0))
        total_unpaid += rem

    return int(round(total_unpaid))


def check_credit_for_dispatch(
    db: Session,
    customer_id: str,
    unpaid_amount: float = 0.0,
    order_id: Optional[str] = None,
    is_manager_approved: bool = False
) -> Dict[str, Any]:
    """
    Kiểm tra điều kiện xuất kho theo đúng 4 bước đã chốt:
    - Bước 0: Còn thiếu <= 0 (Đã trả đủ tiền 100%) -> Cho qua ngay.
    - Bước 1: credit_limit <= 0 -> Báo lỗi chưa cấp hạn mức.
    - Bước 2: Nợ quá hạn ngày lịch -> Báo lỗi nợ quá hạn.
    - Bước 3: Vượt hạn mức tiền -> Báo lỗi vượt hạn mức.
    """
    customer = _get_customer(db, customer_id)
    order_unpaid = max(0, int(round(unpaid_amount)))

    # Bước 0: Đã thanh toán đủ 100%, không phát sinh nợ mới -> Luôn cho phép xuất kho
    if order_unpaid <= 0:
        return {
            "allowed": True,
            "error_message": None,
            "credit_limit": 0,
            "max_debt_days": 0,
            "dispatched_debt": 0,
            "order_unpaid_amount": 0,
            "excess_amount": 0,
            "overdue_days": 0,
            "overdue_order_code": None,
        }

    profile = get_or_create_credit_profile(db, customer.id)
    today_date = datetime.now(timezone.utc).date()

    # Bước 1: Chưa cấp hạn mức nợ
    if profile.credit_limit <= 0 and not is_manager_approved:
        return {
            "allowed": False,
            "error_message": (
                f"Đại lý '{customer.name}' chưa được cấp hạn mức công nợ. "
                f"Vui lòng thanh toán đủ 100% trước khi xuất hàng."
            ),
            "credit_limit": profile.credit_limit,
            "max_debt_days": profile.max_debt_days,
            "dispatched_debt": profile.current_debt,
            "order_unpaid_amount": order_unpaid,
            "excess_amount": order_unpaid,
            "overdue_days": 0,
            "overdue_order_code": None,
        }

    # Bước 2: Kiểm tra nợ quá hạn theo ngày lịch (calendar days)
    # Lấy các đơn hàng đã xuất kho còn thiếu nợ (loại trừ đơn hiện tại nếu đang kiểm tra lại)
    debt_query = db.query(Order).filter(
        Order.customer_id == customer.id,
        Order.status.in_(["shipping", "completed"]),
        Order.status != "cancelled"
    )
    if order_id:
        debt_query = debt_query.filter(Order.id != order_id)

    past_debt_orders = debt_query.all()
    for o in past_debt_orders:
        rem = max(0.0, float(o.total or 0.0) - float(o.paid_amount or 0.0))
        if rem > 0:
            # Xác định mốc ngày xuất kho (dispatched_at), dự phòng fallback về created_at
            disp_dt = None
            prof = db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == o.id).first()
            if prof and hasattr(prof, "dispatched_at") and prof.dispatched_at:
                disp_dt = prof.dispatched_at
            elif o.created_at:
                disp_dt = o.created_at

            if disp_dt:
                disp_date = disp_dt.date() if hasattr(disp_dt, "date") else disp_dt
                days_overdue = (today_date - disp_date).days
                if days_overdue > profile.max_debt_days:
                    return {
                        "allowed": False,
                        "error_message": (
                            f"Khách hàng đang có khoản nợ quá hạn chưa thanh toán! "
                            f"(Đơn hàng {o.code} nợ quá hạn {days_overdue} ngày, quy định tối đa {profile.max_debt_days} ngày, "
                            f"số tiền nợ còn lại: {int(rem):,} đ). Vui lòng thanh toán khoản nợ quá hạn này trước khi xuất thêm hàng."
                        ),
                        "credit_limit": profile.credit_limit,
                        "max_debt_days": profile.max_debt_days,
                        "dispatched_debt": profile.current_debt,
                        "order_unpaid_amount": order_unpaid,
                        "excess_amount": 0,
                        "overdue_days": days_overdue,
                        "overdue_order_code": o.code,
                    }

    # Bước 3: Kiểm tra hạn mức tiền (Tính toán trực tiếp kết hợp khóa dòng current read)
    calc_debt = calculate_actual_customer_debt(db, customer.id)
    dispatched_debt = max(int(profile.current_debt or 0), calc_debt)
    # Nếu đơn hiện tại đã ở shipping/completed thì trừ ra để tránh tính trùng
    if order_id:
        curr = db.query(Order).filter(Order.id == order_id).first()
        if curr and curr.status in ["shipping", "completed"]:
            curr_rem = max(0.0, float(curr.total or 0.0) - float(curr.paid_amount or 0.0))
            dispatched_debt = max(0, dispatched_debt - int(round(curr_rem)))

    total_debt_after_dispatch = dispatched_debt + order_unpaid
    if total_debt_after_dispatch > profile.credit_limit:
        excess = total_debt_after_dispatch - profile.credit_limit
        if not is_manager_approved:
            return {
                "allowed": False,
                "error_message": (
                    f"Đơn hàng vượt quá hạn mức công nợ khả dụng của khách hàng! "
                    f"Đại lý '{customer.name}' không đủ hạn mức công nợ để xuất đơn này "
                    f"(Hạn mức: {profile.credit_limit:,} đ, Dư nợ đã xuất: {dispatched_debt:,} đ, "
                    f"Đơn hàng cần nợ: {order_unpaid:,} đ, Vượt quá: {excess:,} đ). "
                    f"Vui lòng thanh toán bớt nợ trước khi xuất hàng."
                ),
                "credit_limit": profile.credit_limit,
                "max_debt_days": profile.max_debt_days,
                "dispatched_debt": dispatched_debt,
                "order_unpaid_amount": order_unpaid,
                "excess_amount": excess,
                "overdue_days": 0,
                "overdue_order_code": None,
            }

    return {
        "allowed": True,
        "error_message": None,
        "credit_limit": profile.credit_limit,
        "max_debt_days": profile.max_debt_days,
        "dispatched_debt": dispatched_debt,
        "order_unpaid_amount": order_unpaid,
        "excess_amount": 0,
        "overdue_days": 0,
        "overdue_order_code": None,
    }


def check_customer_overdue_debt(
    db: Session,
    customer_id: str,
    order_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Kiểm tra xem khách hàng / đại lý có khoản nợ nào quá hạn thanh toán hay không (S4-02, SCRUM-497).
    - Điều kiện: đơn hàng đã xuất kho (shipping, completed) và còn nợ (total - paid_amount > 0).
    - Số ngày quá hạn = (hôm nay - ngày xuất kho) - max_debt_days.
    - Nếu có khoản nợ quá hạn: Bị chặn tạo đơn hoàn toàn theo quy định.
    """
    customer = _get_customer(db, customer_id)
    profile = get_or_create_credit_profile(db, customer.id)
    today_date = datetime.now(timezone.utc).date()

    debt_query = db.query(Order).filter(
        Order.customer_id == customer.id,
        Order.status.in_(["shipping", "completed"]),
        Order.status != "cancelled"
    )
    if order_id:
        debt_query = debt_query.filter(Order.id != order_id)

    past_debt_orders = debt_query.all()
    max_overdue_days = 0
    overdue_order_code = None
    overdue_rem_amount = 0

    for o in past_debt_orders:
        rem = max(0.0, float(o.total or 0.0) - float(o.paid_amount or 0.0))
        if rem > 0:
            disp_dt = None
            prof = db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == o.id).first()
            if prof and hasattr(prof, "dispatched_at") and prof.dispatched_at:
                disp_dt = prof.dispatched_at
            elif o.created_at:
                disp_dt = o.created_at

            if disp_dt:
                disp_date = disp_dt.date() if hasattr(disp_dt, "date") else disp_dt
                days_in_debt = (today_date - disp_date).days
                if days_in_debt > profile.max_debt_days:
                    excess_days = days_in_debt - profile.max_debt_days
                    if excess_days > max_overdue_days:
                        max_overdue_days = excess_days
                        overdue_order_code = o.code
                        overdue_rem_amount = int(round(rem))

    has_overdue = max_overdue_days > 0
    block_msg = None
    if has_overdue:
        block_msg = (
            f"Đại lý '{customer.name}' đang có khoản nợ quá hạn chưa thanh toán! "
            f"(Đơn hàng {overdue_order_code} nợ quá hạn {max_overdue_days} ngày, quy định tối đa {profile.max_debt_days} ngày, "
            f"số tiền nợ còn lại: {overdue_rem_amount:,} đ). Đại lý bị chặn tạo đơn hoàn toàn theo quy định hệ thống."
        )

    return {
        "has_overdue": has_overdue,
        "overdue_days": max_overdue_days,
        "overdue_order_code": overdue_order_code,
        "is_blocked": has_overdue,
        "block_reason": block_msg,
    }


def check_credit_for_order_placement(
    db: Session,
    customer_id: str,
    unpaid_amount: float = 0.0,
    order_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Kiểm tra hạn mức công nợ và số ngày quá hạn khi tạo hoặc chốt đơn hàng (S4-02, SCRUM-496, SCRUM-497, SCRUM-498).
    
    Quy tắc nghiệp vụ S4-02:
    1. Kiểm tra nợ quá hạn:
       - Nếu đại lý có khoản nợ quá số ngày cho phép: Chặn tạo/chốt đơn hoàn toàn!
    2. Đơn thanh toán đủ 100% (unpaid_amount <= 0):
       - Cho phép tạo đơn, không bị chặn và không cần duyệt.
    3. Kiểm tra hạn mức tiền:
       - Nếu tổng nợ sau khi tạo đơn (current_debt + unpaid_amount) vượt hạn mức credit_limit:
         -> Đơn hàng được đánh dấu cần duyệt (status = 'pending_approval', requires_approval = True).
       - Nếu không vượt hạn mức:
         -> Cho phép tạo đơn bình thường (requires_approval = False).
    """
    customer = _get_customer(db, customer_id)
    profile = get_or_create_credit_profile(db, customer.id)
    order_unpaid = max(0, int(round(unpaid_amount)))

    # 1. Kiểm tra nợ quá hạn trước tiên (Chặn hoàn toàn nếu vi phạm)
    overdue_info = check_customer_overdue_debt(db=db, customer_id=customer.id, order_id=order_id)
    if overdue_info["is_blocked"]:
        return {
            "allowed": False,
            "action": "BLOCK",
            "requires_approval": False,
            "is_blocked": True,
            "error_message": overdue_info["block_reason"],
            "warning_message": None,
            "credit_limit": profile.credit_limit,
            "max_debt_days": profile.max_debt_days,
            "dispatched_debt": profile.current_debt,
            "current_debt": profile.current_debt,
            "available_credit": max(0, profile.credit_limit - profile.current_debt),
            "order_unpaid_amount": order_unpaid,
            "excess_amount": 0,
            "overdue_days": overdue_info["overdue_days"],
            "overdue_order_code": overdue_info["overdue_order_code"],
            "approval_reason": None,
        }

    # 2. Đã thanh toán đủ 100% (không phát sinh nợ mới)
    calc_debt = calculate_actual_customer_debt(db, customer.id)
    current_debt = max(int(profile.current_debt or 0), calc_debt)
    available_credit = max(0, profile.credit_limit - current_debt)

    if order_unpaid <= 0:
        return {
            "allowed": True,
            "action": "ALLOW",
            "requires_approval": False,
            "is_blocked": False,
            "error_message": None,
            "warning_message": None,
            "credit_limit": profile.credit_limit,
            "max_debt_days": profile.max_debt_days,
            "dispatched_debt": current_debt,
            "current_debt": current_debt,
            "available_credit": available_credit,
            "order_unpaid_amount": 0,
            "excess_amount": 0,
            "overdue_days": 0,
            "overdue_order_code": None,
            "approval_reason": None,
        }

    # 3. Kiểm tra hạn mức tiền:
    total_debt_after = current_debt + order_unpaid
    
    # Trường hợp 3a: Chưa được cấp hạn mức nhưng phát sinh nợ
    if profile.credit_limit <= 0:
        excess = order_unpaid
        approval_msg = (
            f"Đại lý '{customer.name}' chưa được cấp hạn mức công nợ "
            f"(Hạn mức: 0 đ, Đơn hàng cần nợ: {order_unpaid:,} đ). "
            f"Đơn hàng được chuyển sang trạng thái Chờ duyệt bởi Quản lý kinh doanh."
        )
        return {
            "allowed": True,
            "action": "REQUIRE_APPROVAL",
            "requires_approval": True,
            "is_blocked": False,
            "error_message": None,
            "warning_message": approval_msg,
            "credit_limit": profile.credit_limit,
            "max_debt_days": profile.max_debt_days,
            "dispatched_debt": current_debt,
            "current_debt": current_debt,
            "available_credit": 0,
            "order_unpaid_amount": order_unpaid,
            "excess_amount": excess,
            "overdue_days": 0,
            "overdue_order_code": None,
            "approval_reason": approval_msg,
        }

    # Trường hợp 3b: Vượt hạn mức công nợ
    if total_debt_after > profile.credit_limit:
        excess = total_debt_after - profile.credit_limit
        approval_msg = (
            f"Tổng công nợ sau đơn ({total_debt_after:,} đ = Dư nợ hiện tại {current_debt:,} đ + Đơn này {order_unpaid:,} đ) "
            f"vượt hạn mức công nợ được cấp ({profile.credit_limit:,} đ) là {excess:,} đ. "
            f"Đơn hàng được chuyển sang trạng thái Chờ duyệt bởi Quản lý kinh doanh."
        )
        return {
            "allowed": True,
            "action": "REQUIRE_APPROVAL",
            "requires_approval": True,
            "is_blocked": False,
            "error_message": None,
            "warning_message": approval_msg,
            "credit_limit": profile.credit_limit,
            "max_debt_days": profile.max_debt_days,
            "dispatched_debt": current_debt,
            "current_debt": current_debt,
            "available_credit": available_credit,
            "order_unpaid_amount": order_unpaid,
            "excess_amount": excess,
            "overdue_days": 0,
            "overdue_order_code": None,
            "approval_reason": approval_msg,
        }

    # Trường hợp 3c: Hợp lệ trong hạn mức
    return {
        "allowed": True,
        "action": "ALLOW",
        "requires_approval": False,
        "is_blocked": False,
        "error_message": None,
        "warning_message": None,
        "credit_limit": profile.credit_limit,
        "max_debt_days": profile.max_debt_days,
        "dispatched_debt": current_debt,
        "current_debt": current_debt,
        "available_credit": max(0, profile.credit_limit - total_debt_after),
        "order_unpaid_amount": order_unpaid,
        "excess_amount": 0,
        "overdue_days": 0,
        "overdue_order_code": None,
        "approval_reason": None,
    }


def update_credit_profile(
    db: Session,
    customer_id: str,
    data: CreditProfileUpdate,
    current_user: Optional[User] = None
) -> CustomerCreditProfile:
    """
    Cập nhật hạn mức công nợ và số ngày nợ tối đa.
    - Kiểm tra phân quyền RBAC: chỉ Kế toán công nợ, QLKD, Admin.
    - Khóa dòng with_for_update().
    - Bắt buộc lưu lịch sử (Append-Only) và ghi AuditLog trong cùng một Transaction.
    """
    if not _is_allowed_to_update_credit(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán công nợ và Quản lý kinh doanh mới có quyền điều chỉnh hạn mức."
        )

    customer = _get_customer(db, customer_id)
    profile = get_or_create_credit_profile(db, customer.id, for_update=True)

    old_limit = profile.credit_limit
    old_days = profile.max_debt_days
    changed_by = current_user.username if current_user else "system"
    clean_reason = data.reason.strip()

    try:
        # 1. Thêm bản ghi lịch sử điều chỉnh (Append-Only)
        history = CustomerCreditHistory(
            customer_id=customer.id,
            old_credit_limit=old_limit,
            new_credit_limit=data.credit_limit,
            old_max_debt_days=old_days,
            new_max_debt_days=data.max_debt_days,
            reason=clean_reason,
            changed_by=changed_by,
        )
        db.add(history)

        # 2. Cập nhật hồ sơ công nợ
        profile.credit_limit = data.credit_limit
        profile.max_debt_days = data.max_debt_days
        profile.updated_by = changed_by
        profile.current_debt = calculate_actual_customer_debt(db, customer.id)

        # 3. Ghi AuditLog hệ thống trong cùng một Transaction
        audit = AuditLog(
            entity_type="CREDIT_PROFILE",
            entity_id=str(profile.id),
            entity_name=f"{customer.name} - Hạn mức công nợ",
            action="UPDATE",
            change_summary=(
                f"Điều chỉnh hạn mức công nợ đại lý {customer.name}: "
                f"Hạn mức {old_limit:,} đ -> {data.credit_limit:,} đ; "
                f"Số ngày nợ {old_days} -> {data.max_debt_days} ngày. "
                f"Lý do: {clean_reason}"
            ),
            username=changed_by,
            new_values={
                "credit_limit": data.credit_limit,
                "max_debt_days": data.max_debt_days,
                "reason": clean_reason
            }
        )
        db.add(audit)

        db.commit()
        db.refresh(profile)
        return profile
    except Exception as e:
        db.rollback()
        raise e


def get_credit_history(db: Session, customer_id: str) -> List[CustomerCreditHistory]:
    """Lấy danh sách lịch sử điều chỉnh hạn mức (Mọi nhân viên có thể xem)."""
    customer = _get_customer(db, customer_id)
    return db.query(CustomerCreditHistory).filter(
        CustomerCreditHistory.customer_id == customer.id
    ).order_by(CustomerCreditHistory.id.desc()).all()


def seed_default_credit_profiles(db: Session):
    """Đảm bảo mọi đại lý hiện có đều có một bản ghi hồ sơ công nợ mặc định (Idempotent)."""
    customers = db.query(Customer).all()
    for c in customers:
        existing = db.query(CustomerCreditProfile).filter(
            CustomerCreditProfile.customer_id == c.id
        ).first()
        if not existing:
            new_prof = CustomerCreditProfile(
                customer_id=c.id,
                credit_limit=50_000_000 if c.customer_group in ["TIER_1", "VIP"] else 0,
                max_debt_days=30 if c.customer_group in ["TIER_1", "VIP"] else 0,
                current_debt=0,
                updated_by="system"
            )
            db.add(new_prof)
    try:
        db.commit()
    except Exception:
        db.rollback()
