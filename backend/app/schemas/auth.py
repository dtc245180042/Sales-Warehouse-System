import re
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

from app.schemas.navigation import MenuItemResponse


class LoginRequest(BaseModel):
    """Schema cho request đăng nhập."""
    username: str = Field(
        ...,
        description="Tên đăng nhập hoặc địa chỉ email của người dùng",
        examples=["admin", "admin@warehouse.local"],
    )
    password: str = Field(
        ...,
        description="Mật khẩu tài khoản",
        examples=["Secret123"],
    )


class UserClaimsResponse(BaseModel):
    """Thông tin claims đầy đủ của user sau khi đăng nhập (SCRUM-203 / SCRUM-301).

    Trả về: profile, roles, permissions và cây menu điều hướng được cá nhân hóa
    theo vai trò và kho/địa bàn đang làm việc của người dùng.
    """
    id: int
    username: str
    email: str
    role: Optional[str] = None
    is_active: bool = True
    token_version: Optional[int] = 1
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    assigned_warehouse: Optional[str] = None
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    region: Optional[str] = None
    must_change_password: Optional[bool] = False

    # Claims phân quyền & menu
    roles: List[str] = []
    permissions: List[str] = []
    navigation_menus: List[MenuItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


# Alias tương thích: auth.py dùng UserResponse trong TokenResponse
UserResponse = UserClaimsResponse


class TokenResponse(BaseModel):
    """Schema phản hồi khi đăng nhập thành công."""
    access_token: str
    token_type: str = "bearer"
    user: UserClaimsResponse


# Alias tương thích
LoginResponse = TokenResponse


class ChangePasswordRequest(BaseModel):
    """Schema cho request đổi mật khẩu khi đang đăng nhập (SCRUM-307)."""
    old_password: str = Field(
        ...,
        description="Mật khẩu hiện tại",
        examples=["OldPass123"],
    )
    new_password: str = Field(
        ...,
        description="Mật khẩu mới (tối thiểu 8 ký tự, gồm cả chữ cái và chữ số)",
        examples=["NewSecurePass88"],
    )

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        """Kiểm tra độ mạnh mật khẩu: tối thiểu 8 ký tự, có chữ cái và chữ số."""
        if len(value) < 8:
            raise ValueError("Mật khẩu mới phải có độ dài tối thiểu 8 ký tự.")
        has_letter = any(c.isalpha() for c in value)
        has_digit = any(c.isdigit() for c in value)
        if not has_letter or not has_digit:
            raise ValueError("Mật khẩu mới phải chứa ít nhất một chữ cái và một chữ số.")
        return value


class ForgotPasswordRequest(BaseModel):
    """Schema cho request quên mật khẩu qua email (SCRUM-200 / SCRUM-295)."""
    email: str = Field(
        ...,
        description="Địa chỉ email cần nhận liên kết đặt lại mật khẩu",
        examples=["user@warehouse.local"],
    )

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
        if not re.match(email_regex, v):
            raise ValueError("Định dạng email không hợp lệ")
        return v


class ResetPasswordRequest(BaseModel):
    """Schema cho request đặt lại mật khẩu bằng token (SCRUM-200 / SCRUM-295)."""
    token: str = Field(
        ...,
        description="Token đặt lại mật khẩu nhận được qua email",
        examples=["abcdef123456..."],
    )
    new_password: str = Field(
        ...,
        description="Mật khẩu mới",
        examples=["NewSecurePass88"],
    )

    @field_validator("new_password")
    @classmethod
    def validate_password_min_length(cls, value: str) -> str:
        if len(value) < 6:
            raise ValueError("Mật khẩu mới phải có độ dài tối thiểu 6 ký tự.")
        return value


class MessageResponse(BaseModel):
    """Schema phản hồi thông điệp chung."""
    message: str


# Aliases tương thích
ForgotPasswordResponse = MessageResponse
ResetPasswordResponse = MessageResponse
