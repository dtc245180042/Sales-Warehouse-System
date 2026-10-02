import math
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.models.auth import User
from app.schemas.password_reset import (
    ResetTokenVerifyResponse,
    MockOutboxResponse,
    MockEmailItem,
)
from app.services.email_service import get_mock_outbox, clear_mock_outbox

# Khai báo router theo chuẩn Auto-Discovery của hệ thống (AGENTS.md)
router = APIRouter(prefix="/password-reset", tags=["Password Reset (SCRUM-200)"])


def _mask_email(email: str) -> str:
    """Che giấu một phần email để bảo vệ quyền riêng tư người dùng."""
    if not email or "@" not in email:
        return email
    parts = email.split("@")
    name_part = parts[0]
    domain_part = parts[1]
    if len(name_part) <= 2:
        masked_name = name_part[0] + "***"
    else:
        masked_name = name_part[0] + "***" + name_part[-1]
    return f"{masked_name}@{domain_part}"


@router.get(
    "/verify",
    response_model=ResetTokenVerifyResponse,
    summary="Kiểm tra tính hợp lệ và thời hạn 30 phút của token đặt lại mật khẩu (SCRUM-200 / SCRUM-297)"
)
def kiem_tra_token_dat_lai(
    token: str = Query(..., min_length=1, description="Mã token đặt lại mật khẩu cần xác thực"),
    phien_db: Session = Depends(lay_phien_db)
):
    """Xác thực token khi người dùng bấm vào liên kết trong email:
    - Kiểm tra token có tồn tại trong hệ thống hay không.
    - Kiểm tra thời hạn hiệu lực (đúng 30 phút).
    - Trả về email được che một phần và số phút hiệu lực còn lại.
    """
    token_sach = token.strip()
    nguoi_dung = phien_db.query(User).filter(
        User.reset_password_token == token_sach
    ).first()

    thoi_gian_hien_tai = datetime.now(timezone.utc)

    # 1. Token không tồn tại hoặc đã bị hủy (đã dùng)
    if not nguoi_dung:
        return ResetTokenVerifyResponse(
            valid=False,
            message="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng."
        )

    # 2. Token đã quá hạn 30 phút
    if not nguoi_dung.reset_password_expires_at:
        return ResetTokenVerifyResponse(
            valid=False,
            message="Liên kết đặt lại mật khẩu không có thời hạn hợp lệ."
        )

    # Đảm bảo múi giờ UTC đồng nhất
    han_dung = nguoi_dung.reset_password_expires_at
    if han_dung.tzinfo is None:
        han_dung = han_dung.replace(tzinfo=timezone.utc)

    if thoi_gian_hien_tai > han_dung:
        return ResetTokenVerifyResponse(
            valid=False,
            message="Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút). Vui lòng yêu cầu liên kết mới."
        )

    # 3. Token hoàn toàn hợp lệ
    so_giay_con_lai = (han_dung - thoi_gian_hien_tai).total_seconds()
    so_phut_con_lai = max(1, math.ceil(so_giay_con_lai / 60))

    return ResetTokenVerifyResponse(
        valid=True,
        email=_mask_email(nguoi_dung.email),
        expires_at=han_dung,
        expires_in_minutes=so_phut_con_lai,
        message="Mã token hợp lệ và sẵn sàng để đặt lại mật khẩu."
    )


@router.get(
    "/mock-outbox",
    response_model=MockOutboxResponse,
    summary="Xem danh sách email giả lập phục vụ Test và Demo (SCRUM-295)"
)
def danh_sach_email_gia_lap():
    """Hỗ trợ tester và hội đồng kiểm tra các email và liên kết reset mật khẩu vừa gửi."""
    danh_sach = get_mock_outbox()
    cac_email = [MockEmailItem(**item) for item in danh_sach]
    return MockOutboxResponse(
        total=len(cac_email),
        emails=cac_email
    )


@router.delete(
    "/mock-outbox",
    summary="Xóa sạch hộp thư giả lập phục vụ kiểm thử tự động"
)
def xoa_hop_thu_gia_lap():
    clear_mock_outbox()
    return {"message": "Đã làm sạch hộp thư giả lập thành công."}
