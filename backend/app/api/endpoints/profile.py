from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.profile import ProfileResponse, ProfileUpdateRequest
from app.services.profile_service import ProfileService

# Khai báo router theo cơ chế Auto-Discovery (AGENTS.md)
# Hệ thống sẽ tự động đăng ký vào cả /api/profile và /api/v1/profile
router = APIRouter(prefix="/profile", tags=["Hồ sơ cá nhân (SCRUM-210)"])


@router.get(
    "/me",
    response_model=ProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy thông tin hồ sơ của người dùng hiện tại (SCRUM-357 / SCRUM-210)"
)
def lay_ho_so_ca_nhan(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy thông tin hồ sơ cá nhân của tài khoản đang đăng nhập qua Bearer Token:
    - Trả về họ tên, số điện thoại, tài khoản, email, vai trò, kho và địa bàn được phân công.
    - Bảo mật tuyệt đối: Chỉ xem được thông tin của chính mình.
    """
    return ProfileService.get_profile(nguoi_dung_hien_tai, phien_db)


@router.put(
    "/me",
    response_model=ProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Cập nhật hồ sơ cá nhân: Họ tên và Số điện thoại (SCRUM-357, SCRUM-358, SCRUM-360)"
)
def cap_nhat_ho_so_ca_nhan(
    du_lieu: ProfileUpdateRequest,
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Cập nhật thông tin liên lạc cá nhân:
    - Chỉ cho phép sửa `full_name` và `phone_number`.
    - Tự động chuẩn hóa và xác thực số điện thoại di động Việt Nam 10 chữ số (SCRUM-358).
    - Ngăn chặn mọi nỗ lực thay đổi vai trò, kho, địa bàn, tài khoản (SCRUM-360).
    """
    return ProfileService.update_profile(
        db=phien_db,
        current_user=nguoi_dung_hien_tai,
        data=du_lieu
    )
