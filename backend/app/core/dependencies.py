from typing import Callable
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.database import get_db, lay_phien_db
from app.core.security import decode_access_token
from app.models.auth import User, UserRole

# HTTPBearer scheme để đọc Authorization: Bearer <token>
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Validate JWT Bearer token và trả về User đang đăng nhập.

    Kiểm tra:
    - Token có mặt và hợp lệ về chữ ký / thời hạn.
    - Tài khoản đang active.
    - token_version khớp DB để xử lý thu hồi phiên (SCRUM-307 & SCRUM-310).
    """
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials or not credentials.credentials:
        raise auth_error

    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise auth_error

    # Lấy user_id và token_version từ JWT payload
    raw_user_id = payload.get("user_id") or payload.get("sub")
    token_version = payload.get("token_version")

    if raw_user_id is None or token_version is None:
        raise auth_error

    try:
        user_id = int(raw_user_id)
    except (ValueError, TypeError):
        raise auth_error

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise auth_error

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa.",
        )

    # Token_version không khớp → mật khẩu đã đổi hoặc bị đăng xuất cưỡng bức
    if user.token_version != token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã bị thu hồi do mật khẩu đã thay đổi. Vui lòng đăng nhập lại.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_role(*allowed_roles: str | UserRole) -> Callable[[User], User]:
    """Dependency factory: tạo guard kiểm tra vai trò người dùng (SCRUM-310).

    Hệ thống hỗ trợ 7 vai trò: Admin, Customer, Sales Rep, Sales Manager,
    Warehouse, WH Manager, Accountant.

    Nếu người dùng không thuộc danh sách vai trò cho phép → HTTP 403 Forbidden.
    """
    allowed_set: set[str] = {
        role.value if isinstance(role, UserRole) else str(role)
        for role in allowed_roles
    }

    def _check_role(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Bạn không có quyền thực hiện hành động này. "
                    f"Yêu cầu một trong các vai trò: {', '.join(sorted(allowed_set))}."
                ),
            )
        return current_user

    return _check_role


# ---------------------------------------------------------------------------
# Backward-compatibility aliases (legacy Vietnamese names — do NOT use in new code)
# ---------------------------------------------------------------------------
co_che_bearer = bearer_scheme
lay_nguoi_dung_hien_tai = get_current_user
yeu_cau_vai_tro = require_role
require_roles = require_role
