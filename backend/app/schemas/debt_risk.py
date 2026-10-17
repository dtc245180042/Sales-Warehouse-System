from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, field_validator


class DebtRiskConfigBase(BaseModel):
    auto_flag_enabled: bool = Field(True, description="Tự động gắn cờ rủi ro khi vi phạm")
    action_on_overdue: str = Field(
        "BLOCK",
        description="Hành vi khi nợ quá hạn: BLOCK, REQUIRE_APPROVAL, WARNING_ONLY"
    )
    action_on_credit_limit_exceeded: str = Field(
        "REQUIRE_APPROVAL",
        description="Hành vi khi vượt hạn mức: BLOCK, REQUIRE_APPROVAL, WARNING_ONLY"
    )
    grace_period_days: int = Field(0, ge=0, description="Số ngày ân hạn trước khi tính là nợ quá hạn")
    min_debt_to_flag: int = Field(0, ge=0, description="Ngưỡng số nợ tối thiểu để bắt đầu gắn cờ (VNĐ)")
    auto_lock_on_flag: bool = Field(True, description="Tự động khóa bán khi hành vi là BLOCK")
    description: Optional[str] = Field(None, description="Mô tả cấu hình")

    @field_validator("action_on_overdue", "action_on_credit_limit_exceeded")
    @classmethod
    def validate_action(cls, v: str) -> str:
        valid_actions = {"BLOCK", "REQUIRE_APPROVAL", "WARNING_ONLY"}
        v_upper = v.upper().strip()
        if v_upper not in valid_actions:
            raise ValueError(f"Hành vi phải là một trong các giá trị: {', '.join(valid_actions)}")
        return v_upper


class DebtRiskConfigUpdate(BaseModel):
    auto_flag_enabled: Optional[bool] = None
    action_on_overdue: Optional[str] = None
    action_on_credit_limit_exceeded: Optional[str] = None
    grace_period_days: Optional[int] = Field(None, ge=0)
    min_debt_to_flag: Optional[int] = Field(None, ge=0)
    auto_lock_on_flag: Optional[bool] = None
    description: Optional[str] = None

    @field_validator("action_on_overdue", "action_on_credit_limit_exceeded")
    @classmethod
    def validate_action(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        valid_actions = {"BLOCK", "REQUIRE_APPROVAL", "WARNING_ONLY"}
        v_upper = v.upper().strip()
        if v_upper not in valid_actions:
            raise ValueError(f"Hành vi phải là một trong các giá trị: {', '.join(valid_actions)}")
        return v_upper


class DebtRiskConfigResponse(DebtRiskConfigBase):
    id: int
    config_code: str
    updated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerDebtFlagResponse(BaseModel):
    id: int
    customer_id: str
    customer_name: Optional[str] = None
    is_flagged: bool
    risk_level: str
    action_applied: str
    is_blocked: bool
    requires_approval: bool
    total_debt: int
    credit_limit: int
    excess_amount: int
    overdue_amount: int
    max_overdue_days: int
    oldest_overdue_invoice_code: Optional[str] = None
    flag_reason: Optional[str] = None
    last_evaluated_at: Optional[datetime] = None
    evaluated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerDebtFlagHistoryResponse(BaseModel):
    id: int
    customer_id: str
    customer_name: Optional[str] = None
    event_type: str
    previous_risk_level: Optional[str] = None
    new_risk_level: str
    previous_is_flagged: bool
    new_is_flagged: bool
    previous_is_blocked: bool
    new_is_blocked: bool
    total_debt: int
    overdue_amount: int
    excess_amount: int
    max_overdue_days: int
    reason: str
    source: str
    actor_username: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DailyEvaluationJobResponse(BaseModel):
    total_customers_scanned: int
    total_flagged: int
    newly_flagged: int
    newly_unflagged: int
    total_blocked: int
    total_require_approval: int
    executed_at: datetime
    executed_by: str
    details: Optional[List[Dict[str, Any]]] = None


class DebtRiskOverviewSummary(BaseModel):
    total_customers: int
    safe_count: int
    warning_count: int
    overdue_count: int
    limit_exceeded_count: int
    high_risk_count: int
    blocked_count: int
    requires_approval_count: int
    last_evaluated_at: Optional[datetime] = None
