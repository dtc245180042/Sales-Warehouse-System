import re
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
from app.schemas.navigation import MenuItemResponse


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., description="Email đã đăng ký tài khoản")

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        # Regex kiểm tra cú pháp email cơ bản an toàn
        email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
        if not re.match(email_regex, v):
            raise ValueError("Định dạng email không hợp lệ")
        return v


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="Token đặt lại mật khẩu nhận được qua email")
    new_password: str = Field(..., min_length=6, description="Mật khẩu mới (tối thiểu 6 ký tự)")


class ResetPasswordResponse(BaseModel):
    message: str


class LoginRequest(BaseModel):
    username: str = Field(..., description="Tên đăng nhập")
    password: str = Field(..., description="Mật khẩu")


class UserClaimsResponse(BaseModel):
    """Thông tin chi tiết của người dùng sau đăng nhập, kèm phân quyền và cây menu tương ứng (SCRUM-301)."""
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    is_active: bool
    
    # Phân vùng kho và địa bàn phụ trách
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    region: Optional[str] = None

    # Claims phân quyền
    roles: List[str] = []
    permissions: List[str] = []

    # Danh sách menu điều hướng được phép truy cập
    navigation_menus: List[MenuItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserClaimsResponse
