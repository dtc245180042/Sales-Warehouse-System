from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class AvatarInfo(BaseModel):
    """Thông tin chi tiết về ảnh đại diện và thumbnail."""
    user_id: int
    original_filename: Optional[str] = None
    avatar_url: str
    thumbnail_url: str
    content_type: str
    file_size: int
    width: Optional[int] = None
    height: Optional[int] = None
    updated_at: Optional[datetime] = None
    external_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AvatarUploadResponse(BaseModel):
    """Phản hồi sau khi tải ảnh đại diện lên thành công."""
    success: bool = True
    message: str
    data: AvatarInfo


class AvatarSetUrlRequest(BaseModel):
    """Yêu cầu cập nhật đường dẫn ảnh đại diện (như ImgBB Cloud URL)."""
    avatar_url: str


class AvatarDeleteResponse(BaseModel):
    """Phản hồi sau khi xóa ảnh đại diện."""
    success: bool = True
    message: str
