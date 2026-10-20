"""Script khởi tạo 100% dữ liệu HÀNG ĐIỆN TỬ & CÔNG NGHỆ CAO CẤP.
Xóa bỏ triệt để mọi mặt hàng thực phẩm, bánh kẹo, đồ uống.
Tạo dữ liệu phong phú, liên kết chuẩn xác cho TẤT CẢ các trang (Sprint 1 - 8):
- Sản phẩm công nghệ, danh mục 3 cấp, đơn vị tính
- Tồn kho 2 kho, lô hàng FEFO / bảo hành
- Khách hàng đại lý công nghệ B2B, hạn mức công nợ
- Đơn hàng đa trạng thái, bán lẻ POS
- Phiếu soạn hàng (Picking), xuất kho điều phối (Dispatch), biên bản giao hàng POD
- Hóa đơn VAT, phiếu thu tiền, sổ nợ, báo cáo tuổi nợ
- Phiếu trả hàng, chứng từ giảm nợ, chỉ tiêu doanh số
"""
import sys
import os
from datetime import datetime, date, timedelta, timezone
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.core.database import SessionLocal, engine
from app.core.security import bam_mat_khau
from app.models.auth import User, UserRole
from app.models.category import Category
from app.models.product import Product, ProductStatus
from app.models.product_stock_profile import ProductStockProfile
from app.models.product_lot import ProductLot
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.customer_warehouse_profile import CustomerWarehouseProfile
from app.models.order import Order, OrderItem, OrderStatus
from app.models.picking_list import (
    PickingLocation,
    PickingList,
    PickingListOrder,
    PickingListItem,
)
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, DispatchStatus
from app.models.dispatch_delivery import DispatchDelivery, DeliveryStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.payment import PaymentReceipt
from app.models.credit_note import CreditNote
from app.models.sales_return import SalesReturn, SalesReturnItem
from app.models.device_lockout import DeviceLockout
from app.models.sales_target import SalesTarget

