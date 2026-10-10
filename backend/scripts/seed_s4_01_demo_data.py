"""Script chuẩn hóa dữ liệu demo cho tính năng S4-01:
- Tạo Bảng giá chuẩn cho Nhóm Đại lý cấp 1 (TIER_1) và Cấp 2 (TIER_2) chứa các sản phẩm điện tử PRD-001, PRD-002, PRD-005, PRD-006.
- Giữ nguyên PRD-003 (MacBook Air) và PRD-004 ngoài bảng giá TIER_1 để test chặn đơn SCRUM-492.
- Tạo chính sách chiết khấu sản lượng theo số lượng (1-9 cái: 0%, 10-49 cái: 5%, 50+ cái: 10%).
"""
import sys
import os
from datetime import datetime, timedelta

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.price_list import PriceList, PriceListItem
from app.models.volume_discount import VolumeDiscountPolicy, VolumeDiscountTier
from app.models.product import Product
from app.models.customer import Customer

def run_seed():
    db = SessionLocal()
    try:
        print("--- Đang chuẩn bị dữ liệu Demo cho S4-01 ---")
        
        # 1. Tìm hoặc tạo bảng giá cho TIER_1
        pl_tier1 = db.query(PriceList).filter(
            PriceList.customer_group == "TIER_1",
            PriceList.status == "APPROVED",
            PriceList.name == "Bảng giá Đại lý Cấp 1 Chuẩn 2026"
        ).first()

        now = datetime.now()
        valid_to = now + timedelta(days=365)

        if not pl_tier1:
            pl_tier1 = PriceList(
                code="BG-TIER1-DEMO",
                name="Bảng giá Đại lý Cấp 1 Chuẩn 2026",
                customer_group="TIER_1",
                valid_from=now - timedelta(days=1),
                valid_to=valid_to,
                status="APPROVED",
                created_by_name="Admin"
            )
            db.add(pl_tier1)
            db.flush()

        # Cập nhật items cho bảng giá TIER_1
        # PRD-001 (iPhone 15 Pro 128GB): niêm yết 26.990.000 -> giá bán 24.500.000, giá sàn 23.000.000
        # PRD-002 (Samsung Galaxy S24 Ultra): niêm yết 29.990.000 -> giá bán 27.000.000, giá sàn 25.500.000
        # PRD-005 (Tai nghe Sony WH-1000XM5): niêm yết 7.990.000 -> giá bán 7.000.000, giá sàn 6.500.000
        # PRD-006 (AirPods Pro 2): niêm yết 5.690.000 -> giá bán 5.000.000, giá sàn 4.500.000
        demo_items_t1 = [
            ("PRD-001", "IP15P-128-TI", "iPhone 15 Pro 128GB Titan Tự Nhiên", "cái", 26990000.0, 24500000.0, 23000000.0),
            ("PRD-002", "SAM-S24U-512", "Samsung Galaxy S24 Ultra 512GB Gray", "cái", 29990000.0, 27000000.0, 25500000.0),
            ("PRD-005", "SN-WH1000XM5-BK", "Tai nghe Sony WH-1000XM5 Black", "cái", 7990000.0, 7000000.0, 6500000.0),
            ("PRD-006", "AP-PRO-2-USBC", "AirPods Pro 2 USB-C MagSafe Case", "hộp", 5690000.0, 5000000.0, 4500000.0),
        ]

        for prod_id, sku, name, unit, list_price, sale_price, floor_price in demo_items_t1:
            item = db.query(PriceListItem).filter(
                PriceListItem.price_list_id == pl_tier1.id,
                PriceListItem.product_id == prod_id
            ).first()
            if not item:
                item = PriceListItem(
                    price_list_id=pl_tier1.id,
                    product_id=prod_id,
                    product_sku=sku,
                    product_name=name,
                    unit=unit,
                    listed_price=list_price,
                    sale_price=sale_price,
                    floor_price=floor_price,
                    discount_percent=round((list_price - sale_price) / list_price * 100, 2),
                    status="APPROVED"
                )
                db.add(item)
            else:
                item.product_sku = sku
                item.sale_price = sale_price
                item.floor_price = floor_price
                item.status = "APPROVED"

        # 2. Bảng giá cho TIER_2
        pl_tier2 = db.query(PriceList).filter(
            PriceList.customer_group == "TIER_2",
            PriceList.status == "APPROVED",
            PriceList.name == "Bảng giá Đại lý Cấp 2 Chuẩn 2026"
        ).first()

        if not pl_tier2:
            pl_tier2 = PriceList(
                code="BG-TIER2-DEMO",
                name="Bảng giá Đại lý Cấp 2 Chuẩn 2026",
                customer_group="TIER_2",
                valid_from=now - timedelta(days=1),
                valid_to=valid_to,
                status="APPROVED",
                created_by_name="Admin"
            )
            db.add(pl_tier2)
            db.flush()

        demo_items_t2 = [
            ("PRD-001", "IP15P-128-TI", "iPhone 15 Pro 128GB Titan Tự Nhiên", "cái", 26990000.0, 25500000.0, 24000000.0),
            ("PRD-002", "SAM-S24U-512", "Samsung Galaxy S24 Ultra 512GB Gray", "cái", 29990000.0, 28000000.0, 26500000.0),
        ]

        for prod_id, sku, name, unit, list_price, sale_price, floor_price in demo_items_t2:
            item = db.query(PriceListItem).filter(
                PriceListItem.price_list_id == pl_tier2.id,
                PriceListItem.product_id == prod_id
            ).first()
            if not item:
                item = PriceListItem(
                    price_list_id=pl_tier2.id,
                    product_id=prod_id,
                    product_sku=sku,
                    product_name=name,
                    unit=unit,
                    listed_price=list_price,
                    sale_price=sale_price,
                    floor_price=floor_price,
                    discount_percent=round((list_price - sale_price) / list_price * 100, 2),
                    status="APPROVED"
                )
                db.add(item)
            else:
                item.product_sku = sku
                item.sale_price = sale_price
                item.floor_price = floor_price
        # 3. Bảng giá cho RETAIL (Khách bán lẻ)
        pl_retail = db.query(PriceList).filter(
            PriceList.customer_group == "RETAIL",
            PriceList.status == "APPROVED",
            PriceList.name == "Bảng giá Niêm yết Bán lẻ Chuẩn 2026"
        ).first()

        if not pl_retail:
            pl_retail = PriceList(
                code="BG-RETAIL-DEMO",
                name="Bảng giá Niêm yết Bán lẻ Chuẩn 2026",
                customer_group="RETAIL",
                valid_from=now - timedelta(days=1),
                valid_to=valid_to,
                status="APPROVED",
                created_by_name="Admin"
            )
            db.add(pl_retail)
            db.flush()

        demo_items_retail = [
            ("PRD-001", "IP15P-128-TI", "iPhone 15 Pro 128GB Titan Tự Nhiên", "cái", 26990000.0, 26990000.0, 25000000.0),
            ("PRD-002", "SAM-S24U-512", "Samsung Galaxy S24 Ultra 512GB Gray", "cái", 29990000.0, 29990000.0, 28000000.0),
            ("PRD-005", "SN-WH1000XM5-BK", "Tai nghe Sony WH-1000XM5 Black", "cái", 7990000.0, 7990000.0, 7000000.0),
            ("PRD-006", "AP-PRO-2-USBC", "AirPods Pro 2 USB-C MagSafe Case", "hộp", 5690000.0, 5690000.0, 5000000.0),
        ]

        for prod_id, sku, name, unit, list_price, sale_price, floor_price in demo_items_retail:
            item = db.query(PriceListItem).filter(
                PriceListItem.price_list_id == pl_retail.id,
                PriceListItem.product_id == prod_id
            ).first()
            if not item:
                item = PriceListItem(
                    price_list_id=pl_retail.id,
                    product_id=prod_id,
                    product_sku=sku,
                    product_name=name,
                    unit=unit,
                    listed_price=list_price,
                    sale_price=sale_price,
                    floor_price=floor_price,
                    discount_percent=0.0,
                    status="APPROVED"
                )
                db.add(item)
            else:
                item.product_sku = sku
                item.sale_price = sale_price
                item.floor_price = floor_price
                item.status = "APPROVED"

        # 4. Chính sách Chiết khấu sản lượng áp dụng toàn hệ thống
        vd_policy = db.query(VolumeDiscountPolicy).filter(
            VolumeDiscountPolicy.code == "CKSL-DEMO-2026"
        ).first()

        if not vd_policy:
            vd_policy = VolumeDiscountPolicy(
                code="CKSL-DEMO-2026",
                name="Chính sách Chiết khấu Sản lượng Bán buôn 2026",
                applied_scope="ALL_PRODUCTS",
                customer_group="ALL",
                valid_from=now - timedelta(days=1),
                valid_to=valid_to,
                is_active=True,
                created_by_name="Admin"
            )
            db.add(vd_policy)
            db.flush()

            tier1 = VolumeDiscountTier(policy_id=vd_policy.id, min_quantity=10, max_quantity=49, discount_value=5.0, discount_type="PERCENT")
            tier2 = VolumeDiscountTier(policy_id=vd_policy.id, min_quantity=50, max_quantity=None, discount_value=10.0, discount_type="PERCENT")
            db.add_all([tier1, tier2])
        else:
            vd_policy.applied_scope = "ALL_PRODUCTS"
            vd_policy.is_active = True
            vd_policy.valid_to = valid_to

        db.commit()
        print("✓ Khởi tạo dữ liệu Demo S4-01 thành công!")
        print(f"  - Bảng giá TIER_1: '{pl_tier1.name}' (ID: {pl_tier1.id})")
        print(f"  - Bảng giá TIER_2: '{pl_tier2.name}' (ID: {pl_tier2.id})")
        print(f"  - Chính sách CK Sản lượng: '{vd_policy.name}' (Code: {vd_policy.code})")

    except Exception as e:
        db.rollback()
        print(f"Lỗi khởi tạo: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
