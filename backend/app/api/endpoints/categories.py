from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryTreeResponse,
    TransferProductsRequest,
    TransferProductsResponse,
    ProductCreate,
    ProductResponse,
)
from app.services.category_service import CategoryService

# Tự động nạp qua Auto-Discovery theo đúng quy tắc AGENTS.md
router = APIRouter(prefix="/categories", tags=["Categories & Hierarchy (SCRUM-214)"])


@router.get(
    "/tree",
    response_model=List[CategoryTreeResponse],
    summary="Lấy toàn bộ cây danh mục nhóm hàng nhiều cấp (tối thiểu 3 cấp) (SCRUM-214)"
)
def lay_cay_nhom_hang(db: Session = Depends(lay_phien_db)):
    """Trả về cấu trúc cây nhóm hàng nhiều cấp lồng nhau:
    - Hỗ trợ tối thiểu 3 cấp (Level 1: Ngành hàng -> Level 2: Nhóm hàng -> Level 3: Tiểu nhóm).
    - Đi kèm thống kê số lượng sản phẩm và số lượng nhóm con.
    """
    return CategoryService.get_tree(db)


@router.get(
    "",
    response_model=List[CategoryResponse],
    summary="Lấy danh sách phẳng nhóm hàng có lọc theo cấp độ hoặc nhóm cha"
)
def lay_danh_sach_nhom_hang(
    parent_id: Optional[int] = Query(None, description="Lọc theo ID nhóm cha"),
    level: Optional[int] = Query(None, ge=1, description="Lọc theo cấp độ phân tầng"),
    keyword: Optional[str] = Query(None, description="Tìm kiếm theo mã hoặc tên nhóm"),
    db: Session = Depends(lay_phien_db)
):
    return CategoryService.get_list(db, parent_id=parent_id, level=level, keyword=keyword)


@router.get(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Xem chi tiết một nhóm hàng"
)
def xem_chi_tiet_nhom_hang(
    category_id: int,
    db: Session = Depends(lay_phien_db)
):
    return CategoryService.get_by_id(db, category_id)


@router.post(
    "",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo mới một nhóm hàng (tự động xác định level)"
)
def tao_nhom_hang(
    du_lieu: CategoryCreate,
    db: Session = Depends(lay_phien_db)
):
    """Tạo mới nhóm hàng:
    - Nếu không có parent_id: Level 1 (Ngành hàng lớn).
    - Nếu có parent_id: Level = parent.level + 1.
    """
    return CategoryService.create(db, du_lieu)


@router.put(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Cập nhật thông tin nhóm hàng (kiểm tra chống tạo chu trình lặp)"
)
def cap_nhat_nhom_hang(
    category_id: int,
    du_lieu: CategoryUpdate,
    db: Session = Depends(lay_phien_db)
):
    return CategoryService.update(db, category_id, du_lieu)


@router.delete(
    "/{category_id}",
    summary="Xóa nhóm hàng có kiểm tra bảo vệ (SCRUM-214)"
)
def xoa_nhom_hang(
    category_id: int,
    db: Session = Depends(lay_phien_db)
):
    """RÀNG BUỘC NGHIỆP VỤ BẢO VỆ:
    - Ngăn xóa nếu nhóm còn sản phẩm trực thuộc (trả về HTTP 400).
    - Ngăn xóa nếu nhóm còn nhóm con trực thuộc (trả về HTTP 400).
    - Chỉ cho phép xóa khi nhóm hoàn toàn rỗng.
    """
    return CategoryService.delete_with_guard(db, category_id)


@router.post(
    "/transfer-products",
    response_model=TransferProductsResponse,
    summary="Chuyển sản phẩm giữa các nhóm hàng (SCRUM-214)"
)
def chuyen_san_pham_giua_cac_nhom(
    du_lieu: TransferProductsRequest,
    db: Session = Depends(lay_phien_db)
):
    """Gán lại danh sách sản phẩm từ nhóm nguồn sang nhóm đích:
    - Đảm bảo tính nhất quán dữ liệu trong 1 Transaction.
    - Cập nhật đúng category_id cho các sản phẩm.
    """
    return CategoryService.transfer_products(db, du_lieu)


@router.get(
    "/{category_id}/products",
    response_model=List[ProductResponse],
    summary="Lấy danh sách sản phẩm trực thuộc nhóm hàng"
)
def lay_san_pham_theo_nhom(
    category_id: int,
    db: Session = Depends(lay_phien_db)
):
    return CategoryService.get_products_by_category(db, category_id)


@router.post(
    "/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm mới sản phẩm gắn vào một nhóm hàng"
)
def tao_san_pham(
    du_lieu: ProductCreate,
    db: Session = Depends(lay_phien_db)
):
    return CategoryService.create_product(db, du_lieu)


@router.post(
    "/seed-samples",
    summary="Khởi tạo cây danh mục 3 cấp và dữ liệu sản phẩm mẫu để kiểm thử nội bộ"
)
def khoi_tao_mau_cay_danh_muc(db: Session = Depends(lay_phien_db)):
    return CategoryService.seed_sample_tree_data(db)
