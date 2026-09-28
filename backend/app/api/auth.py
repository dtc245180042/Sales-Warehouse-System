from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token
from app.api.deps import get_current_user
from app.models.auth import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    LoginRequest,
    LoginResponse,
    UserClaimsResponse
)
from app.services.auth_service import (
    request_password_reset,
    reset_password_with_token,
    authenticate_user,
    build_user_claims_response
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db)
):
    """API Đăng nhập hệ thống (SCRUM-301):
    - Xác thực thông tin tài khoản và mật khẩu.
    - Cấp JWT access token.
    - Trả về toàn bộ claims phân quyền: roles, permissions, context kho/địa bàn và cây menu điều hướng được phép truy cập.
    """
    user = authenticate_user(db, payload.username, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Đóng gói JWT token
    access_token = create_access_token(data={
        "sub": user.username,
        "user_id": user.id,
        "roles": user.get_roles_list(),
        "warehouse_id": user.warehouse_id
    })

    # Dựng claims và cây menu theo quyền
    user_claims = build_user_claims_response(user, db)

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_claims
    )


@router.get("/me", response_model=UserClaimsResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """API Lấy thông tin claims và cây menu điều hướng của người dùng hiện tại sau khi đã đăng nhập (SCRUM-301).
    - FE sử dụng API này để dựng menu Sidebar, ẩn/hiện nút bấm theo quyền và hiển thị kho/địa bàn công tác.
    """
    return build_user_claims_response(current_user, db)


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
