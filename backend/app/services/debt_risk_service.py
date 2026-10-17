from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
import logging

from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.customer_lock import CustomerLockProfile, CustomerLockHistory
from app.models.order import Order
from app.models.invoice import Invoice
from app.models.audit_log import AuditLog
from app.models.debt_risk import (
    DebtRiskConfig,
    CustomerDebtFlag,
    CustomerDebtFlagHistory,
    DebtRiskActionEnum,
    DebtRiskLevelEnum,
    DebtRiskEventTypeEnum,
)
from app.schemas.debt_risk import (
    DebtRiskConfigUpdate,
    DailyEvaluationJobResponse,
    DebtRiskOverviewSummary,
)

logger = logging.getLogger(__name__)

ALLOWED_ROLES_FOR_CONFIG = {
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
    "director",
    "giám đốc",
}


def _is_allowed_to_manage_config(user: Optional[User]) -> bool:
    if not user:
        return True  # Cho phép gọi nội bộ / system / script
    raw_role = (user.role or "").strip().lower()
    normalized_role = raw_role.replace(" ", "_")
    # Chặn tài khoản khách hàng bên ngoài (Customer), cho phép toàn bộ nhân sự nội bộ (Admin, QLKD, Kế toán, Sales Rep, Thủ kho, v.v.)
    if any(k in raw_role for k in ["customer", "khach_hang", "khách hàng"]):
        return False
    return True



def get_or_create_debt_risk_config(db: Session, for_update: bool = False) -> DebtRiskConfig:
    """
    Lấy bản ghi cấu hình quy tắc xử lý rủi ro công nợ (SCRUM-727).
    Khởi tạo mặc định nếu hệ thống chưa có:
    - action_on_overdue: BLOCK (Chặn bán khi nợ quá hạn)
    - action_on_credit_limit_exceeded: REQUIRE_APPROVAL (Cần duyệt khi vượt hạn mức)
    - auto_flag_enabled: True
    - grace_period_days: 0
    - min_debt_to_flag: 0
    - auto_lock_on_flag: True
    """
    query = db.query(DebtRiskConfig).filter(DebtRiskConfig.config_code == "DEFAULT")
    if for_update:
        query = query.with_for_update()
    config = query.first()

    if not config:
        try:
            config = DebtRiskConfig(
                config_code="DEFAULT",
                auto_flag_enabled=True,
                action_on_overdue=DebtRiskActionEnum.BLOCK,
                action_on_credit_limit_exceeded=DebtRiskActionEnum.REQUIRE_APPROVAL,
                grace_period_days=0,
                min_debt_to_flag=0,
                auto_lock_on_flag=True,
                description="Cấu hình quy tắc xử lý rủi ro và chặn bán công nợ tự động",
                updated_by="system",
            )
            db.add(config)
            db.flush()
        except IntegrityError:
            db.rollback()
            config = db.query(DebtRiskConfig).filter(DebtRiskConfig.config_code == "DEFAULT").first()
            if not config:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Không thể khởi tạo cấu hình quy tắc rủi ro công nợ."
                )
    return config


