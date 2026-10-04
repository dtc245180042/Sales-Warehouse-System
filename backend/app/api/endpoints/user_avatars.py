import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.user_avatar import (
    AvatarInfo,
    AvatarUploadResponse,
    AvatarDeleteResponse,
)
from app.services.avatar_service import (
    save_user_avatar,
    get_user_avatar,
    delete_user_avatar,
    build_avatar_urls,
)

# Khai báo router theo chuẩn Auto-Discovery của hệ thống (AGENTS.md)
router = APIRouter(prefix="/user-avatars", tags=["User Avatars (SCRUM-362, SCRUM-364, SCRUM-365)"])


@router.post(
    "/upload",
    response_model=AvatarUploadResponse,
    summary="Tải lên và cập nhật ảnh đại diện người dùng (SCRUM-362, SCRUM-364, SCRUM-365)"
)
async def tai_len_anh_dai_dien(
    file: UploadFile = File(..., description="File ảnh đại diện (JPG/PNG, tối đa 2MB)"),
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Tải lên ảnh đại diện:
    - SCRUM-365: Kiểm tra định dạng JPG/PNG và giới hạn kích thước tối đa 2MB.
    - SCRUM-362: Cắt vuông từ tâm (1:1) và tạo bản thu nhỏ (thumbnail 128x128).
    - SCRUM-364: Lưu trữ theo thư mục riêng của người dùng và cập nhật CSDL.
    """
    file_bytes = await file.read()
    filename = file.filename or "avatar.jpg"
    content_type = file.content_type

    user_avatar = save_user_avatar(
        db=phien_db,
        user_id=nguoi_dung_hien_tai.id,
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type
    )

    avatar_url, thumb_url = build_avatar_urls(nguoi_dung_hien_tai.id, user_avatar.updated_at)

    info = AvatarInfo(
        user_id=user_avatar.user_id,
        original_filename=user_avatar.original_filename,
        avatar_url=avatar_url,
        thumbnail_url=thumb_url,
        content_type=user_avatar.content_type,
        file_size=user_avatar.file_size,
        width=user_avatar.width,
        height=user_avatar.height,
        updated_at=user_avatar.updated_at
    )

    return AvatarUploadResponse(
        success=True,
        message="Tải lên và xử lý ảnh đại diện thành công.",
        data=info
    )


@router.post(
    "/{user_id}/upload",
    response_model=AvatarUploadResponse,
    summary="Tải lên và cập nhật ảnh đại diện cho người dùng theo user_id (SCRUM-362, SCRUM-364, SCRUM-365)"
)
async def tai_len_anh_dai_dien_theo_user_id(
    user_id: int,
    file: UploadFile = File(..., description="File ảnh đại diện (JPG/PNG, tối đa 2MB)"),
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Admin hoặc chính chủ tài khoản có thể tải lên ảnh đại diện:
    - SCRUM-365: Kiểm tra định dạng JPG/PNG và giới hạn kích thước tối đa 2MB.
    - SCRUM-362: Cắt vuông từ tâm (1:1) và tạo thumbnail 128x128.
    - SCRUM-364: Lưu trữ theo thư mục riêng và cập nhật CSDL.
    """
    is_admin = any(
        (hasattr(r, "name") and r.name.lower() == "admin") or str(r).lower() == "admin"
        for r in getattr(nguoi_dung_hien_tai, "roles", [])
    ) or getattr(nguoi_dung_hien_tai, "is_superuser", False)

    if nguoi_dung_hien_tai.id != user_id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền cập nhật ảnh đại diện của người dùng khác."
        )

    target_user = phien_db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng có ID {user_id}."
        )

    file_bytes = await file.read()
    filename = file.filename or "avatar.jpg"
    content_type = file.content_type

    user_avatar = save_user_avatar(
        db=phien_db,
        user_id=user_id,
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type
    )

    avatar_url, thumb_url = build_avatar_urls(user_id, user_avatar.updated_at)
    info = AvatarInfo(
        user_id=user_avatar.user_id,
        original_filename=user_avatar.original_filename,
        avatar_url=avatar_url,
        thumbnail_url=thumb_url,
        content_type=user_avatar.content_type,
        file_size=user_avatar.file_size,
        width=user_avatar.width,
        height=user_avatar.height,
        updated_at=user_avatar.updated_at
    )

    return AvatarUploadResponse(
        success=True,
        message="Tải lên và xử lý ảnh đại diện thành công.",
        data=info
    )


