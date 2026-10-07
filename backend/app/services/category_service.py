from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.category import Category
from app.models.product import Product
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryTreeResponse,
    TransferProductsRequest,
    TransferProductsResponse,
    ProductResponse,
    ProductCreate,
)


def get_all_descendant_ids(db: Session, category_id: int) -> List[int]:
    """Lấy danh sách ID của toàn bộ các nhóm con cháu bên dưới (đệ quy) để chống tạo chu trình."""
    descendant_ids = []
    children = db.query(Category.id).filter(Category.parent_id == category_id).all()
    for (child_id,) in children:
        descendant_ids.append(child_id)
        descendant_ids.extend(get_all_descendant_ids(db, child_id))
    return descendant_ids


def update_subtree_levels(db: Session, category_id: int, new_level: int):
    """Cập nhật đệ quy cấp độ (level) cho toàn bộ nhánh con khi chuyển nhóm cha."""
    children = db.query(Category).filter(Category.parent_id == category_id).all()
    for child in children:
        child.level = new_level + 1
        update_subtree_levels(db, child.id, child.level)


class CategoryService:
    @staticmethod
    def get_list(
        db: Session,
        parent_id: Optional[int] = None,
        level: Optional[int] = None,
        keyword: Optional[str] = None
    ) -> List[CategoryResponse]:
        """Lấy danh sách phẳng các nhóm hàng kèm số lượng sản phẩm và nhóm con."""
        query = db.query(Category)
        if parent_id is not None:
            query = query.filter(Category.parent_id == parent_id)
        if level is not None:
            query = query.filter(Category.level == level)
        if keyword:
            kw = f"%{keyword.strip()}%"
            query = query.filter((Category.name.ilike(kw)) | (Category.code.ilike(kw)))

        categories = query.order_by(Category.level.asc(), Category.name.asc()).all()

        results = []
        for cat in categories:
            prod_count = db.query(Product).filter(Product.category_id == cat.id).count()
            child_count = db.query(Category).filter(Category.parent_id == cat.id).count()
            desc_ids = get_all_descendant_ids(db, cat.id)
            sub_count = db.query(Product).filter(Product.category_id.in_(desc_ids)).count() if desc_ids else 0
            total_prod_count = prod_count + sub_count
            results.append(
                CategoryResponse(
                    id=cat.id,
                    code=cat.code,
                    name=cat.name,
                    description=cat.description,
                    parent_id=cat.parent_id,
                    level=cat.level,
                    is_active=cat.is_active,
                    product_count=prod_count,
                    children_count=child_count,
                    total_product_count=total_prod_count,
                    created_at=cat.created_at,
                    updated_at=cat.updated_at,
                )
            )
        return results

    @staticmethod
    def get_tree(db: Session) -> List[CategoryTreeResponse]:
        """Xây dựng và trả về cây danh mục nhóm hàng nhiều cấp (tối thiểu 3 cấp) theo SCRUM-214."""
        all_categories = db.query(Category).order_by(Category.level.asc(), Category.name.asc()).all()

        # Tính trước thống kê sản phẩm và nhóm con
        stats: Dict[int, Dict[str, int]] = {}
        for cat in all_categories:
            prod_count = db.query(Product).filter(Product.category_id == cat.id).count()
            child_count = db.query(Category).filter(Category.parent_id == cat.id).count()
            stats[cat.id] = {"prod_count": prod_count, "child_count": child_count}

        # Ánh xạ thành dictionary các node
        node_map: Dict[int, CategoryTreeResponse] = {}
        for cat in all_categories:
            node_map[cat.id] = CategoryTreeResponse(
                id=cat.id,
                code=cat.code,
                name=cat.name,
                description=cat.description,
                parent_id=cat.parent_id,
                level=cat.level,
                is_active=cat.is_active,
                product_count=stats[cat.id]["prod_count"],
                children_count=stats[cat.id]["child_count"],
                total_product_count=stats[cat.id]["prod_count"],
                created_at=cat.created_at,
                updated_at=cat.updated_at,
                children=[]
            )

        # Lắp ghép các node thành cây phân cấp
        root_nodes: List[CategoryTreeResponse] = []
        for cat in all_categories:
            current_node = node_map[cat.id]
            if cat.parent_id and cat.parent_id in node_map:
                node_map[cat.parent_id].children.append(current_node)
            else:
                root_nodes.append(current_node)

        # Tính toán cộng dồn số lượng sản phẩm đệ quy từ các nhánh con lên gốc (Roll-up Aggregation)
        def _rollup_counts(node: CategoryTreeResponse) -> int:
            total = node.product_count
            for child in node.children:
                total += _rollup_counts(child)
            node.total_product_count = total
            return total

        for root in root_nodes:
            _rollup_counts(root)

        return root_nodes

    @staticmethod
    def get_by_id(db: Session, category_id: int) -> CategoryResponse:
        """Lấy thông tin chi tiết một nhóm hàng."""
        cat = db.query(Category).filter(Category.id == category_id).first()
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy nhóm hàng có ID {category_id}."
            )
        prod_count = db.query(Product).filter(Product.category_id == cat.id).count()
        child_count = db.query(Category).filter(Category.parent_id == cat.id).count()
        desc_ids = get_all_descendant_ids(db, cat.id)
        sub_count = db.query(Product).filter(Product.category_id.in_(desc_ids)).count() if desc_ids else 0
        total_prod_count = prod_count + sub_count

        return CategoryResponse(
            id=cat.id,
            code=cat.code,
            name=cat.name,
            description=cat.description,
            parent_id=cat.parent_id,
            level=cat.level,
            is_active=cat.is_active,
            product_count=prod_count,
            children_count=child_count,
            total_product_count=total_prod_count,
            created_at=cat.created_at,
            updated_at=cat.updated_at,
        )

    @staticmethod
    def create(db: Session, cat_in: CategoryCreate) -> CategoryResponse:
        """Tạo nhóm hàng mới kèm tính toán cấp độ phân tầng (Level)."""
        clean_code = cat_in.code.strip().upper()
        existing = db.query(Category).filter(Category.code == clean_code).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã nhóm hàng '{clean_code}' đã tồn tại trong hệ thống. Vui lòng chọn mã khác."
            )

        level = 1
        if cat_in.parent_id:
            parent = db.query(Category).filter(Category.id == cat_in.parent_id).first()
            if not parent:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Nhóm hàng cha (ID: {cat_in.parent_id}) không tồn tại."
                )
            level = parent.level + 1

        new_cat = Category(
            code=clean_code,
            name=cat_in.name.strip(),
            description=cat_in.description.strip() if cat_in.description else None,
            parent_id=cat_in.parent_id,
            level=level,
            is_active=cat_in.is_active,
        )
        db.add(new_cat)
        db.commit()
        db.refresh(new_cat)

        return CategoryService.get_by_id(db, new_cat.id)

    @staticmethod
    def update(db: Session, category_id: int, cat_in: CategoryUpdate) -> CategoryResponse:
        """Cập nhật thông tin nhóm hàng và kiểm tra chống tạo chu trình cha-con lặp."""
        cat = db.query(Category).filter(Category.id == category_id).first()
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy nhóm hàng có ID {category_id}."
            )

        if cat_in.code:
            clean_code = cat_in.code.strip().upper()
            if clean_code != cat.code:
                dup = db.query(Category).filter(Category.code == clean_code, Category.id != category_id).first()
                if dup:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Mã nhóm hàng '{clean_code}' đã được sử dụng."
                    )
                cat.code = clean_code

        if cat_in.name is not None:
            cat.name = cat_in.name.strip()
        if cat_in.description is not None:
            cat.description = cat_in.description.strip() if cat_in.description else None
        if cat_in.is_active is not None:
            cat.is_active = cat_in.is_active

        # Kiểm tra nếu thay đổi nhóm cha
        if cat_in.parent_id is not None and cat_in.parent_id != cat.parent_id:
            new_parent_id = cat_in.parent_id if cat_in.parent_id > 0 else None
            if new_parent_id == cat.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Một nhóm hàng không thể tự làm nhóm cha của chính mình."
                )

            if new_parent_id:
                # Kiểm tra nhóm cha có tồn tại không
                new_parent = db.query(Category).filter(Category.id == new_parent_id).first()
                if not new_parent:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Nhóm cha đích (ID: {new_parent_id}) không tồn tại."
                    )
                # Kiểm tra chu trình: nhóm cha mới không được nằm trong danh sách con cháu của nhóm hiện tại
                descendant_ids = get_all_descendant_ids(db, cat.id)
                if new_parent_id in descendant_ids:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Không thể chuyển nhóm hàng vào trong một nhóm con của chính nó (gây xung đột vòng lặp cấu trúc cây)."
                    )
                cat.parent_id = new_parent_id
                cat.level = new_parent.level + 1
            else:
                cat.parent_id = None
                cat.level = 1

            # Cập nhật đệ quy level cho toàn bộ nhánh con bên dưới
            update_subtree_levels(db, cat.id, cat.level)

        db.commit()
        db.refresh(cat)
        return CategoryService.get_by_id(db, cat.id)

    @staticmethod
    def delete_with_guard(db: Session, category_id: int) -> Dict[str, Any]:
        """RÀNG BUỘC BẢO VỆ XÓA THEO SCRUM-214:
        Ngăn xóa nếu:
        1. Nhóm hàng còn sản phẩm trực thuộc (product_count > 0).
        2. Nhóm hàng còn nhóm con trực thuộc (children_count > 0).
        """
        cat = db.query(Category).filter(Category.id == category_id).first()
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy nhóm hàng có ID {category_id}."
            )

        # 1. Kiểm tra sản phẩm trực thuộc
        prod_count = db.query(Product).filter(Product.category_id == category_id).count()
        if prod_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể xóa nhóm hàng '{cat.name}' vì đang chứa {prod_count} sản phẩm trực thuộc. Vui lòng chuyển các sản phẩm sang nhóm khác trước khi xóa."
            )

        # 2. Kiểm tra nhóm con trực thuộc
        child_count = db.query(Category).filter(Category.parent_id == category_id).count()
        if child_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể xóa nhóm hàng '{cat.name}' vì còn {child_count} nhóm hàng con trực thuộc. Vui lòng xóa hoặc di chuyển các nhóm con trước."
            )

        # Nếu thỏa mãn cả 2 điều kiện, thực hiện xóa
        cat_name = cat.name
        db.delete(cat)
        db.commit()

        return {
            "success": True,
            "message": f"Đã xóa thành công nhóm hàng '{cat_name}'.",
            "deleted_id": category_id
        }

    @staticmethod
    def transfer_products(db: Session, transfer_req: TransferProductsRequest) -> TransferProductsResponse:
        """CHUYỂN SẢN PHẨM GIỮA CÁC NHÓM HÀNG THEO SCRUM-214:
        Cho phép chọn các sản phẩm từ nhóm nguồn gán sang nhóm đích một cách nhất quán.
        """
        if transfer_req.source_category_id == transfer_req.target_category_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nhóm nguồn và nhóm đích phải khác nhau."
            )

        source_cat = db.query(Category).filter(Category.id == transfer_req.source_category_id).first()
        if not source_cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Nhóm nguồn (ID: {transfer_req.source_category_id}) không tồn tại."
            )

        target_cat = db.query(Category).filter(Category.id == transfer_req.target_category_id).first()
        if not target_cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Nhóm đích (ID: {transfer_req.target_category_id}) không tồn tại."
            )

        # Tìm các sản phẩm thuộc nhóm nguồn khớp với danh sách product_ids
        products = db.query(Product).filter(
            Product.id.in_(transfer_req.product_ids),
            Product.category_id == transfer_req.source_category_id
        ).all()

        if not products:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không tìm thấy sản phẩm hợp lệ thuộc nhóm nguồn để chuyển."
            )

        # Thực hiện cập nhật nhóm đích
        for p in products:
            p.category_id = target_cat.id

        db.commit()

        return TransferProductsResponse(
            success=True,
            transferred_count=len(products),
            message=f"Đã chuyển thành công {len(products)} sản phẩm từ nhóm '{source_cat.name}' sang nhóm '{target_cat.name}'.",
            target_category_name=target_cat.name
        )

    @staticmethod
    def get_products_by_category(db: Session, category_id: int) -> List[ProductResponse]:
        """Lấy danh sách sản phẩm trong một nhóm hàng."""
        cat = db.query(Category).filter(Category.id == category_id).first()
        if not cat:
            raise HTTPException(status_code=404, detail="Nhóm hàng không tồn tại.")

        products = db.query(Product).filter(Product.category_id == category_id).all()
        return [
            ProductResponse(
                id=p.id,
                sku=p.sku,
                name=p.name,
                category_id=p.category_id,
                category_name=cat.name,
                price=p.price,
                unit=p.unit,
                description=p.description,
                is_active=p.is_active,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
            for p in products
        ]

    @staticmethod
    def create_product(db: Session, prod_in: ProductCreate) -> ProductResponse:
        """Tạo sản phẩm mới."""
        clean_sku = prod_in.sku.strip().upper()
        if db.query(Product).filter(Product.sku == clean_sku).first():
            raise HTTPException(status_code=400, detail=f"Mã SKU '{clean_sku}' đã tồn tại.")

        cat_name = None
        if prod_in.category_id:
            cat = db.query(Category).filter(Category.id == prod_in.category_id).first()
            if not cat:
                raise HTTPException(status_code=404, detail="Nhóm hàng không tồn tại.")
            cat_name = cat.name

        product = Product(
            sku=clean_sku,
            name=prod_in.name.strip(),
            category_id=prod_in.category_id,
            price=prod_in.price,
            unit=prod_in.unit,
            description=prod_in.description,
            is_active=prod_in.is_active,
        )
        db.add(product)
        db.commit()
        db.refresh(product)

        return ProductResponse(
            id=product.id,
            sku=product.sku,
            name=product.name,
            category_id=product.category_id,
            category_name=cat_name,
            price=product.price,
            unit=product.unit,
            description=product.description,
            is_active=product.is_active,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )

    @staticmethod
    def seed_sample_tree_data(db: Session) -> Dict[str, Any]:
        """Khởi tạo cây nhóm hàng mẫu 3 cấp và một số sản phẩm để kiểm thử nhanh (SCRUM-214)."""
        # Nếu đã có dữ liệu thì bỏ qua
        if db.query(Category).count() > 0:
            return {"message": "Dữ liệu nhóm hàng đã tồn tại.", "categories": db.query(Category).count()}

        # 1. Level 1 (Ngành hàng lớn)
        dien_tu = Category(code="DIEN_TU", name="Thiết bị điện tử & Viễn thông", level=1, parent_id=None)
        gia_dung = Category(code="GIA_DUNG", name="Điện gia dụng & Nhà bếp", level=1, parent_id=None)
        db.add_all([dien_tu, gia_dung])
        db.commit()
        db.refresh(dien_tu)
        db.refresh(gia_dung)

        # 2. Level 2 (Nhóm hàng trực thuộc)
        dien_thoai_mtb = Category(code="DIEN_THOAI_MTB", name="Điện thoại & Máy tính bảng", level=2, parent_id=dien_tu.id)
        laptop_pc = Category(code="LAPTOP_PC", name="Máy tính & Thiết bị IT", level=2, parent_id=dien_tu.id)
        nha_bep = Category(code="NHA_BEP", name="Thiết bị nấu nướng nhà bếp", level=2, parent_id=gia_dung.id)
        db.add_all([dien_thoai_mtb, laptop_pc, nha_bep])
        db.commit()
        db.refresh(dien_thoai_mtb)
        db.refresh(laptop_pc)
        db.refresh(nha_bep)

        # 3. Level 3 (Tiểu nhóm / Phân loại hàng trực thuộc)
        smartphone = Category(code="SMARTPHONE", name="Điện thoại thông minh (Smartphones)", level=3, parent_id=dien_thoai_mtb.id)
        tablet = Category(code="TABLET", name="Máy tính bảng (Tablets)", level=3, parent_id=dien_thoai_mtb.id)
        laptop_gaming = Category(code="LAPTOP_GAMING", name="Laptop Gaming đồ họa", level=3, parent_id=laptop_pc.id)
        noi_chien = Category(code="NOI_CHIEN", name="Nồi chiên không dầu & Lò nướng", level=3, parent_id=nha_bep.id)
        bep_tu = Category(code="BEP_TU", name="Bếp từ & Bếp hồng ngoại", level=3, parent_id=nha_bep.id)
        db.add_all([smartphone, tablet, laptop_gaming, noi_chien, bep_tu])
        db.commit()
        db.refresh(smartphone)
        db.refresh(tablet)
        db.refresh(laptop_gaming)

        # 4. Tạo một số sản phẩm mẫu gắn vào các nhóm Level 3
        products = [
            Product(sku="IPHONE-15-PRO", name="iPhone 15 Pro Max 256GB Titan Tự Nhiên", category_id=smartphone.id, price=29990000, unit="chiếc"),
            Product(sku="SS-S24-ULTRA", name="Samsung Galaxy S24 Ultra 512GB Xám", category_id=smartphone.id, price=31490000, unit="chiếc"),
            Product(sku="IPAD-AIR-M2", name="iPad Air M2 11-inch WiFi 128GB Xanh", category_id=tablet.id, price=16990000, unit="chiếc"),
            Product(sku="ASUS-ROG-STRIX", name="Laptop ASUS ROG Strix G16 RTX 4060", category_id=laptop_gaming.id, price=38500000, unit="chiếc"),
            Product(sku="PHILIPS-HD9650", name="Nồi chiên không dầu Philips XXL HD9650", category_id=noi_chien.id, price=5490000, unit="chiếc"),
            Product(sku="BOSCH-PUJ611BB5E", name="Bếp từ 3 vùng nấu Bosch PUJ611BB5E", category_id=bep_tu.id, price=13900000, unit="chiếc"),
        ]
        db.add_all(products)
        db.commit()

        return {
            "message": "Khởi tạo thành công cây nhóm hàng 3 cấp và 6 sản phẩm mẫu.",
            "categories_count": db.query(Category).count(),
            "products_count": db.query(Product).count()
        }
