from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.auth import User, UserRole
from app.schemas.auth import MessageResponse
from app.schemas.user import (
    UserCreate,
    UserLockRequest,
    UserPaginatedResponse,
    UserResponse,
    UserUpdate,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users Management"])


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo tài khoản người dùng mới (SCRUM-205 & SCRUM-206)",
)
def create_user(
    request_body: UserCreate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Tạo người dùng mới (chỉ Admin):
    
    - Bắt lỗi trùng tài khoản hoặc email kèm thông báo cụ thể (SCRUM-205).
    - Cấp mật khẩu tạm nếu không truyền mật khẩu.
    - Kiểm tra ràng buộc: Người dùng thuộc vai trò kho phải gắn với ít nhất một kho (SCRUM-206).
    """
    new_user = user_service.create_user(user_data=request_body, db=db)
    return UserResponse.model_validate(new_user)


@router.get(
    "",
    response_model=UserPaginatedResponse,
    summary="Tìm kiếm, lọc và phân trang danh sách người dùng (SCRUM-205)",
)
def list_users(
    query: Optional[str] = Query(None, alias="q", description="Tìm theo tên, tài khoản, email hoặc số điện thoại"),
    role: Optional[str] = Query(None, description="Lọc theo vai trò"),
    is_active: Optional[bool] = Query(None, description="Lọc theo trạng thái hoạt động"),
    page: int = Query(1, ge=1, description="Số trang hiện tại (bắt đầu từ 1)"),
    page_size: int = Query(20, ge=1, le=100, description="Số bản ghi trên mỗi trang (mặc định 20)"),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> UserPaginatedResponse:
    """Tìm kiếm, lọc và phân trang danh sách tài khoản theo đúng SCRUM-205 (mặc định 20 dòng)."""
    users, total_count, total_pages = user_service.list_users(
        query=query,
        role=role,
        is_active=is_active,
        page=page,
        page_size=page_size,
        db=db,
    )
    return UserPaginatedResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Xem chi tiết người dùng theo ID (SCRUM-205)",
)
def get_user(
    user_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Lấy chi tiết 1 người dùng theo ID."""
    user = user_service.get_user_by_id(user_id=user_id, db=db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng.",
        )
    return UserResponse.model_validate(user)


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="Chỉnh sửa thông tin và vai trò người dùng (SCRUM-205 & SCRUM-206)",
)
def update_user(
    user_id: int,
    request_body: UserUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Cập nhật người dùng:
    
    - Không thể tự thu hồi quyền quản trị của chính mình (SCRUM-206).
    - Ràng buộc vai trò kho phải gắn kho (SCRUM-206).
    """
    updated_user = user_service.update_user(
        user_id=user_id,
        update_data=request_body,
        current_user=current_user,
        db=db,
    )
    return UserResponse.model_validate(updated_user)


@router.post(
    "/{user_id}/lock",
    summary="Khóa tài khoản và thu hồi các phiên đăng nhập (SCRUM-207)",
)
def lock_user(
    user_id: int,
    request_body: UserLockRequest,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Khóa tài khoản:
    
    - Bắt buộc ghi rõ lý do khóa.
    - Ngăn đăng nhập và thu hồi toàn bộ phiên đang mở (tăng token_version).
    - Cảnh báo bàn giao đại lý nếu là nhân viên kinh doanh.
    """
    return user_service.lock_user(
        user_id=user_id,
        reason=request_body.reason,
        current_user=current_user,
        db=db,
    )


@router.post(
    "/{user_id}/unlock",
    response_model=MessageResponse,
    summary="Mở khóa tài khoản người dùng (SCRUM-207)",
)
def unlock_user(
    user_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Mở khóa tài khoản: Cho phép người dùng hoạt động trở lại."""
    unlocked_user = user_service.unlock_user(user_id=user_id, db=db)
    return MessageResponse(
        message=f"Tài khoản '{unlocked_user.username}' đã được mở khóa thành công."
    )


# ---------------------------------------------------------------------------
# Backward-compatibility aliases (legacy Vietnamese names — do NOT use in new code)
# ---------------------------------------------------------------------------
tao_nguoi_dung = create_user
danh_sach_nguoi_dung = list_users
cap_nhat_nguoi_dung = update_user
khoa_tai_khoan = lock_user
mo_khoa_tai_khoan = unlock_user
lay_phien_db = get_db
yeu_cau_vai_tro = require_role
lay_nguoi_dung_hien_tai = get_current_user
