import math
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.auth import User, UserRole
from app.models.product import Product, ProductStatus
from app.schemas.product import (
    ProductCreateRequest,
    ProductUpdateRequest,
    ProductResponse,
    ProductListResponse,
)


class ProductService:
    """Service xử lý nghiệp vụ Quản lý danh mục sản phẩm (SCRUM-220)."""

    @staticmethod
    def is_sales_manager_or_admin(user: Optional[User]) -> bool:
        """Kiểm tra quyền Quản lý kinh doanh hoặc Quản trị viên (SCRUM-378).
        Chỉ hai vai trò này mới được xem và sửa giá vốn (cost_price).
        """
        if not user:
            return False
        user_role = (user.role or "").strip().lower()
        allowed_roles = {
            UserRole.SALES_MANAGER.value.lower(),
            UserRole.ADMIN.value.lower(),
            "sales_manager",
            "sales manager",
            "admin",
        }
        return user_role in allowed_roles

    @classmethod
    def serialize_product(cls, product: Product, current_user: Optional[User] = None) -> ProductResponse:
        """Chuyển đổi Product model sang ProductResponse với phân quyền giá vốn (SCRUM-378).
        Nếu người dùng không phải Quản lý kinh doanh/Admin, ẩn trường giá vốn (`cost_price = None`).
        """
        can_view_cost = cls.is_sales_manager_or_admin(current_user)
        return ProductResponse(
            id=product.id,
            sku=product.sku,
            name=product.name,
            category=product.category,
            unit=product.unit,
            packaging_spec=product.packaging_spec,
            cost_price=product.cost_price if can_view_cost else None,
            image_url=product.image_url,
            status=product.status,
            has_transactions=product.has_transactions,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )

    @classmethod
    def create_product(
        cls, db: Session, data: ProductCreateRequest, current_user: User
    ) -> Product:
        """Tạo mới sản phẩm vào danh mục (SCRUM-376, SCRUM-377):
        - Kiểm tra tính duy nhất của mã SKU (SCRUM-377).
        """
        normalized_sku = data.sku.strip().upper()

        # Kiểm tra trùng mã SKU (SCRUM-377)
        existing = db.query(Product).filter(
            func.upper(Product.sku) == normalized_sku
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã SKU '{normalized_sku}' đã tồn tại trong hệ thống. Vui lòng nhập mã khác."
            )

        # Kiểm tra quyền sửa giá vốn (SCRUM-378)
        cost_price = data.cost_price or 0.0
        if not cls.is_sales_manager_or_admin(current_user) and data.cost_price not in (None, 0.0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản lý kinh doanh mới có quyền thiết lập giá vốn cho sản phẩm."
            )

        product = Product(
            sku=normalized_sku,
            name=data.name.strip(),
            category=data.category.strip(),
            unit=data.unit.strip(),
            packaging_spec=data.packaging_spec.strip() if data.packaging_spec else None,
            cost_price=cost_price if cls.is_sales_manager_or_admin(current_user) else 0.0,
            image_url=data.image_url,
            status=data.status or ProductStatus.ACTIVE,
            has_transactions=False,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        return product

    @classmethod
    def update_product(
        cls, db: Session, product_id: int, data: ProductUpdateRequest, current_user: User
    ) -> Product:
        """Cập nhật thông tin sản phẩm trong danh mục (SCRUM-376, SCRUM-377, SCRUM-378):
        - Kiểm tra tính duy nhất khi thay đổi mã SKU (SCRUM-377).
        - Kiểm tra quyền sửa giá vốn (SCRUM-378).
        """
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy sản phẩm trong danh mục."
            )

        # Cập nhật và kiểm tra duy nhất mã SKU (SCRUM-377)
        if data.sku is not None:
            normalized_sku = data.sku.strip().upper()
            if normalized_sku != product.sku:
                existing = db.query(Product).filter(
                    func.upper(Product.sku) == normalized_sku,
                    Product.id != product_id
                ).first()
                if existing:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Mã SKU '{normalized_sku}' đã được sử dụng bởi sản phẩm khác."
                    )
                product.sku = normalized_sku

        # Cập nhật giá vốn (SCRUM-378)
        if data.cost_price is not None:
            if not cls.is_sales_manager_or_admin(current_user):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Chỉ Quản lý kinh doanh mới có quyền xem và sửa giá vốn."
                )
            product.cost_price = data.cost_price
        if data.name is not None:
            product.name = data.name.strip()
        if data.category is not None:
            product.category = data.category.strip()
        if data.unit is not None:
            product.unit = data.unit.strip()
        if data.packaging_spec is not None:
            product.packaging_spec = data.packaging_spec.strip() if data.packaging_spec else None
        if data.cost_price is not None:
            product.cost_price = data.cost_price
        if data.image_url is not None:
            product.image_url = data.image_url
        if data.status is not None:
            product.status = data.status

        db.commit()
        db.refresh(product)
        return product

    @classmethod
    def get_product(cls, db: Session, product_id: int) -> Product:
        """Lấy chi tiết một sản phẩm theo ID (SCRUM-376)."""
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy sản phẩm trong danh mục."
            )
        return product

    @classmethod
    def list_products(
        cls,
        db: Session,
        current_user: Optional[User] = None,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        category: Optional[str] = None,
        product_status: Optional[str] = None,
    ) -> ProductListResponse:
        """Tra cứu và phân trang danh sách sản phẩm (SCRUM-376)."""
        query = db.query(Product)

        if search and search.strip():
            clean_search = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Product.sku.ilike(clean_search),
                    Product.name.ilike(clean_search),
                )
            )

        if category and category.strip():
            query = query.filter(Product.category == category.strip())

        if product_status and product_status.strip():
            query = query.filter(Product.status == product_status.strip())

        total = query.count()
        total_pages = math.ceil(total / page_size) if total > 0 else 0

        offset = (page - 1) * page_size
        items = query.order_by(Product.id.desc()).offset(offset).limit(page_size).all()

        serialized_items = [cls.serialize_product(p, current_user) for p in items]

        return ProductListResponse(
            items=serialized_items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    @classmethod
    def update_image(cls, db: Session, product_id: int, image_url: str) -> Product:
        """Cập nhật ảnh sản phẩm và lưu thông tin hiển thị trên danh mục (SCRUM-379)."""
        product = cls.get_product(db, product_id)
        product.image_url = image_url
        db.commit()
        db.refresh(product)
        return product