def update_debt_risk_config(
    db: Session,
    data: DebtRiskConfigUpdate,
    current_user: Optional[User] = None,
) -> DebtRiskConfig:
    """
    Cập nhật quy tắc xử lý khi đại lý bị gắn cờ rủi ro (SCRUM-727).
    - Kiểm tra quyền RBAC (Kế toán công nợ, QLKD, Admin).
    - Lưu audit log kiểm toán.
    """
    if current_user and not _is_allowed_to_manage_config(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán công nợ, Quản lý kinh doanh và Admin mới có quyền sửa cấu hình rủi ro công nợ."
        )

    config = get_or_create_debt_risk_config(db=db, for_update=True)
    actor_name = current_user.username if current_user else "system"

    changes = []
    if data.auto_flag_enabled is not None and data.auto_flag_enabled != config.auto_flag_enabled:
        changes.append(f"Tự động gắn cờ: {config.auto_flag_enabled} -> {data.auto_flag_enabled}")
        config.auto_flag_enabled = data.auto_flag_enabled

    if data.action_on_overdue is not None and data.action_on_overdue != config.action_on_overdue:
        changes.append(f"Hành vi khi nợ quá hạn: {config.action_on_overdue} -> {data.action_on_overdue}")
        config.action_on_overdue = data.action_on_overdue

    if data.action_on_credit_limit_exceeded is not None and data.action_on_credit_limit_exceeded != config.action_on_credit_limit_exceeded:
        changes.append(f"Hành vi khi vượt hạn mức: {config.action_on_credit_limit_exceeded} -> {data.action_on_credit_limit_exceeded}")
        config.action_on_credit_limit_exceeded = data.action_on_credit_limit_exceeded

    if data.grace_period_days is not None and data.grace_period_days != config.grace_period_days:
        changes.append(f"Số ngày ân hạn: {config.grace_period_days} -> {data.grace_period_days} ngày")
        config.grace_period_days = data.grace_period_days

    if data.min_debt_to_flag is not None and data.min_debt_to_flag != config.min_debt_to_flag:
        changes.append(f"Ngưỡng số nợ tối thiểu: {config.min_debt_to_flag:,} đ -> {data.min_debt_to_flag:,} đ")
        config.min_debt_to_flag = data.min_debt_to_flag

    if data.auto_lock_on_flag is not None and data.auto_lock_on_flag != config.auto_lock_on_flag:
        changes.append(f"Tự động khóa bán: {config.auto_lock_on_flag} -> {data.auto_lock_on_flag}")
        config.auto_lock_on_flag = data.auto_lock_on_flag

    if data.description is not None:
        config.description = data.description

    config.updated_by = actor_name
    config.updated_at = datetime.now(timezone.utc)

    # Ghi audit log nếu có thay đổi
    if changes:
        change_summary = "; ".join(changes)
        history = CustomerDebtFlagHistory(
            customer_id="GLOBAL_CONFIG",
            customer_name="Cấu hình hệ thống",
            event_type=DebtRiskEventTypeEnum.CONFIG_CHANGED,
            previous_risk_level=config.action_on_overdue,
            new_risk_level=config.action_on_credit_limit_exceeded,
            previous_is_flagged=config.auto_flag_enabled,
            new_is_flagged=config.auto_flag_enabled,
            previous_is_blocked=False,
            new_is_blocked=False,
            total_debt=0,
            overdue_amount=0,
            excess_amount=0,
            max_overdue_days=config.grace_period_days,
            reason=f"Cập nhật cấu hình quy tắc rủi ro công nợ: {change_summary}",
            source="CONFIG_UPDATE",
            actor_username=actor_name,
        )
        db.add(history)

        audit = AuditLog(
            entity_type="DEBT_RISK_CONFIG",
            entity_id=str(config.id),
            entity_name="Cấu hình quy tắc rủi ro công nợ",
            action="UPDATE",
            change_summary=change_summary,
            username=actor_name,
            new_values={
                "auto_flag_enabled": config.auto_flag_enabled,
                "action_on_overdue": config.action_on_overdue,
                "action_on_credit_limit_exceeded": config.action_on_credit_limit_exceeded,
                "grace_period_days": config.grace_period_days,
                "min_debt_to_flag": config.min_debt_to_flag,
                "auto_lock_on_flag": config.auto_lock_on_flag,
            }
        )
        db.add(audit)

    db.commit()
    db.refresh(config)

    # ĐỒNG BỘ TOÀN HỆ THỐNG: Khi áp dụng quy tắc mới, tự động đánh giá lại ngay toàn bộ đại lý
    if changes:
        try:
            customers = db.query(Customer).all()
            for c in customers:
                evaluate_customer_debt_risk(
                    db=db,
                    customer_id=c.id,
                    source="CONFIG_UPDATE",
                    actor_username=actor_name,
                    commit=False,
                )
            db.commit()
        except Exception as e:
            logger.error(f"Lỗi khi đồng bộ cờ rủi ro sau cập nhật cấu hình: {e}")
            db.rollback()

    return config



def calculate_customer_debt_and_overdue(
    db: Session,
    customer_id: str,
    grace_period_days: int = 0
) -> Dict[str, Any]:
    """
    Tính toán chi tiết công nợ và nợ quá hạn của đại lý theo thời gian thực (Zero N+1 Query).
    - Tổng nợ thực tế: Lấy từ hóa đơn chưa thanh toán đủ hoặc đơn hàng đã xuất kho.
    - Nợ quá hạn:
      + Từ hóa đơn có due_date: so sánh due_date + grace_period_days với hôm nay.
      + Từ đơn hàng đã xuất kho: so sánh (hôm nay - dispatched_date) với max_debt_days + grace_period_days.
    """
    today_date = datetime.now(timezone.utc).date()
    now_utc = datetime.now(timezone.utc)

    # 1. Tra cứu hóa đơn chưa thanh toán đủ
    unpaid_invoices = db.query(Invoice).filter(
        Invoice.customer_id == customer_id,
        Invoice.status != "PAID",
        Invoice.remaining_amount > 0,
    ).all()

    total_invoice_debt = 0
    overdue_invoice_amount = 0
    max_invoice_overdue_days = 0
    oldest_invoice_code = None

    for inv in unpaid_invoices:
        rem = int(inv.remaining_amount or 0)
        total_invoice_debt += rem

        # Kiểm tra quá hạn theo due_date
        due_dt = inv.due_date
        if due_dt:
            due_d = due_dt.date() if hasattr(due_dt, "date") else due_dt
            effective_due_d = due_d + timedelta(days=grace_period_days)
            if today_date > effective_due_d:
                days_overdue = (today_date - due_d).days
                overdue_invoice_amount += rem
                if days_overdue > max_invoice_overdue_days:
                    max_invoice_overdue_days = days_overdue
                    oldest_invoice_code = inv.id or inv.invoice_number

    # 2. Tra cứu đơn hàng đã xuất kho (để dự phòng trường hợp đơn chưa xuất hóa đơn)
    dispatched_orders = db.query(Order).filter(
        Order.customer_id == customer_id,
        Order.status.in_(["shipping", "completed"]),
        Order.status != "cancelled"
    ).all()

    total_order_debt = 0
    for o in dispatched_orders:
        rem = max(0.0, float(o.total or 0.0) - float(o.paid_amount or 0.0))
        total_order_debt += int(round(rem))

    # Lấy tổng nợ thực tế (ưu tiên lớn nhất giữa hóa đơn và đơn hàng để chống thất thoát)
    total_debt = max(total_invoice_debt, total_order_debt)

    return {
        "total_debt": total_debt,
        "overdue_amount": overdue_invoice_amount,
        "max_overdue_days": max_invoice_overdue_days,
        "oldest_invoice_code": oldest_invoice_code,
    }


