import io
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple
from PIL import Image
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user_avatar import UserAvatar

# Giới hạn kích thước tối đa 2MB (SCRUM-365)
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB = 2,097,152 bytes

# Các định dạng ảnh được phép (SCRUM-365)
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/pjpeg",
    "image/x-png",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

# Kích thước chuẩn cho ảnh đại diện và ảnh thu nhỏ (SCRUM-362)
AVATAR_SIZE = (500, 500)
THUMBNAIL_SIZE = (128, 128)

# Thư mục lưu trữ file ảnh đại diện theo người dùng (SCRUM-364)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads" / "avatars"


def get_user_avatar_dir(user_id: int) -> Path:
    """Lấy và tạo thư mục lưu trữ ảnh đại diện riêng cho từng người dùng (SCRUM-364)."""
    user_dir = UPLOAD_DIR / f"user_{user_id}"
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


def validate_avatar_file(file_bytes: bytes, filename: str, content_type: Optional[str] = None) -> str:
    """Kiểm tra tính hợp lệ của file tải lên:
    - SCRUM-365: Giới hạn dung lượng tối đa 2MB (2,097,152 bytes).
    - SCRUM-365: Chỉ chấp nhận định dạng JPG hoặc PNG.
    """
    # 1. Kiểm tra dung lượng file (tối đa 2MB)
    if len(file_bytes) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dung lượng ảnh vượt quá giới hạn 2MB (tối đa {MAX_AVATAR_SIZE:,} bytes)."
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File tải lên không có dữ liệu."
        )

    # 2. Kiểm tra phần mở rộng file (đuôi file phải là .jpg, .jpeg hoặc .png)
    ext = Path(filename).suffix.lower() if filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Định dạng file không hợp lệ. Chỉ chấp nhận định dạng JPG hoặc PNG."
        )

    # 3. Kiểm tra MIME type nếu có truyền lên từ client
    if content_type:
        base_mime = content_type.split(";")[0].strip().lower()
        if base_mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Định dạng file không hợp lệ. Chỉ chấp nhận định dạng JPG hoặc PNG."
            )

    # 4. Kiểm tra cấu trúc binary thực tế của ảnh bằng Pillow
    try:
        img_buffer = io.BytesIO(file_bytes)
        with Image.open(img_buffer) as img:
            img_format = (img.format or "").upper()
            if img_format not in ["JPEG", "PNG"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Định dạng file không hợp lệ. Chỉ chấp nhận định dạng JPG hoặc PNG."
                )
            return "image/png" if img_format == "PNG" else "image/jpeg"
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Định dạng file không hợp lệ hoặc dữ liệu ảnh bị hỏng. Chỉ chấp nhận định dạng JPG hoặc PNG."
        )


def process_square_crop_and_thumbnail(file_bytes: bytes, is_png: bool) -> Tuple[bytes, bytes, int, int]:
    """Cắt vuông (center square crop) và tạo bản thu nhỏ cho ảnh đại diện (SCRUM-362).
    - Cắt từ tâm để lấy tỉ lệ 1:1.
    - Resize ảnh đại diện chuẩn về 500x500.
    - Resize bản thu nhỏ (thumbnail) về 128x128.
    """
    img_buffer = io.BytesIO(file_bytes)
    with Image.open(img_buffer) as img:
        # Xử lý transparency cho định dạng JPEG
        if not is_png:
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.convert("RGBA").split()[3])
                img = bg
            elif img.mode != "RGB":
                img = img.convert("RGB")
        else:
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA")

        # 1. Cắt ảnh vuông (Center Crop 1:1)
        width, height = img.size
        min_dim = min(width, height)
        left = (width - min_dim) // 2
        top = (height - min_dim) // 2
        right = left + min_dim
        bottom = top + min_dim
        cropped_img = img.crop((left, top, right, bottom))

        # 2. Tạo ảnh avatar kích thước chuẩn 500x500
        avatar_img = cropped_img.resize(AVATAR_SIZE, Image.Resampling.LANCZOS)
        avatar_buffer = io.BytesIO()
        save_format = "PNG" if is_png else "JPEG"
        if save_format == "JPEG":
            avatar_img.save(avatar_buffer, format=save_format, quality=92, optimize=True)
        else:
            avatar_img.save(avatar_buffer, format=save_format, optimize=True)

        # 3. Tạo thumbnail kích thước 128x128 (SCRUM-362)
        thumb_img = cropped_img.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
        thumb_buffer = io.BytesIO()
        if save_format == "JPEG":
            thumb_img.save(thumb_buffer, format=save_format, quality=88, optimize=True)
        else:
            thumb_img.save(thumb_buffer, format=save_format, optimize=True)

        return avatar_buffer.getvalue(), thumb_buffer.getvalue(), AVATAR_SIZE[0], AVATAR_SIZE[1]


