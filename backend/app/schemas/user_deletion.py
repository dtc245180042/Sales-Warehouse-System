from typing import Optional
from pydantic import BaseModel, ConfigDict


class UserDependencyDetails(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    orders_count: int = 0
    stock_receipts_count: int = 0
    price_lists_count: int = 0
    audit_logs_count: int = 0


class UserCanDeleteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    username: str
    full_name: Optional[str] = None
    can_delete: bool
    has_dependencies: bool
    dependencies: UserDependencyDetails
    reason: str
    suggested_action: str  # "delete" hoặc "lock"


class UserDeleteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    success: bool
    message: str
    deleted_user_id: int
    action_taken: str  # "deleted"