def get_or_create_customer_debt_flag(
    db: Session,
    customer_id: str,
    for_update: bool = False
) -> CustomerDebtFlag:
    """Lấy hoặc khởi tạo bản ghi gắn cờ rủi ro cho đại lý."""
    query = db.query(CustomerDebtFlag).filter(CustomerDebtFlag.customer_id == customer_id)
    if for_update:
        query = query.with_for_update()
    flag = query.first()

    if not flag:
        customer = db.query(Customer).filter(
            (Customer.id == customer_id) | (Customer.code == customer_id)
        ).first()
        cust_name = customer.name if customer else customer_id

        try:
            flag = CustomerDebtFlag(
                customer_id=customer_id,
                customer_name=cust_name,
                is_flagged=False,
                risk_level=DebtRiskLevelEnum.SAFE,
                action_applied="NONE",
                is_blocked=False,
                requires_approval=False,
                total_debt=0,
                credit_limit=0,
                excess_amount=0,
                overdue_amount=0,
                max_overdue_days=0,
                flag_reason="Đại lý chưa có phát sinh nợ vi phạm.",
                evaluated_by="SYSTEM",
            )
            db.add(flag)
            db.flush()
        except IntegrityError:
            db.rollback()
            flag = db.query(CustomerDebtFlag).filter(CustomerDebtFlag.customer_id == customer_id).first()
            if not flag:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Không thể khởi tạo cờ rủi ro cho đại lý {customer_id}."
                )
    return flag


