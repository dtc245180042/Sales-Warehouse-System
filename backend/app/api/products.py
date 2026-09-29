from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.dependencies import get_current_user
from app.models.auth import User
from app.schemas.product import ProductListResponse
from app.services.product_service import (
    get_products_list,
    get_product_by_sku,
    can_view_cost_and_margin,
)

router = APIRouter(prefix="/products", tags=["Products & Financial Margins"])


@router.get(
    "",
    summary="Danh sách sản phẩm có lọc giá vốn và biên lợi nhuận theo vai trò (SCRUM-202, SCRUM-313)",
    response_model=ProductListResponse,
)
def list_products(
    search: Optional[str] = Query(None, description="Tìm kiếm theo tên sản phẩm hoặc mã SKU"),
    category: Optional[str] = Query(None, description="Lọc theo danh mục sản phẩm"),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Cơ chế kiểm tra vai trò và lọc dữ liệu (SCRUM-202):
    
    - Chỉ vai trò Quản lý kinh doanh (Sales Manager) và Admin nhận được trường
      `cost_price` (giá vốn) và `profit_margin` (biên lợi nhuận).
    - Các vai trò khác (Sales Rep, Warehouse, WH Manager, Accountant, Customer)
      hoàn toàn KHÔNG nhận các trường dữ liệu nhạy cảm này trong response.
    """
    return get_products_list(current_user=current_user, search=search, category=category)


@router.get(
    "/{sku}",
    summary="Chi tiết sản phẩm theo mã SKU có lọc giá vốn theo quyền (SCRUM-202)",
)
def get_product(
    sku: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Lấy chi tiết 1 sản phẩm. Giá vốn và biên lợi nhuận được ẩn nếu không phải Sales Manager/Admin."""
    product = get_product_by_sku(sku=sku, current_user=current_user)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm với mã SKU '{sku}'",
        )
    return product


# ---------------------------------------------------------------------------
# Backward-compatibility aliases (legacy Vietnamese names — do NOT use in new code)
# ---------------------------------------------------------------------------
danh_sach_san_pham = list_products
chi_tiet_san_pham = get_product
kiem_tra_quyen_xem_gia_von = can_view_cost_and_margin
