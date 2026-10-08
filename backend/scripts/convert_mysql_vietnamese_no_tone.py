import sys
import os

# Đảm bảo đường dẫn import
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.database import SessionLocal
from app.models.product import Product
from app.models.category import Category

BANG_MA_TIENG_VIET = {
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'đ': 'd',
    'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
    'À': 'A', 'Á': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
    'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ẳ': 'A', 'Ẵ': 'A', 'Ặ': 'A',
    'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ậ': 'A',
    'Đ': 'D',
    'È': 'E', 'É': 'E', 'Ẻ': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ẹ': 'E',
    'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ể': 'E', 'Ễ': 'E', 'Ệ': 'E',
    'Ì': 'I', 'Í': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
    'Ò': 'O', 'Ó': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
    'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
    'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
    'Ù': 'U', 'Ú': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
    'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
    'Ỳ': 'Y', 'Ý': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y'
}

def bo_dau_tieng_viet(text: str) -> str:
    if not text:
        return text
    res = str(text)
    for k, v in BANG_MA_TIENG_VIET.items():
        res = res.replace(k, v)
    return res

def chuyen_doi_du_lieu_mysql():
    db = SessionLocal()
    try:
        # 1. Chuyển đổi bảng categories
        categories = db.query(Category).all()
        cat_count = 0
        for c in categories:
            old_name = c.name
            c.name = bo_dau_tieng_viet(c.name)
            if c.description:
                c.description = bo_dau_tieng_viet(c.description)
            if old_name != c.name:
                cat_count += 1

        # 2. Chuyển đổi bảng products
        products = db.query(Product).all()
        prod_count = 0
        for p in products:
            p.name = bo_dau_tieng_viet(p.name)
            if p.category:
                p.category = bo_dau_tieng_viet(p.category)
            if p.unit:
                p.unit = bo_dau_tieng_viet(p.unit)
            if p.packaging_spec:
                p.packaging_spec = bo_dau_tieng_viet(p.packaging_spec)
            if p.description:
                p.description = bo_dau_tieng_viet(p.description)
            # Đảm bảo status là ACTIVE
            if not p.status or p.status.upper() == 'ACTIVE':
                p.status = 'ACTIVE'
            prod_count += 1

        db.commit()
        print(f"Thanh cong! Da chuyen doi {cat_count} danh muc va {prod_count} san pham trong MySQL sang Tieng Viet khong dau.")
    except Exception as e:
        db.rollback()
        print("Loi khi cap nhat MySQL:", e)
    finally:
        db.close()

if __name__ == '__main__':
    chuyen_doi_du_lieu_mysql()