@router.get(
    "/me",
    response_model=AvatarInfo,
    summary="Lấy thông tin ảnh đại diện của người dùng hiện tại"
)
def lay_thong_tin_avatar_cua_toi(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy thông tin ảnh đại diện của chính mình."""
    user_avatar = get_user_avatar(phien_db, nguoi_dung_hien_tai.id)
    if not user_avatar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng chưa thiết lập ảnh đại diện."
        )

    avatar_url, thumb_url = build_avatar_urls(nguoi_dung_hien_tai.id, user_avatar.updated_at)
    return AvatarInfo(
        user_id=user_avatar.user_id,
        original_filename=user_avatar.original_filename,
        avatar_url=avatar_url,
        thumbnail_url=thumb_url,
        content_type=user_avatar.content_type,
        file_size=user_avatar.file_size,
        width=user_avatar.width,
        height=user_avatar.height,
        updated_at=user_avatar.updated_at
    )


@router.get(
    "/{user_id}/avatar",
    summary="Truy xuất file ảnh đại diện kích thước chuẩn (500x500) đã crop vuông"
)
def lay_file_anh_dai_dien(
    user_id: int,
    phien_db: Session = Depends(lay_phien_db)
):
    """Trả về file ảnh đại diện của người dùng theo user_id."""
    user_avatar = get_user_avatar(phien_db, user_id)
    if not user_avatar or not os.path.exists(user_avatar.avatar_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy file ảnh đại diện."
        )

    return FileResponse(
        path=user_avatar.avatar_path,
        media_type=user_avatar.content_type,
        headers={"Cache-Control": "public, max-age=86400"}
    )


@router.get(
    "/{user_id}/thumbnail",
    summary="Truy xuất file thumbnail ảnh đại diện (128x128) phục vụ danh sách và lịch sử đơn hàng (SCRUM-362)"
)
def lay_file_thumbnail_dai_dien(
    user_id: int,
    phien_db: Session = Depends(lay_phien_db)
):
    """Trả về file thumbnail thu nhỏ của người dùng theo user_id."""
    user_avatar = get_user_avatar(phien_db, user_id)
    if not user_avatar or not os.path.exists(user_avatar.thumbnail_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy file thumbnail ảnh đại diện."
        )

    return FileResponse(
        path=user_avatar.thumbnail_path,
        media_type=user_avatar.content_type,
        headers={"Cache-Control": "public, max-age=86400"}
    )


@router.get(
    "/{user_id}",
    response_model=AvatarInfo,
    summary="Lấy thông tin metadata ảnh đại diện theo user_id"
)
def lay_thong_tin_avatar_theo_id(
    user_id: int,
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy thông tin URL ảnh và kích thước theo user_id."""
    user_avatar = get_user_avatar(phien_db, user_id)
    if not user_avatar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng chưa thiết lập ảnh đại diện."
        )

    avatar_url, thumb_url = build_avatar_urls(user_id, user_avatar.updated_at)
    return AvatarInfo(
        user_id=user_avatar.user_id,
        original_filename=user_avatar.original_filename,
        avatar_url=avatar_url,
        thumbnail_url=thumb_url,
        content_type=user_avatar.content_type,
        file_size=user_avatar.file_size,
        width=user_avatar.width,
        height=user_avatar.height,
        updated_at=user_avatar.updated_at
    )


@router.delete(
    "/me",
    response_model=AvatarDeleteResponse,
    summary="Xóa ảnh đại diện của người dùng hiện tại"
)
def xoa_anh_dai_dien_cua_toi(
    nguoi_dung_hien_tai: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Xóa file và bản ghi ảnh đại diện của người dùng."""
    thanh_cong = delete_user_avatar(phien_db, nguoi_dung_hien_tai.id)
    if not thanh_cong:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bạn chưa có ảnh đại diện để xóa."
        )

    return AvatarDeleteResponse(
        success=True,
        message="Đã xóa ảnh đại diện thành công."
    )
