import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


# Biểu thức chính quy cho các đầu số di động hợp lệ tại Việt Nam (10 số):
# - Viettel: 032-039, 086, 096, 097, 098
# - VinaPhone: 081-085, 088, 091, 094
# - MobiFone: 070, 076-079, 089, 090, 093
# - Vietnamobile: 052, 056, 058, 092
# - Gmobile: 059, 099
# - Itelecom: 087
# - Wintel: 055
VN_PHONE_REGEX = re.compile(
    r"^(?:0|\+84|84)(3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-46-9])[0-9]{7}$"
)


def validate_and_normalize_vn_phone(phone: Optional[str]) -> Optional[str]:
    """Kiểm tra và chuẩn hóa số điện thoại di động Việt Nam (SCRUM-358).
    
    Quy tắc:
    - Loại bỏ khoảng trắng, dấu gạch nối, dấu chấm, ngoặc đơn.
    - Chấp nhận đầu số quốc tế: +84 hoặc 84 và chuyển về đầu số chuẩn 0.
    - Yêu cầu đúng 10 chữ số với đầu mạng viễn thông hợp lệ của Việt Nam.
    """
    if phone is None:
        return None

    cleaned = re.sub(r"[\s\-\.\(\)]", "", phone.strip())
    if not cleaned:
        return None

    if not VN_PHONE_REGEX.match(cleaned):
        raise ValueError(
            "Số điện thoại không đúng định dạng di động Việt Nam. "
            "Yêu cầu 10 chữ số với đầu số hợp lệ (ví dụ: 0901234567 hoặc +84901234567)."
        )

    # Chuẩn hóa về dạng 0xxxxxxxxx
    if cleaned.startswith("+84"):
        cleaned = "0" + cleaned[3:]
    elif cleaned.startswith("84") and len(cleaned) == 11:
        cleaned = "0" + cleaned[2:]

    return cleaned


class ProfileUpdateRequest(BaseModel):
    """Schema cập nhật hồ sơ cá nhân (SCRUM-360 & SCRUM-358).
    
    Ràng buộc nghiêm ngặt:
    - CHỈ cho phép cập nhật `full_name` và `phone_number`.
    - Cấu hình `extra = 'forbid'` để chặn mọi nỗ lực can thiệp vào các trường quản trị
      như username, role, warehouse, region, is_active...
    """
    full_name: Optional[str] = Field(
        None,
        max_length=100,
        description="Họ và tên người dùng (tối đa 100 ký tự)"
    )
    phone_number: Optional[str] = Field(
        None,
        description="Số điện thoại di động Việt Nam"
    )

    model_config = ConfigDict(extra="forbid")

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if len(cleaned) == 0:
                raise ValueError("Họ và tên không được để trống hoặc chỉ chứa khoảng trắng.")
            return cleaned
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        return validate_and_normalize_vn_phone(v)


class ProfileResponse(BaseModel):
    """Schema trả về thông tin hồ sơ người dùng (SCRUM-357)."""
    id: int
    username: str
    email: str
    role: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    assigned_warehouse: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