def build_avatar_urls(user_id: int, updated_at: Optional[datetime] = None) -> Tuple[str, str]:
    """Tạo URL truy cập ảnh đại diện và thumbnail."""
    ts = int(updated_at.timestamp()) if updated_at else int(datetime.now(timezone.utc).timestamp())
    avatar_url = f"/api/v1/user-avatars/{user_id}/avatar?t={ts}"
    thumbnail_url = f"/api/v1/user-avatars/{user_id}/thumbnail?t={ts}"
    return avatar_url, thumbnail_url


def save_user_avatar(
    db: Session,
    user_id: int,
    file_bytes: bytes,
    filename: str,
    content_type: Optional[str] = None
) -> UserAvatar:
    """Xử lý và lưu trữ ảnh đại diện cùng thumbnail theo người dùng (SCRUM-364):
    - Kiểm tra giới hạn 2MB và định dạng JPG/PNG (SCRUM-365).
    - Cắt vuông từ tâm và sinh thumbnail (SCRUM-362).
    - Lưu file vào thư mục người dùng và cập nhật CSDL (SCRUM-364).
    """
    # Bước 1: Xác thực định dạng & dung lượng
    confirmed_mime = validate_avatar_file(file_bytes, filename, content_type)
    is_png = confirmed_mime == "image/png"

    # Bước 2: Cắt vuông và tạo thumbnail
    avatar_bytes, thumb_bytes, w, h = process_square_crop_and_thumbnail(file_bytes, is_png)

    # Bước 3: Lưu file vào đĩa
    user_dir = get_user_avatar_dir(user_id)
    file_ext = "png" if is_png else "jpg"
    avatar_filename = f"avatar.{file_ext}"
    thumb_filename = f"thumbnail.{file_ext}"

    avatar_full_path = user_dir / avatar_filename
    thumb_full_path = user_dir / thumb_filename

    with open(avatar_full_path, "wb") as f:
        f.write(avatar_bytes)

    with open(thumb_full_path, "wb") as f:
        f.write(thumb_bytes)

    # Bước 4: Lưu thông tin vào CSDL (bảng user_avatars độc lập)
    user_avatar = db.query(UserAvatar).filter(UserAvatar.user_id == user_id).first()
    now_utc = datetime.now(timezone.utc)

    if not user_avatar:
        user_avatar = UserAvatar(
            user_id=user_id,
            original_filename=filename,
            avatar_path=str(avatar_full_path),
            thumbnail_path=str(thumb_full_path),
            content_type=confirmed_mime,
            file_size=len(file_bytes),
            width=w,
            height=h,
            created_at=now_utc,
            updated_at=now_utc
        )
        db.add(user_avatar)
    else:
        user_avatar.original_filename = filename
        user_avatar.avatar_path = str(avatar_full_path)
        user_avatar.thumbnail_path = str(thumb_full_path)
        user_avatar.content_type = confirmed_mime
        user_avatar.file_size = len(file_bytes)
        user_avatar.width = w
        user_avatar.height = h
        user_avatar.updated_at = now_utc

    db.commit()
    db.refresh(user_avatar)
    return user_avatar


def get_user_avatar(db: Session, user_id: int) -> Optional[UserAvatar]:
    """Lấy bản ghi UserAvatar từ CSDL."""
    return db.query(UserAvatar).filter(UserAvatar.user_id == user_id).first()


def delete_user_avatar(db: Session, user_id: int) -> bool:
    """Xóa ảnh đại diện và thumbnail của người dùng (SCRUM-364)."""
    user_avatar = db.query(UserAvatar).filter(UserAvatar.user_id == user_id).first()
    if not user_avatar:
        return False

    # Xóa file trên đĩa
    user_dir = get_user_avatar_dir(user_id)
    if user_dir.exists():
        try:
            shutil.rmtree(user_dir)
        except Exception:
            pass

    db.delete(user_avatar)
    db.commit()
    return True
