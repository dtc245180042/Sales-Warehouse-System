from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon, lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.models.debt_risk import CustomerDebtFlag, CustomerDebtFlagHistory
from app.schemas.debt_risk import (
    DebtRiskConfigResponse,
    DebtRiskConfigUpdate,
    CustomerDebtFlagResponse,
    CustomerDebtFlagHistoryResponse,
    DailyEvaluationJobResponse,
    DebtRiskOverviewSummary,
)
from app.services import debt_risk_service
from app.services.customer_assignment_service import check_sales_rep_customer_scope

router = APIRouter(prefix="/debt-risk", tags=["Rủi ro công nợ & Khóa bán"])


@router.get(
    "/config",
    response_model=DebtRiskConfigResponse,
    summary="Lấy cấu hình hành vi xử lý khi đại lý bị gắn cờ rủi ro (SCRUM-727)"
)
def get_debt_risk_config(
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Trả về cấu hình hành vi quy tắc rủi ro công nợ hiện thời của hệ thống:
    - action_on_overdue: BLOCK | REQUIRE_APPROVAL | WARNING_ONLY
    - action_on_credit_limit_exceeded: BLOCK | REQUIRE_APPROVAL | WARNING_ONLY
    - grace_period_days: Số ngày ân hạn
    - min_debt_to_flag: Ngưỡng nợ tối thiểu
    - auto_flag_enabled: Tự động gắn cờ
    """
    return debt_risk_service.get_or_create_debt_risk_config(db=db)


@router.put(
    "/config",
    response_model=DebtRiskConfigResponse,
    summary="Cập nhật cấu hình hành vi xử lý khi đại lý bị gắn cờ (SCRUM-727)"
)
def update_debt_risk_config(
    data: DebtRiskConfigUpdate,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Cập nhật quy tắc xử lý khi đại lý vượt hạn mức hoặc quá hạn nợ.
    Quyền: Kế toán công nợ, Quản lý kinh doanh, Admin.
    Lưu audit trail bất biến.
    """
    return debt_risk_service.update_debt_risk_config(
        db=db,
        data=data,
        current_user=current_user,
    )


@router.get(
    "/flags",
    response_model=List[CustomerDebtFlagResponse],
    summary="Danh sách trạng thái cờ rủi ro của các đại lý (SCRUM-732)"
)
def list_customer_debt_flags(
    search: Optional[str] = Query(None, description="Tìm kiếm theo mã hoặc tên đại lý"),
    risk_level: Optional[str] = Query(None, description="Lọc theo cấp độ: SAFE, WARNING, OVERDUE, LIMIT_EXCEEDED, HIGH_RISK"),
    is_flagged: Optional[bool] = Query(None, description="Lọc đại lý đang bị gắn cờ"),
    is_blocked: Optional[bool] = Query(None, description="Lọc đại lý đang bị khóa bán"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy danh sách cờ rủi ro công nợ kèm thông tin dư nợ và hành vi áp dụng."""
    query = db.query(CustomerDebtFlag)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (CustomerDebtFlag.customer_id.ilike(s)) |
            (CustomerDebtFlag.customer_name.ilike(s))
        )
    if risk_level:
        query = query.filter(CustomerDebtFlag.risk_level == risk_level.upper())
    if is_flagged is not None:
        query = query.filter(CustomerDebtFlag.is_flagged == is_flagged)
    if is_blocked is not None:
        query = query.filter(CustomerDebtFlag.is_blocked == is_blocked)

    return query.order_by(CustomerDebtFlag.is_flagged.desc(), CustomerDebtFlag.total_debt.desc()).offset(skip).limit(limit).all()


@router.get(
    "/flags/{customer_id}",
    response_model=CustomerDebtFlagResponse,
    summary="Lấy chi tiết cờ rủi ro của đại lý (SCRUM-732)"
)
def get_customer_debt_flag(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Tra cứu trạng thái cờ rủi ro công nợ hiện thời của 1 đại lý."""
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    return debt_risk_service.get_or_create_customer_debt_flag(db=db, customer_id=customer_id)


@router.post(
    "/flags/{customer_id}/reevaluate",
    response_model=CustomerDebtFlagResponse,
    summary="Kích hoạt đánh giá lại trạng thái công nợ ngay lập tức cho đại lý (SCRUM-725, SCRUM-729)"
)
def reevaluate_customer_debt_flag(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Tính toán lại dư nợ thực tế và nợ quá hạn của đại lý,
    tự động cập nhật cờ rủi ro, áp dụng khóa bán hoặc mở khóa bán.
    """
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    actor = current_user.username if current_user else "system"
    return debt_risk_service.evaluate_customer_debt_risk(
        db=db,
        customer_id=customer_id,
        source="MANUAL_REEVALUATE",
        actor_username=actor,
        commit=True,
    )


@router.get(
    "/flags/{customer_id}/history",
    response_model=List[CustomerDebtFlagHistoryResponse],
    summary="Xem lịch sử cảnh báo và trạng thái khoá/bỏ khoá do công nợ của đại lý (SCRUM-731)"
)
def get_customer_debt_flag_history(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy danh sách các lần cảnh báo, gắn cờ, gỡ cờ, khóa và bỏ khóa bán của đại lý."""
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    return db.query(CustomerDebtFlagHistory).filter(
        CustomerDebtFlagHistory.customer_id == customer_id
    ).order_by(CustomerDebtFlagHistory.id.desc()).all()


@router.get(
    "/history",
    response_model=List[CustomerDebtFlagHistoryResponse],
    summary="Lịch sử cảnh báo và thay đổi trạng thái rủi ro công nợ toàn hệ thống (SCRUM-731)"
)
def list_debt_risk_histories(
    event_type: Optional[str] = Query(None, description="Lọc theo loại sự kiện: FLAGGED, UNFLAGGED, AUTO_LOCKED, AUTO_UNLOCKED, REEVALUATED, CONFIG_CHANGED"),
    customer_id: Optional[str] = Query(None, description="Lọc theo mã đại lý"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Truy vết toàn bộ biến động cảnh báo và khóa/bỏ khóa do công nợ trên hệ thống."""
    query = db.query(CustomerDebtFlagHistory)
    if event_type:
        query = query.filter(CustomerDebtFlagHistory.event_type == event_type.upper())
    if customer_id:
        query = query.filter(CustomerDebtFlagHistory.customer_id == customer_id)
    return query.order_by(CustomerDebtFlagHistory.id.desc()).offset(skip).limit(limit).all()


@router.post(
    "/jobs/daily-evaluation",
    response_model=DailyEvaluationJobResponse,
    summary="Chạy tác vụ đánh giá lại trạng thái rủi ro công nợ hằng ngày (SCRUM-728)"
)
def run_daily_evaluation_job(
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Thực thi tác vụ quét định kỳ hàng ngày (Job) để đánh giá lại toàn bộ đại lý:
    - Gắn cờ tự động các đại lý mới vi phạm quá hạn hoặc vượt hạn mức
    - Gỡ cờ tự động các đại lý đã hết nợ vi phạm
    - Áp dụng khóa bán hoặc chuyển duyệt theo cấu hình
    """
    return debt_risk_service.run_daily_debt_risk_evaluation_job(
        db=db,
        current_user=current_user,
    )


@router.get(
    "/summary",
    response_model=DebtRiskOverviewSummary,
    summary="Lấy số liệu thống kê tổng quan về rủi ro công nợ"
)
def get_debt_risk_summary(
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Cung cấp số lượng đại lý theo từng mức độ rủi ro (SAFE, WARNING, OVERDUE, LIMIT_EXCEEDED, HIGH_RISK, BLOCKED)."""
    return debt_risk_service.get_debt_risk_overview_summary(db=db)
