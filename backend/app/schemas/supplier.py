from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, EmailStr, field_validator
import re


# ─── SCRUM-410: Validator dùng chung ─────────────────────────────────────────

def _validate_code(v: Optional[str]) -> Optional[str]:
    """Mã NCC phải là chữ hoa, số, dấu gạch ngang. Ví dụ: NCC-01."""
    if v is not None:
        v = v.strip().upper()
        if not re.match(r"^[A-Z0-9\-]{2,20}$", v):
            raise ValueError(
                "Mã nhà cung cấp chỉ được chứa chữ hoa, số và dấu gạch ngang (2–20 ký tự)."
            )
    return v


def _validate_tax_code(v: Optional[str]) -> Optional[str]:
    """Mã số thuế VN: 10 hoặc 13 chữ số (có thể có dấu gạch ngang ở vị trí 10)."""
    if v is not None:
        digits = re.sub(r"[-\s]", "", v)
        if not re.match(r"^\d{10}(\d{3})?$", digits):
            raise ValueError(
                "Mã số thuế không hợp lệ. Phải gồm 10 hoặc 13 chữ số (định dạng VN)."
            )
    return v


def _validate_payment_terms(v: Optional[str]) -> Optional[str]:
    """Điều khoản thanh toán: ví dụ NET30, COD, T/T 60 ngày."""
    if v is not None:
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Điều khoản thanh toán không được vượt quá 100 ký tự.")
    return v


# ─── Base ─────────────────────────────────────────────────────────────────────

class SupplierBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Tên nhà cung cấp")
    tax_code: Optional[str] = Field(None, description="Mã số thuế doanh nghiệp (10 hoặc 13 chữ số)")
    payment_terms: Optional[str] = Field(None, description="Điều khoản thanh toán. Ví dụ: NET30, COD")
    contact_person: Optional[str] = Field(None, description="Người liên hệ")
    phone: Optional[str] = Field(None, description="Số điện thoại")
    email: Optional[str] = Field(None, description="Email liên hệ")
    address: Optional[str] = Field(None, description="Địa chỉ")
    status: str = Field("active", description="Trạng thái: active (đang giao dịch) | inactive (ngừng giao dịch)")

    @field_validator("tax_code", mode="before")
    @classmethod
    def check_tax_code(cls, v):
        return _validate_tax_code(v)

    @field_validator("payment_terms", mode="before")
    @classmethod
    def check_payment_terms(cls, v):
        return _validate_payment_terms(v)

    @field_validator("status", mode="before")
    @classmethod
    def check_status(cls, v):
        if v not in ("active", "inactive"):
            raise ValueError("Trạng thái chỉ chấp nhận 'active' hoặc 'inactive'.")
        return v


# ─── Create ───────────────────────────────────────────────────────────────────

class SupplierCreate(SupplierBase):
    id: Optional[str] = None
    code: Optional[str] = None

    @field_validator("code", mode="before")
    @classmethod
    def check_code(cls, v):
        return _validate_code(v)


# ─── Update ───────────────────────────────────────────────────────────────────

class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    tax_code: Optional[str] = None
    payment_terms: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None

    @field_validator("tax_code", mode="before")
    @classmethod
    def check_tax_code(cls, v):
        return _validate_tax_code(v)

    @field_validator("payment_terms", mode="before")
    @classmethod
    def check_payment_terms(cls, v):
        return _validate_payment_terms(v)

    @field_validator("status", mode="before")
    @classmethod
    def check_status(cls, v):
        if v is not None and v not in ("active", "inactive"):
            raise ValueError("Trạng thái chỉ chấp nhận 'active' hoặc 'inactive'.")
        return v


# ─── Response ─────────────────────────────────────────────────────────────────

class SupplierResponse(SupplierBase):
    id: str
    code: str
    total_imports: int = 0
    total_spent: float = 0.0
    has_receipts: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ─── SCRUM-408: Response cảnh báo khi không thể xóa ─────────────────────────

class SupplierDeleteResponse(BaseModel):
    """Kết quả xóa hoặc ngừng giao dịch nhà cung cấp."""
    supplier_id: str
    action: str  # "deleted" | "deactivated"
    message: str
    warning: Optional[str] = None
