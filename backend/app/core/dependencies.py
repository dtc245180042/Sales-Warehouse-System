from typing import Callable, Optional
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


def lay_nguoi_dung_tuy_chon(
    chung_thuc_bearer: HTTPAuthorizationCredentials | None = Depends(co_che_bearer),
    phien_db: Session = Depends(lay_phien_db)
) -> User | None:
    """Xác thực người dùng tùy chọn (Optional Auth).
    Nếu có token hợp lệ: trả về đối tượng User.
    Nếu không có token hoặc token hết hạn: trả về None thay vì quăng lỗi 401.
    Giúp giao diện luôn tải được danh mục sản phẩm từ CSDL mà không bị màn hình trắng/dữ liệu rỗng.
    """
    if not chung_thuc_bearer or not chung_thuc_bearer.credentials:
        return None
    try:
        chuoi_token = chung_thuc_bearer.credentials
        tai_trong = giai_ma_token_truy_cap(chuoi_token)
        if not tai_trong:
            return None
        id_nguoi_dung_tho = tai_trong.get("user_id") or tai_trong.get("sub")
        phien_ban_token = tai_trong.get("token_version")
        if id_nguoi_dung_tho is None or phien_ban_token is None:
            return None
        id_nguoi_dung = int(id_nguoi_dung_tho)
        nguoi_dung = phien_db.query(User).filter(User.id == id_nguoi_dung).first()
        if not nguoi_dung or not nguoi_dung.is_active or nguoi_dung.token_version != phien_ban_token:
            return None
        return nguoi_dung
    except Exception:
        return None


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


def lay_nguoi_dung_noi_bo(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai)
) -> User:
    """Xác thực người dùng nội bộ Backoffice (Default-Deny với vai trò Customer).
    Nếu role là Customer -> Chặn ngay lập tức với HTTP 403 Forbidden (S4-10, SCRUM-242).
    """
    if (nguoi_dung_hien_tai.role or "").lower() == "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản khách hàng / đại lý không có quyền truy cập khu vực quản trị nội bộ."
        )
    return nguoi_dung_hien_tai


def chan_tai_khoan_customer_noi_bo(
    chung_thuc_bearer: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
):
    """Guard chặn tuyệt đối vai trò Customer truy cập bất kỳ route nội bộ nào (S4-10, SCRUM-242)."""
    if not chung_thuc_bearer or not chung_thuc_bearer.credentials:
        return
    try:
        payload = giai_ma_token_truy_cap(chung_thuc_bearer.credentials)
        if payload and (payload.get("role") or "").lower() == "customer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản khách hàng / đại lý không có quyền truy cập khu vực quản trị nội bộ."
            )
    except HTTPException:
        raise
    except Exception:
        pass


def lay_dai_ly_hien_tai(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Xác thực danh tính Đại lý cho các API Cổng đại lý (/portal/*) (S4-10, SCRUM-242).
    - Người dùng phải có role là Customer (hoặc Admin khi chạy test / giả lập).
    - Tự động map và truy vấn hồ sơ Customer tương ứng từ User.customer_id hoặc User.email / phone.
    - Kiểm tra trạng thái khóa giao dịch đại lý (SC-228).
    """
    from app.models.customer import Customer
    from app.services.customer_lock_service import check_customer_order_allowed

    user_role = (nguoi_dung_hien_tai.role or "").lower()
    if user_role not in ["customer", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ tài khoản Đại lý mới có quyền truy cập Cổng đặt hàng đại lý."
        )

    cust = None
    if getattr(nguoi_dung_hien_tai, "customer_id", None):
        cust = phien_db.query(Customer).filter(Customer.id == nguoi_dung_hien_tai.customer_id).first()
    if not cust:
        cust = phien_db.query(Customer).filter(
            (Customer.email == nguoi_dung_hien_tai.email) |
            (Customer.phone == nguoi_dung_hien_tai.phone_number)
        ).first()

    if not cust and user_role == "admin":
        cust = phien_db.query(Customer).first()

    if not cust:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản của bạn chưa được liên kết với bất kỳ hồ sơ đại lý nào trong hệ thống."
        )

    # SC-228: Kiểm tra nếu đại lý bị khóa giao dịch
    allowed, lock_msg = check_customer_order_allowed(cust.id, phien_db)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=lock_msg
        )

    return cust

