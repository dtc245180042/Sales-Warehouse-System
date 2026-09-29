"""
Router xác thực — /api/auth & /api/v1/auth

Endpoints:
  POST   /login              — Đăng nhập, trả JWT + claims (SCRUM-287, SCRUM-301)
  POST   /change-password    — Đổi mật khẩu & thu hồi phiên (SCRUM-307)
  POST   /logout             — Đăng xuất server-side (SCRUM-307)
  POST   /refresh            — Gia hạn phiên tự động (SCRUM-199)
  POST   /forgot-password    — Yêu cầu đặt lại mật khẩu (SCRUM-200)
  POST   /reset-password     — Xác nhận token & đặt mật khẩu mới (SCRUM-200)
  GET    /me                 — Thông tin user + claims (SCRUM-301)
  GET    /me/claims          — Claims đầy đủ: roles, permissions, menu (SCRUM-203)
  GET    /financial/cost-and-margin — Báo cáo giá vốn (SCRUM-202)
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.auth import User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserClaimsResponse,
)
from app.schemas.user import ActivateAccountRequest
from app.services import user_service
from app.services.auth_service import (
    GENERIC_FORGOT_PASSWORD_MESSAGE,
    build_user_claims_response,
    request_password_reset,
    reset_password_with_token,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _build_token_payload(user: User) -> dict:
    """Tạo JWT payload chuẩn từ thông tin user."""
    return {
        "sub": user.username,
        "user_id": user.id,
        "role": user.role,
        "roles": user.get_roles_list(),
        "warehouse_id": user.warehouse_id,
        "token_version": user.token_version,
    }


def _build_token_response(user: User, db: Session) -> TokenResponse:
    """Tạo TokenResponse đầy đủ gồm access_token + user claims."""
    token = create_access_token(_build_token_payload(user))
    claims = build_user_claims_response(user, db)
    return TokenResponse(access_token=token, token_type="bearer", user=claims)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Đăng nhập, xác thực phân quyền & xử lý khóa tạm 15 phút (SCRUM-287, SCRUM-301)",
)
def login(
    request_body: LoginRequest,
    db: Session = Depends(get_db),
):
    """Xác thực đăng nhập:
    - Tìm kiếm theo username hoặc email.
    - Kiểm tra trạng thái khóa tạm thời 15 phút (SCRUM-287).
    - Nếu sai mật khẩu >= 5 lần thì khóa 15 phút.
    - Tạo JWT mang user_id, roles, warehouse_id, token_version.
    - Trả về token + claims đầy đủ (roles, permissions, navigation_menus).
    """
    now = datetime.now(timezone.utc)
    identifier = request_body.username.strip()

    user = db.query(User).filter(
        (User.username == identifier) | (User.email == identifier.lower())
    ).first()

    if user:
        # 1. Kiểm tra tài khoản bị khóa tạm thời
        if user.da_bi_khoa():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản tạm thời bị khóa trong 15 phút do nhập sai nhiều lần.",
            )

        # Tự động mở khóa nếu đã hết thời gian
        if user.locked_until and not user.da_bi_khoa():
            user.locked_until = None
            user.failed_login_attempts = 0
            db.commit()

        # 2. Kiểm tra tài khoản active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
            )

        # 3. Xác thực mật khẩu
        if not verify_password(request_body.password, user.hashed_password):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=settings.ACCOUNT_LOCK_MINUTES)
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tài khoản tạm thời bị khóa trong 15 phút do nhập sai nhiều lần.",
                )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tên đăng nhập hoặc mật khẩu không chính xác",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Đăng nhập thành công: reset bộ đếm sai
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()

        return _build_token_response(user, db)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tên đăng nhập hoặc mật khẩu không chính xác",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Đổi mật khẩu & thu hồi các phiên đăng nhập khác (SCRUM-307)",
)
def change_password(
    request_body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Đổi mật khẩu người dùng đang đăng nhập:
    - Xác thực mật khẩu cũ chính xác.
    - Cập nhật mật khẩu mới (đã hash).
    - Tăng token_version để thu hồi toàn bộ token cũ (SCRUM-307).
    """
    if not verify_password(request_body.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không chính xác.",
        )
    if verify_password(request_body.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới không được trùng với mật khẩu hiện tại.",
        )

    current_user.hashed_password = get_password_hash(request_body.new_password)
    current_user.token_version += 1
    current_user.must_change_password = False
    db.commit()

    return MessageResponse(
        message="Đổi mật khẩu thành công. Các phiên đăng nhập trên thiết bị khác đã được đăng xuất."
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Đăng xuất và hủy phiên đăng nhập server-side (SCRUM-307)",
)
def logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Đăng xuất an toàn bằng cách tăng token_version trong database."""
    current_user.token_version += 1
    db.commit()
    return MessageResponse(message="Đăng xuất thành công. Phiên đăng nhập đã bị vô hiệu hóa phía máy chủ.")


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Gia hạn phiên đăng nhập tự động khi người dùng đang hoạt động (SCRUM-199)",
)
def refresh_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cấp access token mới khi phiên cũ vẫn còn hiệu lực và người dùng đang thao tác."""
    return _build_token_response(current_user, db)


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Yêu cầu đặt lại mật khẩu qua email (SCRUM-200 / SCRUM-295)",
)
def forgot_password(
    request_body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Gửi liên kết đặt lại mật khẩu:
    - Sinh token an toàn, lưu DB và gửi email bất đồng bộ.
    - Luôn trả thông báo chung (chống rò rỉ dữ liệu / User Enumeration).
    """
    email = request_body.email.strip().lower()

    # Cập nhật cả trường reset_password_token trên User (tương thích ngược)
    user = db.query(User).filter(User.email == email).first()
    if user:
        token_str = secrets.token_urlsafe(32)
        user.reset_password_token = token_str
        user.reset_password_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        db.commit()

    # Service xử lý PasswordResetToken + gửi email
    msg = request_password_reset(db=db, email=email, background_tasks=background_tasks)
    return MessageResponse(message=msg or GENERIC_FORGOT_PASSWORD_MESSAGE)


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Đặt lại mật khẩu mới bằng token (SCRUM-200 / SCRUM-295)",
)
def reset_password(
    request_body: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Xác nhận token và đặt lại mật khẩu mới:
    - Kiểm tra token hợp lệ và còn hạn.
    - Đổi xong hủy token (chỉ dùng 1 lần) và tăng token_version.
    """
    token = request_body.token.strip()
    now = datetime.now(timezone.utc)

    # Thử qua User.reset_password_token trước (tương thích ngược)
    user = db.query(User).filter(User.reset_password_token == token).first()
    if user and user.reset_password_expires_at:
        expires_at = user.reset_password_expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if now > expires_at:
            user.reset_password_token = None
            user.reset_password_expires_at = None
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút). Vui lòng yêu cầu lại.",
            )

        user.hashed_password = get_password_hash(request_body.new_password)
        user.reset_password_token = None
        user.reset_password_expires_at = None
        user.token_version += 1
        db.commit()
        return MessageResponse(message="Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.")

    # Thử qua PasswordResetToken (SCRUM-295)
    msg = reset_password_with_token(db=db, token=token, new_password=request_body.new_password)
    return MessageResponse(message=msg)


