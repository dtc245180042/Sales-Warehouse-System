"""Script đồng bộ và khởi tạo cơ sở dữ liệu chuyên biệt về HÀNG ĐIỆN TỬ & CÔNG NGHỆ.
- Xóa bỏ triệt để mọi sản phẩm bánh kẹo, đồ ăn, nước uống thử nghiệm.
- Xây dựng cây nhóm hàng 3 cấp chuẩn điện tử (Điện thoại, Máy tính, Thiết bị âm thanh, Linh kiện ngoại vi).
- Khởi tạo danh mục sản phẩm điện tử cao cấp, đầy đủ SKU, giá vốn, giá bán, tồn kho.
"""
import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal, engine
from app.models.category import Category
from app.models.product import Product, ProductStatus
from app.models.product_stock_profile import ProductStockProfile

def run_seed_electronics():
    db = SessionLocal()
    try:
        print("=" * 70)
        print(" BẮT ĐẦU CHUYỂN ĐỔI TOÀN BỘ CSDL SANG CHUYÊN HÀNG ĐIỆN TỬ")
        print("=" * 70)

        # 1. Xóa sạch mọi sản phẩm phi điện tử còn sót lại
        non_electronics = db.query(Product).filter(
            (Product.sku.in_(['SP-MONSTER-355', 'SP-DANISA-454', 'SP-G7-18G', 'PHILIPS-HD9650', 'BOSCH-PUJ611BB5E'])) |
            (Product.category.ilike('%bánh%')) |
            (Product.category.ilike('%kẹo%')) |
            (Product.category.ilike('%nước giải khát%')) |
            (Product.category.ilike('%cà phê%')) |
            (Product.category.ilike('%nồi chiên%')) |
            (Product.category.ilike('%bếp từ%')) |
            (Product.category.ilike('%nhà bếp%'))
        ).all()
        for p in non_electronics:
            db.query(ProductStockProfile).filter(ProductStockProfile.product_id == p.id).delete()
            db.delete(p)
        db.commit()

        # 2. Xóa các danh mục cũ không liên quan
        old_cats = db.query(Category).all()
        for c in old_cats:
            db.delete(c)
        db.commit()

        # 3. Khởi tạo Cây Nhóm Hàng Điện Tử 3 Cấp
        print("-> Đang khởi tạo cây danh mục ngành hàng điện tử (3 cấp)...")
        # Level 1
        cat_dt = Category(code="DIEN_TU_VT", name="Thiết Bị Điện Tử & Viễn Thông", level=1, parent_id=None)
        cat_it = Category(code="CONG_NGHE_IT", name="Thiết Bị Tin Học & Công Nghệ", level=1, parent_id=None)
        db.add_all([cat_dt, cat_it])
        db.commit()
        db.refresh(cat_dt)
        db.refresh(cat_it)

        # Level 2
        cat_phone_tab = Category(code="DIEN_THOAI_MTB", name="Điện Thoại & Máy Tính Bảng", level=2, parent_id=cat_dt.id)
        cat_audio = Category(code="THIET_BI_AM_THANH", name="Thiết Bị Âm Thanh", level=2, parent_id=cat_dt.id)
        cat_laptop = Category(code="MAY_TINH_LAPTOP", name="Máy Tính & Laptop", level=2, parent_id=cat_it.id)
        cat_periph = Category(code="LINH_KIEN_NGOAI_VI", name="Linh Kiện & Ngoại Vi", level=2, parent_id=cat_it.id)
        db.add_all([cat_phone_tab, cat_audio, cat_laptop, cat_periph])
        db.commit()
        db.refresh(cat_phone_tab)
        db.refresh(cat_audio)
        db.refresh(cat_laptop)
        db.refresh(cat_periph)

        # Level 3
        sub_smartphones = Category(code="SMARTPHONES", name="Điện thoại thông minh (Smartphones)", level=3, parent_id=cat_phone_tab.id)
        sub_tablets = Category(code="TABLETS", name="Máy tính bảng (Tablets)", level=3, parent_id=cat_phone_tab.id)
        sub_headphones = Category(code="HEADPHONES", name="Tai nghe & Headphone", level=3, parent_id=cat_audio.id)
        sub_speakers = Category(code="SPEAKERS", name="Loa Bluetooth & Soundbar", level=3, parent_id=cat_audio.id)
        sub_ultrabooks = Category(code="LAPTOP_ULTRABOOK", name="Laptop mỏng nhẹ & Ultrabook", level=3, parent_id=cat_laptop.id)
        sub_gaming_laptop = Category(code="LAPTOP_GAMING", name="Laptop Gaming đồ họa", level=3, parent_id=cat_laptop.id)
        sub_periph = Category(code="PERIPHERALS", name="Bàn phím, Chuột & Thiết bị ngoại vi", level=3, parent_id=cat_periph.id)
        sub_monitors = Category(code="MONITORS", name="Màn hình & Thiết bị hiển thị", level=3, parent_id=cat_periph.id)

        db.add_all([
            sub_smartphones, sub_tablets, sub_headphones, sub_speakers,
            sub_ultrabooks, sub_gaming_laptop, sub_periph, sub_monitors
        ])
        db.commit()
        for cat in [sub_smartphones, sub_tablets, sub_headphones, sub_speakers, sub_ultrabooks, sub_gaming_laptop, sub_periph, sub_monitors]:
            db.refresh(cat)

        # 4. Danh sách Sản phẩm Điện tử Chuẩn
        electronic_products = [
            # Điện thoại & Máy tính bảng
            {
                "sku": "IP15P-128-TI",
                "name": "iPhone 15 Pro 128GB Titan Tự Nhiên",
                "category": "Điện Thoại & Phụ Kiện",
                "category_id": sub_smartphones.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 24500000.0,
                "price": 26990000.0,
                "description": "Chip A17 Pro mạnh mẽ, khung viền Titan chuẩn hàng không vũ trụ.",
                "image_url": "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": True,
            },
            {
                "sku": "IP15-128-BK",
                "name": "iPhone 15 128GB Đen",
                "category": "Điện Thoại & Phụ Kiện",
                "category_id": sub_smartphones.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 18200000.0,
                "price": 19990000.0,
                "description": "Màn hình Dynamic Island, camera chính 48MP sắc nét vượt trội.",
                "image_url": "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": True,
            },
            {
                "sku": "SS-S24U-256",
                "name": "Samsung Galaxy S24 Ultra 256GB Titanium Gray",
                "category": "Điện Thoại & Phụ Kiện",
                "category_id": sub_smartphones.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 24500000.0,
                "price": 29990000.0,
                "description": "Tích hợp Galaxy AI thông minh, bút S-Pen quyền năng, camera 200MP.",
                "image_url": "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },
            {
                "sku": "IPAD-AIR-M2",
                "name": "iPad Air 11 inch M2 128GB WiFi Space Gray",
                "category": "Điện Thoại & Phụ Kiện",
                "category_id": sub_tablets.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 14500000.0,
                "price": 16990000.0,
                "description": "Sức mạnh vi xử lý Apple M2 đỉnh cao, màn hình Liquid Retina tuyệt đẹp.",
                "image_url": "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },

            # Laptop & Máy tính
            {
                "sku": "MBA-M2-13-SL",
                "name": "MacBook Air 13 inch M2 8GB 256GB Silver",
                "category": "Laptop & Máy Tính",
                "category_id": sub_ultrabooks.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 22500000.0,
                "price": 24890000.0,
                "description": "Thiết kế siêu mỏng nhẹ 1.24kg, thời lượng pin lên đến 18 tiếng liên tục.",
                "image_url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": True,
            },
            {
                "sku": "MBP-14-M3",
                "name": "MacBook Pro 14 inch M3 8GB 512GB Space Gray",
                "category": "Laptop & Máy Tính",
                "category_id": sub_ultrabooks.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 35000000.0,
                "price": 39990000.0,
                "description": "Màn hình Liquid Retina XDR 120Hz, chip M3 đồ họa đỉnh cao cho chuyên gia.",
                "image_url": "https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },
            {
                "sku": "ASUS-ROG-G16",
                "name": "Laptop ASUS ROG Strix G16 Core i7 RTX 4060",
                "category": "Laptop & Máy Tính",
                "category_id": sub_gaming_laptop.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/thùng",
                "cost_price": 32000000.0,
                "price": 38500000.0,
                "description": "Card đồ họa RTX 4060 8GB GDDR6, màn hình 240Hz 2.5K chuyên trị game AAA.",
                "image_url": "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },
            {
                "sku": "DELL-XPS-13",
                "name": "Dell XPS 13 Plus 9320 Core i7 16GB 512GB",
                "category": "Laptop & Máy Tính",
                "category_id": sub_ultrabooks.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 31000000.0,
                "price": 36900000.0,
                "description": "Màn hình OLED cảm ứng viền siêu mỏng, phím cảm ứng ẩn tinh tế.",
                "image_url": "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },

            # Thiết bị Âm thanh
            {
                "sku": "SN-WH1000XM5-BK",
                "name": "Tai nghe Sony WH-1000XM5 Black",
                "category": "Thiết Bị Âm Thanh",
                "category_id": sub_headphones.id,
                "unit": "Chiếc",
                "packaging_spec": "1 chiếc/hộp",
                "cost_price": 6200000.0,
                "price": 7990000.0,
                "description": "Công nghệ chống ồn chủ động hàng đầu thế giới, âm thanh Hi-Res LDAC.",
                "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": True,
            },
            {
                "sku": "APP-PRO-2",
                "name": "Tai nghe Apple AirPods Pro 2 Type-C",
                "category": "Thiết Bị Âm Thanh",
                "category_id": sub_headphones.id,
                "unit": "Chiếc",
                "packaging_spec": "1 chiếc/hộp",
                "cost_price": 4500000.0,
                "price": 5790000.0,
                "description": "Chống ồn gấp 2 lần thế hệ trước, âm thanh không gian cá nhân hóa Spatial Audio.",
                "image_url": "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },
            {
                "sku": "MARSHALL-ACTON3",
                "name": "Loa Bluetooth Marshall Acton III Black",
                "category": "Thiết Bị Âm Thanh",
                "category_id": sub_speakers.id,
                "unit": "Chiếc",
                "packaging_spec": "1 loa/thùng",
                "cost_price": 5200000.0,
                "price": 6490000.0,
                "description": "Âm trầm mạnh mẽ, thiết kế retro cổ điển đặc trưng đậm chất thương hiệu Marshall.",
                "image_url": "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },

            # Linh kiện & Ngoại vi
            {
                "sku": "LOGI-MX-M3S",
                "name": "Chuột không dây Logitech MX Master 3S",
                "category": "Linh Kiện & Ngoại Vi",
                "category_id": sub_periph.id,
                "unit": "Chiếc",
                "packaging_spec": "1 chuột/hộp",
                "cost_price": 1850000.0,
                "price": 2490000.0,
                "description": "Cảm biến quang học 8.000 DPI trên mọi bề mặt, con lăn điện từ MagSpeed.",
                "image_url": "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },
            {
                "sku": "KEY-Q1-PRO",
                "name": "Bàn phím cơ không dây Keychron Q1 Pro RGB",
                "category": "Linh Kiện & Ngoại Vi",
                "category_id": sub_periph.id,
                "unit": "Bộ",
                "packaging_spec": "1 bộ/hộp",
                "cost_price": 3800000.0,
                "price": 4690000.0,
                "description": "Khung nhôm CNC nguyên khối, núm xoay đa năng, kết nối Bluetooth 5.1 & Type-C.",
                "image_url": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },
            {
                "sku": "DELL-U2723QE",
                "name": "Màn hình Dell UltraSharp 27 4K IPS Black",
                "category": "Linh Kiện & Ngoại Vi",
                "category_id": sub_monitors.id,
                "unit": "Chiếc",
                "packaging_spec": "1 màn hình/thùng",
                "cost_price": 10500000.0,
                "price": 12890000.0,
                "description": "Độ phân giải 4K UHD, công nghệ tấm nền IPS Black tỷ lệ tương phản 2000:1.",
                "image_url": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=300",
                "status": ProductStatus.ACTIVE,
                "is_active": True,
                "has_transactions": False,
            },
        ]

        # 5. Lưu vào database
        print("-> Đang cập nhật sản phẩm điện tử vào CSDL...")
        for p_data in electronic_products:
            existing = db.query(Product).filter(Product.sku == p_data["sku"]).first()
            if existing:
                for key, val in p_data.items():
                    setattr(existing, key, val)
                prod_obj = existing
            else:
                prod_obj = Product(**p_data)
                db.add(prod_obj)
            db.flush()

            # Đồng bộ tồn kho mẫu
            sp = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == prod_obj.id).first()
            if not sp:
                sp = ProductStockProfile(
                    product_id=prod_obj.id,
                    sku=prod_obj.sku,
                    stock=100,
                    min_stock=10,
                    warehouse="Kho Tổng Hà Nội"
                )
                db.add(sp)
            else:
                sp.sku = prod_obj.sku
                sp.stock = 100
                sp.min_stock = 10

        db.commit()

        print("\n [HOÀN TẤT CHUYỂN ĐỔI]:")
        print(f"   - Tổng ngành hàng / nhóm hàng điện tử: {db.query(Category).count()}")
        print(f"   - Tổng mặt hàng điện tử sẵn sàng kinh doanh: {db.query(Product).count()}")
        for p in db.query(Product).all():
            print(f"     + [{p.sku:<16}] {p.name:<45} | Nhóm: {p.category:<22} | Giá: {int(p.price):,} đ")
        print("=" * 70)

    except Exception as e:
        db.rollback()
        print(f"❌ Lỗi: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_seed_electronics()
