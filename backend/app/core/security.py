from datetime import datetime, timedelta, timezone
from typing import Any
import bcrypt
from jose import jwt, JWTError

from app.core.config import settings


def kiem_tra_mat_khau(mat_khau_thuan: str, mat_khau_bam: str) -> bool:
    """Xác thực mật khẩu thô so với chuỗi hash bcrypt."""
    try:
        chuoi_byte_thuan = mat_khau_thuan.encode("utf-8")[:72]
        chuoi_byte_bam = mat_khau_bam.encode("utf-8")
        return bcrypt.checkpw(chuoi_byte_thuan, chuoi_byte_bam)
    except Exception:
        return False


def bam_mat_khau(mat_khau: str) -> str:
    """Băm mật khẩu sử dụng thuật toán bcrypt (giới hạn an toàn 72 bytes)."""
    chuoi_byte = mat_khau.encode("utf-8")[:72]
    muoi = bcrypt.gensalt()
    return bcrypt.hashpw(chuoi_byte, muoi).decode("utf-8")


def tao_token_truy_cap(
    du_lieu: dict[str, Any],
    thoi_gian_het_han: timedelta | None = None
) -> str:
    """Tạo JWT access token chứa payload data và thời hạn hết hạn."""
    du_lieu_ma_hoa = du_lieu.copy()
    thoi_diem_hien_tai = datetime.now(timezone.utc)
    if thoi_gian_het_han:
        han_dung = thoi_diem_hien_tai + thoi_gian_het_han
    else:
        han_dung = thoi_diem_hien_tai + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    du_lieu_ma_hoa.update({
        "exp": han_dung,
        "iat": thoi_diem_hien_tai
    })
    token_jwt = jwt.encode(du_lieu_ma_hoa, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token_jwt


def giai_ma_token_truy_cap(chuoi_token: str) -> dict[str, Any] | None:
    """Giải mã JWT token và trả về payload, hoặc None nếu không hợp lệ / hết hạn."""
    try:
        tai_trong = jwt.decode(
            chuoi_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        return tai_trong
    except JWTError:
        return None


# Bí danh tương thích ngược (aliases)
verify_password = kiem_tra_mat_khau
get_password_hash = bam_mat_khau
create_access_token = tao_token_truy_cap
decode_access_token = giai_ma_token_truy_cap