@router.post(
    "/activate",
    response_model=MessageResponse,
    summary="Kích hoạt tài khoản bằng mã token gửi qua email (SCRUM-323)",
)
def activate_account(
    request_body: ActivateAccountRequest,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Kích hoạt tài khoản người dùng bằng token (SCRUM-323)."""
    user = user_service.activate_user_with_token(
        token=request_body.token,
        new_password=request_body.new_password,
        db=db,
    )
    return MessageResponse(
        message=f"Tài khoản '{user.username}' đã được kích hoạt thành công."
    )


@router.get(
    "/me",
    response_model=UserClaimsResponse,
    summary="Thông tin user đang đăng nhập kèm claims đầy đủ (SCRUM-301)",
)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trả về profile + roles + permissions + cây menu điều hướng của user đang xác thực."""
    return build_user_claims_response(current_user, db)


@router.get(
    "/me/claims",
    response_model=UserClaimsResponse,
    summary="Claims đầy đủ: roles, permissions và menu theo vai trò/kho (SCRUM-203)",
)
def get_me_claims(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cung cấp claims chi tiết sau đăng nhập cho Frontend (SCRUM-203):

    - `roles`: danh sách mã vai trò (e.g. ["ADMIN", "WH_MANAGER"]).
    - `permissions`: danh sách mã quyền (e.g. ["order:view", "stock_in:create"]).
    - `navigation_menus`: cây menu được lọc theo quyền — FE dùng để render Sidebar.
    - `warehouse_id` / `warehouse_name` / `region`: context kho/địa bàn hiện tại.

    Đảm bảo dữ liệu đủ để FE phân biệt menu hiển thị theo kho hoặc địa bàn làm việc.
    """
    return build_user_claims_response(current_user, db)


# ---------------------------------------------------------------------------
# Endpoints demo Guard phân quyền (SCRUM-310 / Story S1-05)
# ---------------------------------------------------------------------------

@router.get(
    "/demo/sales-manager-or-admin",
    response_model=MessageResponse,
    summary="Demo Guard: Chỉ Sales Manager hoặc Admin (SCRUM-310)",
)
def demo_sales_manager_or_admin(
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SALES_MANAGER)),
):
    """Endpoint bảo vệ mẫu: chỉ Admin hoặc Sales Manager được phép gọi."""
    return MessageResponse(
        message=f"Xin chào {current_user.username}! Bạn đã truy cập thành công khu vực Quản lý Bán hàng với vai trò [{current_user.role}]."
    )


@router.get(
    "/demo/warehouse-only",
    response_model=MessageResponse,
    summary="Demo Guard: Chỉ Warehouse / WH Manager / Admin (SCRUM-310)",
)
def demo_warehouse_only(
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.WH_MANAGER, UserRole.WAREHOUSE)),
):
    """Endpoint bảo vệ mẫu: chỉ Admin, WH Manager hoặc Warehouse được phép gọi."""
    return MessageResponse(
        message=f"Xin chào {current_user.username}! Bạn đã truy cập thành công phân hệ Quản lý Kho với vai trò [{current_user.role}]."
    )


@router.get(
    "/financial/cost-and-margin",
    summary="Báo cáo Giá vốn & Biên lợi nhuận — chỉ Sales Manager hoặc Admin (SCRUM-202)",
)
def get_cost_and_margin(
    current_user: User = Depends(require_role(UserRole.SALES_MANAGER, UserRole.ADMIN)),
):
    """Kiểm tra quyền tầng server: nhân viên kho, kế toán không có quyền truy cập."""
    return {
        "status": "success",
        "authorized_role": current_user.role,
        "data": [
            {"product_sku": "SKU-BIA-SG-SPEC", "cost_price": 10500, "selling_price": 15000, "profit_margin": "30.0%"},
            {"product_sku": "SKU-CHOCOPIE-OR",  "cost_price": 38000, "selling_price": 55000, "profit_margin": "30.9%"},
            {"product_sku": "SKU-LAVIE-500",    "cost_price": 3500,  "selling_price": 6000,  "profit_margin": "41.6%"},
            {"product_sku": "SKU-STING-DAU",    "cost_price": 6800,  "selling_price": 10000, "profit_margin": "32.0%"},
            {"product_sku": "SKU-SUA-VNM-180",  "cost_price": 6000,  "selling_price": 8500,  "profit_margin": "29.4%"},
        ],
    }


# ---------------------------------------------------------------------------
# Backward-compatibility aliases (legacy Vietnamese names — do NOT use in new code)
# ---------------------------------------------------------------------------
dang_nhap = login
doi_mat_khau = change_password
dang_xuat = logout
gia_han_phien = refresh_token
quen_mat_khau = forgot_password
dat_lai_mat_khau = reset_password
lay_thong_tin_toi = get_me
get_current_user_profile = get_me
demo_khu_vuc_quan_ly_ban_hang_hoac_admin = demo_sales_manager_or_admin
demo_khu_vuc_danh_rieng_cho_kho = demo_warehouse_only
bao_cao_gia_von_va_bien_loi_nhuan = get_cost_and_margin
