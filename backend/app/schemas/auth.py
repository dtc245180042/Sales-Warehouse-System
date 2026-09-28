from pydantic import BaseModel, Field, field_validator, ConfigDict


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
    """Thông tin user trả về cho client."""
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    token_version: int

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """Schema phản hồi khi đăng nhập thành công."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


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
        """Kiểm tra độ mạnh của mật khẩu mới theo yêu cầu:
        - Tối thiểu 8 ký tự
        - Phải chứa cả chữ cái và chữ số
        """
        if len(gia_tri_mat_khau) < 8:
            raise ValueError("Mật khẩu mới phải có độ dài tối thiểu 8 ký tự.")
        
        co_chu_cai = any(ky_tu.isalpha() for ky_tu in gia_tri_mat_khau)
        co_chu_so = any(ky_tu.isdigit() for ky_tu in gia_tri_mat_khau)

        if not co_chu_cai or not co_chu_so:
            raise ValueError("Mật khẩu mới phải chứa ít nhất một chữ cái và một chữ số.")

        return gia_tri_mat_khau


class MessageResponse(BaseModel):
    """Schema phản hồi thông điệp chung."""
    message: str
