import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import lay_phien_db
from app.core.security import kiem_tra_mat_khau, bam_mat_khau, tao_token_truy_cap
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro
from app.models.auth import User, UserRole, PasswordResetToken
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    UserResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    MessageResponse,
)
from app.services.auth_service import (
    request_password_reset,
    reset_password_with_token,
    build_user_claims_response,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _chuan_bi_user_response(user: User, db: Session) -> UserResponse:
    """Helper đóng gói UserResponse kèm roles, permissions và cây menu điều hướng."""
    try:
        claims = build_user_claims_response(user, db)
        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role,
            is_active=user.is_active,
            token_version=user.token_version,
            full_name=user.full_name,
            phone_number=user.phone_number,
            assigned_warehouse=user.assigned_warehouse or user.warehouse_name,
            warehouse_id=user.warehouse_id,
            warehouse_name=user.warehouse_name,
            region=user.region,
            must_change_password=user.must_change_password,
            roles=claims.roles,
            permissions=claims.permissions,
            navigation_menus=claims.navigation_menus,
        )
    except Exception:
        roles = user.get_roles_list()
        permissions = user.get_permissions_list()
        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role,
            is_active=user.is_active,
            token_version=user.token_version,
            full_name=user.full_name,
            phone_number=user.phone_number,
            assigned_warehouse=user.assigned_warehouse or user.warehouse_name,
            warehouse_id=user.warehouse_id,
            warehouse_name=user.warehouse_name,
            region=user.region,
            must_change_password=user.must_change_password,
            roles=roles,
            permissions=permissions,
            navigation_menus=[],
        )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Đăng nhập tài khoản, xác thực phân quyền & xử lý khóa tạm 15 phút (SCRUM-287 & SCRUM-301)"
)
def dang_nhap(
    du_lieu_yeu_cau: LoginRequest,
    phien_db: Session = Depends(lay_phien_db)
):
    """Xác thực đăng nhập:
    - Tìm kiếm theo username hoặc email.
    - Kiểm tra trạng thái khóa tạm thời 15 phút (SCRUM-287).
    - Kiểm tra mật khẩu, nếu sai >= 5 lần thì khóa 15 phút.
    - Tạo JWT token mang user_id, roles, warehouse_id và token_version.
    - Trả về token cùng thông tin người dùng, roles, permissions và cây menu điều hướng.
    """
    thoi_gian_hien_tai = datetime.now(timezone.utc)
    dinh_danh = du_lieu_yeu_cau.username.strip()

    nguoi_dung = phien_db.query(User).filter(
        (User.username == dinh_danh) | (User.email == dinh_danh.lower())
    ).first()

    if nguoi_dung:
        # 1. Kiểm tra trạng thái khóa tạm thời
        if nguoi_dung.da_bi_khoa():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản tạm thời bị khóa trong 15 phút do nhập sai nhiều lần."
            )

        # Nếu đã qua thời gian khóa thì tự động mở lại
        if nguoi_dung.locked_until and not nguoi_dung.da_bi_khoa():
            nguoi_dung.locked_until = None
            nguoi_dung.failed_login_attempts = 0
            phien_db.commit()

        # 2. Kiểm tra tài khoản có bị vô hiệu hóa không
        if not nguoi_dung.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên."
            )

        # 3. Xác thực mật khẩu
        if not kiem_tra_mat_khau(du_lieu_yeu_cau.password, nguoi_dung.hashed_password):
            nguoi_dung.failed_login_attempts += 1

            if nguoi_dung.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
                nguoi_dung.locked_until = thoi_gian_hien_tai + timedelta(minutes=settings.ACCOUNT_LOCK_MINUTES)
                phien_db.commit()
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tài khoản tạm thời bị khóa trong 15 phút do nhập sai nhiều lần."
                )

            phien_db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tên đăng nhập hoặc mật khẩu không chính xác",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Đăng nhập thành công: reset số lần sai
        nguoi_dung.failed_login_attempts = 0
        nguoi_dung.locked_until = None
        phien_db.commit()

        # Đóng gói JWT access token
        du_lieu_token = {
            "sub": nguoi_dung.username,
            "user_id": nguoi_dung.id,
            "role": nguoi_dung.role,
            "roles": nguoi_dung.get_roles_list(),
            "warehouse_id": nguoi_dung.warehouse_id,
            "token_version": nguoi_dung.token_version
        }
        token_jwt = tao_token_truy_cap(du_lieu_token)
        user_res = _chuan_bi_user_response(nguoi_dung, phien_db)

        return TokenResponse(
            access_token=token_jwt,
            token_type="bearer",
            user=user_res
        )

    # Nếu người dùng không tồn tại
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tên đăng nhập hoặc mật khẩu không chính xác",
        headers={"WWW-Authenticate": "Bearer"}
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Đổi mật khẩu & thu hồi các phiên đăng nhập khác (SCRUM-307)"
)
def doi_mat_khau(
    du_lieu_yeu_cau: ChangePasswordRequest,
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Đổi mật khẩu người dùng đang đăng nhập:
    - Xác thực mật khẩu cũ chính xác.
    - Cập nhật mật khẩu mới (đã hash).
    - Tăng token_version thêm 1 để thu hồi các token cũ.
    """
    if not kiem_tra_mat_khau(du_lieu_yeu_cau.old_password, nguoi_dung_hien_tai.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không chính xác."
        )

    if kiem_tra_mat_khau(du_lieu_yeu_cau.new_password, nguoi_dung_hien_tai.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới không được trùng với mật khẩu hiện tại."
        )

    nguoi_dung_hien_tai.hashed_password = bam_mat_khau(du_lieu_yeu_cau.new_password)
    nguoi_dung_hien_tai.token_version += 1
    nguoi_dung_hien_tai.must_change_password = False
    phien_db.commit()

    return MessageResponse(
        message="Đổi mật khẩu thành công. Các phiên đăng nhập trên thiết bị khác đã được đăng xuất."
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Đăng xuất và hủy phiên đăng nhập (SCRUM-307)"
)
def dang_xuat(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Đăng xuất an toàn bằng cách tăng token_version trong database."""
    nguoi_dung_hien_tai.token_version += 1
    phien_db.commit()
    return MessageResponse(message="Đăng xuất thành công. Phiên đăng nhập đã bị vô hiệu hóa phía máy chủ.")


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Gia hạn phiên đăng nhập tự động khi người dùng đang hoạt động (SCRUM-199)"
)
def gia_han_phien(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Gia hạn phiên tự động: Cấp access token mới khi phiên cũ vẫn còn hiệu lực và người dùng đang thao tác."""
    du_lieu_token = {
        "sub": nguoi_dung_hien_tai.username,
        "user_id": nguoi_dung_hien_tai.id,
        "role": nguoi_dung_hien_tai.role,
        "roles": nguoi_dung_hien_tai.get_roles_list(),
        "warehouse_id": nguoi_dung_hien_tai.warehouse_id,
        "token_version": nguoi_dung_hien_tai.token_version
    }
    token_moi = tao_token_truy_cap(du_lieu_token)
    user_res = _chuan_bi_user_response(nguoi_dung_hien_tai, phien_db)
    return TokenResponse(
        access_token=token_moi,
        token_type="bearer",
        user=user_res
    )


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Yêu cầu đặt lại mật khẩu qua email có hiệu lực (SCRUM-200 / SCRUM-295)"
)
def quen_mat_khau(
    du_lieu_yeu_cau: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    phien_db: Session = Depends(lay_phien_db)
):
    """Gửi liên kết đặt lại mật khẩu:
    - Sinh token an toàn, lưu CSDL và gửi email bất đồng bộ.
    - Hỗ trợ cả PasswordResetToken và reset_password_token trên User.
    - Luôn trả về cùng một thông báo chung (chống rò rỉ dữ liệu).
    """
    email_nhan = du_lieu_yeu_cau.email.strip().lower()
    nguoi_dung = phien_db.query(User).filter(User.email == email_nhan).first()

    if nguoi_dung:
        token_dat_lai = secrets.token_urlsafe(32)
        nguoi_dung.reset_password_token = token_dat_lai
        nguoi_dung.reset_password_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        phien_db.commit()

    # Gọi hàm service để gửi email ngầm và lưu PasswordResetToken
    msg = request_password_reset(db=phien_db, email=email_nhan, background_tasks=background_tasks)

    return MessageResponse(
        message=msg or "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư của bạn."
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Đặt lại mật khẩu mới bằng token (SCRUM-200 / SCRUM-295)"
)
def dat_lai_mat_khau(
    du_lieu_yeu_cau: ResetPasswordRequest,
    phien_db: Session = Depends(lay_phien_db)
):
    """Xác nhận token và đặt lại mật khẩu mới:
    - Kiểm tra token hợp lệ và còn hạn.
    - Đổi xong hủy token (chỉ dùng 1 lần) và tăng token_version để thu hồi các phiên cũ.
    """
    token_xac_nhan = du_lieu_yeu_cau.token.strip()

    # Thử xử lý qua User.reset_password_token trước
    thoi_gian_hien_tai = datetime.now(timezone.utc)
    nguoi_dung = phien_db.query(User).filter(
        User.reset_password_token == token_xac_nhan
    ).first()

    if nguoi_dung and nguoi_dung.reset_password_expires_at:
        han_token = nguoi_dung.reset_password_expires_at
        if han_token.tzinfo is None:
            han_token = han_token.replace(tzinfo=timezone.utc)

        if thoi_gian_hien_tai > han_token:
            nguoi_dung.reset_password_token = None
            nguoi_dung.reset_password_expires_at = None
            phien_db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút). Vui lòng yêu cầu lại."
            )

        nguoi_dung.hashed_password = bam_mat_khau(du_lieu_yeu_cau.new_password)
        nguoi_dung.reset_password_token = None
        nguoi_dung.reset_password_expires_at = None
        nguoi_dung.token_version += 1
        phien_db.commit()
        return MessageResponse(
            message="Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới."
        )

    # Thử qua PasswordResetToken (SCRUM-295)
    msg = reset_password_with_token(db=phien_db, token=token_xac_nhan, new_password=du_lieu_yeu_cau.new_password)
    return MessageResponse(message=msg)


@router.get(
    "/financial/cost-and-margin",
    summary="Báo cáo Giá vốn & Biên lợi nhuận - Chỉ dành riêng cho Quản lý Kinh doanh (SCRUM-202)"
)
def bao_cao_gia_von_va_bien_loi_nhuan(
    nguoi_dung_hien_tai: User = Depends(yeu_cau_vai_tro(UserRole.SALES_MANAGER, UserRole.ADMIN))
):
    """Kiểm tra quyền tầng server: Nhân viên kinh doanh, thủ kho, kế toán không có quyền truy cập."""
    return {
        "status": "success",
        "authorized_role": nguoi_dung_hien_tai.role,
        "data": [
            {"product_sku": "SKU-BIA-SG-SPEC", "cost_price": 10500, "selling_price": 15000, "profit_margin": "30.0%"},
            {"product_sku": "SKU-CHOCOPIE-OR", "cost_price": 38000, "selling_price": 55000, "profit_margin": "30.9%"},
            {"product_sku": "SKU-LAVIE-500", "cost_price": 3500, "selling_price": 6000, "profit_margin": "41.6%"},
            {"product_sku": "SKU-STING-DAU", "cost_price": 6800, "selling_price": 10000, "profit_margin": "32.0%"},
            {"product_sku": "SKU-SUA-VNM-180", "cost_price": 6000, "selling_price": 8500, "profit_margin": "29.4%"},
        ]
    }


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Lấy thông tin người dùng đang đăng nhập kèm phân quyền và cây menu (SCRUM-301)"
)
def lay_thong_tin_toi(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Trả về thông tin cá nhân của người dùng đã xác thực Bearer token, kèm cây menu navigation."""
    return _chuan_bi_user_response(nguoi_dung_hien_tai, phien_db)


# =========================================================================
# ENDPOINTS DEMO CHO GUARD PHÂN QUYỀN (SCRUM-310 / Story S1-05)
# =========================================================================

@router.get(
    "/demo/sales-manager-or-admin",
    response_model=MessageResponse,
    summary="Demo Guard: Chỉ Sales Manager hoặc Admin mới có quyền truy cập (SCRUM-310)"
)
def demo_khu_vuc_quan_ly_ban_hang_hoac_admin(
    nguoi_dung_hien_tai: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN, UserRole.SALES_MANAGER))
):
    """Endpoint bảo vệ mẫu: Chỉ người dùng có vai trò 'Admin' hoặc 'Sales Manager' mới được phép gọi."""
    return MessageResponse(
        message=f"Xin chào {nguoi_dung_hien_tai.username}! Bạn đã truy cập thành công khu vực Quản lý Bán hàng với vai trò [{nguoi_dung_hien_tai.role}]."
    )


