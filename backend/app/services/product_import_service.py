import pandas as pd
from io import BytesIO
from sqlalchemy.orm import Session
from app.models.product import Product

class ProductImportService:

    @staticmethod
    def preview_import(file_bytes: bytes, db: Session) -> dict:
        """SCRUM-215: Validate Excel, phân loại Create/Update và kiểm tra dòng lỗi"""
        df = pd.read_excel(BytesIO(file_bytes))
        
        valid_data = []
        errors = []
        to_create_count = 0
        to_update_count = 0

        # Lấy danh sách SKU hiện có trong DB để phân loại
        existing_skus = set(res[0] for res in db.query(Product.sku).all())

        for index, row in df.iterrows():
            row_num = index + 2  # Dòng thực tế trong file Excel (trừ header)
            sku = str(row.get("sku", "")).strip()
            name = str(row.get("name", "")).strip()
            price = row.get("price")
            quantity = row.get("quantity")
            category_id = row.get("category_id")

            # Validate dữ liệu cơ bản
            row_errors = []
            if not sku or sku == "nan":
                row_errors.append("Mã SKU không được để trống")
            if not name or name == "nan":
                row_errors.append("Tên sản phẩm không được để trống")
            if pd.isna(price) or price <= 0:
                row_errors.append("Giá bán phải lớn hơn 0")
            if pd.isna(quantity) or quantity < 0:
                row_errors.append("Số lượng phải lớn hơn hoặc bằng 0")

            if row_errors:
                errors.append({"row": row_num, "sku": sku, "errors": row_errors})
            else:
                is_update = sku in existing_skus
                if is_update:
                    to_update_count += 1
                else:
                    to_create_count += 1

                valid_data.append({
                    "sku": sku,
                    "name": name,
                    "category_id": int(category_id),
                    "price": float(price),
                    "quantity": int(quantity),
                    "action": "UPDATE" if is_update else "CREATE"
                })

        return {
            "total_rows": len(df),
            "valid_count": len(valid_data),
            "invalid_rows_count": len(errors),
            "to_create_count": to_create_count,
            "to_update_count": to_update_count,
            "valid_data": valid_data,
            "errors": errors
        }

    @staticmethod
    def execute_import(valid_data: list, db: Session) -> dict:
        """SCRUM-216: Lưu/Cập nhật dữ liệu hợp lệ vào Database, bỏ qua dòng lỗi"""
        created_skus = []
        updated_skus = []

        for item in valid_data:
            product = db.query(Product).filter(Product.sku == item["sku"]).first()
            if product:
                # Cập nhật sản phẩm cũ
                product.name = item["name"]
                product.price = item["price"]
                product.quantity = item["quantity"]
                product.category_id = item["category_id"]
                updated_skus.append(item["sku"])
            else:
                # Tạo mới sản phẩm
                new_product = Product(
                    sku=item["sku"],
                    name=item["name"],
                    price=item["price"],
                    quantity=item["quantity"],
                    category_id=item["category_id"]
                )
                db.add(new_product)
                created_skus.append(item["sku"])

        db.commit()

        return {
            "success_count": len(created_skus) + len(updated_skus),
            "created_skus": created_skus,
            "updated_skus": updated_skus
        }