def seed_pure_electronics():
    db = SessionLocal()
    print("=" * 80)
    print(">>> BẮT ĐẦU DỌN DẸP & KHỞI TẠO 100% HÀNG ĐIỆN TỬ - CÔNG NGHỆ CHO TẤT CẢ CÁC TRANG")
    print("=" * 80)

    try:
        # 0. TẮT TẠM FOREIGN KEY CHECKS TRÊN CSDL ĐỂ DỌN DẸP SẠCH DỮ LIỆU CŨ
        try:
            db.execute(text("PRAGMA foreign_keys = OFF;"))
        except Exception:
            try:
                db.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
            except Exception:
                pass

        # Xóa các bảng giao dịch cũ phát sinh từ thực phẩm
        tables_to_clean = [
            "sales_return_items", "sales_returns",
            "credit_notes",
            "payment_receipts",
            "invoice_items", "invoices",
            "dispatch_deliveries", "stock_dispatch_items", "stock_dispatches",
            "picking_list_items", "picking_list_orders", "picking_lists",
            "order_items", "orders",
            "stock_ledger_entries", "product_lots", "warehouse_stocks",
            "product_stock_profiles", "products", "categories",
            "customer_warehouse_profiles", "customer_credit_profiles", "customers",
            "sales_targets", "device_lockouts"
        ]
        for tbl in tables_to_clean:
            try:
                db.execute(text(f"DELETE FROM {tbl};"))
            except Exception as e:
                pass
        db.commit()
        print("-> Đã dọn dẹp sạch toàn bộ dữ liệu hàng hóa cũ (bánh kẹo, bia nước ngọt...).")

        # 1. KHỞI TẠO TÀI KHOẢN VỚI MẬT KHẨU 123456
        demo_users = [
            ("admin", "admin@saleswarehouse.com", "Admin@123456", UserRole.ADMIN.value, "Trần Quản Trị Hệ Thống", "0901234567", None),
            ("sales_mgr", "sales_mgr@warehouse.local", "SalesMgr@1234", UserRole.SALES_MANAGER.value, "Nguyễn Văn Giám Đốc Kinh Doanh", "0902345678", None),
            ("sales_rep", "sales_rep@warehouse.local", "SalesRep@1234", UserRole.SALES_REP.value, "Lê Thị Nhân Viên Kinh Doanh", "0903456789", None),
            ("wh_mgr", "wh_mgr@warehouse.local", "WhMgr@1234", UserRole.WH_MANAGER.value, "Phạm Văn Trưởng Kho", "0904567890", "Kho Tổng Hà Nội"),
            ("warehouse", "warehouse@warehouse.local", "Warehouse@1234", UserRole.WAREHOUSE.value, "Hoàng Văn Thủ Kho", "0905678901", "Kho Đà Nẵng"),
            ("accountant", "accountant@warehouse.local", "Accountant@1234", UserRole.ACCOUNTANT.value, "Đỗ Thị Kế Toán Trưởng", "0906789012", None),
            ("customer", "customer@warehouse.local", "Customer@1234", UserRole.CUSTOMER.value, "Công ty TNHH Đại Lý Tuấn Phương", "0907890123", None),
        ]
        for u_name, email, pwd_raw, role_val, f_name, phone, wh in demo_users:
            u = db.query(User).filter((User.username == u_name) | (User.email == email)).first()
            if not u:
                u = User(
                    username=u_name,
                    email=email,
                    full_name=f_name,
                    phone_number=phone,
                    assigned_warehouse=wh,
                    hashed_password=bam_mat_khau("123456"),
                    role=role_val,
                    is_active=True,
                    token_version=1
                )
                db.add(u)
            else:
                u.hashed_password = bam_mat_khau("123456")
                u.is_active = True
                u.failed_login_attempts = 0
                u.locked_until = None
        db.commit()
        print("-> Đã đồng bộ 7 tài khoản demo chuẩn với mật khẩu chung 123456.")

        # 2. KHỞI TẠO CÂY DANH MỤC NGÀNH HÀNG ĐIỆN TỬ & CÔNG NGHỆ (3 CẤP)
        # Cấp 1
        cat_dt = Category(code="CAT-DIEN-TU", name="Thiết Bị Điện Tử & Viễn Thông", description="Điện thoại, máy tính bảng, thiết bị viễn thông", level=1, is_active=True)
        cat_it = Category(code="CAT-TIN-HOC", name="Thiết Bị Tin Học & Công Nghệ", description="Laptop, máy tính để bàn, linh kiện và thiết bị ngoại vi", level=1, is_active=True)
        cat_audio = Category(code="CAT-AM-THANH", name="Thiết Bị Âm Thanh & Phụ Kiện", description="Tai nghe cao cấp, loa bluetooth, soundbar và phụ kiện", level=1, is_active=True)
        db.add_all([cat_dt, cat_it, cat_audio])
        db.commit()
        db.refresh(cat_dt); db.refresh(cat_it); db.refresh(cat_audio)

        # Cấp 2
        sub_phone = Category(code="SUB-PHONE", name="Điện thoại thông minh", level=2, parent_id=cat_dt.id, is_active=True)
        sub_tablet = Category(code="SUB-TABLET", name="Máy tính bảng (Tablets)", level=2, parent_id=cat_dt.id, is_active=True)
        sub_laptop = Category(code="SUB-LAPTOP", name="Laptop & Máy tính xách tay", level=2, parent_id=cat_it.id, is_active=True)
        sub_periph = Category(code="SUB-PERIPH", name="Bàn phím, Chuột & Thiết bị ngoại vi", level=2, parent_id=cat_it.id, is_active=True)
        sub_monitor = Category(code="SUB-MONITOR", name="Màn hình hiển thị đồ họa", level=2, parent_id=cat_it.id, is_active=True)
        sub_headphone = Category(code="SUB-HEADPHONE", name="Tai nghe chống ồn & True Wireless", level=2, parent_id=cat_audio.id, is_active=True)
        sub_speaker = Category(code="SUB-SPEAKER", name="Loa Bluetooth & Loa di động", level=2, parent_id=cat_audio.id, is_active=True)
        db.add_all([sub_phone, sub_tablet, sub_laptop, sub_periph, sub_monitor, sub_headphone, sub_speaker])
        db.commit()
        for s in [sub_phone, sub_tablet, sub_laptop, sub_periph, sub_monitor, sub_headphone, sub_speaker]:
            db.refresh(s)

        # 3. DANH SÁCH 18 SẢN PHẨM ĐIỆN TỬ CAO CẤP CHUẨN
        raw_tech_products = [
            # Điện thoại & Máy tính bảng
            {
                "sku": "IP15PM-256-TI",
                "name": "iPhone 15 Pro Max 256GB Titan Tự Nhiên",
                "category": "Điện thoại thông minh",
                "category_id": sub_phone.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 27500000.0,
                "price": 29990000.0,
                "sale_price": 29990000.0,
                "stock": 85,
                "min_stock": 15,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 180,
                "image_url": "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400",
                "description": "Chip Apple A17 Pro 3nm, khung viền Titan siêu bền, ống kính tiềm vọng Zoom 5x quang học."
            },
            {
                "sku": "SS-S24U-256-GR",
                "name": "Samsung Galaxy S24 Ultra 256GB Xám Titan",
                "category": "Điện thoại thông minh",
                "category_id": sub_phone.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 25000000.0,
                "price": 27990000.0,
                "sale_price": 27990000.0,
                "stock": 70,
                "min_stock": 10,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 180,
                "image_url": "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=400",
                "description": "Bộ xử lý Snapdragon 8 Gen 3 for Galaxy, tích hợp trí tuệ nhân tạo Galaxy AI, bút S-Pen."
            },
            {
                "sku": "IPAD-AIR-M2-128",
                "name": "iPad Air 11 inch M2 128GB WiFi Space Gray",
                "category": "Máy tính bảng (Tablets)",
                "category_id": sub_tablet.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 14500000.0,
                "price": 16490000.0,
                "sale_price": 16490000.0,
                "stock": 60,
                "min_stock": 10,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 180,
                "image_url": "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400",
                "description": "Vi xử lý Apple M2 thế hệ mới, màn hình Liquid Retina hỗ trợ Apple Pencil Pro."
            },
            {
                "sku": "IP15-128-BK",
                "name": "iPhone 15 128GB Midnight Black",
                "category": "Điện thoại thông minh",
                "category_id": sub_phone.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/hộp",
                "cost_price": 17800000.0,
                "price": 19690000.0,
                "sale_price": 19690000.0,
                "stock": 90,
                "min_stock": 15,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 180,
                "image_url": "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=400",
                "description": "Màn hình Dynamic Island đột phá, camera chính 48MP sắc nét, cổng USB-C tiện dụng."
            },

            # Laptop & Máy tính xách tay
            {
                "sku": "MBP-14-M3-512",
                "name": "MacBook Pro 14 inch M3 8GB 512GB Space Gray",
                "category": "Laptop & Máy tính xách tay",
                "category_id": sub_laptop.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/thùng",
                "cost_price": 36500000.0,
                "price": 39990000.0,
                "sale_price": 39990000.0,
                "stock": 45,
                "min_stock": 8,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400",
                "description": "Màn hình Liquid Retina XDR 120Hz ProMotion đỉnh cao, thời lượng pin lên đến 22 giờ liên tục."
            },
            {
                "sku": "MBA-13-M2-256",
                "name": "MacBook Air 13 inch M2 8GB 256GB Silver",
                "category": "Laptop & Máy tính xách tay",
                "category_id": sub_laptop.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/thùng",
                "cost_price": 22500000.0,
                "price": 24890000.0,
                "sale_price": 24890000.0,
                "stock": 55,
                "min_stock": 10,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=400",
                "description": "Thiết kế siêu mỏng nhẹ chỉ 1.24kg, vỏ nhôm nguyên khối tái chế thân thiện môi trường."
            },
            {
                "sku": "DELL-XPS-9320",
                "name": "Dell XPS 13 Plus 9320 Core i7-1360P 16GB 512GB",
                "category": "Laptop & Máy tính xách tay",
                "category_id": sub_laptop.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/thùng",
                "cost_price": 31000000.0,
                "price": 34990000.0,
                "sale_price": 34990000.0,
                "stock": 35,
                "min_stock": 5,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=400",
                "description": "Màn hình OLED 3.5K cảm ứng tràn viền vô cực, touchpad kính tàng hình hiện đại."
            },
            {
                "sku": "ASUS-ROG-G16",
                "name": "ASUS ROG Zephyrus G16 Core Ultra 9 RTX 4070",
                "category": "Laptop & Máy tính xách tay",
                "category_id": sub_laptop.id,
                "unit": "Chiếc",
                "packaging_spec": "1 máy/thùng",
                "cost_price": 48000000.0,
                "price": 53990000.0,
                "sale_price": 53990000.0,
                "stock": 25,
                "min_stock": 5,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=400",
                "description": "Màn hình ROG Nebula OLED 240Hz, card đồ họa rời NVIDIA RTX 4070 8GB GDDR6."
            },

            # Thiết bị Âm thanh & Tai nghe
            {
                "sku": "SN-WH1000XM5-BK",
                "name": "Tai nghe không dây Sony WH-1000XM5 Black",
                "category": "Tai nghe chống ồn & True Wireless",
                "category_id": sub_headphone.id,
                "unit": "Chiếc",
                "packaging_spec": "1 chiếc/hộp",
                "cost_price": 6400000.0,
                "price": 7690000.0,
                "sale_price": 7690000.0,
                "stock": 110,
                "min_stock": 20,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
                "description": "Khử tiếng ồn đỉnh cao Auto NC Optimizer với 8 micro, màng loa carbon 30mm Hi-Res Audio."
            },
            {
                "sku": "APP-PRO-2-USBC",
                "name": "Tai nghe Apple AirPods Pro 2 MagSafe USB-C",
                "category": "Tai nghe chống ồn & True Wireless",
                "category_id": sub_headphone.id,
                "unit": "Chiếc",
                "packaging_spec": "1 chiếc/hộp",
                "cost_price": 4700000.0,
                "price": 5690000.0,
                "sale_price": 5690000.0,
                "stock": 130,
                "min_stock": 25,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400",
                "description": "Chip H2 thông minh, chế độ Xuyên Âm Thích Ứng, chống bụi và nước chuẩn IP54."
            },
            {
                "sku": "MARSHALL-ACTON3-BK",
                "name": "Loa Bluetooth Marshall Acton III Black",
                "category": "Loa Bluetooth & Loa di động",
                "category_id": sub_speaker.id,
                "unit": "Chiếc",
                "packaging_spec": "1 loa/thùng",
                "cost_price": 5400000.0,
                "price": 6490000.0,
                "sale_price": 6490000.0,
                "stock": 65,
                "min_stock": 10,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=400",
                "description": "Thiết kế Vintage phong cách rock huyền thoại, trường âm rộng hơn với loa tweeter hướng ngoài."
            },
            {
                "sku": "JBL-CHARGE-5-BL",
                "name": "Loa di động chống nước JBL Charge 5 Blue",
                "category": "Loa Bluetooth & Loa di động",
                "category_id": sub_speaker.id,
                "unit": "Chiếc",
                "packaging_spec": "1 loa/hộp",
                "cost_price": 3100000.0,
                "price": 3790000.0,
                "sale_price": 3790000.0,
                "stock": 80,
                "min_stock": 15,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1589003077984-894e133dabab?w=400",
                "description": "Âm thanh JBL Original Pro Sound sống động, chuẩn chống nước chống bụi IP67, pin 20 giờ."
            },

            # Linh kiện & Thiết bị ngoại vi
            {
                "sku": "LOGI-MX-M3S-GR",
                "name": "Chuột không dây Logitech MX Master 3S Graphite",
                "category": "Bàn phím, Chuột & Thiết bị ngoại vi",
                "category_id": sub_periph.id,
                "unit": "Chiếc",
                "packaging_spec": "1 chuột/hộp",
                "cost_price": 1950000.0,
                "price": 2490000.0,
                "sale_price": 2490000.0,
                "stock": 150,
                "min_stock": 30,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=400",
                "description": "Cảm biến Darkfield 8000 DPI lướt mượt trên mọi bề mặt kính, con lăn điện từ MagSpeed."
            },
            {
                "sku": "KEY-Q1-PRO-RGB",
                "name": "Bàn phím cơ không dây Keychron Q1 Pro RGB Switch Red",
                "category": "Bàn phím, Chuột & Thiết bị ngoại vi",
                "category_id": sub_periph.id,
                "unit": "Bộ",
                "packaging_spec": "1 bộ/hộp",
                "cost_price": 3900000.0,
                "price": 4790000.0,
                "sale_price": 4790000.0,
                "stock": 75,
                "min_stock": 15,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400",
                "description": "Khung nhôm CNC nguyên khối, gasket mount kép cách âm êm ái, hỗ trợ QMK/VIA keymap tùy biến."
            },
            {
                "sku": "DELL-U2723QE-4K",
                "name": "Màn hình đồ họa Dell UltraSharp 27 4K IPS Black",
                "category": "Màn hình hiển thị đồ họa",
                "category_id": sub_monitor.id,
                "unit": "Chiếc",
                "packaging_spec": "1 màn hình/thùng",
                "cost_price": 10800000.0,
                "price": 12990000.0,
                "sale_price": 12990000.0,
                "stock": 50,
                "min_stock": 10,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400",
                "description": "Độ phân giải 4K UHD 3840x2160, độ phủ màu 98% DCI-P3, tích hợp cổng sạc USB-C PD 90W."
            },
            {
                "sku": "SAM-990PRO-2TB",
                "name": "Ổ cứng SSD Samsung 990 Pro 2TB PCIe NVMe 4.0",
                "category": "Bàn phím, Chuột & Thiết bị ngoại vi",
                "category_id": sub_periph.id,
                "unit": "Chiếc",
                "packaging_spec": "1 ổ/hộp",
                "cost_price": 3800000.0,
                "price": 4590000.0,
                "sale_price": 4590000.0,
                "stock": 95,
                "min_stock": 20,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=400",
                "description": "Tốc độ đọc tuần tự lên đến 7450 MB/s, công nghệ tản nhiệt niken kiểm soát nhiệt tối ưu."
            },
            {
                "sku": "ANKER-GAN-65W",
                "name": "Củ sạc nhanh Anker 735 GaNPrime 65W 3 Cổng",
                "category": "Bàn phím, Chuột & Thiết bị ngoại vi",
                "category_id": sub_periph.id,
                "unit": "Chiếc",
                "packaging_spec": "1 củ/hộp",
                "cost_price": 850000.0,
                "price": 1190000.0,
                "sale_price": 1190000.0,
                "stock": 200,
                "min_stock": 30,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=400",
                "description": "Công nghệ sạc nhanh GaNPrime tiên tiến, công suất 65W sạc đồng thời Laptop và Smartphone."
            },
            {
                "sku": "APPLE-WATCH-S9",
                "name": "Đồng hồ Apple Watch Series 9 45mm Nhôm GPS",
                "category": "Điện thoại thông minh",
                "category_id": sub_phone.id,
                "unit": "Chiếc",
                "packaging_spec": "1 đồng hồ/hộp",
                "cost_price": 9200000.0,
                "price": 10490000.0,
                "sale_price": 10490000.0,
                "stock": 60,
                "min_stock": 10,
                "manage_by_lot": True,
                "near_expiry_threshold_days": 365,
                "image_url": "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=400",
                "description": "Chip Apple S9 SiP mạnh mẽ, thao tác chạm hai lần Double Tap kỳ diệu, đo nồng độ oxy SpO2."
            }
        ]

        product_objects = {}
        for p in raw_tech_products:
            prod_obj = Product(
                sku=p["sku"],
                name=p["name"],
                category=p["category"],
                category_id=p["category_id"],
                unit=p["unit"],
                packaging_spec=p["packaging_spec"],
                cost_price=p["cost_price"],
                price=p["price"],
                sale_price=p["sale_price"],
                stock=p["stock"],
                min_stock=p["min_stock"],
                manage_by_lot=p["manage_by_lot"],
                near_expiry_threshold_days=p["near_expiry_threshold_days"],
                image_url=p["image_url"],
                description=p["description"],
                status=ProductStatus.ACTIVE,
                is_active=True,
                has_transactions=True
            )
            db.add(prod_obj)
            db.flush()
            product_objects[p["sku"]] = prod_obj

            # Tồn kho theo từng kho: Hà Nội (55%), Đà Nẵng (45%)
            st_hn = int(p["stock"] * 0.55)
            st_dn = p["stock"] - st_hn

            db.add(WarehouseStock(
                product_id=prod_obj.id,
                sku=prod_obj.sku,
                warehouse_id=1,
                warehouse="Kho Tổng Hà Nội",
                stock=st_hn,
                physical_stock=st_hn,
                min_stock=p["min_stock"]
            ))
            db.add(WarehouseStock(
                product_id=prod_obj.id,
                sku=prod_obj.sku,
                warehouse_id=2,
                warehouse="Kho Đà Nẵng",
                stock=st_dn,
                physical_stock=st_dn,
                min_stock=p["min_stock"]
            ))
            db.add(ProductStockProfile(
                product_id=prod_obj.id,
                sku=prod_obj.sku,
                stock=p["stock"],
                min_stock=p["min_stock"],
                warehouse="Kho Tổng Hà Nội"
            ))

        db.commit()
        print(f"-> Đã tạo {len(product_objects)} sản phẩm điện tử cao cấp và phân bổ tồn kho đa kho.")

        # 4. TẠO CÁC LÔ HÀNG ĐIỆN TỬ FEFO / HẠN BẢO HÀNH
        today = date.today()
        lot_records = []
        for sku, prod in product_objects.items():
            # Lô 1: Lô nhập sớm, hạn đến giữa năm 2027
            lot1 = ProductLot(
                product_id=prod.id,
                lot_number=f"LOT-2026-{prod.sku[:6]}-01",
                warehouse_id=2,
                warehouse_name="Kho Đà Nẵng",
                mfg_date=today - timedelta(days=90),
                exp_date=today + timedelta(days=275), # ~9 tháng
                initial_quantity=int(prod.stock * 0.3),
                remaining_quantity=int(prod.stock * 0.25),
                unit_price=prod.cost_price,
                status="ACTIVE"
            )
            # Lô 2: Lô nhập mới, bảo hành 2 năm
            lot2 = ProductLot(
                product_id=prod.id,
                lot_number=f"LOT-2026-{prod.sku[:6]}-02",
                warehouse_id=1,
                warehouse_name="Kho Tổng Hà Nội",
                mfg_date=today - timedelta(days=15),
                exp_date=today + timedelta(days=730), # 2 năm
                initial_quantity=int(prod.stock * 0.4),
                remaining_quantity=int(prod.stock * 0.4),
                unit_price=prod.cost_price,
                status="ACTIVE"
            )
            db.add_all([lot1, lot2])
            lot_records.append(lot1)
        db.commit()
        print(f"-> Đã tạo {len(product_objects) * 2} lô hàng thiết bị điện tử có theo dõi hạn bảo hành FEFO.")

        # 5. KHỞI TẠO CÁC ĐẠI LÝ PHÂN PHỐI CÔNG NGHỆ B2B
        real_dealers = [
            {
                "code": "DL-PHONGVU",
                "name": "Công ty CP Thương Mại Dịch Vụ Phong Vũ",
                "phone": "02873006666",
                "email": "kinhdoanh@phongvu.vn",
                "address": "Tầng 5, Tòa nhà số 215 Nam Kỳ Khởi Nghĩa, Quận 3, TP. Hồ Chí Minh",
                "customer_group": "WHOLESALE",
                "tax_code": "0304998877",
                "region": "Miền Nam",
                "warehouse_name": "Kho Đà Nẵng",
                "warehouse_code": "WH-DANANG",
                "sales_rep": "Nguyễn Văn Giám Đốc Kinh Doanh",
                "credit_limit": 500_000_000,
                "current_debt": 145_000_000,
                "max_debt_days": 45,
            },
            {
                "code": "DL-CELLPHONES",
                "name": "Hệ thống Bán lẻ Công nghệ CellphoneS",
                "phone": "02473089999",
                "email": "b2b@cellphones.com.vn",
                "address": "Số 365 Phố Cầu Giấy, Phường Dịch Vọng, Quận Cầu Giấy, Hà Nội",
                "customer_group": "TIER_1",
                "tax_code": "0105882233",
                "region": "Miền Bắc",
                "warehouse_name": "Kho Tổng Hà Nội",
                "warehouse_code": "WH-HANOI",
                "sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
                "credit_limit": 400_000_000,
                "current_debt": 89_500_000,
                "max_debt_days": 30,
            },
            {
                "code": "DL-HOANGHA",
                "name": "Công ty TNHH Thương Mại Hoàng Hà Mobile",
                "phone": "02473045566",
                "email": "contact@hoanghamobile.com",
                "address": "Số 89 Đường Tam Trinh, Phường Mai Động, Quận Hoàng Mai, Hà Nội",
                "customer_group": "TIER_1",
                "tax_code": "0103774411",
                "region": "Miền Bắc",
                "warehouse_name": "Kho Tổng Hà Nội",
                "warehouse_code": "WH-HANOI",
                "sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
                "credit_limit": 350_000_000,
                "current_debt": 65_000_000,
                "max_debt_days": 30,
            },
            {
                "code": "DL-PHUCANH",
                "name": "Công ty TNHH Kỹ Nghệ Phúc Anh Smart World",
                "phone": "02438576999",
                "email": "daily@phucanh.com.vn",
                "address": "Số 15 Xã Đàn, Quận Đống Đa, Hà Nội",
                "customer_group": "TIER_2",
                "tax_code": "0101995588",
                "region": "Miền Bắc",
                "warehouse_name": "Kho Tổng Hà Nội",
                "warehouse_code": "WH-HANOI",
                "sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
                "credit_limit": 250_000_000,
                "current_debt": 115_000_000,
                "max_debt_days": 45,
            },
            {
                "code": "DL-TUANPHUONG",
                "name": "Công ty TNHH Đại Lý Tuấn Phương (B2B Partner)",
                "phone": "0907890123",
                "email": "customer@warehouse.local",
                "address": "Số 250 Đường Nguyễn Tri Phương, Phường Hòa Thuận Tây, Quận Hải Châu, Đà Nẵng",
                "customer_group": "TIER_1",
                "tax_code": "0401889922",
                "region": "Miền Trung",
                "warehouse_name": "Kho Đà Nẵng",
                "warehouse_code": "WH-DANANG",
                "sales_rep": "Nguyễn Văn Giám Đốc Kinh Doanh",
                "credit_limit": 300_000_000,
                "current_debt": 52_000_000,
                "max_debt_days": 45,
            },
            {
                "code": "DL-ANPHAT",
                "name": "Công ty Cổ phần Tin học An Phát Computer",
                "phone": "02435637003",
                "email": "kinhdoanh@anphatpc.com.vn",
                "address": "Số 49 Thái Hà, Phường Trung Liệt, Quận Đống Đa, Hà Nội",
                "customer_group": "WHOLESALE",
                "tax_code": "0102663399",
                "region": "Miền Bắc",
                "warehouse_name": "Kho Tổng Hà Nội",
                "warehouse_code": "WH-HANOI",
                "sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
                "credit_limit": 600_000_000,
                "current_debt": 210_000_000,
                "max_debt_days": 60,
            }
        ]

        dealer_objs = {}
        for d in real_dealers:
            cust = Customer(
                code=d["code"],
                name=d["name"],
                phone=d["phone"],
                email=d["email"],
                address=d["address"],
                customer_group=d["customer_group"],
                tax_code=d["tax_code"],
                region=d["region"],
                assigned_sales_rep=d["sales_rep"],
                status="active"
            )
            db.add(cust)
            db.flush()
            dealer_objs[d["code"]] = cust

            db.add(CustomerWarehouseProfile(
                customer_id=str(cust.id),
                warehouse_name=d["warehouse_name"],
                warehouse_code=d["warehouse_code"],
                is_default=True,
                notes=f"Kho trung chuyển phục vụ {d['region']}"
            ))
            db.add(CustomerCreditProfile(
                customer_id=cust.id,
                credit_limit=d["credit_limit"],
                max_debt_days=d["max_debt_days"],
                current_debt=d["current_debt"],
                updated_by="Hệ thống Khởi tạo dữ liệu"
            ))
        db.commit()
        print(f"-> Đã tạo {len(dealer_objs)} đại lý phân phối công nghệ kèm hạn mức tín dụng và kho phục vụ.")

        # 6. KHỞI TẠO CÁC ĐƠN BÁN HÀNG CÔNG NGHỆ ĐA TRẠNG THÁI (SPRINT 4 - 8)
        now_utc = datetime.now(timezone.utc)
        order_scenarios = [
            {
                "order_code": "ORD-2026-0001",
                "dealer": "DL-PHONGVU",
                "status": OrderStatus.COMPLETED.value,
                "items": [
                    ("IP15PM-256-TI", 5, 29990000.0),
                    ("MBP-14-M3-512", 3, 39990000.0),
                    ("SN-WH1000XM5-BK", 10, 7690000.0),
                ],
                "created_at": now_utc - timedelta(days=12),
                "is_pos": False,
            },
            {
                "order_code": "ORD-2026-0002",
                "dealer": "DL-CELLPHONES",
                "status": OrderStatus.COMPLETED.value,
                "items": [
                    ("SS-S24U-256-GR", 8, 27990000.0),
                    ("IPAD-AIR-M2-128", 6, 16490000.0),
                    ("APP-PRO-2-USBC", 15, 5690000.0),
                ],
                "created_at": now_utc - timedelta(days=9),
                "is_pos": False,
            },
            {
                "order_code": "ORD-2026-0003",
                "dealer": "DL-TUANPHUONG",
                "status": OrderStatus.DISPATCHED.value,
                "items": [
                    ("DELL-XPS-9320", 4, 34990000.0),
                    ("DELL-U2723QE-4K", 6, 12990000.0),
                    ("LOGI-MX-M3S-GR", 12, 2490000.0),
                ],
                "created_at": now_utc - timedelta(days=4),
                "is_pos": False,
            },
            {
                "order_code": "ORD-2026-0004",
                "dealer": "DL-HOANGHA",
                "status": OrderStatus.APPROVED.value,
                "items": [
                    ("IP15-128-BK", 10, 19690000.0),
                    ("APPLE-WATCH-S9", 8, 10490000.0),
                    ("ANKER-GAN-65W", 30, 1190000.0),
                ],
                "created_at": now_utc - timedelta(days=2),
                "is_pos": False,
            },
            {
                "order_code": "ORD-2026-0005",
                "dealer": "DL-PHUCANH",
                "status": OrderStatus.PENDING.value,
                "items": [
                    ("ASUS-ROG-G16", 2, 53990000.0),
                    ("KEY-Q1-PRO-RGB", 10, 4790000.0),
                    ("SAM-990PRO-2TB", 15, 4590000.0),
                ],
                "created_at": now_utc - timedelta(hours=8),
                "is_pos": False,
            },
            {
                "order_code": "POS-2026-0001",
                "dealer": "DL-TUANPHUONG",
                "status": OrderStatus.COMPLETED.value,
                "items": [
                    ("LOGI-MX-M3S-GR", 2, 2490000.0),
                    ("APP-PRO-2-USBC", 1, 5690000.0),
                    ("ANKER-GAN-65W", 2, 1190000.0),
                ],
                "created_at": now_utc - timedelta(hours=3),
                "is_pos": True,
            }
        ]

        order_objs = {}
        for sc in order_scenarios:
            cust = dealer_objs[sc["dealer"]]
            total_amt = sum(qty * price for _, qty, price in sc["items"])
            discount_val = int(total_amt * 0.03) # 3% chiết khấu
            net_amt = total_amt - discount_val
            vat_val = int(net_amt * 0.1) # 10% VAT
            final_total = net_amt + vat_val

            ord_entity = Order(
                order_code=sc["order_code"],
                customer_id=cust.id,
                sales_rep_id=2, # sales_rep
                status=sc["status"],
                total_amount=final_total,
                discount_amount=discount_val,
                final_amount=final_total,
                warehouse_id=2 if "WH-DANANG" in cust.address or cust.region == "Miền Trung" else 1,
                created_at=sc["created_at"],
                notes="Đơn hàng thiết bị công nghệ chính hãng xuất kho bảo hành tiêu chuẩn"
            )
            db.add(ord_entity)
            db.flush()
            order_objs[sc["order_code"]] = ord_entity

            for sku_code, q, pr in sc["items"]:
                p_item = product_objects[sku_code]
                line_total = q * pr
                db.add(OrderItem(
                    order_id=ord_entity.id,
                    product_id=p_item.id,
                    product_name=p_item.name,
                    quantity=q,
                    unit_price=pr,
                    subtotal=line_total,
                    final_amount=line_total
                ))
        db.commit()
        print(f"-> Đã tạo {len(order_objs)} đơn hàng bán buôn và bán lẻ POS với sản phẩm điện tử cao cấp.")

        # 7. KHỞI TẠO PHIẾU SOẠN HÀNG (PICKING) & PHIẾU XUẤT KHO ĐIỀU PHỐI (DISPATCH)
        # Picking Locations
        loc_a1 = PickingLocation(location_code="A1-KE-LAPTOP", description="Khu vực kệ chuyên lưu trữ Laptop & Máy tính xách tay")
        loc_b2 = PickingLocation(location_code="B2-KE-PHONE", description="Tủ kính an ninh lưu trữ Điện thoại thông minh & Máy tính bảng")
        loc_c3 = PickingLocation(location_code="C3-KE-PHUKIEN", description="Khu vực kệ phụ kiện, bàn phím, chuột, tai nghe")
        db.add_all([loc_a1, loc_b2, loc_c3])
        db.commit()

        # Tạo Picking List cho ORD-0003
        ord3 = order_objs["ORD-2026-0003"]
        pick_list = PickingList(
            picking_code="PICK-2026-DN01",
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            picker_name="Hoàng Văn Thủ Kho",
            status="COMPLETED",
            created_at=now_utc - timedelta(days=3)
        )
        db.add(pick_list)
        db.flush()
        db.add(PickingListOrder(picking_list_id=pick_list.id, order_id=ord3.id, order_code=ord3.order_code))

        for it in ord3.items:
            db.add(PickingListItem(
                picking_list_id=pick_list.id,
                order_id=ord3.id,
                product_id=it.product_id,
                product_name=it.product_name,
                requested_quantity=it.quantity,
                picked_quantity=it.quantity,
                location_code="B2-KE-PHONE" if "iPhone" in it.product_name else "A1-KE-LAPTOP"
            ))

        # Phiếu xuất kho điều phối (Stock Dispatch)
        dsp = StockDispatch(
            dispatch_code="DSP-2026-DN001",
            order_id=ord3.id,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            customer_name="Công ty TNHH Đại Lý Tuấn Phương (B2B Partner)",
            status=DispatchStatus.DELIVERED.value,
            dispatched_by="Hoàng Văn Thủ Kho",
            license_plate="43C-892.45",
            driver_name="Nguyễn Văn Tài Xế",
            driver_phone="0918776655",
            notes="Giao hàng công nghệ nguyên seal kèm biên bản bàn giao",
            created_at=now_utc - timedelta(days=3)
        )
        db.add(dsp)
        db.flush()

        for it in ord3.items:
            db.add(StockDispatchItem(
                dispatch_id=dsp.id,
                product_id=it.product_id,
                product_name=it.product_name,
                dispatched_quantity=it.quantity,
                lot_number=f"LOT-2026-TECH-01"
            ))

        # Biên bản giao hàng (POD)
        db.add(DispatchDelivery(
            dispatch_id=dsp.id,
            status=DeliveryStatus.DELIVERED.value,
            recipient_name="Trần Văn Nhận Hàng (Đại diện kỹ thuật)",
            recipient_phone="0905556677",
            delivery_proof_url="/delivery_proof_sample.png",
            notes="Đã kiểm đếm đầy đủ 100% nguyên seal, test màn hình hoạt động hoàn hảo.",
            delivered_at=now_utc - timedelta(days=2)
        ))
        db.commit()
        print("-> Đã khởi tạo Phiếu soạn hàng (Picking), Phiếu xuất kho (Dispatch) và Biên bản bàn giao ảnh POD.")

        # 8. KHỞI TẠO HÓA ĐƠN VAT (INVOICE) & PHIẾU THU CÔNG NỢ (PAYMENT) & GIẢM NỢ
        ord1 = order_objs["ORD-2026-0001"]
        inv1 = Invoice(
            invoice_code="INV-2026-0001",
            order_id=ord1.id,
            customer_id=ord1.customer_id,
            customer_name="Công ty CP Thương Mại Dịch Vụ Phong Vũ",
            customer_tax_code="0304998877",
            status=InvoiceStatus.PAID.value,
            subtotal=ord1.total_amount,
            vat_rate=10.0,
            vat_amount=int(ord1.total_amount * 0.1),
            total_amount=int(ord1.total_amount * 1.1),
            paid_amount=int(ord1.total_amount * 1.1),
            remaining_amount=0,
            created_at=now_utc - timedelta(days=10)
        )
        db.add(inv1)
        db.flush()

        # Phiếu thu công nợ
        db.add(PaymentReceipt(
            payment_code="PAY-2026-0001",
            invoice_id=inv1.id,
            customer_id=ord1.customer_id,
            amount=inv1.total_amount,
            payment_method="BANK_TRANSFER",
            reference_number="VCB-FT-9988223311",
            collector_name="Đỗ Thị Kế Toán Trưởng",
            notes="Thanh toán chuyển khoản trọn gói tiền hàng thiết bị điện tử đợt 1",
            created_at=now_utc - timedelta(days=9)
        ))

        # Hóa đơn chưa thanh toán cho ORD-0002
        ord2 = order_objs["ORD-2026-0002"]
        inv2 = Invoice(
            invoice_code="INV-2026-0002",
            order_id=ord2.id,
            customer_id=ord2.customer_id,
            customer_name="Hệ thống Bán lẻ Công nghệ CellphoneS",
            customer_tax_code="0105882233",
            status=InvoiceStatus.PARTIALLY_PAID.value,
            subtotal=ord2.total_amount,
            vat_rate=10.0,
            vat_amount=int(ord2.total_amount * 0.1),
            total_amount=int(ord2.total_amount * 1.1),
            paid_amount=150_000_000,
            remaining_amount=int(ord2.total_amount * 1.1) - 150_000_000,
            created_at=now_utc - timedelta(days=7)
        )
        db.add(inv2)
        db.flush()

        db.add(PaymentReceipt(
            payment_code="PAY-2026-0002",
            invoice_id=inv2.id,
            customer_id=ord2.customer_id,
            amount=150_000_000,
            payment_method="BANK_TRANSFER",
            reference_number="TCB-8833112299",
            collector_name="Đỗ Thị Kế Toán Trưởng",
            notes="Tạm ứng đợt 1 tiền hàng Samsung S24 Ultra & iPad Air",
            created_at=now_utc - timedelta(days=6)
        ))

        # Phiếu trả hàng (Sales Return) & Chứng từ giảm nợ (Credit Note)
        s_ret = SalesReturn(
            return_code="RET-2026-0001",
            order_id=ord1.id,
            customer_id=ord1.customer_id,
            warehouse_id=2,
            status="APPROVED",
            total_refund_amount=7690000.0,
            reason="Lỗi đổi trả 1:1 trong 30 ngày - Tai nghe Sony vỏ hộp bị móp nhẹ khi vận chuyển",
            created_at=now_utc - timedelta(days=5)
        )
        db.add(s_ret)
        db.flush()

        db.add(CreditNote(
            note_code="CRN-2026-0001",
            return_id=s_ret.id,
            customer_id=ord1.customer_id,
            amount=7690000.0,
            status="APPLIED",
            notes="Giảm trừ công nợ do hoàn nhập 1 tai nghe Sony WH-1000XM5",
            created_at=now_utc - timedelta(days=4)
        ))

        # 9. CHỈ TIÊU DOANH SỐ (SALES TARGETS)
        db.add(SalesTarget(
            rep_id=2, # sales_rep
            rep_name="Lê Thị Nhân Viên Kinh Doanh",
            period="2026-10",
            target_revenue=500_000_000.0,
            target_orders=20,
            is_locked=True
        ))
        db.add(SalesTarget(
            rep_id=1,
            rep_name="Nguyễn Văn Giám Đốc Kinh Doanh",
            period="2026-10",
            target_revenue=1_200_000_000.0,
            target_orders=45,
            is_locked=True
        ))
        db.commit()
        print("-> Đã khởi tạo Hóa đơn VAT, Phiếu thu tiền, Sổ nợ, Phiếu trả hàng và Chứng từ giảm nợ.")

        # MỞ LẠI FOREIGN KEY CHECKS
        try:
            db.execute(text("PRAGMA foreign_keys = ON;"))
        except Exception:
            try:
                db.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
            except Exception:
                pass

        print("=" * 80)
        print("🎉 TẤT CẢ DỮ LIỆU DEMO HÀNG ĐIỆN TỬ - CÔNG NGHỆ ĐÃ ĐƯỢC THIẾT LẬP THÀNH CÔNG RỰC RỠ!")
        print("=" * 80)

    except Exception as e:
        db.rollback()
        print(f"[LỖI SEED DỮ LIỆU]: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_pure_electronics()
