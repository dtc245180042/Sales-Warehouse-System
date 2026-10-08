import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.database import SessionLocal
from app.models.category import Category
from app.models.product import Product

DEFAULT_CATEGORIES = [
    {"id": 1, "code": "DIEN_TU", "name": "Thiet bi dien tu & Vien thong", "level": 1, "parent_id": None},
    {"id": 2, "code": "GIA_DUNG", "name": "Dien gia dung & Nha bep", "level": 1, "parent_id": None},
    {"id": 3, "code": "DIEN_THOAI_MTB", "name": "Dien thoai & May tinh bang", "level": 2, "parent_id": 1},
    {"id": 4, "code": "LAPTOP_PC", "name": "May tinh & Thiet bi IT", "level": 2, "parent_id": 1},
    {"id": 11, "code": "AUDIO_ACCESSORIES", "name": "Am thanh & Phu kien cong nghe", "level": 2, "parent_id": 1},
    {"id": 12, "code": "NETWORK_SMART", "name": "Thiet bi mang & Nha thong minh", "level": 2, "parent_id": 1},
    {"id": 5, "code": "NHA_BEP", "name": "Thiet bi nau nuong nha bep", "level": 2, "parent_id": 2},
    {"id": 13, "code": "GIA_DUNG_SMART", "name": "Thiet bi gia dung & Doi song", "level": 2, "parent_id": 2},
    {"id": 6, "code": "SMARTPHONE", "name": "Dien thoai thong minh (Smartphones)", "level": 3, "parent_id": 3},
    {"id": 7, "code": "TABLET", "name": "May tinh bang (Tablets)", "level": 3, "parent_id": 3},
    {"id": 14, "code": "SMARTWATCH", "name": "Dong ho & Vong deo tay thong minh", "level": 3, "parent_id": 3},
    {"id": 8, "code": "LAPTOP_GAMING", "name": "Laptop Gaming do hoa", "level": 3, "parent_id": 4},
    {"id": 15, "code": "LAPTOP_ULTRABOOK", "name": "Laptop mong nhe & Ultrabook", "level": 3, "parent_id": 4},
    {"id": 16, "code": "PERIPHERALS", "name": "Ban phim, Chuot & Thiet bi ngoai vi", "level": 3, "parent_id": 4},
    {"id": 17, "code": "MONITORS", "name": "Man hinh & Thiet bi hien thi", "level": 3, "parent_id": 4},
    {"id": 18, "code": "STORAGE", "name": "O cung & Thiet bi luu tru", "level": 3, "parent_id": 4},
    {"id": 19, "code": "HEADPHONES", "name": "Tai nghe & Headphone", "level": 3, "parent_id": 11},
    {"id": 20, "code": "SPEAKERS", "name": "Loa Bluetooth & Soundbar", "level": 3, "parent_id": 11},
    {"id": 21, "code": "CHARGERS", "name": "Cu sac, Cap sac & Tram sac", "level": 3, "parent_id": 11},
    {"id": 22, "code": "ROUTERS_MESH", "name": "Router WiFi & He thong Mesh", "level": 3, "parent_id": 12},
    {"id": 23, "code": "CAMERAS_SECURITY", "name": "Camera AI & Thiet bi an ninh", "level": 3, "parent_id": 12},
    {"id": 9, "code": "NOI_CHIEN", "name": "Noi chien khong dau & Lo nuong", "level": 3, "parent_id": 5},
    {"id": 10, "code": "BEP_TU", "name": "Bep tu & Bep hong ngoai", "level": 3, "parent_id": 5},
    {"id": 24, "code": "ROBOT_VACUUMS", "name": "Robot hut bui & Lau nha thong minh", "level": 3, "parent_id": 13},
    {"id": 25, "code": "AIR_PURIFIERS", "name": "May loc khong khi & Tao am", "level": 3, "parent_id": 13},
    {"id": 26, "code": "SMART_LIGHTING", "name": "Den & Chieu sang thong minh", "level": 3, "parent_id": 13},
]

def seed_categories_and_link():
    db = SessionLocal()
    try:
        # 1. Thêm categories nếu chưa có
        existing_cats = {c.id: c for c in db.query(Category).all()}
        for item in DEFAULT_CATEGORIES:
            cid = item["id"]
            if cid not in existing_cats:
                cat = Category(
                    id=cid,
                    code=item["code"],
                    name=item["name"],
                    level=item["level"],
                    parent_id=item["parent_id"],
                    is_active=True,
                )
                db.add(cat)
            else:
                c = existing_cats[cid]
                c.code = item["code"]
                c.name = item["name"]
                c.level = item["level"]
                c.parent_id = item["parent_id"]
        db.commit()
        print("Da dong bo danh muc categories trong MySQL.")

        # 2. Quy tắc map từ chuỗi text category sang category_id chuẩn
        # Dựa trên dữ liệu thực tế 5.000 sản phẩm:
        mapping = {
            "dien thoai": 6,       # Smartphones (thuộc Nhóm 3: Điện thoại & Máy tính bảng)
            "may tinh bang": 7,     # Tablets (thuộc Nhóm 3: Điện thoại & Máy tính bảng)
            "laptop": 15,          # Laptop Ultrabook (thuộc Nhóm 4: Máy tính & Thiết bị IT)
            "may tinh": 4,         # Máy tính & Thiết bị IT
            "phu kien may tinh": 16, # Bàn phím chuột ngoại vi (thuộc Nhóm 4)
            "man hinh": 17,        # Màn hình (thuộc Nhóm 4)
            "luu tru": 18,         # Ổ cứng lưu trữ (thuộc Nhóm 4)
            "am thanh": 11,        # Âm thanh & Phụ kiện công nghệ
            "mang": 22,            # Router WiFi & Mesh (thuộc Nhóm 12)
            "gia dung": 13,        # Thiết bị gia dụng & Đời sống (thuộc Nhóm 13)
        }

        products = db.query(Product).all()
        updated_count = 0
        for p in products:
            c_text = (p.category or "").lower()
            matched_id = None
            for kw, cid in mapping.items():
                if kw in c_text:
                    matched_id = cid
                    break
            if matched_id:
                p.category_id = matched_id
                updated_count += 1
            else:
                # Mặc định thuộc nhóm 1
                p.category_id = 1
                updated_count += 1

        db.commit()
        print(f"Da gan category_id thanh cong cho {updated_count} san pham trong MySQL.")
    except Exception as e:
        db.rollback()
        print("Loi:", e)
    finally:
        db.close()

if __name__ == '__main__':
    seed_categories_and_link()
