from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductStockUpdate,
    ProductResponse,
)
from app.services import product_service

router = APIRouter(prefix="/products", tags=["Sản phẩm"])


@router.get("", response_model=List[ProductResponse])
@router.get("/", response_model=List[ProductResponse], include_in_schema=False)
def get_products(
    search: Optional[str] = Query(None, description="Tìm theo tên, mã SKU hoặc Barcode"),
    category: Optional[str] = Query(None, description="Lọc theo danh mục"),
    stock_status: Optional[str] = Query(None, description="Lọc theo trạng thái tồn kho (active, low_stock, out_of_stock)"),
    db: Session = Depends(lay_phien_db),
):
    """Lấy danh sách tất cả sản phẩm trong hệ thống với các bộ lọc tìm kiếm."""
    return product_service.get_all_products(
        db=db,
        search=search,
        category=category,
        stock_status=stock_status,
    )


@router.get("/{product_id}", response_model=ProductResponse)
def get_product_detail(
    product_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Lấy thông tin chi tiết của một sản phẩm qua ID hoặc SKU."""
    return product_service.get_product_by_id(db=db, product_id=product_id)


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_new_product(
    product_in: ProductCreate,
    db: Session = Depends(lay_phien_db),
):
    """Tạo mới một sản phẩm vào danh mục."""
    return product_service.create_product(db=db, product_in=product_in)


@router.put("/{product_id}", response_model=ProductResponse)
def update_existing_product(
    product_id: str,
    product_in: ProductUpdate,
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật thông tin sản phẩm."""
    return product_service.update_product(db=db, product_id=product_id, product_in=product_in)


@router.delete("/{product_id}")
def delete_existing_product(
    product_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Xóa một sản phẩm khỏi hệ thống."""
    product_service.delete_product(db=db, product_id=product_id)
    return {"message": f"Đã xóa sản phẩm '{product_id}' thành công."}


@router.patch("/{product_id}/stock", response_model=ProductResponse)
def update_product_stock_delta(
    product_id: str,
    stock_in: ProductStockUpdate,
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật số lượng tồn kho (tăng hoặc giảm delta)."""
    return product_service.update_product_stock(db=db, product_id=product_id, delta=stock_in.delta)
