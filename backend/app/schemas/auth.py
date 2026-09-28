import re
from pydantic import BaseModel, Field, field_validator


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
