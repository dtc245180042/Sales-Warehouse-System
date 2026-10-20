import sys
import os
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

# Đảm bảo in tiếng Việt trên console Windows không bị lỗi UnicodeEncodeError
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Thêm đường dẫn backend vào sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal, engine
from app.models.category import Category
from app.models.product import Product, ProductStatus
from app.models.product_lot import ProductLot
from app.models.warehouse_stock import WarehouseStock, StockLedgerEntry
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.customer_warehouse_profile import CustomerWarehouseProfile
from app.models.order import Order, OrderItem
from app.models.picking_list import (
    PickingLocation,
    PickingList,
    PickingListOrder,
    PickingListItem,
)
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, DispatchStatus
from app.models.dispatch_delivery import DispatchDelivery, DeliveryStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def seed_presentation_data():
    db = SessionLocal()
    print("=" * 70)
    print(">>> BẮT ĐẦU KHỞI TẠO DỮ LIỆU DEMO CHUẨN XÁC CHO SPRINT 6 + 7 + 8")
    print(">>> TÁC NHÂN TRỌNG TÂM: NHÂN VIÊN KHO (HOÀNG VĂN THỦ KHO - KHO ĐÀ NẴNG)")
    print("=" * 70)

    # -------------------------------------------------------------------------
    # 1. DANH SÁCH KHÁCH HÀNG / ĐẠI LÝ LẤY TÊN NGƯỜI THẬT
    # -------------------------------------------------------------------------
    real_customers = [
        {
            "code": "KH-1001",
            "name": "Nguyễn Văn Nam",
            "phone": "0912345678",
            "email": "nam.nguyen@taphoanamphuong.vn",
            "address": "Số 45 Phố Hàng Bông, Phường Hàng Bông, Quận Hoàn Kiếm, Hà Nội",
            "customer_group": "TIER_1",
            "tax_code": "0108923412",
            "region": "Miền Bắc",
            "warehouse_name": "Kho Tổng Hà Nội",
            "warehouse_code": "WH-HANOI",
            "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
            "credit_limit": 100_000_000,
            "max_debt_days": 30,
            "current_debt": 35_500_000,
        },
        {
            "code": "KH-1002",
            "name": "Trần Thị Mai Anh",
            "phone": "0983224556",
            "email": "maianh.tran@bachhoamaianh.vn",
            "address": "Số 128 Đường Lê Duẩn, Phường Thạch Thang, Quận Hải Châu, Đà Nẵng",
            "customer_group": "TIER_1",
            "tax_code": "0401889231",
            "region": "Miền Trung",
            "warehouse_name": "Kho Đà Nẵng",
            "warehouse_code": "WH-DANANG",
            "assigned_sales_rep": "Nguyễn Văn Giám Đốc Kinh Doanh",
            "credit_limit": 150_000_000,
            "max_debt_days": 45,
            "current_debt": 98_000_000,
        },
        {
            "code": "KH-1003",
            "name": "Lê Hoàng Long",
            "phone": "0908776889",
            "email": "long.le@hoanglongdist.com",
            "address": "Số 56 Đường Nguyễn Trãi, Phường 3, Quận 5, TP. Hồ Chí Minh",
            "customer_group": "WHOLESALE",
            "tax_code": "0315778899",
            "region": "Miền Nam",
            "warehouse_name": "Kho Tổng TP.HCM",
            "warehouse_code": "WH-HCM",
            "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
            "credit_limit": 200_000_000,
            "max_debt_days": 60,
            "current_debt": 45_000_000,
        },
        {
            "code": "KH-1004",
            "name": "Phạm Minh Tuấn",
            "phone": "0907890123",
            "email": "tuan.pham@bachhoaminhtuan.com",
            "address": "Số 89 Đường Lạch Tray, Quận Ngô Quyền, Hải Phòng",
            "customer_group": "TIER_2",
            "tax_code": "0201994455",
            "region": "Miền Bắc",
            "warehouse_name": "Kho Tổng Hà Nội",
            "warehouse_code": "WH-HANOI",
            "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
            "credit_limit": 80_000_000,
            "max_debt_days": 30,
            "current_debt": 76_500_000,
        },
        {
            "code": "KH-1005",
            "name": "Đỗ Quỳnh Trang",
            "phone": "0934567890",
            "email": "trang.do@quynhtrangretail.vn",
            "address": "Số 15 Đại Lộ Hòa Bình, Quận Ninh Kiều, Cần Thơ",
            "customer_group": "TIER_2",
            "tax_code": "1801662233",
            "region": "Miền Tây",
            "warehouse_name": "Kho Tổng TP.HCM",
            "warehouse_code": "WH-HCM",
            "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
            "credit_limit": 120_000_000,
            "max_debt_days": 45,
            "current_debt": 125_000_000,  # Vượt hạn mức nợ (S7-04)
        },
        {
            "code": "KH-1006",
            "name": "Vũ Đức Thắng",
            "phone": "0977112233",
            "email": "thang.vu@ducthangmart.com",
            "address": "Số 234 Đường Lê Thánh Tông, TP. Hạ Long, Quảng Ninh",
            "customer_group": "RETAIL",
            "tax_code": "5701883344",
            "region": "Miền Bắc",
            "warehouse_name": "Kho Tổng Hà Nội",
            "warehouse_code": "WH-HANOI",
            "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
            "credit_limit": 60_000_000,
            "max_debt_days": 30,
            "current_debt": 12_000_000,
        },
        {
            "code": "KH-1007",
            "name": "Hoàng Thu Thảo",
            "phone": "0966334455",
            "email": "thao.hoang@thuthaominimart.vn",
            "address": "Số 68 Đường Trần Hưng Đạo, TP. Bắc Ninh, Tỉnh Bắc Ninh",
            "customer_group": "TIER_1",
            "tax_code": "2301119988",
            "region": "Miền Bắc",
            "warehouse_name": "Kho Tổng Hà Nội",
            "warehouse_code": "WH-HANOI",
            "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
            "credit_limit": 90_000_000,
            "max_debt_days": 30,
            "current_debt": 28_000_000,
        },
        {
            "code": "KH-1008",
            "name": "Bùi Thanh Tùng",
            "phone": "0945667788",
            "email": "tung.bui@tongkhotungthanh.vn",
            "address": "Số 112 Đường Quang Trung, TP. Vinh, Tỉnh Nghệ An",
            "customer_group": "WHOLESALE",
            "tax_code": "2901445566",
            "region": "Miền Trung",
            "warehouse_name": "Kho Đà Nẵng",
            "warehouse_code": "WH-DANANG",
            "assigned_sales_rep": "Nguyễn Văn Giám Đốc Kinh Doanh",
            "credit_limit": 250_000_000,
            "max_debt_days": 60,
            "current_debt": 85_000_000,
        },
        {
            "code": "KH-1009",
            "name": "Nguyễn Văn Đại Lý",
            "phone": "0905556677",
            "email": "daily.nguyen@dailyb2b.vn",
            "address": "Số 250 Đường Nguyễn Tri Phương, Phường Hòa Thuận Tây, Quận Hải Châu, Đà Nẵng",
            "customer_group": "TIER_1",
            "tax_code": "0401998877",
            "region": "Miền Trung",
            "warehouse_name": "Kho Đà Nẵng",
            "warehouse_code": "WH-DANANG",
            "assigned_sales_rep": "Nguyễn Văn Giám Đốc Kinh Doanh",
            "credit_limit": 180_000_000,
            "max_debt_days": 45,
            "current_debt": 42_000_000,
        },
    ]

    customer_map = {}
    for c_data in real_customers:
        cust = db.query(Customer).filter(Customer.code == c_data["code"]).first()
        if not cust:
            cust = Customer(
                code=c_data["code"],
                name=c_data["name"],
                phone=c_data["phone"],
                email=c_data["email"],
                address=c_data["address"],
                customer_group=c_data["customer_group"],
                tax_code=c_data["tax_code"],
                region=c_data["region"],
                assigned_sales_rep=c_data["assigned_sales_rep"],
                status="active"
            )
            db.add(cust)
            db.flush()
        else:
            cust.name = c_data["name"]
            cust.phone = c_data["phone"]
            cust.email = c_data["email"]
            cust.address = c_data["address"]
            cust.customer_group = c_data["customer_group"]
            cust.tax_code = c_data["tax_code"]
            cust.region = c_data["region"]
            cust.assigned_sales_rep = c_data["assigned_sales_rep"]

        customer_map[c_data["code"]] = cust

        # Gán kho phục vụ (CustomerWarehouseProfile - S6-03 picking list)
        cwp = db.query(CustomerWarehouseProfile).filter(CustomerWarehouseProfile.customer_id == str(cust.id)).first()
        if not cwp:
            cwp = CustomerWarehouseProfile(
                customer_id=str(cust.id),
                warehouse_name=c_data["warehouse_name"],
                warehouse_code=c_data["warehouse_code"],
                is_default=True,
                notes=f"Kho phục vụ khu vực {c_data['region']}"
            )
            db.add(cwp)
        else:
            cwp.warehouse_name = c_data["warehouse_name"]
            cwp.warehouse_code = c_data["warehouse_code"]

        # Cập nhật Credit Profile
        profile = db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == cust.id).first()
        if not profile:
            profile = CustomerCreditProfile(
                customer_id=cust.id,
                credit_limit=c_data["credit_limit"],
                max_debt_days=c_data["max_debt_days"],
                current_debt=c_data["current_debt"],
                updated_by="Hệ thống khởi tạo demo"
            )
            db.add(profile)
        else:
            profile.credit_limit = c_data["credit_limit"]
            profile.max_debt_days = c_data["max_debt_days"]
            profile.current_debt = c_data["current_debt"]

    db.commit()
    print(f"-> [1/8] Đã đồng bộ {len(real_customers)} khách hàng với họ tên người thật & kho phục vụ.")

    # -------------------------------------------------------------------------
    # 2. CÂY DANH MỤC SẢN PHẨM (CATEGORIES)
    # -------------------------------------------------------------------------
    categories_def = [
        {"code": "CAT-BEVERAGE", "name": "Bia & Nước giải khát", "desc": "Bia lon, nước ngọt có ga, nước tăng lực"},
        {"code": "CAT-FOOD", "name": "Thực phẩm & Đồ uống", "desc": "Sữa tiệt trùng, cà phê, sữa đặc"},
        {"code": "CAT-FMCG", "name": "Hàng tiêu dùng nhanh (FMCG)", "desc": "Mì ăn liền, dầu ăn, gia vị đóng gói"},
        {"code": "CAT-CONFECTIONERY", "name": "Bánh kẹo & Tiêu dùng", "desc": "Bánh ChocoPie, kẹo và đồ ăn vặt"},
    ]
    cat_map = {}
    for c_item in categories_def:
        cat = db.query(Category).filter(Category.code == c_item["code"]).first()
        if not cat:
            cat = Category(
                code=c_item["code"],
                name=c_item["name"],
                description=c_item["desc"],
                level=1,
                is_active=True
            )
            db.add(cat)
            db.flush()
        else:
            cat.name = c_item["name"]
            cat.description = c_item["desc"]
        cat_map[c_item["name"]] = cat
    db.commit()

    # -------------------------------------------------------------------------
    # 3. DANH SÁCH 13 SẢN PHẨM FMCG DEMO (CÓ BIA SAIGON SPECIAL, VINAMILK, RED BULL,...)
    # -------------------------------------------------------------------------
    products_def = [
        {
            "sku": "SAB-SPECIAL-330",
            "name": "Bia Saigon Special Sleek (Thùng 24 lon x 330ml)",
            "category": "Bia & Nước giải khát",
            "unit": "thùng",
            "packaging_spec": "24 lon/thùng",
            "cost_price": 310000,
            "price": 360000,
            "sale_price": 360000,
            "stock": 260,
            "min_stock": 30,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 30,
        },
        {
            "sku": "VNM-SUA-180",
            "name": "Sữa tươi tiệt trùng Vinamilk 100% Có đường (Thùng 48 hộp x 180ml)",
            "category": "Thực phẩm & Đồ uống",
            "unit": "thùng",
            "packaging_spec": "48 hộp/thùng",
            "cost_price": 320000,
            "price": 385000,
            "sale_price": 385000,
            "stock": 360,
            "min_stock": 30,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 30,
        },
        {
            "sku": "RBL-THAI-250",
            "name": "Nước tăng lực Red Bull Nắp Vàng Thái Lan (Thùng 24 lon x 250ml)",
            "category": "Bia & Nước giải khát",
            "unit": "thùng",
            "packaging_spec": "24 lon/thùng",
            "cost_price": 220000,
            "price": 265000,
            "sale_price": 265000,
            "stock": 200,
            "min_stock": 20,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 30,
        },
        {
            "sku": "KEN-SILVER-330",
            "name": "Bia Heineken Silver Sleek Cao Cấp (Thùng 24 lon x 330ml)",
            "category": "Bia & Nước giải khát",
            "unit": "thùng",
            "packaging_spec": "24 lon/thùng",
            "cost_price": 380000,
            "price": 435000,
            "sale_price": 435000,
            "stock": 310,
            "min_stock": 40,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 45,
        },
        {
            "sku": "ACE-HAOHAO-75",
            "name": "Mì ăn liền Hảo Hảo Tôm Chua Cay Acecook (Thùng 30 gói x 75g)",
            "category": "Hàng tiêu dùng nhanh (FMCG)",
            "unit": "thùng",
            "packaging_spec": "30 gói/thùng",
            "cost_price": 105000,
            "price": 125000,
            "sale_price": 125000,
            "stock": 420,
            "min_stock": 50,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 30,
        },
        {
            "sku": "TNG-G7-3IN1",
            "name": "Cà phê hòa tan G7 3in1 Trung Nguyên Legend (Thùng 24 hộp x 20 gói)",
            "category": "Thực phẩm & Đồ uống",
            "unit": "thùng",
            "packaging_spec": "24 hộp/thùng",
            "cost_price": 1100000,
            "price": 1280000,
            "sale_price": 1280000,
            "stock": 110,
            "min_stock": 15,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 60,
        },
        {
            "sku": "ORN-CHOCO-12",
            "name": "Bánh ChocoPie Orion Truyền Thống Đậm Vị (Thùng 8 hộp x 12 cái)",
            "category": "Bánh kẹo & Tiêu dùng",
            "unit": "thùng",
            "packaging_spec": "8 hộp/thùng",
            "cost_price": 350000,
            "price": 410000,
            "sale_price": 410000,
            "stock": 160,
            "min_stock": 20,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 30,
        },
        {
            "sku": "CCL-ORIG-320",
            "name": "Nước giải khát có ga Coca-Cola Sleek (Thùng 24 lon x 320ml)",
            "category": "Bia & Nước giải khát",
            "unit": "thùng",
            "packaging_spec": "24 lon/thùng",
            "cost_price": 180000,
            "price": 215000,
            "sale_price": 215000,
            "stock": 240,
            "min_stock": 30,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 30,
        },
        {
            "sku": "LAV-WATER-500",
            "name": "Nước khoáng thiên nhiên La Vie (Thùng 24 chai x 500ml)",
            "category": "Bia & Nước giải khát",
            "unit": "thùng",
            "packaging_spec": "24 chai/thùng",
            "cost_price": 75000,
            "price": 98000,
            "sale_price": 98000,
            "stock": 330,
            "min_stock": 30,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 60,
        },
        {
            "sku": "SMP-OIL-1L",
            "name": "Dầu ăn thực vật cao cấp Simply Đậu Nành (Thùng 12 chai x 1L)",
            "category": "Hàng tiêu dùng nhanh (FMCG)",
            "unit": "thùng",
            "packaging_spec": "12 chai/thùng",
            "cost_price": 530000,
            "price": 620000,
            "sale_price": 620000,
            "stock": 140,
            "min_stock": 15,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 45,
        },
        {
            "sku": "VNM-ONGTHO-380",
            "name": "Sữa đặc có đường Ông Thọ Nhãn Đỏ (Thùng 24 lon x 380g)",
            "category": "Thực phẩm & Đồ uống",
            "unit": "thùng",
            "packaging_spec": "24 lon/thùng",
            "cost_price": 510000,
            "price": 590000,
            "sale_price": 590000,
            "stock": 150,
            "min_stock": 20,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 45,
        },
        {
            "sku": "TH-TOPKID-180",
            "name": "Sữa tươi tiệt trùng TH true MILK Hộp 180ml (Thùng 48 hộp)",
            "category": "Thực phẩm & Đồ uống",
            "unit": "thùng",
            "packaging_spec": "48 hộp/thùng",
            "cost_price": 330000,
            "price": 395000,
            "sale_price": 395000,
            "stock": 170,
            "min_stock": 25,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 30,
        },
        {
            "sku": "NES-MILO-180",
            "name": "Thức uống lúa mạch Nestlé Milo Hộp 180ml (Thùng 48 hộp)",
            "category": "Thực phẩm & Đồ uống",
            "unit": "thùng",
            "packaging_spec": "48 hộp/thùng",
            "cost_price": 315000,
            "price": 375000,
            "sale_price": 375000,
            "stock": 220,
            "min_stock": 30,
            "manage_by_lot": True,
            "near_expiry_threshold_days": 30,
        },
    ]

    product_map = {}
    for p_info in products_def:
        prod = db.query(Product).filter(Product.sku == p_info["sku"]).first()
        cat_obj = cat_map.get(p_info["category"])
        if not prod:
            prod = Product(
                sku=p_info["sku"],
                name=p_info["name"],
                category=p_info["category"],
                category_id=cat_obj.id if cat_obj else None,
                unit=p_info["unit"],
                packaging_spec=p_info["packaging_spec"],
                cost_price=p_info["cost_price"],
                price=p_info["price"],
                sale_price=p_info["sale_price"],
                stock=p_info["stock"],
                min_stock=p_info["min_stock"],
                manage_by_lot=p_info["manage_by_lot"],
                near_expiry_threshold_days=p_info["near_expiry_threshold_days"],
                status=ProductStatus.ACTIVE,
                is_active=True
            )
            db.add(prod)
            db.flush()
        else:
            prod.name = p_info["name"]
            prod.category = p_info["category"]
            prod.category_id = cat_obj.id if cat_obj else None
            prod.unit = p_info["unit"]
            prod.cost_price = p_info["cost_price"]
            prod.price = p_info["price"]
            prod.sale_price = p_info["sale_price"]
            prod.stock = p_info["stock"]
            prod.min_stock = p_info["min_stock"]
            prod.manage_by_lot = p_info["manage_by_lot"]
            prod.near_expiry_threshold_days = p_info["near_expiry_threshold_days"]
            prod.status = ProductStatus.ACTIVE
            prod.is_active = True

        product_map[p_info["sku"]] = prod

        # ---------------------------------------------------------------------
        # PHÂN BỔ TỒN KHO ĐA KHO:
        # Kho 1: Kho Tổng Hà Nội (55% tồn)
        # Kho 2: Kho Đà Nẵng (45% tồn) -> Kho thủ kho Hoàng Văn phụ trách
        # ---------------------------------------------------------------------
        stock_hanoi = int(p_info["stock"] * 0.55)
        stock_danang = p_info["stock"] - stock_hanoi

        # Kho 1: Hà Nội
        ws1 = db.query(WarehouseStock).filter(
            WarehouseStock.product_id == prod.id,
            WarehouseStock.warehouse_id == 1
        ).first()
        if not ws1:
            ws1 = WarehouseStock(
                product_id=prod.id,
                sku=prod.sku,
                warehouse_id=1,
                warehouse="Kho Tổng Hà Nội",
                stock=stock_hanoi,
                physical_stock=stock_hanoi,
                min_stock=p_info["min_stock"]
            )
            db.add(ws1)
        else:
            ws1.stock = stock_hanoi
            ws1.physical_stock = stock_hanoi

        # Kho 2: Đà Nẵng
        ws2 = db.query(WarehouseStock).filter(
            WarehouseStock.product_id == prod.id,
            WarehouseStock.warehouse_id == 2
        ).first()
        if not ws2:
            ws2 = WarehouseStock(
                product_id=prod.id,
                sku=prod.sku,
                warehouse_id=2,
                warehouse="Kho Đà Nẵng",
                stock=stock_danang,
                physical_stock=stock_danang,
                min_stock=p_info["min_stock"]
            )
            db.add(ws2)
        else:
            ws2.stock = stock_danang
            ws2.physical_stock = stock_danang

    db.commit()
    print(f"-> [2/8] Đã tạo/đồng bộ {len(products_def)} sản phẩm và phân bổ tồn tại Kho Đà Nẵng & Kho Hà Nội.")

    # -------------------------------------------------------------------------
    # 4. TẠO CÁC LÔ HÀNG THEO CHUẨN FEFO (S6-01 & S6-04) CHO CẢ 2 KHO
    # Hạn sử dụng chia làm 3 nhóm nhãn cảnh báo:
    # - ĐỎ: Cận date < 30 ngày (hoặc quá hạn) -> Cảnh báo cận date / Quá hạn chặn xuất
    # - VÀNG: Còn 30 - 90 ngày -> Cận date
    # - XANH: Còn > 90 ngày -> An toàn
    # -------------------------------------------------------------------------
    today = date(2026, 10, 19)

    lots_def = [
        # --- KHO ĐÀ NẴNG (warehouse_id = 2) - KHO THỦ KHO DEMO TRỰC TIẾP ---
        # 1. Bia Saigon Special Sleek: 3 Lô (Đỏ - Vàng - Xanh)
        {
            "sku": "SAB-SPECIAL-330",
            "lot_number": "LOT-SAB-DN01",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=155),
            "exp_date": today + timedelta(days=25),   # Còn 25 ngày -> ĐỎ CẬN DATE
            "initial_quantity": 40,
            "remaining_quantity": 30,
        },
        {
            "sku": "SAB-SPECIAL-330",
            "lot_number": "LOT-SAB-DN02",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=100),
            "exp_date": today + timedelta(days=75),   # Còn 75 ngày -> VÀNG
            "initial_quantity": 60,
            "remaining_quantity": 50,
        },
        {
            "sku": "SAB-SPECIAL-330",
            "lot_number": "LOT-SAB-DN03",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=30),
            "exp_date": today + timedelta(days=240),  # Còn 240 ngày -> XANH AN TOÀN
            "initial_quantity": 80,
            "remaining_quantity": 80,
        },

        # 2. Sữa tươi Vinamilk 180ml: CHUẨN KỊCH BẢN FEFO S6-04 (Cần 50 -> Lấy 30 Lô 1 + 20 Lô 2)
        {
            "sku": "VNM-SUA-180",
            "lot_number": "LOT-VNM-DN01",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=160),
            "exp_date": today + timedelta(days=20),   # Còn 20 ngày -> ĐỎ CẬN DATE
            "initial_quantity": 50,
            "remaining_quantity": 30,                # Lô 1 còn 30 thùng
        },
        {
            "sku": "VNM-SUA-180",
            "lot_number": "LOT-VNM-DN02",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=120),
            "exp_date": today + timedelta(days=60),   # Còn 60 ngày -> VÀNG
            "initial_quantity": 60,
            "remaining_quantity": 50,                # Lô 2 còn 50 thùng
        },
        {
            "sku": "VNM-SUA-180",
            "lot_number": "LOT-VNM-DN03",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=30),
            "exp_date": today + timedelta(days=180),  # Còn 180 ngày -> XANH AN TOÀN
            "initial_quantity": 100,
            "remaining_quantity": 100,
        },

        # 3. Red Bull Thái Lan tại Kho Đà Nẵng
        {
            "sku": "RBL-THAI-250",
            "lot_number": "LOT-RBL-DN01",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=335),
            "exp_date": today + timedelta(days=25),   # Còn 25 ngày -> ĐỎ
            "initial_quantity": 40,
            "remaining_quantity": 25,
        },
        {
            "sku": "RBL-THAI-250",
            "lot_number": "LOT-RBL-DN02",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=90),
            "exp_date": today + timedelta(days=210),  # Còn 210 ngày -> XANH
            "initial_quantity": 70,
            "remaining_quantity": 65,
        },

        # 4. Mì Hảo Hảo: Lô đã quá hạn (EXPIRED) để test cảnh báo đỏ chặn xuất kho
        {
            "sku": "ACE-HAOHAO-75",
            "lot_number": "LOT-HH-EXPIRED",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=200),
            "exp_date": today - timedelta(days=10),   # Quá hạn 10 ngày -> ĐỎ QUÁ HẠN CHẶN XUẤT
            "initial_quantity": 30,
            "remaining_quantity": 15,
        },
        {
            "sku": "ACE-HAOHAO-75",
            "lot_number": "LOT-HH-DN02",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=40),
            "exp_date": today + timedelta(days=140),  # XANH AN TOÀN
            "initial_quantity": 180,
            "remaining_quantity": 170,
        },

        # 5. Bia Heineken Silver tại Kho Đà Nẵng
        {
            "sku": "KEN-SILVER-330",
            "lot_number": "LOT-KEN-DN01",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=110),
            "exp_date": today + timedelta(days=50),   # Còn 50 ngày -> VÀNG
            "initial_quantity": 70,
            "remaining_quantity": 55,
        },
        {
            "sku": "KEN-SILVER-330",
            "lot_number": "LOT-KEN-DN02",
            "warehouse_id": 2,
            "mfg_date": today - timedelta(days=20),
            "exp_date": today + timedelta(days=200),  # Còn 200 ngày -> XANH
            "initial_quantity": 90,
            "remaining_quantity": 85,
        },

        # --- KHO TỔNG HÀ NỘI (warehouse_id = 1) ---
        {
            "sku": "VNM-SUA-180",
            "lot_number": "LOT-VNM-HN01",
            "warehouse_id": 1,
            "mfg_date": today - timedelta(days=160),
            "exp_date": today + timedelta(days=20),
            "initial_quantity": 50,
            "remaining_quantity": 30,
        },
        {
            "sku": "VNM-SUA-180",
            "lot_number": "LOT-VNM-HN02",
            "warehouse_id": 1,
            "mfg_date": today - timedelta(days=120),
            "exp_date": today + timedelta(days=60),
            "initial_quantity": 60,
            "remaining_quantity": 50,
        },
        {
            "sku": "VNM-SUA-180",
            "lot_number": "LOT-VNM-HN03",
            "warehouse_id": 1,
            "mfg_date": today - timedelta(days=30),
            "exp_date": today + timedelta(days=180),
            "initial_quantity": 120,
            "remaining_quantity": 115,
        },
        {
            "sku": "TNG-G7-3IN1",
            "lot_number": "LOT-G7-HN01",
            "warehouse_id": 1,
            "mfg_date": today - timedelta(days=45),
            "exp_date": today + timedelta(days=320),
            "initial_quantity": 60,
            "remaining_quantity": 58,
        },
        {
            "sku": "ORN-CHOCO-12",
            "lot_number": "LOT-CP-HN01",
            "warehouse_id": 1,
            "mfg_date": today - timedelta(days=60),
            "exp_date": today + timedelta(days=120),
            "initial_quantity": 90,
            "remaining_quantity": 85,
        },
    ]

    for l_info in lots_def:
        prod = product_map.get(l_info["sku"])
        if not prod:
            continue
        lot = db.query(ProductLot).filter(
            ProductLot.product_id == prod.id,
            ProductLot.warehouse_id == l_info["warehouse_id"],
            ProductLot.lot_number == l_info["lot_number"]
        ).first()

        if not lot:
            lot = ProductLot(
                product_id=prod.id,
                warehouse_id=l_info["warehouse_id"],
                lot_number=l_info["lot_number"],
                mfg_date=l_info["mfg_date"],
                exp_date=l_info["exp_date"],
                initial_quantity=l_info["initial_quantity"],
                remaining_quantity=l_info["remaining_quantity"],
            )
            db.add(lot)
        else:
            lot.mfg_date = l_info["mfg_date"]
            lot.exp_date = l_info["exp_date"]
            lot.initial_quantity = l_info["initial_quantity"]
            lot.remaining_quantity = l_info["remaining_quantity"]

    db.commit()
    print(f"-> [3/8] Đã tạo {len(lots_def)} lô hàng chuẩn FEFO (Đỏ cận date - Vàng - Xanh an toàn - Quá hạn chặn).")

    # -------------------------------------------------------------------------
    # 5. SỔ THẺ KHO (STOCK LEDGER ENTRY - S6-02)
    # BIA SAIGON SPECIAL TẠI KHO ĐÀ NẴNG: 4 DÒNG BIẾN ĐỘNG LIÊN TIẾP
    # CÔNG THỨC: TỒN CUỐI = TỒN ĐẦU + NHẬP - XUẤT (100 + 50 - 30 - 20 = 100)
    # -------------------------------------------------------------------------
    p_sab = product_map["SAB-SPECIAL-330"]
    p_vnm = product_map["VNM-SUA-180"]

    ledger_entries_def = [
        # Thẻ kho Bia Saigon Special (Kho Đà Nẵng - warehouse_id=2)
        {
            "key": "LEDGER-SAB-DN-01",
            "ref": "PNK-INIT-SAB-DN",
            "movement": "STOCK_IN",
            "product": p_sab,
            "wh_id": 2,
            "qty": 100,
            "before": 0,
            "after": 100,
            "note": "Nhập số dư kho đầu kỳ hệ thống",
            "time_offset_days": -15
        },
        {
            "key": "LEDGER-SAB-DN-02",
            "ref": "PNK-SABECO-202610",
            "movement": "STOCK_IN",
            "product": p_sab,
            "wh_id": 2,
            "qty": 50,
            "before": 100,
            "after": 150,
            "note": "Nhập bổ sung từ Nhà máy Bia Sabeco Miền Trung",
            "time_offset_days": -8
        },
        {
            "key": "LEDGER-SAB-DN-03",
            "ref": "PXK-20261019-DN01",
            "movement": "OUT_SALE",
            "product": p_sab,
            "wh_id": 2,
            "qty": 30,
            "before": 150,
            "after": 120,
            "note": "Xuất bán theo đơn cho Đại lý Bách hóa Mai Anh (Đà Nẵng)",
            "time_offset_days": -3
        },
        {
            "key": "LEDGER-SAB-DN-04",
            "ref": "PXK-20261019-DN02",
            "movement": "OUT_SALE",
            "product": p_sab,
            "wh_id": 2,
            "qty": 20,
            "before": 120,
            "after": 100,
            "note": "Xuất bán cho Đại lý Nguyễn Văn Đại Lý (Đà Nẵng)",
            "time_offset_days": -1
        },

        # Thẻ kho Sữa tươi Vinamilk (Kho Đà Nẵng)
        {
            "key": "LEDGER-VNM-DN-01",
            "ref": "PNK-INIT-VNM-DN",
            "movement": "STOCK_IN",
            "product": p_vnm,
            "wh_id": 2,
            "qty": 200,
            "before": 0,
            "after": 200,
            "note": "Nhập kho ban đầu nhà máy Vinamilk Đà Nẵng",
            "time_offset_days": -20
        },
        {
            "key": "LEDGER-VNM-DN-02",
            "ref": "PXK-20261015-VNM",
            "movement": "OUT_SALE",
            "product": p_vnm,
            "wh_id": 2,
            "qty": 20,
            "before": 200,
            "after": 180,
            "note": "Xuất giao đại lý Mai Anh đợt 1",
            "time_offset_days": -5
        },
    ]

    for le in ledger_entries_def:
        existing_entry = db.query(StockLedgerEntry).filter(StockLedgerEntry.idempotency_key == le["key"]).first()
        entry_time = datetime.now(timezone.utc) + timedelta(days=le["time_offset_days"])
        if not existing_entry:
            new_entry = StockLedgerEntry(
                idempotency_key=le["key"],
                reference_code=le["ref"],
                line_ref="1",
                movement_type=le["movement"],
                product_id=le["product"].id,
                sku=le["product"].sku,
                warehouse_id=le["wh_id"],
                quantity_base=le["qty"],
                previous_physical=le["before"],
                new_physical=le["after"],
                performer_id=5, # Hoàng Văn Thủ Kho
                note=le["note"],
                created_at=entry_time
            )
            db.add(new_entry)
        else:
            existing_entry.reference_code = le["ref"]
            existing_entry.quantity_base = le["qty"]
            existing_entry.previous_physical = le["before"]
            existing_entry.new_physical = le["after"]
            existing_entry.note = le["note"]

    db.commit()
    print("-> [4/8] Đã tạo thẻ kho chuẩn xác: Tồn cuối = Tồn đầu + Nhập - Xuất cho Bia Saigon Special & Vinamilk.")

    # -------------------------------------------------------------------------
    # 6. CẤU HÌNH VỊ TRÍ KỆ (PICKING LOCATIONS) CHO KHO ĐÀ NẴNG (S6-03)
    # Tuyến đường đi trong kho: Kệ A ➔ B ➔ C
    # -------------------------------------------------------------------------
    locations_def = [
        {"sku": "SAB-SPECIAL-330", "wh_id": 2, "loc": "A-01-01", "seq": 1},
        {"sku": "KEN-SILVER-330",  "wh_id": 2, "loc": "A-01-02", "seq": 2},
        {"sku": "VNM-SUA-180",     "wh_id": 2, "loc": "B-02-01", "seq": 3},
        {"sku": "RBL-THAI-250",    "wh_id": 2, "loc": "B-02-02", "seq": 4},
        {"sku": "ACE-HAOHAO-75",   "wh_id": 2, "loc": "C-03-01", "seq": 5},
        {"sku": "TNG-G7-3IN1",     "wh_id": 2, "loc": "C-03-02", "seq": 6},

        # Kho Hà Nội
        {"sku": "VNM-SUA-180",     "wh_id": 1, "loc": "HN-A-01", "seq": 1},
        {"sku": "KEN-SILVER-330",  "wh_id": 1, "loc": "HN-B-01", "seq": 2},
    ]

    for loc_item in locations_def:
        prod = product_map.get(loc_item["sku"])
        if not prod:
            continue
        p_loc = db.query(PickingLocation).filter(
            PickingLocation.warehouse_id == loc_item["wh_id"],
            PickingLocation.product_id == prod.id
        ).first()

        if not p_loc:
            p_loc = PickingLocation(
                warehouse_id=loc_item["wh_id"],
                product_id=prod.id,
                location_code=loc_item["loc"],
                route_sequence=loc_item["seq"]
            )
            db.add(p_loc)
        else:
            p_loc.location_code = loc_item["loc"]
            p_loc.route_sequence = loc_item["seq"]

    db.commit()
    print("-> [5/8] Đã cấu hình vị trí lưu kho & tuyến đường nhặt hàng (Kệ A -> B -> C) cho S6-03.")

    # -------------------------------------------------------------------------
    # 7. TẠO CÁC ĐƠN HÀNG MẪU (ORDERS) PHỤC VỤ CÁC KỊCH BẢN THUYẾT TRÌNH
    # -------------------------------------------------------------------------
    c_nam = customer_map["KH-1001"]       # Nguyễn Văn Nam (Hà Nội)
    c_maianh = customer_map["KH-1002"]    # Trần Thị Mai Anh (Đà Nẵng)
    c_long = customer_map["KH-1003"]      # Lê Hoàng Long (TP.HCM)
    c_tung = customer_map["KH-1008"]      # Bùi Thanh Tùng (Nghệ An)
    c_daily = customer_map["KH-1009"]     # Nguyễn Văn Đại Lý (Đà Nẵng)

    p_rbl = product_map["RBL-THAI-250"]
    p_ken = product_map["KEN-SILVER-330"]
    p_hh = product_map["ACE-HAOHAO-75"]
    p_g7 = product_map["TNG-G7-3IN1"]

    # ĐƠN 1: DH-2026-0001 (APPROVED) -> Sẵn sàng cho thủ kho tạo Phiếu Soạn Hàng (S6-03)
    order_1 = db.query(Order).filter(Order.code == "DH-2026-0001").first()
    if not order_1:
        tot_1 = (10 * p_sab.sale_price) + (15 * p_vnm.sale_price) + (10 * p_rbl.sale_price)
        order_1 = Order(
            id="ORD-2026-1001",
            code="DH-2026-0001",
            customer_id=c_maianh.id,
            customer_name=c_maianh.name,
            customer_phone=c_maianh.phone,
            customer_address=c_maianh.address,
            subtotal=tot_1,
            discount=0,
            tax=0,
            total=tot_1,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="APPROVED",  # Đã duyệt -> Thủ kho tạo Phiếu soạn hàng S6-03
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Đơn hàng đã duyệt - Cần tạo phiếu soạn hàng tại Kho Đà Nẵng",
            source="internal",
            is_unassigned=False
        )
        db.add(order_1)
        db.flush()
        db.add(OrderItem(order_id=order_1.id, product_id=p_sab.id, sku=p_sab.sku, name=p_sab.name, price=p_sab.sale_price, quantity=10, discount=0, subtotal=10 * p_sab.sale_price, unit=p_sab.unit))
        db.add(OrderItem(order_id=order_1.id, product_id=p_vnm.id, sku=p_vnm.sku, name=p_vnm.name, price=p_vnm.sale_price, quantity=15, discount=0, subtotal=15 * p_vnm.sale_price, unit=p_vnm.unit))
        db.add(OrderItem(order_id=order_1.id, product_id=p_rbl.id, sku=p_rbl.sku, name=p_rbl.name, price=p_rbl.sale_price, quantity=10, discount=0, subtotal=10 * p_rbl.sale_price, unit=p_rbl.unit))

    # ĐƠN 2: DH-2026-0002 (DISPATCHED / shipping) -> Demo Xác nhận Giao Hàng Thành Công kèm ảnh POD (S6-08)
    order_2 = db.query(Order).filter(Order.code == "DH-2026-0002").first()
    if not order_2:
        tot_2 = (20 * p_sab.sale_price) + (10 * p_vnm.sale_price)
        order_2 = Order(
            id="ORD-2026-1002",
            code="DH-2026-0002",
            customer_id=c_maianh.id,
            customer_name=c_maianh.name,
            customer_phone=c_maianh.phone,
            customer_address=c_maianh.address,
            subtotal=tot_2,
            discount=0,
            tax=0,
            total=tot_2,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="DISPATCHED", # Đang giao hàng -> Demo S6-08 xác nhận POD
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Xe tải 2.5T đang trên đường giao đến 128 Lê Duẩn, Đà Nẵng",
            source="internal",
            is_unassigned=False
        )
        db.add(order_2)
        db.flush()
        db.add(OrderItem(order_id=order_2.id, product_id=p_sab.id, sku=p_sab.sku, name=p_sab.name, price=p_sab.sale_price, quantity=20, discount=0, subtotal=20 * p_sab.sale_price, unit=p_sab.unit))
        db.add(OrderItem(order_id=order_2.id, product_id=p_vnm.id, sku=p_vnm.sku, name=p_vnm.name, price=p_vnm.sale_price, quantity=10, discount=0, subtotal=10 * p_vnm.sale_price, unit=p_vnm.unit))

    # Phiếu xuất kho tương ứng của Đơn 2
    dispatch_2 = db.query(StockDispatch).filter(StockDispatch.id == "PXK-20261019-0002").first()
    if not dispatch_2:
        dispatch_2 = StockDispatch(
            id="PXK-20261019-0002",
            order_id=order_2.id,
            customer_id=c_maianh.id,
            customer_name=c_maianh.name,
            customer_address=c_maianh.address,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status=DispatchStatus.CONFIRMED.value,
            total_items=2,
            total_dispatched_quantity=30,
            is_partial=False,
            has_shortfall=False,
            dispatched_by=5,
            dispatched_at=datetime.now(timezone.utc),
            notes="Đã xuất xe tải 43C-128.99 giao đại lý Mai Anh"
        )
        db.add(dispatch_2)
        db.flush()
        db.add(StockDispatchItem(
            dispatch_id=dispatch_2.id,
            product_id=p_sab.id,
            sku=p_sab.sku,
            product_name=p_sab.name,
            ordered_quantity=20,
            dispatched_quantity=20,
            shortfall_quantity=0,
            delivered_quantity=0
        ))
        db.add(StockDispatchItem(
            dispatch_id=dispatch_2.id,
            product_id=p_vnm.id,
            sku=p_vnm.sku,
            product_name=p_vnm.name,
            ordered_quantity=10,
            dispatched_quantity=10,
            shortfall_quantity=0,
            delivered_quantity=0
        ))

    # ĐƠN 3: DH-2026-0003 (DELIVERED) -> Đã giao hàng thành công, có ảnh chứng từ POD
    order_3 = db.query(Order).filter(Order.code == "DH-2026-0003").first()
    if not order_3:
        tot_3 = (20 * p_hh.sale_price) + (2 * p_g7.sale_price)
        order_3 = Order(
            id="ORD-2026-1003",
            code="DH-2026-0003",
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            customer_phone=c_daily.phone,
            customer_address=c_daily.address,
            subtotal=tot_3,
            discount=0,
            tax=0,
            total=tot_3,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="DELIVERED", # Đã giao -> Kế toán xuất hóa đơn S7-01
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Đã ký nhận biên bản bàn giao POD lúc 14:30",
            source="internal",
            is_unassigned=False
        )
        db.add(order_3)
        db.flush()
        db.add(OrderItem(order_id=order_3.id, product_id=p_hh.id, sku=p_hh.sku, name=p_hh.name, price=p_hh.sale_price, quantity=20, discount=0, subtotal=20 * p_hh.sale_price, unit=p_hh.unit))
        db.add(OrderItem(order_id=order_3.id, product_id=p_g7.id, sku=p_g7.sku, name=p_g7.name, price=p_g7.sale_price, quantity=2, discount=0, subtotal=2 * p_g7.sale_price, unit=p_g7.unit))

    # ĐƠN 4: DH-2026-0004 -> PHIẾU XUẤT THIẾU (BACKORDER - S6-05) ĐÃ XÁC NHẬN
    order_4 = db.query(Order).filter(Order.code == "DH-2026-0004").first()
    if not order_4:
        tot_4 = (10 * p_rbl.sale_price) + (10 * p_vnm.sale_price)
        order_4 = Order(
            id="ORD-2026-1004",
            code="DH-2026-0004",
            customer_id=c_tung.id,
            customer_name=c_tung.name,
            customer_phone=c_tung.phone,
            customer_address=c_tung.address,
            subtotal=tot_4,
            discount=0,
            tax=0,
            total=tot_4,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="PARTIAL_DISPATCHED",
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Đơn hàng giao thiếu 3 thùng Red Bull - Đang ghi nhận nợ hàng (Backorder)",
            source="internal",
            is_unassigned=False
        )
        db.add(order_4)
        db.flush()
        db.add(OrderItem(order_id=order_4.id, product_id=p_rbl.id, sku=p_rbl.sku, name=p_rbl.name, price=p_rbl.sale_price, quantity=10, discount=0, subtotal=10 * p_rbl.sale_price, unit=p_rbl.unit))
        db.add(OrderItem(order_id=order_4.id, product_id=p_vnm.id, sku=p_vnm.sku, name=p_vnm.name, price=p_vnm.sale_price, quantity=10, discount=0, subtotal=10 * p_vnm.sale_price, unit=p_vnm.unit))

    # Phiếu xuất kho PXK-20261019-0001 (CONFIRMED có nợ hàng - S6-05)
    dispatch_1 = db.query(StockDispatch).filter(StockDispatch.id == "PXK-20261019-0001").first()
    if not dispatch_1:
        dispatch_1 = StockDispatch(
            id="PXK-20261019-0001",
            order_id=order_4.id,
            customer_id=c_tung.id,
            customer_name=c_tung.name,
            customer_address=c_tung.address,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status=DispatchStatus.CONFIRMED.value,
            total_items=2,
            total_dispatched_quantity=17,
            is_partial=True,
            has_shortfall=True, # Hiển thị badge: "Xuất thiếu (Có nợ hàng)"
            dispatched_by=5,
            dispatched_at=datetime.now(timezone.utc),
            notes="Vinamilk xuất đủ 10 thùng; Red Bull đặt 10 thực xuất 7, nợ lại 3 thùng giao chuyến sau"
        )
        db.add(dispatch_1)
        db.flush()
        db.add(StockDispatchItem(
            dispatch_id=dispatch_1.id,
            product_id=p_rbl.id,
            sku=p_rbl.sku,
            product_name=p_rbl.name,
            ordered_quantity=10,
            dispatched_quantity=7,
            shortfall_quantity=3, # NỢ 3 THÙNG -> Xuất hiện trên trang /inventory/backorders
            delivered_quantity=0
        ))
        db.add(StockDispatchItem(
            dispatch_id=dispatch_1.id,
            product_id=p_vnm.id,
            sku=p_vnm.sku,
            product_name=p_vnm.name,
            ordered_quantity=10,
            dispatched_quantity=10,
            shortfall_quantity=0,
            delivered_quantity=0
        ))

    # ĐƠN 5 & PHIẾU XUẤT DRAFT: PXK-20261019-DRAFT -> Dành riêng để Thủ Kho thao tác trực tiếp BƯỚC 1 -> 3 CỦA CÔNG VIỆC 5!
    order_5 = db.query(Order).filter(Order.code == "DH-2026-0005").first()
    if not order_5:
        tot_5 = 10 * p_sab.sale_price
        order_5 = Order(
            id="ORD-2026-1005",
            code="DH-2026-0005",
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            customer_phone=c_daily.phone,
            customer_address=c_daily.address,
            subtotal=tot_5,
            discount=0,
            tax=0,
            total=tot_5,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="PACKING",
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Đơn hàng đang chuẩn bị xuất kho tại Kho Đà Nẵng",
            source="internal",
            is_unassigned=False
        )
        db.add(order_5)
        db.flush()
        db.add(OrderItem(order_id=order_5.id, product_id=p_sab.id, sku=p_sab.sku, name=p_sab.name, price=p_sab.sale_price, quantity=10, discount=0, subtotal=tot_5, unit=p_sab.unit))

    dispatch_draft = db.query(StockDispatch).filter(StockDispatch.id == "PXK-20261019-DRAFT").first()
    if not dispatch_draft:
        dispatch_draft = StockDispatch(
            id="PXK-20261019-DRAFT",
            order_id=order_5.id,
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            customer_address=c_daily.address,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status="DRAFT", # Trạng thái DRAFT để thủ kho bấm "Xem chi tiết" và "Xác nhận xuất kho"
            total_items=1,
            total_dispatched_quantity=7,
            is_partial=True,
            has_shortfall=True,
            dispatched_by=5,
            dispatched_at=datetime.now(timezone.utc),
            notes="Phiếu xuất kho DRAFT - Đặt 10 thùng, thực xuất 7 thùng, nợ 3 thùng"
        )
        db.add(dispatch_draft)
        db.flush()
        db.add(StockDispatchItem(
            dispatch_id=dispatch_draft.id,
            product_id=p_sab.id,
            sku=p_sab.sku,
            product_name=p_sab.name,
            ordered_quantity=10,
            dispatched_quantity=7,
            shortfall_quantity=3, # Thiếu nợ hàng tự động tính = -3
            delivered_quantity=0
        ))

    db.commit()
    print("-> [6/8] Đã tạo 5 đơn hàng & 3 phiếu xuất kho phục vụ chính xác kịch bản S6-03, S6-05, S6-08.")

    # -------------------------------------------------------------------------
    # 8. TẠO 1 PHIẾU SOẠN HÀNG SẴN (PICKING LIST - S6-03) ĐỂ IN PHIẾU / HOÀN TẤT
    # -------------------------------------------------------------------------
    pl_sample = db.query(PickingList).filter(PickingList.id == "PL-DN-20261019-01").first()
    if not pl_sample:
        pl_sample = PickingList(
            id="PL-DN-20261019-01",
            client_request_id="REQ-PL-DN-01",
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status="in_progress",
            notes="Phiếu soạn hàng đợt 1 sáng 19/10 theo tuyến Kệ A -> B -> C",
            created_by=5,
        )
        db.add(pl_sample)
        db.flush()

        db.add(PickingListOrder(
            picking_list_id=pl_sample.id,
            order_id=order_5.id,
            order_code=order_5.code,
            original_status="APPROVED",
            active_order_key=order_5.id
        ))

        db.add(PickingListItem(
            picking_list_id=pl_sample.id,
            order_id=order_5.id,
            order_item_id=1,
            product_id=p_sab.id,
            sku=p_sab.sku,
            product_name=p_sab.name,
            unit=p_sab.unit,
            location_code="A-01-01",
            route_sequence=1,
            requested_quantity=10,
            picked_quantity=10,
            shortfall_quantity=0,
            status="picked"
        ))
        db.commit()

    # -------------------------------------------------------------------------
    # 9. GHI NHẬN CHỨNG TỪ POD MẪU CHO ĐƠN 3 ĐÃ GIAO (S6-08)
    # -------------------------------------------------------------------------
    delivery_3 = db.query(DispatchDelivery).filter(DispatchDelivery.dispatch_id == "PXK-20261019-0002").first()
    if not delivery_3:
        delivery_3 = DispatchDelivery(
            dispatch_id="PXK-20261019-0002",
            order_id=order_2.id,
            customer_id=c_maianh.id,
            customer_name=c_maianh.name,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status=DeliveryStatus.DELIVERED.value,
            receiver_name="Nguyễn Văn Đại Lý",
            receiver_phone="0983224556",
            delivered_at=datetime.now(timezone.utc),
            proof_image_path="uploads/delivery_proofs/bien_ban_ban_giao_da_ky.png",
            proof_image_url="/api/v1/dispatch-deliveries/proof-file/bien_ban_ban_giao_da_ky.png",
            returned_to_warehouse=False,
            confirmed_by=5,
            confirmed_by_name="Hoàng Văn Thủ Kho",
            notes="Đã kiểm đếm đầy đủ, ký nhận biên bản bàn giao có mộc đỏ đại lý"
        )
        db.add(delivery_3)
        db.commit()

    db.close()
    print("=" * 70)
    print(">>> HOÀN THÀNH KHỞI TẠO TOÀN BỘ DỮ LIỆU DEMO THUYẾT TRÌNH THÀNH CÔNG!")
    print(">>> SẴN SÀNG CHO BUỔI DEMO 6 CÔNG VIỆC CỦA [NHÂN VIÊN KHO] SPRINT 6, 7, 8!")
    print("=" * 70)


if __name__ == "__main__":
    seed_presentation_data()
