from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, computed_field


class CustomerLockRequest(BaseModel):
    """Yêu cầu khoá giao dịch đại lý - Bắt buộc nhập lý do (SC-228)."""
    reason: str = Field(..., min_length=3, max_length=1000, description="Lý do khoá giao dịch (bắt buộc)")

    @field_validator("reason")
    @classmethod
    def validate_reason_not_empty(cls, v: str) -> str:
        cleaned = v.strip() if v else ""
        if len(cleaned) < 3:
            raise ValueError("Lý do khoá giao dịch phải có ít nhất 3 ký tự hợp lệ.")
        return cleaned


class CustomerUnlockRequest(BaseModel):
    """Yêu cầu mở khoá giao dịch đại lý (SC-228)."""
    reason: Optional[str] = Field(None, max_length=1000, description="Lý do mở khoá giao dịch")


class CustomerLockStatusResponse(BaseModel):
    customer_id: str
    customer_name: Optional[str] = None
    is_locked: bool
    status: str
    lock_reason: Optional[str] = None
    locked_at: Optional[datetime] = None
    locked_by: Optional[str] = None
    warning_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def customerName(self) -> Optional[str]:
        return self.customer_name

    @computed_field
    def isLocked(self) -> bool:
        return self.is_locked

    @computed_field
    def lockReason(self) -> Optional[str]:
        return self.lock_reason

    @computed_field
    def lockedAt(self) -> Optional[str]:
        return self.locked_at.strftime("%Y-%m-%d %H:%M:%S") if self.locked_at else None

    @computed_field
    def lockedBy(self) -> Optional[str]:
        return self.locked_by

    @computed_field
    def warningMessage(self) -> Optional[str]:
        return self.warning_message


class CustomerLockHistoryItem(BaseModel):
    id: int
    customer_id: str
    action: str
    reason: str
    actor_username: Optional[str] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def actorUsername(self) -> Optional[str]:
        return self.actor_username

    @computed_field
    def actorName(self) -> Optional[str]:
        return self.actor_name

    @computed_field
    def actorRole(self) -> Optional[str]:
        return self.actor_role

    @computed_field
    def createdAt(self) -> Optional[str]:
        return self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None
