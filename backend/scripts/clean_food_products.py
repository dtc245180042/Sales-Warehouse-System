import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.product import Product
from app.models.category import Category
from sqlalchemy import text

def clean_database():
    db = SessionLocal()
    try:
        print("Đang quét các sản phẩm bánh kẹo, thực phẩm, đồ uống trong cơ sở dữ liệu...")
        
        all_prods = db.query(Product).all()
        food_ids = []
        for p in all_prods:
            name_lower = (p.name or "").lower()
            cat_lower = (p.category or "").lower()
            sku_lower = (p.sku or "").lower()
            
            is_food = any(k in name_lower or k in cat_lower or k in sku_lower for k in [
                "bánh", "kẹo", "nước", "sữa", "coca", "pepsi", "thực phẩm", "đồ ăn", "snack",
                "cà phê", "cafe", "danisa", "monster", "bia", "mì tôm", "oishi", "sting"
            ])
            if is_food:
                food_ids.append(p.id)
                
        print(f"-> Tìm thấy {len(food_ids)} sản phẩm bánh kẹo / thực phẩm cần xóa.")
        
        if food_ids:
            # Tắt tạm thời kiểm tra Foreign Key để xóa an toàn
            try:
                db.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
            except Exception:
                pass
            
            chunk_size = 100
            for i in range(0, len(food_ids), chunk_size):
                chunk = food_ids[i:i+chunk_size]
                placeholders = ",".join([f":id_{j}" for j in range(len(chunk))])
                params = {f"id_{j}": pid for j, pid in enumerate(chunk)}
                
                for tbl in [
                    "supplier_stock_receipt_items",
                    "product_stock_profiles",
                    "price_list_items",
                    "stock_reservations",
                    "warehouse_stocks",
                    "stock_ledger_entries",
                    "stock_receipt_items",
                    "order_items",
                    "inventory_audit_items",
                    "stock_in_receipt_items",
                    "stock_out_receipt_items",
                ]:
                    try:
                        db.execute(text(f"DELETE FROM {tbl} WHERE product_id IN ({placeholders})"), params)
                    except Exception:
                        pass
                
                db.execute(text(f"DELETE FROM products WHERE id IN ({placeholders})"), params)
                db.commit()

            try:
                db.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
            except Exception:
                pass
                
            print(f"-> Đã xóa sạch {len(food_ids)} sản phẩm bánh kẹo / thực phẩm khỏi cơ sở dữ liệu.")
            
        # Dọn dẹp danh mục bánh kẹo
        food_cats = db.query(Category).filter(
            (Category.name.ilike('%bánh%')) |
            (Category.name.ilike('%kẹo%')) |
            (Category.name.ilike('%thực phẩm%')) |
            (Category.name.ilike('%đồ uống%'))
        ).all()
        for fc in food_cats:
            db.delete(fc)
        db.commit()
        
        remaining = db.query(Product).count()
        print(f"-> Tổng số sản phẩm ĐIỆN TỬ hiện tại trong kho: {remaining} sản phẩm.")
        
    except Exception as e:
        db.rollback()
        print(f"[LỖI]: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_database()