@router.get(
    "/demo/warehouse-only",
    response_model=MessageResponse,
    summary="Demo Guard: Chỉ Warehouse, WH Manager hoặc Admin mới có quyền truy cập (SCRUM-310)"
)
def demo_khu_vuc_danh_rieng_cho_kho(
    nguoi_dung_hien_tai: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN, UserRole.WH_MANAGER, UserRole.WAREHOUSE))
):
    """Endpoint bảo vệ mẫu: Chỉ người dùng có vai trò 'Admin', 'WH Manager' hoặc 'Warehouse' mới được phép gọi."""
    return MessageResponse(
        message=f"Xin chào {nguoi_dung_hien_tai.username}! Bạn đã truy cập thành công phân hệ Quản lý Kho với vai trò [{nguoi_dung_hien_tai.role}]."
    )


# Bí danh tương thích ngược (aliases)
login = dang_nhap
logout = dang_xuat
refresh = gia_han_phien
forgot_password = quen_mat_khau
reset_password = dat_lai_mat_khau
change_password = doi_mat_khau
get_me = lay_thong_tin_toi
get_current_user_profile = lay_thong_tin_toi
demo_sales_manager_or_admin = demo_khu_vuc_quan_ly_ban_hang_hoac_admin
demo_warehouse_only = demo_khu_vuc_danh_rieng_cho_kho
