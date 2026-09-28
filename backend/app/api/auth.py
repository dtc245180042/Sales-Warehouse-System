from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse
)
from app.services.auth_service import request_password_reset, reset_password_with_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """API Yêu cầu đặt lại mật khẩu và gửi email liên kết (SCRUM-295).
    - Tạo liên kết đặt lại mật khẩu an toàn có thời hạn.
    - Gửi email ngầm không làm chậm thời gian phản hồi API.
    - Luôn trả về thông báo chung kể cả khi email không tồn tại (chống lộ danh tính tài khoản).
    """
    message = request_password_reset(db=db, email=payload.email, background_tasks=background_tasks)
    return ForgotPasswordResponse(message=message)


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """API Đặt lại mật khẩu mới thông qua mã token xác thực."""
    message = reset_password_with_token(db=db, token=payload.token, new_password=payload.new_password)
    return ResetPasswordResponse(message=message)