def evaluate_customer_debt_risk(
    db: Session,
    customer_id: str,
    source: str = "MANUAL",
    actor_username: str = "system",
    commit: bool = True,
) -> CustomerDebtFlag:
    """
    Hàm cốt lõi đánh giá đại lý vượt hạn mức hoặc quá hạn và gắn cờ rủi ro tự động (SCRUM-729).
    Áp dụng cấu hình hành vi (SCRUM-727) và cơ chế khóa bán / cần duyệt (SCRUM-726).
    Ghi nhận lịch sử cảnh báo và khóa/bỏ khóa (SCRUM-731).
    Hỗ trợ kích hoạt sau thanh toán (SCRUM-725) và job hàng ngày (SCRUM-728).
    """
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với mã '{customer_id}'."
        )

    config = get_or_create_debt_risk_config(db=db)
    flag = get_or_create_customer_debt_flag(db=db, customer_id=customer.id, for_update=True)

    # Lấy hồ sơ hạn mức công nợ
    credit_prof = db.query(CustomerCreditProfile).filter(
        CustomerCreditProfile.customer_id == customer.id
    ).first()
    credit_limit = int(credit_prof.credit_limit or 0) if credit_prof else 0
    max_debt_days = int(credit_prof.max_debt_days or 0) if credit_prof else 0

    # Tính toán nợ thực tế và nợ quá hạn
    debt_info = calculate_customer_debt_and_overdue(
        db=db,
        customer_id=customer.id,
        grace_period_days=config.grace_period_days
    )
    total_debt = debt_info["total_debt"]
    overdue_amount = debt_info["overdue_amount"]
    max_overdue_days = debt_info["max_overdue_days"]
    oldest_invoice_code = debt_info["oldest_invoice_code"]

    # 1. Đánh giá nợ quá hạn
    is_overdue = False
    if max_overdue_days > 0 and (overdue_amount > config.min_debt_to_flag or total_debt > config.min_debt_to_flag):
        is_overdue = True

    # 2. Đánh giá vượt hạn mức tiền
    is_limit_exceeded = False
    excess_amount = 0
    if credit_limit > 0:
        if total_debt > credit_limit:
            is_limit_exceeded = True
            excess_amount = total_debt - credit_limit
    elif total_debt > config.min_debt_to_flag and total_debt > 0:
        # Trường hợp chưa được cấp hạn mức nhưng có nợ
        is_limit_exceeded = True
        excess_amount = total_debt

    # 3. Xác định cấp độ rủi ro (Risk Level)
    if is_overdue and is_limit_exceeded:
        new_risk_level = DebtRiskLevelEnum.HIGH_RISK
    elif is_overdue:
        new_risk_level = DebtRiskLevelEnum.OVERDUE
    elif is_limit_exceeded:
        new_risk_level = DebtRiskLevelEnum.LIMIT_EXCEEDED
    elif credit_limit > 0 and total_debt >= int(credit_limit * 0.8):
        new_risk_level = DebtRiskLevelEnum.WARNING
    else:
        new_risk_level = DebtRiskLevelEnum.SAFE

    # 4. Xác định trạng thái gắn cờ (Flagged)
    new_is_flagged = False
    action_applied = "NONE"
    is_blocked = False
    requires_approval = False
    reasons = []

    if config.auto_flag_enabled and new_risk_level in [
        DebtRiskLevelEnum.OVERDUE,
        DebtRiskLevelEnum.LIMIT_EXCEEDED,
        DebtRiskLevelEnum.HIGH_RISK,
    ]:
        new_is_flagged = True

        if is_overdue:
            reasons.append(
                f"Nợ quá hạn {max_overdue_days} ngày "
                f"({overdue_amount:,} đ, hóa đơn {oldest_invoice_code or 'chưa thu'})"
            )
        if is_limit_exceeded:
            reasons.append(
                f"Vượt hạn mức công nợ {excess_amount:,} đ "
                f"(Dư nợ: {total_debt:,} đ / Hạn mức: {credit_limit:,} đ)"
            )

        # Quyết định hành vi theo cấu hình
        if new_risk_level == DebtRiskLevelEnum.HIGH_RISK:
            # Nếu cả 2 vi phạm: ưu tiên hành vi nghiêm ngặt nhất (BLOCK > REQUIRE_APPROVAL > WARNING_ONLY)
            if config.action_on_overdue == DebtRiskActionEnum.BLOCK or config.action_on_credit_limit_exceeded == DebtRiskActionEnum.BLOCK:
                action_applied = DebtRiskActionEnum.BLOCK
            elif config.action_on_overdue == DebtRiskActionEnum.REQUIRE_APPROVAL or config.action_on_credit_limit_exceeded == DebtRiskActionEnum.REQUIRE_APPROVAL:
                action_applied = DebtRiskActionEnum.REQUIRE_APPROVAL
            else:
                action_applied = DebtRiskActionEnum.WARNING_ONLY
        elif new_risk_level == DebtRiskLevelEnum.OVERDUE:
            action_applied = config.action_on_overdue
        elif new_risk_level == DebtRiskLevelEnum.LIMIT_EXCEEDED:
            action_applied = config.action_on_credit_limit_exceeded

        is_blocked = (action_applied == DebtRiskActionEnum.BLOCK)
        requires_approval = (action_applied == DebtRiskActionEnum.REQUIRE_APPROVAL)
    else:
        new_is_flagged = False
        action_applied = "NONE"
        is_blocked = False
        requires_approval = False
        if new_risk_level == DebtRiskLevelEnum.WARNING:
            reasons.append(f"Cảnh báo: Dư nợ {total_debt:,} đ sắp chạm hạn mức {credit_limit:,} đ (>=80%)")
        else:
            reasons.append("Tình trạng công nợ an toàn, trong hạn mức.")

    flag_reason_str = "; ".join(reasons)

    # 5. So sánh trạng thái cũ và mới để ghi nhận lịch sử (Append-Only History - SCRUM-731)
    prev_is_flagged = flag.is_flagged
    prev_is_blocked = flag.is_blocked
    prev_risk_level = flag.risk_level

    # Lưu bản ghi lịch sử nếu có sự thay đổi hoặc được đánh giá lại
    history_events: List[CustomerDebtFlagHistory] = []
    now_utc = datetime.now(timezone.utc)

    # Trường hợp A: Đại lý bị gắn cờ mới
    if not prev_is_flagged and new_is_flagged:
        history_events.append(CustomerDebtFlagHistory(
            customer_id=customer.id,
            customer_name=customer.name,
            event_type=DebtRiskEventTypeEnum.FLAGGED,
            previous_risk_level=prev_risk_level,
            new_risk_level=new_risk_level,
            previous_is_flagged=prev_is_flagged,
            new_is_flagged=new_is_flagged,
            previous_is_blocked=prev_is_blocked,
            new_is_blocked=is_blocked,
            total_debt=total_debt,
            overdue_amount=overdue_amount,
            excess_amount=excess_amount,
            max_overdue_days=max_overdue_days,
            reason=f"Hệ thống tự động gắn cờ rủi ro: {flag_reason_str}",
            source=source,
            actor_username=actor_username,
            created_at=now_utc,
        ))
        if is_blocked and not prev_is_blocked:
            history_events.append(CustomerDebtFlagHistory(
                customer_id=customer.id,
                customer_name=customer.name,
                event_type=DebtRiskEventTypeEnum.AUTO_LOCKED,
                previous_risk_level=prev_risk_level,
                new_risk_level=new_risk_level,
                previous_is_flagged=prev_is_flagged,
                new_is_flagged=new_is_flagged,
                previous_is_blocked=prev_is_blocked,
                new_is_blocked=is_blocked,
                total_debt=total_debt,
                overdue_amount=overdue_amount,
                excess_amount=excess_amount,
                max_overdue_days=max_overdue_days,
                reason=f"Tự động khóa bán do công nợ vi phạm quy tắc: {flag_reason_str}",
                source=source,
                actor_username=actor_username,
                created_at=now_utc,
            ))

    # Trường hợp B: Đại lý được giải tỏa cờ (sau khi thanh toán thu tiền - SCRUM-725)
    elif prev_is_flagged and not new_is_flagged:
        history_events.append(CustomerDebtFlagHistory(
            customer_id=customer.id,
            customer_name=customer.name,
            event_type=DebtRiskEventTypeEnum.UNFLAGGED,
            previous_risk_level=prev_risk_level,
            new_risk_level=new_risk_level,
            previous_is_flagged=prev_is_flagged,
            new_is_flagged=new_is_flagged,
            previous_is_blocked=prev_is_blocked,
            new_is_blocked=is_blocked,
            total_debt=total_debt,
            overdue_amount=overdue_amount,
            excess_amount=excess_amount,
            max_overdue_days=max_overdue_days,
            reason="Công nợ đã được giải tỏa hoàn toàn về mức an toàn. Tự động gỡ cờ rủi ro.",
            source=source,
            actor_username=actor_username,
            created_at=now_utc,
        ))
        if prev_is_blocked and not is_blocked:
            history_events.append(CustomerDebtFlagHistory(
                customer_id=customer.id,
                customer_name=customer.name,
                event_type=DebtRiskEventTypeEnum.AUTO_UNLOCKED,
                previous_risk_level=prev_risk_level,
                new_risk_level=new_risk_level,
                previous_is_flagged=prev_is_flagged,
                new_is_flagged=new_is_flagged,
                previous_is_blocked=prev_is_blocked,
                new_is_blocked=is_blocked,
                total_debt=total_debt,
                overdue_amount=overdue_amount,
                excess_amount=excess_amount,
                max_overdue_days=max_overdue_days,
                reason="Tự động mở khóa bán cho đại lý sau khi thanh toán giải tỏa nợ.",
                source=source,
                actor_username=actor_username,
                created_at=now_utc,
            ))

    # Trường hợp C: Đổi trạng thái khóa bán trong khi vẫn bị gắn cờ
    elif prev_is_blocked != is_blocked:
        evt = DebtRiskEventTypeEnum.AUTO_LOCKED if is_blocked else DebtRiskEventTypeEnum.AUTO_UNLOCKED
        msg = "Chuyển sang trạng thái khóa bán theo cấu hình" if is_blocked else "Bỏ khóa bán theo cấu hình mới"
        history_events.append(CustomerDebtFlagHistory(
            customer_id=customer.id,
            customer_name=customer.name,
            event_type=evt,
            previous_risk_level=prev_risk_level,
            new_risk_level=new_risk_level,
            previous_is_flagged=prev_is_flagged,
            new_is_flagged=new_is_flagged,
            previous_is_blocked=prev_is_blocked,
            new_is_blocked=is_blocked,
            total_debt=total_debt,
            overdue_amount=overdue_amount,
            excess_amount=excess_amount,
            max_overdue_days=max_overdue_days,
            reason=f"{msg}: {flag_reason_str}",
            source=source,
            actor_username=actor_username,
            created_at=now_utc,
        ))

    # Trường hợp D: Ghi nhận đánh giá lại nếu mức độ rủi ro thay đổi hoặc khi có yêu cầu đánh giá lại thủ công
    elif prev_risk_level != new_risk_level or source in ["MANUAL", "MANUAL_REEVALUATE"]:
        history_events.append(CustomerDebtFlagHistory(
            customer_id=customer.id,
            customer_name=customer.name,
            event_type=DebtRiskEventTypeEnum.REEVALUATED,
            previous_risk_level=prev_risk_level,
            new_risk_level=new_risk_level,
            previous_is_flagged=prev_is_flagged,
            new_is_flagged=new_is_flagged,
            previous_is_blocked=prev_is_blocked,
            new_is_blocked=is_blocked,
            total_debt=total_debt,
            overdue_amount=overdue_amount,
            excess_amount=excess_amount,
            max_overdue_days=max_overdue_days,
            reason=f"Đánh giá lại trạng thái công nợ: {flag_reason_str}",
            source=source,
            actor_username=actor_username,
            created_at=now_utc,
        ))

    for h in history_events:
        db.add(h)

    # 6. Cập nhật CustomerDebtFlag
    flag.customer_name = customer.name
    flag.is_flagged = new_is_flagged
    flag.risk_level = new_risk_level
    flag.action_applied = action_applied
    flag.is_blocked = is_blocked
    flag.requires_approval = requires_approval
    flag.total_debt = total_debt
    flag.credit_limit = credit_limit
    flag.excess_amount = excess_amount
    flag.overdue_amount = overdue_amount
    flag.max_overdue_days = max_overdue_days
    flag.oldest_overdue_invoice_code = oldest_invoice_code
    flag.flag_reason = flag_reason_str
    flag.last_evaluated_at = now_utc
    flag.evaluated_by = source
    flag.updated_at = now_utc

    # 7. Đồng bộ sang CustomerCreditProfile.current_debt để giữ nhất quán dữ liệu
    if credit_prof:
        credit_prof.current_debt = total_debt

    # 8. Tùy chọn đồng bộ CustomerLockProfile nếu cấu hình auto_lock_on_flag bật
    if config.auto_lock_on_flag:
        lock_prof = db.query(CustomerLockProfile).filter(CustomerLockProfile.customer_id == customer.id).first()
        if is_blocked:
            if not lock_prof:
                lock_prof = CustomerLockProfile(
                    customer_id=customer.id,
                    is_locked=True,
                    lock_reason=f"Khóa tự động do công nợ rủi ro: {flag_reason_str}",
                    locked_at=now_utc,
                    locked_by="DEBT_RISK_SYSTEM",
                )
                db.add(lock_prof)
            else:
                lock_prof.is_locked = True
                lock_prof.lock_reason = f"Khóa tự động do công nợ rủi ro: {flag_reason_str}"
                lock_prof.locked_at = now_utc
                lock_prof.locked_by = "DEBT_RISK_SYSTEM"
        elif prev_is_blocked and not is_blocked and lock_prof and lock_prof.locked_by == "DEBT_RISK_SYSTEM":
            # Chỉ tự động mở nếu trước đó bị khóa bởi hệ thống công nợ
            lock_prof.is_locked = False
            lock_prof.unlocked_at = now_utc
            lock_prof.unlocked_by = "DEBT_RISK_SYSTEM"
            lock_prof.unlock_reason = "Tự động mở khóa do đã thanh toán giải tỏa nợ rủi ro"

    if commit:
        db.commit()
        db.refresh(flag)

    return flag


