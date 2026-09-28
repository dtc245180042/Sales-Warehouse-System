import re
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
from app.schemas.navigation import MenuItemResponse


class LoginRequest(BaseModel):
    """Schema cho request đăng nhập."""
    username: str = Field(
        ...,
        description="Tên đăng nhập hoặc địa chỉ email của người dùng",
        examples=["admin", "admin@warehouse.local"]
    )
    password: str = Field(
        ...,
        description="Mật khẩu tài khoản",
        examples=["Secret123"]
    )


class UserResponse(BaseModel):
    """Thông tin user trả về cho client kèm vai trò, quyền hạn và menu điều hướng (SCRUM-301)."""
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

    # Phân quyền & menu
    roles: List[str] = []
    permissions: List[str] = []
    navigation_menus: List[MenuItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


# Bí danh tương thích cho SCRUM-301 claims
UserClaimsResponse = UserResponse


class TokenResponse(BaseModel):
    """Schema phản hồi khi đăng nhập thành công."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Bí danh tương thích
LoginResponse = TokenResponse


class ChangePasswordRequest(BaseModel):
    """Schema cho request đổi mật khẩu khi đang đăng nhập (SCRUM-307)."""
    old_password: str = Field(
        ...,
        description="Mật khẩu hiện tại",
        examples=["OldPass123"]
    )
    new_password: str = Field(
        ...,
        description="Mật khẩu mới (tối thiểu 8 ký tự, gồm cả chữ cái và chữ số)",
        examples=["NewSecurePass88"]
    )

    @field_validator("new_password")
    @classmethod
    def kiem_tra_do_manh_mat_khau(cls, gia_tri_mat_khau: str) -> str:
        if len(gia_tri_mat_khau) < 8:
            raise ValueError("Mật khẩu mới phải có độ dài tối thiểu 8 ký tự.")
        
        co_chu_cai = any(ky_tu.isalpha() for ky_tu in gia_tri_mat_khau)
        co_chu_so = any(ky_tu.isdigit() for ky_tu in gia_tri_mat_khau)

        if not co_chu_cai or not co_chu_so:
            raise ValueError("Mật khẩu mới phải chứa ít nhất một chữ cái và một chữ số.")

        return gia_tri_mat_khau


class ForgotPasswordRequest(BaseModel):
    """Schema cho request quên mật khẩu qua email (SCRUM-200 / SCRUM-295)."""
    email: str = Field(
        ...,
        description="Địa chỉ email cần nhận liên kết đặt lại mật khẩu",
        examples=["user@warehouse.local"]
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
        examples=["abcdef123456..."]
    )
    new_password: str = Field(
        ...,
        description="Mật khẩu mới",
        examples=["NewSecurePass88"]
    )

    @field_validator("new_password")
    @classmethod
    def kiem_tra_do_manh_mat_khau(cls, gia_tri_mat_khau: str) -> str:
        if len(gia_tri_mat_khau) < 6:
            raise ValueError("Mật khẩu mới phải có độ dài tối thiểu 6 ký tự.")
        return gia_tri_mat_khau


class MessageResponse(BaseModel):
    """Schema phản hồi thông điệp chung."""
    message: str


# Bí danh tương thích
ForgotPasswordResponse = MessageResponse
ResetPasswordResponse = MessageResponse
