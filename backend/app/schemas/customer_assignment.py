from datetime import datetime
from typing import Optional, List, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator, field_serializer, computed_field


class CustomerAssignRequest(BaseModel):
    assigned_staff_id: Union[int, str] = Field(..., description="ID nhân viên kinh doanh được gán phụ trách")
    reason: str = Field(..., min_length=5, max_length=500, description="Lý do phân công (5 - 500 ký tự)")

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 5:
            raise ValueError("Lý do phân công phải chứa ít nhất 5 ký tự hợp lệ.")
        return cleaned


class CustomerUnassignRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500, description="Lý do hủy phân công (5 - 500 ký tự)")

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 5:
            raise ValueError("Lý do hủy phân công phải chứa ít nhất 5 ký tự hợp lệ.")
        return cleaned


class BulkTransferRequest(BaseModel):
    from_staff_id: Union[int, str] = Field(..., description="ID nhân viên kinh doanh cũ")
    to_staff_id: Union[int, str] = Field(..., description="ID nhân viên kinh doanh tiếp nhận")
    transfer_all: bool = Field(False, description="Cờ xác định chuyển giao toàn bộ đại lý của nhân viên cũ")
    customer_ids: List[str] = Field(default_factory=list, description="Danh sách ID đại lý muốn chuyển giao")
    reason: str = Field(..., min_length=5, max_length=500, description="Lý do chuyển giao (5 - 500 ký tự)")

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 5:
            raise ValueError("Lý do chuyển giao phải chứa ít nhất 5 ký tự hợp lệ.")
        return cleaned


class CustomerAssignmentBrief(BaseModel):
    id: Optional[int] = None
    customer_id: str
    customer_name: Optional[str] = None
    assigned_staff_id: Optional[Union[str, int]] = None
    assigned_staff_name: Optional[str] = None
    assigned_staff_phone: Optional[str] = None
    assigned_by: Optional[str] = None
    assigned_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def customerName(self) -> Optional[str]:
        return self.customer_name

    @computed_field
    def assignedStaffId(self) -> Optional[str]:
        return str(self.assigned_staff_id) if self.assigned_staff_id is not None else None

    @computed_field
    def assignedStaffName(self) -> Optional[str]:
        return self.assigned_staff_name

    @computed_field
    def assignedStaffPhone(self) -> Optional[str]:
        return self.assigned_staff_phone

    @computed_field
    def assignedBy(self) -> Optional[str]:
        return self.assigned_by

    @computed_field
    def assignedAt(self) -> Optional[str]:
        if not self.assigned_at:
            return None
        dt = self.assigned_at
        if dt.tzinfo is None:
            return dt.isoformat() + "Z"
        return dt.isoformat()


class CustomerAssignmentHistoryResponse(BaseModel):
    id: int
    batch_id: Optional[str] = None
    customer_id: str
    customer_name: str
    from_staff_id: Optional[str] = None
    from_staff_name: Optional[str] = None
    to_staff_id: Optional[str] = None
    to_staff_name: Optional[str] = None
    action_type: str
    reason: str
    performed_by: str
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
    def batchId(self) -> Optional[str]:
        return self.batch_id

    @computed_field
    def customerId(self) -> str:
        return self.customer_id

    @computed_field
    def customerName(self) -> str:
        return self.customer_name

    @computed_field
    def fromStaffId(self) -> Optional[str]:
        return self.from_staff_id

    @computed_field
    def fromStaffName(self) -> Optional[str]:
        return self.from_staff_name

    @computed_field
    def toStaffId(self) -> Optional[str]:
        return self.to_staff_id

    @computed_field
    def toStaffName(self) -> Optional[str]:
        return self.to_staff_name

    @computed_field
    def actionType(self) -> str:
        return self.action_type

    @computed_field
    def performedBy(self) -> str:
        return self.performed_by

    @computed_field
    def createdAt(self) -> Optional[str]:
        if not self.created_at:
            return None
        dt = self.created_at
        if dt.tzinfo is None:
            return dt.isoformat() + "Z"
        return dt.isoformat()


class SalesRepBrief(BaseModel):
    id: Union[str, int]
    username: str
    full_name: str
    email: str
    phone_number: Optional[str] = None
    is_active: bool = True
    assigned_customer_count: int = 0

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("id")
    def serialize_id(self, v: Union[str, int], _info) -> str:
        return str(v)

    @computed_field
    def fullName(self) -> str:
        return self.full_name

    @computed_field
    def phoneNumber(self) -> Optional[str]:
        return self.phone_number

    @computed_field
    def isActive(self) -> bool:
        return self.is_active

    @computed_field
    def assignedCustomerCount(self) -> int:
        return self.assigned_customer_count