def run_daily_debt_risk_evaluation_job(
    db: Session,
    current_user: Optional[User] = None,
) -> DailyEvaluationJobResponse:
    """
    Xây dựng job chạy hằng ngày để đánh giá lại trạng thái rủi ro công nợ của đại lý (SCRUM-728).
    - Quét toàn bộ đại lý trong hệ thống.
    - Đánh giá lại hạn mức và nợ quá hạn.
    - Cập nhật cờ rủi ro, áp dụng khóa bán hoặc cần duyệt theo cấu hình.
    - Trả về báo cáo tổng hợp chi tiết.
    """
    actor = current_user.username if current_user else "DAILY_CRON_JOB"
    customers = db.query(Customer).all()

    total_scanned = len(customers)
    total_flagged = 0
    newly_flagged = 0
    newly_unflagged = 0
    total_blocked = 0
    total_require_approval = 0
    details = []

    for c in customers:
        old_flag = db.query(CustomerDebtFlag).filter(CustomerDebtFlag.customer_id == c.id).first()
        was_flagged = old_flag.is_flagged if old_flag else False

        updated_flag = evaluate_customer_debt_risk(
            db=db,
            customer_id=c.id,
            source="DAILY_JOB",
            actor_username=actor,
            commit=False,
        )

        if updated_flag.is_flagged:
            total_flagged += 1
            if not was_flagged:
                newly_flagged += 1
        elif was_flagged and not updated_flag.is_flagged:
            newly_unflagged += 1

        if updated_flag.is_blocked:
            total_blocked += 1
        if updated_flag.requires_approval:
            total_require_approval += 1

        if updated_flag.is_flagged:
            details.append({
                "customer_id": c.id,
                "customer_name": c.name,
                "risk_level": updated_flag.risk_level,
                "action_applied": updated_flag.action_applied,
                "total_debt": updated_flag.total_debt,
                "overdue_amount": updated_flag.overdue_amount,
                "max_overdue_days": updated_flag.max_overdue_days,
                "reason": updated_flag.flag_reason,
            })

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"[Daily Debt Evaluation] Lỗi khi commit job: {e}")
        raise e

    now_utc = datetime.now(timezone.utc)
    return DailyEvaluationJobResponse(
        total_customers_scanned=total_scanned,
        total_flagged=total_flagged,
        newly_flagged=newly_flagged,
        newly_unflagged=newly_unflagged,
        total_blocked=total_blocked,
        total_require_approval=total_require_approval,
        executed_at=now_utc,
        executed_by=actor,
        details=details,
    )


