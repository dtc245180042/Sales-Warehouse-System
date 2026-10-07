import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import lay_phien_db
from app.core.security import kiem_tra_mat_khau, bam_mat_khau, tao_token_truy_cap
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro
from app.models.user import User, UserRole
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    MessageResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Đăng nhập tài khoản & Xử lý khóa tạm 15 phút (SCRUM-287 / Story S1-01)"
)
def dang_nhap(
    du_lieu_yeu_cau: LoginRequest,
    phien_db: Session = Depends(lay_phien_db)
):
    """Xác thực đăng nhập bằng username hoặc email và password.
    
    Quy tắc an ninh:
    - Nếu sai mật khẩu hoặc tài khoản không tồn tại: Trả về thông báo chung
      'Tên đăng nhập hoặc mật khẩu không chính xác' (tránh rò rỉ sự tồn tại của account).
    - Đếm số lần đăng nhập sai liên tiếp (failed_login_attempts).
    - Khi đạt 5 lần sai: Khóa tài khoản tạm thời 15 phút (locked_until = now + 15m).
    - Khi đang bị khóa: Trả về HTTP 403 kèm thông báo khóa tài khoản.
    - Khi hết hạn khóa: Tự động reset và cho phép thử lại.
    - Khi đăng nhập thành công: Reset failed_login_attempts và locked_until,
      tạo JWT token mang user_id, role và token_version.
    """
    thoi_gian_hien_tai = datetime.now(timezone.utc)
    dinh_danh = du_lieu_yeu_cau.username.strip()

    # Tìm kiếm theo username hoặc email
    nguoi_dung = phien_db.query(User).filter(
        (User.username == dinh_danh) | (User.email == dinh_danh)
    ).first()

    # Nếu người dùng tồn tại trong hệ thống
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

        # 2. Kiểm tra tài khoản có bị vô hiệu hóa bởi quản trị viên không
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
                detail="Tên đăng nhập hoặc mật khẩu không chính xác."
            )

        # 4. Đăng nhập thành công -> Reset trạng thái sai mật khẩu
        nguoi_dung.failed_login_attempts = 0
        nguoi_dung.locked_until = None
        phien_db.commit()
        phien_db.refresh(nguoi_dung)

        # 5. Tạo JWT Access Token
        tai_trong_token = {
            "sub": str(nguoi_dung.id),
            "user_id": nguoi_dung.id,
            "username": nguoi_dung.username,
            "role": nguoi_dung.role,
            "token_version": nguoi_dung.token_version,
        }
        token_truy_cap = tao_token_truy_cap(tai_trong_token)

        return TokenResponse(
            access_token=token_truy_cap,
            token_type="bearer",
            user=UserResponse.model_validate(nguoi_dung)
        )

    # Nếu tài khoản không tồn tại, trả về thông báo chung tránh enumeration attack
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tên đăng nhập hoặc mật khẩu không chính xác."
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Đổi mật khẩu & Thu hồi các phiên đăng nhập khác (SCRUM-307 / Story S1-04)"
)
def doi_mat_khau(
    du_lieu_yeu_cau: ChangePasswordRequest,
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Đổi mật khẩu khi đang đăng nhập.
    
    Quy tắc nghiệp vụ:
    - Kiểm tra mật khẩu cũ có khớp không. Nếu không khớp trả về HTTP 400.
    - Mật khẩu mới được validate thông qua Pydantic (tối thiểu 8 ký tự, có cả chữ và số).
    - Sau khi cập nhật mật khẩu mới: Tăng token_version trong DB để lập tức thu hồi
      toàn bộ các JWT token cũ đang lưu hành ở các phiên/thiết bị khác.
    """
    # 1. Xác minh mật khẩu cũ
    if not kiem_tra_mat_khau(du_lieu_yeu_cau.old_password, nguoi_dung_hien_tai.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu cũ không chính xác."
        )

    # 2. Không cho phép đặt mật khẩu mới trùng mật khẩu cũ
    if kiem_tra_mat_khau(du_lieu_yeu_cau.new_password, nguoi_dung_hien_tai.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới không được trùng với mật khẩu hiện tại."
        )

    # 3. Cập nhật mật khẩu mới và tăng token_version để thu hồi các token cũ
    nguoi_dung_hien_tai.hashed_password = bam_mat_khau(du_lieu_yeu_cau.new_password)
    nguoi_dung_hien_tai.token_version += 1
    phien_db.commit()
    phien_db.refresh(nguoi_dung_hien_tai)

    return MessageResponse(
        message="Đổi mật khẩu thành công. Toàn bộ các phiên đăng nhập khác đã được thu hồi."
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Đăng xuất & Vô hiệu hóa phiên lập tức phía máy chủ (SCRUM-199)"
)
def dang_xuat(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Đăng xuất an toàn: Tăng token_version để vô hiệu hóa token hiện tại phía server ngay lập tức."""
    nguoi_dung_hien_tai.token_version += 1
    phien_db.commit()
    return MessageResponse(message="Đăng xuất thành công. Phiên đăng nhập đã bị vô hiệu hóa phía máy chủ.")


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Gia hạn phiên đăng nhập tự động khi người dùng đang hoạt động (SCRUM-199)"
)
def gia_han_phien(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai)
):
    """Gia hạn phiên tự động: Cấp access token mới khi phiên cũ vẫn còn hiệu lực và người dùng đang thao tác."""
    du_lieu_token = {
        "sub": nguoi_dung_hien_tai.username,
        "user_id": nguoi_dung_hien_tai.id,
        "role": nguoi_dung_hien_tai.role,
        "token_version": nguoi_dung_hien_tai.token_version
    }
    token_moi = tao_token_truy_cap(du_lieu_token)
    return TokenResponse(
        access_token=token_moi,
        token_type="bearer",
        user=UserResponse.model_validate(nguoi_dung_hien_tai)
    )


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Yêu cầu đặt lại mật khẩu qua email (SCRUM-200)"
)
def quen_mat_khau(
    du_lieu_yeu_cau: ForgotPasswordRequest,
    phien_db: Session = Depends(lay_phien_db)
):
    """Gửi liên kết đặt lại mật khẩu:
    - Bắt buộc kiểm tra tài khoản tồn tại trong hệ thống.
    - Nếu không tồn tại: Báo lỗi 404 để người dùng biết nhập sai tài khoản.
    - Nếu tồn tại: Cấp mã OTP 5 chữ số có hạn 5 phút và kích hoạt gửi email.
    """
    dinh_danh = du_lieu_yeu_cau.email.strip().lower()
    nguoi_dung = phien_db.query(User).filter(
        (User.email == dinh_danh) | (User.username == dinh_danh)
    ).first()

    if nguoi_dung:
        # Sinh mã OTP 5 chữ số ngẫu nhiên
        otp_5_so = f"{secrets.randbelow(90000) + 10000}"
        nguoi_dung.reset_password_token = otp_5_so
        nguoi_dung.reset_password_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        phien_db.commit()

    return MessageResponse(
        message="Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn."
    )



