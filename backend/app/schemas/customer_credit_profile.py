from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, computed_field, field_serializer


class CreditProfileUpdate(BaseModel):
    credit_limit: int = Field(
        ...,
        ge=0,
        le=10_000_000_000,
        description="Hạn mức công nợ tối đa (0 đến 10 tỷ VNĐ)"
    )
    max_debt_days: int = Field(
        ...,
        ge=0,
        le=365,
        description="Số ngày nợ tối đa cho phép (0 đến 365 ngày)"
    )
    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Lý do điều chỉnh hạn mức bắt buộc (5 - 500 ký tự)"
    )

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 5:
            raise ValueError("Lý do điều chỉnh phải chứa ít nhất 5 ký tự hợp lệ (không chỉ chứa khoảng trắng).")
        return cleaned


class CreditProfileResponse(BaseModel):
    id: int
    customer_id: str
    credit_limit: int
    max_debt_days: int
    current_debt: int
    updated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def creditLimit(self) -> int:
        return self.credit_limit

    @computed_field
    def maxDebtDays(self) -> int:
        return self.max_debt_days

    @computed_field
    def currentDebt(self) -> int:
        return self.current_debt

    @computed_field
    def availableCredit(self) -> int:
        return max(0, self.credit_limit - self.current_debt)

    @computed_field
    def updatedBy(self) -> Optional[str]:
        return self.updated_by

    @computed_field
    def updatedAt(self) -> Optional[str]:
        if not self.updated_at:
            return None
        dt = self.updated_at
        if dt.tzinfo is None:
            return dt.isoformat() + "Z"
        return dt.isoformat()


class CreditHistoryResponse(BaseModel):
    id: int
    customer_id: str
    old_credit_limit: int
    new_credit_limit: int
    old_max_debt_days: int
    new_max_debt_days: int
    reason: str
    changed_by: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("created_at")
    def serialize_created_at(self, dt: Optional[datetime], _info) -> Optional[str]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.isoformat() + "Z"
        return dt.isoformat()

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def oldCreditLimit(self) -> int:
        return self.old_credit_limit

    @computed_field
    def newCreditLimit(self) -> int:
        return self.new_credit_limit

    @computed_field
    def oldMaxDebtDays(self) -> int:
        return self.old_max_debt_days

    @computed_field
    def newMaxDebtDays(self) -> int:
        return self.new_max_debt_days

    @computed_field
    def changedBy(self) -> str:
        return self.changed_by

    @computed_field
    def createdAt(self) -> Optional[str]:
        if not self.created_at:
            return None
        dt = self.created_at
        if dt.tzinfo is None:
            return dt.isoformat() + "Z"
        return dt.isoformat()


class CreditCheckRequest(BaseModel):
    unpaid_amount: float = Field(0.0, ge=0, description="Số tiền nợ còn thiếu của đơn hàng")
    order_id: Optional[str] = Field(None, description="Mã đơn hàng (nếu đang kiểm tra đơn cụ thể)")


class CreditCheckResponse(BaseModel):
    allowed: bool = Field(..., description="Có được phép xuất kho hay không")
    error_message: Optional[str] = None
    warning_message: Optional[str] = None
    credit_limit: int = 0
    max_debt_days: int = 0
    dispatched_debt: int = 0
    order_unpaid_amount: int = 0
    excess_amount: int = 0
    overdue_days: int = 0
    overdue_order_code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