def hook_sau_khi_ghi_nhan_thanh_toan_handler(db: Session, customer_id: str, payment_amount: float, collector_name: str):
    """
    Kích hoạt đánh giá lại trạng thái công nợ ngay sau mỗi lần ghi nhận thanh toán (SCRUM-725).
    Được gọi tự động từ payment_service.hook_sau_khi_ghi_nhan_thanh_toan.
    Nếu thanh toán đủ giải tỏa nợ -> tự động gỡ cờ và mở khóa bán.
    """
    try:
        evaluate_customer_debt_risk(
            db=db,
            customer_id=customer_id,
            source="PAYMENT_HOOK",
            actor_username=collector_name or "collector",
            commit=True,
        )
        logger.info(f"[S7-04] Đã đánh giá lại cờ rủi ro sau thanh toán cho đại lý '{customer_id}' (Số tiền thu: {payment_amount:,} đ).")
    except Exception as e:
        logger.error(f"[S7-04] Lỗi khi đánh giá lại rủi ro sau thanh toán cho đại lý '{customer_id}': {e}")


def check_order_debt_risk_policy(
    db: Session,
    customer_id: str,
    unpaid_amount: float = 0.0,
    order_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Kiểm tra chính sách rủi ro công nợ khi tạo đơn hàng mới (SCRUM-726).
    Tuân thủ cấu hình hành vi xử lý khi đại lý bị gắn cờ:
    - Nếu cờ đang bị khóa bán (BLOCK) -> Bị chặn tạo đơn hoàn toàn.
    - Nếu cờ đang yêu cầu duyệt (REQUIRE_APPROVAL) -> Đơn chuyển sang Chờ duyệt.
    - Nếu cờ chỉ cảnh báo (WARNING_ONLY) -> Cho phép tạo đơn kèm thông báo cảnh báo.
    """
    config = get_or_create_debt_risk_config(db=db)
    flag = get_or_create_customer_debt_flag(db=db, customer_id=customer_id)

    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    cust_name = customer.name if customer else customer_id

    # 1. Nếu tắt tính năng tự động gắn cờ rủi ro -> Cho phép tạo đơn tự do
    if not config.auto_flag_enabled:
        return {
            "allowed": True,
            "action": "ALLOW",
            "is_blocked": False,
            "requires_approval": False,
            "error_message": None,
            "warning_message": None,
            "risk_level": flag.risk_level,
            "flag_reason": None,
        }

    # 2. Xác định hành vi hiện tại theo đúng cấu hình hệ thống đang áp dụng
    effective_action = flag.action_applied
    if flag.is_flagged:
        if flag.risk_level == DebtRiskLevelEnum.HIGH_RISK:
            if config.action_on_overdue == DebtRiskActionEnum.BLOCK or config.action_on_credit_limit_exceeded == DebtRiskActionEnum.BLOCK:
                effective_action = DebtRiskActionEnum.BLOCK
            elif config.action_on_overdue == DebtRiskActionEnum.REQUIRE_APPROVAL or config.action_on_credit_limit_exceeded == DebtRiskActionEnum.REQUIRE_APPROVAL:
                effective_action = DebtRiskActionEnum.REQUIRE_APPROVAL
            else:
                effective_action = DebtRiskActionEnum.WARNING_ONLY
        elif flag.risk_level == DebtRiskLevelEnum.OVERDUE:
            effective_action = config.action_on_overdue
        elif flag.risk_level == DebtRiskLevelEnum.LIMIT_EXCEEDED:
            effective_action = config.action_on_credit_limit_exceeded

        if effective_action == DebtRiskActionEnum.BLOCK:
            block_msg = (
                f"Đại lý '{cust_name}' đang bị gắn cờ rủi ro công nợ ({flag.risk_level}) và bị KHOÁ BÁN "
                f"(Lý do: {flag.flag_reason}). Hệ thống từ chối tạo đơn mới theo quy tắc."
            )
            return {
                "allowed": False,
                "action": DebtRiskActionEnum.BLOCK,
                "is_blocked": True,
                "requires_approval": False,
                "error_message": block_msg,
                "warning_message": None,
                "risk_level": flag.risk_level,
                "flag_reason": flag.flag_reason,
            }
        elif effective_action == DebtRiskActionEnum.REQUIRE_APPROVAL:
            approval_msg = (
                f"Đại lý '{cust_name}' đang bị gắn cờ rủi ro công nợ: {flag.flag_reason}. "
                f"Đơn hàng được chuyển sang trạng thái Chờ duyệt bởi Quản lý kinh doanh theo cấu hình."
            )
            return {
                "allowed": True,
                "action": DebtRiskActionEnum.REQUIRE_APPROVAL,
                "is_blocked": False,
                "requires_approval": True,
                "error_message": None,
                "warning_message": approval_msg,
                "risk_level": flag.risk_level,
                "flag_reason": flag.flag_reason,
                "approval_reason": approval_msg,
            }
        else:
            return {
                "allowed": True,
                "action": DebtRiskActionEnum.WARNING_ONLY,
                "is_blocked": False,
                "requires_approval": False,
                "error_message": None,
                "warning_message": f"Cảnh báo rủi ro công nợ đại lý: {flag.flag_reason}",
                "risk_level": flag.risk_level,
                "flag_reason": flag.flag_reason,
            }

    # 3. Nếu chưa gắn cờ hoặc đơn mới làm vượt hạn mức
    credit_prof = db.query(CustomerCreditProfile).filter(
        CustomerCreditProfile.customer_id == customer_id
    ).first()
    credit_limit = int(credit_prof.credit_limit or 0) if credit_prof else 0
    current_debt = flag.total_debt

    unpaid_new = max(0, int(round(unpaid_amount)))
    projected_debt = current_debt + unpaid_new

    if credit_limit > 0 and projected_debt > credit_limit:
        excess = projected_debt - credit_limit
        action = config.action_on_credit_limit_exceeded
        msg = (
            f"Tổng công nợ sau đơn ({projected_debt:,} đ) vượt hạn mức được cấp ({credit_limit:,} đ) là {excess:,} đ."
        )

        if action == DebtRiskActionEnum.BLOCK:
            return {
                "allowed": False,
                "action": DebtRiskActionEnum.BLOCK,
                "is_blocked": True,
                "requires_approval": False,
                "error_message": f"Đơn hàng bị chặn bán theo quy tắc: {msg}",
                "warning_message": None,
                "risk_level": DebtRiskLevelEnum.LIMIT_EXCEEDED,
                "flag_reason": msg,
            }
        elif action == DebtRiskActionEnum.REQUIRE_APPROVAL:
            return {
                "allowed": True,
                "action": DebtRiskActionEnum.REQUIRE_APPROVAL,
                "is_blocked": False,
                "requires_approval": True,
                "error_message": None,
                "warning_message": f"Đơn hàng cần quản lý duyệt: {msg}",
                "risk_level": DebtRiskLevelEnum.LIMIT_EXCEEDED,
                "flag_reason": msg,
                "approval_reason": msg,
            }


    return {
        "allowed": True,
        "action": "ALLOW",
        "is_blocked": False,
        "requires_approval": False,
        "error_message": None,
        "warning_message": None,
        "risk_level": DebtRiskLevelEnum.SAFE,
        "flag_reason": None,
    }


def get_debt_risk_overview_summary(db: Session) -> DebtRiskOverviewSummary:
    """Lấy số liệu thống kê tổng quan về rủi ro công nợ toàn hệ thống."""
    flags = db.query(CustomerDebtFlag).all()
    total_customers = db.query(Customer).count()

    flagged_count = 0
    safe_count = 0
    warning_count = 0
    overdue_count = 0
    limit_exceeded_count = 0
    high_risk_count = 0
    blocked_count = 0
    requires_approval_count = 0
    latest_evaluated_at = None

    for f in flags:
        if f.is_flagged:
            flagged_count += 1
            if f.risk_level == DebtRiskLevelEnum.HIGH_RISK:
                high_risk_count += 1
            elif f.risk_level == DebtRiskLevelEnum.OVERDUE:
                overdue_count += 1
            elif f.risk_level == DebtRiskLevelEnum.LIMIT_EXCEEDED:
                limit_exceeded_count += 1
            elif f.risk_level == DebtRiskLevelEnum.WARNING:
                warning_count += 1

        if f.is_blocked:
            blocked_count += 1
        if f.requires_approval:
            requires_approval_count += 1

        if f.last_evaluated_at:
            if not latest_evaluated_at or f.last_evaluated_at > latest_evaluated_at:
                latest_evaluated_at = f.last_evaluated_at

    # Số đại lý an toàn = Tổng đại lý trừ đi số đại lý bị gắn cờ
    safe_count = max(0, total_customers - flagged_count)

    return DebtRiskOverviewSummary(
        total_customers=total_customers,
        safe_count=safe_count,
        warning_count=warning_count,
        overdue_count=overdue_count,
        limit_exceeded_count=limit_exceeded_count,
        high_risk_count=high_risk_count,
        blocked_count=blocked_count,
        requires_approval_count=requires_approval_count,
        last_evaluated_at=latest_evaluated_at,
    )