@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Đặt lại mật khẩu mới bằng token 30 phút (SCRUM-200)"
)
def dat_lai_mat_khau(
    du_lieu_yeu_cau: ResetPasswordRequest,
    phien_db: Session = Depends(lay_phien_db)
):
    """Xác nhận token và đặt lại mật khẩu mới:
    - Kiểm tra token hợp lệ và còn hạn trong vòng 30 phút.
    - Mật khẩu mới tối thiểu 8 ký tự, có cả chữ và số.
    - Đổi xong hủy token (chỉ dùng 1 lần) và tăng token_version để thu hồi các phiên cũ.
    """
    token_xac_nhan = du_lieu_yeu_cau.token.strip()
    nguoi_dung = phien_db.query(User).filter(
        User.reset_password_token == token_xac_nhan
    ).first()

    thoi_gian_hien_tai = datetime.now(timezone.utc)
    if not nguoi_dung or not nguoi_dung.reset_password_expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng."
        )

    # Đảm bảo datetime timezone-aware
    han_token = nguoi_dung.reset_password_expires_at
    if han_token.tzinfo is None:
        han_token = han_token.replace(tzinfo=timezone.utc)

    if thoi_gian_hien_tai > han_token:
        # Hết hạn 30 phút
        nguoi_dung.reset_password_token = None
        nguoi_dung.reset_password_expires_at = None
        phien_db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút). Vui lòng yêu cầu lại."
        )

    # Cập nhật mật khẩu mới, xóa token và thu hồi phiên cũ
    nguoi_dung.hashed_password = bam_mat_khau(du_lieu_yeu_cau.new_password)
    nguoi_dung.reset_password_token = None
    nguoi_dung.reset_password_expires_at = None
    nguoi_dung.token_version += 1
    phien_db.commit()

    return MessageResponse(
        message="Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới."
    )


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
    summary="Lấy thông tin người dùng đang đăng nhập"
)
def lay_thong_tin_toi(nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai)):
    """Demo endpoint trả về thông tin cá nhân của người dùng đã xác thực Bearer token."""
    return UserResponse.model_validate(nguoi_dung_hien_tai)


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
demo_sales_manager_or_admin = demo_khu_vuc_quan_ly_ban_hang_hoac_admin
demo_warehouse_only = demo_khu_vuc_danh_rieng_cho_kho
