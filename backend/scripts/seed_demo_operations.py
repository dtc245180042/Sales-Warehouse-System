"""Script khởi tạo trọn bộ dữ liệu demo nghiệp vụ liên kết (S1 - S8)
hoàn toàn dựa trên 14 SẢN PHẨM ĐIỆN TỬ & CÔNG NGHỆ CAO CẤP.
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
from app.core.database import SessionLocal, engine, Base
from app.models.product import Product
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
from app.models.payment import Payment, PaymentMethod
from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnStatus, ReturnReason
from app.models.credit_note import CreditNote
from app.models.sales_target import SalesTarget

def seed_demo_operations():
    db = SessionLocal()
    print("=" * 80)
    print(">>> KHỞI TẠO DỮ LIỆU DEMO CÔNG NGHỆ LIÊN KẾT TOÀN DIỆN (S1 - S8)")
    print("=" * 80)

    try:
        # Lấy danh sách sản phẩm điện tử đã có trong DB
        products = db.query(Product).all()
        p_map = {p.sku: p for p in products}
        print(f"-> Tìm thấy {len(p_map)} sản phẩm điện tử trong CSDL.")

        # 1. KHÁCH HÀNG & ĐẠI LÝ B2B
        real_dealers = [
            ("KH-1001", "Nguyễn Văn Nam", "0912345678", "nam.nguyen@congnghenamphuong.vn", "Số 45 Phố Hàng Bông, Quận Hoàn Kiếm, Hà Nội", "TIER_1", "0108923412", "Miền Bắc", "Kho Tổng Hà Nội", "WH-HANOI", "Lê Thị Nhân Viên Kinh Doanh", 200_000_000, 30, 45_000_000),
            ("KH-1002", "Trần Thị Mai Anh", "0983224556", "maianh.tran@techmaianh.vn", "Số 128 Đường Lê Duẩn, Quận Hải Châu, Đà Nẵng", "TIER_1", "0401889231", "Miền Trung", "Kho Đà Nẵng", "WH-DANANG", "Nguyễn Văn Giám Đốc Kinh Doanh", 250_000_000, 45, 120_000_000),
            ("KH-1003", "Lê Hoàng Long", "0908776889", "long.le@hoanglongdist.com", "Số 56 Đường Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh", "WHOLESALE", "0315778899", "Miền Nam", "Kho Tổng TP.HCM", "WH-HCM", "Lê Thị Nhân Viên Kinh Doanh", 400_000_000, 60, 85_000_000),
            ("KH-1004", "Phạm Minh Tuấn", "0907890123", "tuan.pham@tuantech.com", "Số 89 Đường Lạch Tray, Quận Ngô Quyền, Hải Phòng", "TIER_2", "0201994455", "Miền Bắc", "Kho Tổng Hà Nội", "WH-HANOI", "Lê Thị Nhân Viên Kinh Doanh", 150_000_000, 30, 65_000_000),
            ("KH-1005", "Đỗ Quỳnh Trang", "0934567890", "trang.do@quynhtrangretail.vn", "Số 15 Đại Lộ Hòa Bình, Quận Ninh Kiều, Cần Thơ", "TIER_2", "1801662233", "Miền Tây", "Kho Tổng TP.HCM", "WH-HCM", "Lê Thị Nhân Viên Kinh Doanh", 180_000_000, 45, 185_000_000),
            ("KH-1008", "Bùi Thanh Tùng", "0945667788", "tung.bui@tongkhotungthanh.vn", "Số 112 Đường Quang Trung, TP. Vinh, Tỉnh Nghệ An", "WHOLESALE", "2901445566", "Miền Trung", "Kho Đà Nẵng", "WH-DANANG", "Nguyễn Văn Giám Đốc Kinh Doanh", 350_000_000, 60, 110_000_000),
            ("KH-1009", "Công ty TNHH Đại Lý Tuấn Phương (B2B Partner)", "0905556677", "customer@warehouse.local", "Số 250 Đường Nguyễn Tri Phương, Quận Hải Châu, Đà Nẵng", "TIER_1", "0401998877", "Miền Trung", "Kho Đà Nẵng", "WH-DANANG", "Nguyễn Văn Giám Đốc Kinh Doanh", 300_000_000, 45, 68_000_000),
        ]

        cust_objs = {}
        for code, name, phone, email, addr, grp, tax, reg, wh_n, wh_c, rep, limit, days, debt in real_dealers:
            c = db.query(Customer).filter(Customer.code == code).first()
            if not c:
                c = Customer(
                    code=code,
                    name=name,
                    phone=phone,
                    email=email,
                    address=addr,
                    customer_group=grp,
                    tax_code=tax,
                    region=reg,
                    assigned_sales_rep=rep,
                    status="active"
                )
                db.add(c)
                db.flush()
            else:
                c.name = name
                c.phone = phone
                c.email = email
                c.address = addr
                c.customer_group = grp
                c.tax_code = tax
                c.region = reg
                c.assigned_sales_rep = rep
            cust_objs[code] = c

            # Warehouse profile
            cwp = db.query(CustomerWarehouseProfile).filter(CustomerWarehouseProfile.customer_id == str(c.id)).first()
            if not cwp:
                db.add(CustomerWarehouseProfile(customer_id=str(c.id), warehouse_name=wh_n, warehouse_code=wh_c, is_default=True))
            
            # Credit profile
            cp = db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == c.id).first()
            if not cp:
                db.add(CustomerCreditProfile(customer_id=c.id, credit_limit=limit, max_debt_days=days, current_debt=debt, updated_by="Hệ thống khởi tạo"))
            else:
                cp.credit_limit = limit
                cp.max_debt_days = days
                cp.current_debt = debt
        db.commit()
        print(f"-> Đã đồng bộ {len(cust_objs)} đại lý phân phối công nghệ B2B.")

        # 2. PHÂN BỔ TỒN KHO & LÔ HÀNG THEO CHUẨN FEFO
        today = date.today()
        # Xóa các lô hàng cũ
        db.query(ProductLot).delete()
        db.query(WarehouseStock).delete()
        db.commit()

        for sku, prod in p_map.items():
            # Tồn kho Hà Nội (60%), Đà Nẵng (40%)
            stk_hn = int(prod.stock * 0.6)
            stk_dn = prod.stock - stk_hn
            db.add(WarehouseStock(product_id=prod.id, sku=prod.sku, warehouse_id=1, warehouse="Kho Tổng Hà Nội", stock=stk_hn, physical_stock=stk_hn, min_stock=prod.min_stock))
            db.add(WarehouseStock(product_id=prod.id, sku=prod.sku, warehouse_id=2, warehouse="Kho Đà Nẵng", stock=stk_dn, physical_stock=stk_dn, min_stock=prod.min_stock))

            # Lô 1: Lô cận date (ĐỎ - còn 20 ngày)
            db.add(ProductLot(
                product_id=prod.id,
                warehouse_id=2,
                lot_number=f"LOT-2026-{sku[:5]}-RED",
                mfg_date=today - timedelta(days=345),
                exp_date=today + timedelta(days=20),
                initial_quantity=20,
                remaining_quantity=15
            ))
            # Lô 2: Lô vàng (còn 60 ngày)
            db.add(ProductLot(
                product_id=prod.id,
                warehouse_id=2,
                lot_number=f"LOT-2026-{sku[:5]}-YEL",
                mfg_date=today - timedelta(days=120),
                exp_date=today + timedelta(days=60),
                initial_quantity=30,
                remaining_quantity=25
            ))
            # Lô 3: Lô xanh an toàn (hạn 2 năm)
            db.add(ProductLot(
                product_id=prod.id,
                warehouse_id=1,
                lot_number=f"LOT-2026-{sku[:5]}-GRN",
                mfg_date=today - timedelta(days=10),
                exp_date=today + timedelta(days=700),
                initial_quantity=50,
                remaining_quantity=50
            ))
        db.commit()
        print(f"-> Đã tạo tồn kho 2 kho và {len(p_map) * 3} lô hàng điện tử FEFO 3 màu Đỏ - Vàng - Xanh.")

        # 3. SỔ THẺ KHO (STOCK LEDGER)
        db.query(StockLedgerEntry).delete()
        p_ip = p_map.get("IP15P-128-TI", list(p_map.values())[0])
        p_mb = p_map.get("MBA-M2-13-SL", list(p_map.values())[1])

        now_utc = datetime.now(timezone.utc)
        db.add_all([
            StockLedgerEntry(
                idempotency_key="IDEM-INIT-01",
                product_id=p_ip.id,
                sku=p_ip.sku,
                warehouse_id=2,
                movement_type="STOCK_IN",
                reference_code="PNK-APPLE-VN01",
                line_ref="LINE-1",
                quantity_base=50,
                previous_physical=0,
                new_physical=50,
                performer_id=5,
                note="Nhập kho chính hãng từ Apple VN Distributor",
                created_at=now_utc - timedelta(days=15)
            ),
            StockLedgerEntry(
                idempotency_key="IDEM-OUT-01",
                product_id=p_ip.id,
                sku=p_ip.sku,
                warehouse_id=2,
                movement_type="OUT_SALE",
                reference_code="PXK-20261019-0001",
                line_ref="LINE-2",
                quantity_base=10,
                previous_physical=50,
                new_physical=40,
                performer_id=5,
                note="Xuất bán đại lý Mai Anh Đà Nẵng",
                created_at=now_utc - timedelta(days=5)
            ),
            StockLedgerEntry(
                idempotency_key="IDEM-INIT-02",
                product_id=p_mb.id,
                sku=p_mb.sku,
                warehouse_id=2,
                movement_type="STOCK_IN",
                reference_code="PNK-APPLE-VN02",
                line_ref="LINE-1",
                quantity_base=30,
                previous_physical=0,
                new_physical=30,
                performer_id=5,
                note="Nhập kho lô MacBook Air M2",
                created_at=now_utc - timedelta(days=12)
            ),
            StockLedgerEntry(
                idempotency_key="IDEM-OUT-02",
                product_id=p_mb.id,
                sku=p_mb.sku,
                warehouse_id=2,
                movement_type="OUT_SALE",
                reference_code="PXK-20261019-0002",
                line_ref="LINE-2",
                quantity_base=5,
                previous_physical=30,
                new_physical=25,
                performer_id=5,
                note="Xuất bán đại lý Tuấn Phương",
                created_at=now_utc - timedelta(days=2)
            ),
        ])
        db.commit()
        print("-> Đã tạo dữ liệu Sổ thẻ kho ghi nhận biến động tồn kho chi tiết.")

        # 4. VỊ TRÍ KỆ (PICKING LOCATIONS)
        db.query(PickingLocation).delete()
        for idx, (sku, prod) in enumerate(p_map.items()):
            wh_id = 2 if idx % 2 == 0 else 1
            loc_code = f"A-01-0{idx+1}" if "IP" in sku or "SS" in sku else (f"B-02-0{idx+1}" if "MB" in sku or "DELL" in sku else f"C-03-0{idx+1}")
            db.add(PickingLocation(warehouse_id=wh_id, product_id=prod.id, location_code=loc_code, route_sequence=idx + 1))
        db.commit()
        print("-> Đã cấu hình tuyến đường nhặt hàng theo kệ A -> B -> C.")

        # 5. ĐƠN HÀNG MẪU (ORDERS) VỚI CÁC TRẠNG THÁI
        c_maianh = cust_objs["KH-1002"]
        c_daily = cust_objs["KH-1009"]
        c_tung = cust_objs["KH-1008"]
        c_nam = cust_objs["KH-1001"]

        # Xóa các đơn cũ
        db.query(OrderItem).delete()
        db.query(Order).delete()
        db.commit()

        # ĐƠN 1: DH-2026-0001 (APPROVED) - Sẵn sàng tạo phiếu soạn hàng
        p_sn = p_map.get("SN-WH1000XM5-BK", list(p_map.values())[2])
        p_logi = p_map.get("LOGI-MX-M3S", list(p_map.values())[3])
        tot1 = 5 * p_ip.price + 2 * p_mb.price + 5 * p_sn.price
        o1 = Order(
            id="ORD-2026-1001",
            code="DH-2026-0001",
            customer_id=c_maianh.id,
            customer_name=c_maianh.name,
            customer_phone=c_maianh.phone,
            customer_address=c_maianh.address,
            subtotal=tot1,
            discount=0,
            tax=0,
            total=tot1,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="APPROVED",
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Đơn hàng thiết bị Apple & Sony đã duyệt - Cần tạo phiếu soạn hàng tại Kho Đà Nẵng",
            source="internal",
            is_unassigned=False
        )
        db.add(o1)
        db.flush()
        db.add(OrderItem(order_id=o1.id, product_id=p_ip.id, sku=p_ip.sku, name=p_ip.name, price=p_ip.price, quantity=5, discount=0, subtotal=5 * p_ip.price, unit=p_ip.unit))
        db.add(OrderItem(order_id=o1.id, product_id=p_mb.id, sku=p_mb.sku, name=p_mb.name, price=p_mb.price, quantity=2, discount=0, subtotal=2 * p_mb.price, unit=p_mb.unit))
        db.add(OrderItem(order_id=o1.id, product_id=p_sn.id, sku=p_sn.sku, name=p_sn.name, price=p_sn.price, quantity=5, discount=0, subtotal=5 * p_sn.price, unit=p_sn.unit))

        # ĐƠN 2: DH-2026-0002 (shipping) - Đang giao xe tải
        tot2 = 10 * p_logi.price + 4 * p_sn.price
        o2 = Order(
            id="ORD-2026-1002",
            code="DH-2026-0002",
            customer_id=c_maianh.id,
            customer_name=c_maianh.name,
            customer_phone=c_maianh.phone,
            customer_address=c_maianh.address,
            subtotal=tot2,
            discount=0,
            tax=0,
            total=tot2,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="shipping",
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Xe tải 43C-128.99 đang trên đường giao thiết bị ngoại vi đến Lê Duẩn, Đà Nẵng",
            source="internal",
            is_unassigned=False
        )
        db.add(o2)
        db.flush()
        db.add(OrderItem(order_id=o2.id, product_id=p_logi.id, sku=p_logi.sku, name=p_logi.name, price=p_logi.price, quantity=10, discount=0, subtotal=10 * p_logi.price, unit=p_logi.unit))
        db.add(OrderItem(order_id=o2.id, product_id=p_sn.id, sku=p_sn.sku, name=p_sn.name, price=p_sn.price, quantity=4, discount=0, subtotal=4 * p_sn.price, unit=p_sn.unit))

        # ĐƠN 3: DH-2026-0003 (completed) - Đã giao thành công kèm ảnh POD
        p_dell = p_map.get("DELL-U2723QE", list(p_map.values())[4])
        p_key = p_map.get("KEY-Q1-PRO", list(p_map.values())[5])
        tot3 = 3 * p_dell.price + 5 * p_key.price
        o3 = Order(
            id="ORD-2026-1003",
            code="DH-2026-0003",
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            customer_phone=c_daily.phone,
            customer_address=c_daily.address,
            subtotal=tot3,
            discount=0,
            tax=0,
            total=tot3,
            paid_amount=tot3,
            change_amount=0,
            payment_method="transfer",
            payment_status="paid",
            status="completed",
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Đã ký nhận biên bản bàn giao thiết bị nguyên seal",
            source="internal",
            is_unassigned=False
        )
        db.add(o3)
        db.flush()
        db.add(OrderItem(order_id=o3.id, product_id=p_dell.id, sku=p_dell.sku, name=p_dell.name, price=p_dell.price, quantity=3, discount=0, subtotal=3 * p_dell.price, unit=p_dell.unit))
        db.add(OrderItem(order_id=o3.id, product_id=p_key.id, sku=p_key.sku, name=p_key.name, price=p_key.price, quantity=5, discount=0, subtotal=5 * p_key.price, unit=p_key.unit))

        # ĐƠN 4: DH-2026-0004 (PARTIAL_DISPATCHED) - Có nợ hàng Backorder
        tot4 = 6 * p_ip.price
        o4 = Order(
            id="ORD-2026-1004",
            code="DH-2026-0004",
            customer_id=c_tung.id,
            customer_name=c_tung.name,
            customer_phone=c_tung.phone,
            customer_address=c_tung.address,
            subtotal=tot4,
            discount=0,
            tax=0,
            total=tot4,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="PARTIAL_DISPATCHED",
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Đơn hàng đặt 6 chiếc iPhone 15 Pro, thực xuất 4 chiếc, nợ lại 2 chiếc (Backorder)",
            source="internal",
            is_unassigned=False
        )
        db.add(o4)
        db.flush()
        db.add(OrderItem(order_id=o4.id, product_id=p_ip.id, sku=p_ip.sku, name=p_ip.name, price=p_ip.price, quantity=6, discount=0, subtotal=tot4, unit=p_ip.unit))

        # ĐƠN 5: DH-2026-0005 (DRAFT / PACKING) - Cho thủ kho thao tác xuất kho
        tot5 = 3 * p_mb.price
        o5 = Order(
            id="ORD-2026-1005",
            code="DH-2026-0005",
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            customer_phone=c_daily.phone,
            customer_address=c_daily.address,
            subtotal=tot5,
            discount=0,
            tax=0,
            total=tot5,
            paid_amount=0,
            change_amount=0,
            payment_method="transfer",
            payment_status="unpaid",
            status="PACKING",
            staff_id="5",
            staff_name="Hoàng Văn Thủ Kho",
            note="Phiếu xuất kho DRAFT - Thủ kho bấm Xem chi tiết và Xác nhận xuất kho",
            source="internal",
            is_unassigned=False
        )
        db.add(o5)
        db.flush()
        db.add(OrderItem(order_id=o5.id, product_id=p_mb.id, sku=p_mb.sku, name=p_mb.name, price=p_mb.price, quantity=3, discount=0, subtotal=tot5, unit=p_mb.unit))

        db.commit()
        print("-> Đã tạo 5 đơn hàng điện tử mẫu với các trạng thái Chờ duyệt, Đã duyệt, Đang giao, Hoàn thành và Nợ hàng.")

        # 6. PHIẾU XUẤT KHO (DISPATCHES) & BIÊN BẢN GIAO HÀNG POD
        db.query(DispatchDelivery).delete()
        db.query(StockDispatchItem).delete()
        db.query(StockDispatch).delete()
        db.commit()

        # Phiếu 1: Xuất thiếu (Backorder)
        dsp1 = StockDispatch(
            id="PXK-20261019-0001",
            order_id=o4.id,
            customer_id=c_tung.id,
            customer_name=c_tung.name,
            customer_address=c_tung.address,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status=DispatchStatus.CONFIRMED.value,
            total_items=1,
            total_dispatched_quantity=4,
            is_partial=True,
            has_shortfall=True,
            dispatched_by=5,
            dispatched_at=now_utc - timedelta(days=2),
            notes="iPhone 15 Pro đặt 6 thực xuất 4, nợ lại 2 chiếc giao đợt tiếp theo"
        )
        db.add(dsp1)
        db.flush()
        db.add(StockDispatchItem(dispatch_id=dsp1.id, product_id=p_ip.id, sku=p_ip.sku, product_name=p_ip.name, ordered_quantity=6, dispatched_quantity=4, shortfall_quantity=2, delivered_quantity=0))

        # Phiếu 2: Đã giao có ảnh POD
        dsp2 = StockDispatch(
            id="PXK-20261019-0002",
            order_id=o3.id,
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            customer_address=c_daily.address,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status=DispatchStatus.CONFIRMED.value,
            total_items=2,
            total_dispatched_quantity=8,
            is_partial=False,
            has_shortfall=False,
            dispatched_by=5,
            dispatched_at=now_utc - timedelta(days=3),
            notes="Đã giao đầy đủ 3 Màn hình Dell và 5 Bàn phím cơ Keychron"
        )
        db.add(dsp2)
        db.flush()
        db.add(StockDispatchItem(dispatch_id=dsp2.id, product_id=p_dell.id, sku=p_dell.sku, product_name=p_dell.name, ordered_quantity=3, dispatched_quantity=3, shortfall_quantity=0, delivered_quantity=3))
        db.add(StockDispatchItem(dispatch_id=dsp2.id, product_id=p_key.id, sku=p_key.sku, product_name=p_key.name, ordered_quantity=5, dispatched_quantity=5, shortfall_quantity=0, delivered_quantity=5))

        # Ảnh POD
        db.add(DispatchDelivery(
            dispatch_id=dsp2.id,
            order_id=o3.id,
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status=DeliveryStatus.DELIVERED.value,
            receiver_name="Nguyễn Văn Đại Lý (Kỹ thuật trưởng)",
            receiver_phone="0905556677",
            delivered_at=now_utc - timedelta(days=2),
            proof_image_path="uploads/delivery_proofs/bien_ban_ban_giao_da_ky.png",
            proof_image_url="/api/v1/dispatch-deliveries/proof-file/bien_ban_ban_giao_da_ky.png",
            confirmed_by=5,
            confirmed_by_name="Hoàng Văn Thủ Kho",
            notes="Đã kiểm đếm đầy đủ 100% nguyên seal máy, tem bảo hành chính hãng hợp lệ"
        ))

        # Phiếu 3: DRAFT cho thủ kho bấm xuất
        dsp3 = StockDispatch(
            id="PXK-20261019-DRAFT",
            order_id=o5.id,
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            customer_address=c_daily.address,
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status="DRAFT",
            total_items=1,
            total_dispatched_quantity=3,
            is_partial=False,
            has_shortfall=False,
            dispatched_by=5,
            dispatched_at=now_utc - timedelta(hours=4),
            notes="Phiếu xuất kho DRAFT - Thủ kho bấm Xác nhận xuất kho"
        )
        db.add(dsp3)
        db.flush()
        db.add(StockDispatchItem(dispatch_id=dsp3.id, product_id=p_mb.id, sku=p_mb.sku, product_name=p_mb.name, ordered_quantity=3, dispatched_quantity=3, shortfall_quantity=0, delivered_quantity=0))
        db.commit()
        print("-> Đã tạo 3 Phiếu xuất kho điều phối (Dispatch) và Biên bản giao hàng có ảnh POD.")

        # 7. PHIẾU SOẠN HÀNG (PICKING LIST)
        db.query(PickingListItem).delete()
        db.query(PickingListOrder).delete()
        db.query(PickingList).delete()
        db.commit()

        pl = PickingList(
            id="PL-DN-20261019-01",
            client_request_id="REQ-PL-DN-01",
            warehouse_id=2,
            warehouse_name="Kho Đà Nẵng",
            status="in_progress",
            notes="Phiếu soạn hàng công nghệ đợt sáng tại Kho Đà Nẵng",
            created_by=5,
        )
        db.add(pl)
        db.flush()
        db.add(PickingListOrder(picking_list_id=pl.id, order_id=o1.id, order_code=o1.code, original_status="APPROVED", active_order_key=o1.id))
        db.add(PickingListItem(picking_list_id=pl.id, order_id=o1.id, order_item_id=1, product_id=p_ip.id, sku=p_ip.sku, product_name=p_ip.name, unit=p_ip.unit, location_code="A-01-01", route_sequence=1, requested_quantity=5, picked_quantity=5, shortfall_quantity=0, status="picked"))
        db.add(PickingListItem(picking_list_id=pl.id, order_id=o1.id, order_item_id=2, product_id=p_mb.id, sku=p_mb.sku, product_name=p_mb.name, unit=p_mb.unit, location_code="B-02-01", route_sequence=2, requested_quantity=2, picked_quantity=2, shortfall_quantity=0, status="picked"))
        db.commit()
        print("-> Đã tạo Phiếu soạn hàng (Picking List) sẵn sàng thao tác.")

        # 8. HÓA ĐƠN VAT & PHIẾU THU CÔNG NỢ
        db.query(CreditNote).delete()
        db.query(ReturnOrderItem).delete()
        db.query(ReturnOrder).delete()
        from app.models.payment import PaymentAllocation
        db.query(PaymentAllocation).delete()
        db.query(Payment).delete()
        db.query(InvoiceItem).delete()
        db.query(Invoice).delete()
        db.commit()

        inv1 = Invoice(
            id="HD-2026-0000001",
            client_request_id="REQ-INV-01",
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            customer_address=c_daily.address,
            customer_tax_code=c_daily.tax_code,
            subtotal_amount=int(tot3),
            discount_amount=0,
            vat_amount=int(tot3 * 0.1),
            total_amount=int(tot3 * 1.1),
            paid_amount=int(tot3 * 1.1),
            remaining_amount=0,
            status=InvoiceStatus.PAID.value,
            issued_at=now_utc - timedelta(days=3),
            due_date=now_utc + timedelta(days=30),
            issued_by=6, # accountant
            notes="Hóa đơn GTGT điện tử xuất cho Đại lý Tuấn Phương"
        )
        db.add(inv1)
        db.flush()
        db.add(InvoiceItem(invoice_id=inv1.id, dispatch_id=dsp2.id, dispatch_item_id=1, order_id=o3.id, product_id=p_dell.id, sku=p_dell.sku, product_name=p_dell.name, unit=p_dell.unit, quantity=3, unit_price=int(p_dell.price), subtotal=int(3 * p_dell.price * 1.1)))

        # Phiếu thu thanh toán đủ cho HD1
        pay1 = Payment(
            id="PT-2026-0000001",
            client_request_id="REQ-PAY-01",
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            amount=int(tot3 * 1.1),
            payment_method=PaymentMethod.BANK_TRANSFER.value,
            payment_date=now_utc - timedelta(days=2),
            collector_id=6,
            collector_name="Đỗ Thị Kế Toán Trưởng",
            reference_code="VCB-FT-9988223311",
            notes="Thanh toán chuyển khoản trọn gói đơn hàng Màn hình Dell & Phím Keychron"
        )
        db.add(pay1)
        db.flush()
        db.add(PaymentAllocation(
            payment_id=pay1.id,
            invoice_id=inv1.id,
            allocated_amount=int(tot3 * 1.1)
        ))

        # Hóa đơn 2 chưa thanh toán
        inv2 = Invoice(
            id="HD-2026-0000002",
            client_request_id="REQ-INV-02",
            customer_id=c_maianh.id,
            customer_name=c_maianh.name,
            customer_address=c_maianh.address,
            customer_tax_code=c_maianh.tax_code,
            subtotal_amount=int(tot2),
            discount_amount=0,
            vat_amount=int(tot2 * 0.1),
            total_amount=int(tot2 * 1.1),
            paid_amount=0,
            remaining_amount=int(tot2 * 1.1),
            status=InvoiceStatus.UNPAID.value,
            issued_at=now_utc - timedelta(days=1),
            due_date=now_utc + timedelta(days=25),
            issued_by=6,
            notes="Hóa đơn chờ đại lý Mai Anh thanh toán trong hạn mức 45 ngày"
        )
        db.add(inv2)
        db.commit()
        print("-> Đã tạo Hóa đơn VAT điện tử & Phiếu thu công nợ ngân hàng.")

        # 9. PHIẾU TRẢ HÀNG & CHỨNG TỪ GIẢM NỢ
        ret = ReturnOrder(
            id="TH-2026-0000001",
            client_request_id="REQ-RET-01",
            invoice_id=inv1.id,
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            origin_warehouse_id=2,
            return_reason=ReturnReason.DEFECTIVE_PRODUCT.value,
            status=ReturnStatus.CONFIRMED.value,
            total_returned_value=int(p_key.price * 1.1),
            requested_by=2, # sales_rep
            requested_by_name="Lê Thị Nhân Viên Kinh Doanh",
            confirmed_by=4, # wh_mgr
            confirmed_by_name="Phạm Văn Trưởng Kho",
            confirmed_at=now_utc - timedelta(days=1),
            notes="Khách trả lại 1 chiếc bàn phím cơ Keychron bị lỗi switch - Đã kiểm đếm hoàn nhập kho",
            created_at=now_utc - timedelta(days=2)
        )
        db.add(ret)
        db.flush()

        db.add(CreditNote(
            id="CN-2026-0000001",
            client_request_id="REQ-CN-01",
            return_order_id=ret.id,
            invoice_id=inv1.id,
            customer_id=c_daily.id,
            customer_name=c_daily.name,
            adjustment_amount=int(p_key.price * 1.1),
            created_by=6, # accountant
            created_by_name="Đỗ Thị Kế Toán Trưởng",
            notes="Chứng từ giảm nợ công nợ tự động tương ứng phiếu trả hàng TH-2026-0000001",
            created_at=now_utc - timedelta(days=1)
        ))
        db.commit()
        print("-> Đã tạo Phiếu trả hàng và Chứng từ giảm trừ công nợ (Credit Note).")

        try:
            from app.models.sales_target import SalesTarget
            SalesTarget.__table__.create(bind=engine, checkfirst=True)
            db.query(SalesTarget).delete()
            db.add(SalesTarget(employee_id="sales_rep", region_code="MIEN_BAC", month_year="2026-10", target_amount=1500000000.0, is_locked=False))
            db.add(SalesTarget(employee_id="sales_mgr", region_code="TOAN_QUOC", month_year="2026-10", target_amount=5000000000.0, is_locked=True))
            db.commit()
            print("-> Đã tạo chỉ tiêu doanh số KPI kinh doanh.")
        except Exception as e_st:
            print(f"Bỏ qua sales_target: {e_st}")

        print("=" * 80)
        print("🎉 TẤT CẢ DỮ LIỆU DEMO CÔNG NGHỆ CHO MỌI TRANG ĐÃ SẴN SÀNG 100%!")
        print("=" * 80)

    except Exception as e:
        db.rollback()
        print(f"❌ Lỗi: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_demo_operations()
