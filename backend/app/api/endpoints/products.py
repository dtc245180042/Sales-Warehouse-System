import os
import uuid
from typing import Optional, Union
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai, lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.product import (
    ProductCreateRequest,
    ProductUpdateRequest,
    ProductResponse,
    ProductListResponse,
)
from app.services.product_service import ProductService

# Router tự động được nạp vào /api và /api/v1 theo cơ chế Auto-Discovery (AGENTS.md)
router = APIRouter(prefix="/products", tags=["Quản lý danh mục sản phẩm (SCRUM-220)"])


@router.get(
    "",
    response_model=ProductListResponse,
    status_code=status.HTTP_200_OK,
    summary="Tra cứu và phân trang danh mục sản phẩm (SCRUM-376)"
)
def lay_danh_sach_san_pham(
    page: int = Query(1, ge=1, description="Số trang hiển thị"),
    page_size: int = Query(20, ge=1, le=10000, description="Số sản phẩm mỗi trang (tối đa 10000 để hỗ trợ tải toàn bộ danh mục)"),
    all_products: bool = Query(False, description="Tải toàn bộ danh sách sản phẩm không phân trang"),
    search: Optional[str] = Query(None, description="Tìm kiếm theo mã SKU hoặc Tên sản phẩm"),
    category: Optional[str] = Query(None, description="Lọc theo nhóm hàng"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: ACTIVE hoặc INACTIVE"),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """Lấy danh sách sản phẩm có tìm kiếm, lọc và phân trang (SCRUM-376). Hỗ trợ tải toàn bộ khi import 5000+ sản phẩm."""
    if all_products:
        page_size = 10000
        page = 1
    return ProductService.list_products(
        db=db,
        current_user=current_user,
        page=page,
        page_size=page_size,
        search=search,
        category=category,
        product_status=status,
    )


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo mới sản phẩm vào danh mục (SCRUM-376)"
)
def tao_san_pham_moi(
    data: ProductCreateRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Khai báo sản phẩm mới trong danh mục (SCRUM-376)."""
    product = ProductService.create_product(
        db=db,
        data=data,
        current_user=current_user,
    )
    return ProductService.serialize_product(product, current_user)


@router.get(
    "/{product_id}",
    response_model=ProductResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem thông tin chi tiết một sản phẩm (SCRUM-376)"
)
def xem_chi_tiet_san_pham(
    product_id: Union[int, str],
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Lấy chi tiết sản phẩm theo ID (SCRUM-376)."""
    product = ProductService.get_product(db=db, product_id=product_id)
    return ProductService.serialize_product(product, current_user)


@router.put(
    "/{product_id}",
    response_model=ProductResponse,
    status_code=status.HTTP_200_OK,
    summary="Cập nhật thông tin sản phẩm (SCRUM-376)"
)
def cap_nhat_san_pham(
    product_id: int,
    data: ProductUpdateRequest,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật thông tin sản phẩm trong danh mục (SCRUM-376)."""
    product = ProductService.update_product(
        db=db,
        product_id=product_id,
        data=data,
        current_user=current_user,
    )
    return ProductService.serialize_product(product, current_user)


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_200_OK,
    summary="Xóa sản phẩm khỏi danh mục (SCRUM-375)"
)
def xoa_san_pham(
    product_id: int,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xóa sản phẩm trong danh mục:
    - Nếu sản phẩm ĐÃ PHÁT SINH GIAO DỊCH (`has_transactions = True`): Hệ thống ngăn chặn xóa
      và yêu cầu chuyển sang trạng thái Ngừng kinh doanh (SCRUM-375).
    - Nếu chưa phát sinh giao dịch: Cho phép xóa khỏi danh mục.
    """
    return ProductService.delete_product(db=db, product_id=product_id)


@router.post(
    "/{product_id}/deactivate",
    response_model=ProductResponse,
    status_code=status.HTTP_200_OK,
    summary="Ngừng kinh doanh sản phẩm (SCRUM-375)"
)
def ngung_kinh_doanh_san_pham(
    product_id: int,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Chuyển trạng thái sản phẩm sang Ngừng kinh doanh (INACTIVE) thay vì xóa (SCRUM-375)."""
    product = ProductService.deactivate_product(db=db, product_id=product_id)
    return ProductService.serialize_product(product, current_user)


@router.post(
    "/{product_id}/activate",
    response_model=ProductResponse,
    status_code=status.HTTP_200_OK,
    summary="Kích hoạt lại trạng thái Đang kinh doanh"
)
def kich_hoat_kinh_doanh_san_pham(
    product_id: int,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Chuyển trạng thái sản phẩm trở lại Đang kinh doanh (ACTIVE)."""
    product = ProductService.activate_product(db=db, product_id=product_id)
    return ProductService.serialize_product(product, current_user)


UPLOAD_DIR = os.path.join("uploads", "products")
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB


@router.post(
    "/{product_id}/image",
    response_model=ProductResponse,
    status_code=status.HTTP_200_OK,
    summary="Tải lên và quản lý ảnh sản phẩm (SCRUM-379)"
)
async def tai_len_anh_san_pham(
    product_id: int,
    file: UploadFile = File(..., description="File ảnh sản phẩm (jpg, png, webp, max 5MB)"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Tải lên ảnh sản phẩm và lưu đường dẫn hiển thị trên danh mục (SCRUM-379):
    - Kiểm tra định dạng ảnh cho phép (jpg, png, webp, gif).
    - Giới hạn dung lượng tối đa 5MB.
    - Cập nhật trường `image_url` cho sản phẩm tương ứng.
    """
    filename = file.filename or ""
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng file không hợp lệ. Chỉ chấp nhận các định dạng: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}."
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng file ảnh vượt quá giới hạn cho phép (tối đa 5MB)."
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as f:
        f.write(content)

    image_url = f"/static/products/{unique_filename}"
    product = ProductService.update_image(db=db, product_id=product_id, image_url=image_url)
    return ProductService.serialize_product(product, current_user)


@router.post(
    "/upload-image",
    status_code=status.HTTP_200_OK,
    summary="Tải lên ảnh sản phẩm độc lập (SCRUM-379)"
)
async def tai_len_anh_san_pham_doc_lap(
    file: UploadFile = File(..., description="File ảnh sản phẩm (jpg, png, webp, max 5MB)"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """Tải lên ảnh sản phẩm độc lập và trả về URL ảnh (SCRUM-379)."""
    filename = file.filename or ""
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng file không hợp lệ. Chỉ chấp nhận các định dạng: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}."
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dung lượng file ảnh vượt quá giới hạn cho phép (tối đa 5MB)."
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "url": f"/static/products/{unique_filename}",
        "image_url": f"/static/products/{unique_filename}",
    }

