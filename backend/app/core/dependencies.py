from typing import Callable
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.security import giai_ma_token_truy_cap
from app.models.user import User, UserRole

# Sử dụng HTTPBearer để bắt Authorization header dạng "Bearer <token>"
co_che_bearer = HTTPBearer(auto_error=False)


def lay_nguoi_dung_hien_tai(
    chung_thuc_bearer: HTTPAuthorizationCredentials | None = Depends(co_che_bearer),
    phien_db: Session = Depends(lay_phien_db)
) -> User:
    """Xác thực người dùng hiện tại từ JWT Bearer token.
    - Kiểm tra tính hợp lệ và thời hạn token.
    - Kiểm tra trạng thái hoạt động của tài khoản.
    - So sánh token_version để xử lý thu hồi phiên sau khi đổi mật khẩu (SCRUM-307 & SCRUM-310).
    Mặc định: Từ chối nếu thiếu token hoặc token không hợp lệ (Deny by default).
    """
    loi_xac_thuc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not chung_thuc_bearer or not chung_thuc_bearer.credentials:
        raise loi_xac_thuc

    chuoi_token = chung_thuc_bearer.credentials
    tai_trong = giai_ma_token_truy_cap(chuoi_token)
    if not tai_trong:
        raise loi_xac_thuc

    # Lấy thông tin từ JWT payload
    id_nguoi_dung_tho = tai_trong.get("user_id") or tai_trong.get("sub")
    phien_ban_token = tai_trong.get("token_version")

    if id_nguoi_dung_tho is None or phien_ban_token is None:
        raise loi_xac_thuc

    try:
        id_nguoi_dung = int(id_nguoi_dung_tho)
    except (ValueError, TypeError):
        raise loi_xac_thuc

    nguoi_dung = phien_db.query(User).filter(User.id == id_nguoi_dung).first()
    if not nguoi_dung:
        raise loi_xac_thuc

    if not nguoi_dung.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa."
        )

    # Kiểm tra token_version: Nếu người dùng đã đổi mật khẩu, token_version trong DB sẽ tăng lên,
    # các token cũ mang version thấp hơn lập tức bị từ chối
    if nguoi_dung.token_version != phien_ban_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã bị thu hồi do mật khẩu đã thay đổi. Vui lòng đăng nhập lại.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return nguoi_dung


def yeu_cau_vai_tro(*cac_vai_tro_cho_phep: str | UserRole) -> Callable[[User], User]:
    """Dependency factory tạo Guard kiểm tra vai trò người dùng (SCRUM-310).
    
    Hệ thống hỗ trợ 7 vai trò:
    - Admin
    - Customer
    - Sales Rep
    - Sales Manager
    - Warehouse
    - WH Manager
    - Accountant

    Nếu người dùng không thuộc danh sách vai trò cho phép:
    -> Trả về HTTP 403 Forbidden.
    """
    tap_hop_vai_tro_chuan_hoa = {
        vt.value if isinstance(vt, UserRole) else str(vt) for vt in cac_vai_tro_cho_phep
    }

    def kiem_tra_vai_tro(nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai)) -> User:
        if nguoi_dung_hien_tai.role not in tap_hop_vai_tro_chuan_hoa:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Bạn không có quyền thực hiện hành động này. "
                    f"Yêu cầu một trong các vai trò: {', '.join(sorted(tap_hop_vai_tro_chuan_hoa))}."
                )
            )
        return nguoi_dung_hien_tai

    return kiem_tra_vai_tro


# Bí danh tương thích ngược (aliases)
get_current_user = lay_nguoi_dung_hien_tai
require_roles = yeu_cau_vai_tro
