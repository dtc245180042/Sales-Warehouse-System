"""
Script khởi tạo DỮ LIỆU KẾ TOÁN THỰC TẾ cho toàn bộ hệ thống:
1. Hóa đơn bán hàng (Invoices) với phân bổ tuổi nợ đa dạng:
   - Nhóm 0–30 ngày (Trong hạn)
   - Nhóm 31–60 ngày (Bắt đầu trễ hạn)
   - Nhóm 61–90 ngày (Quá hạn cảnh báo)
   - Nhóm >90 ngày (Quá hạn rủi ro cao / nợ xấu)
2. Phiếu thu tiền (Payments) & Đối trừ công nợ (PaymentAllocations)
3. Phiếu trả hàng (ReturnOrders) & Chứng từ giảm nợ (CreditNotes)
4. Cập nhật số dư nợ hiện tại (current_debt) trong CustomerCreditProfile
"""
import sys
import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.auth import User
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.customer_debt_profile import CustomerDebtProfile
from app.models.product import Product
from app.models.invoice import Invoice, InvoiceItem, InvoiceSequence, InvoiceStatus
from app.models.payment import Payment, PaymentAllocation, PaymentSequence, PaymentMethod
from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnSequence, ReturnStatus, ReturnReason, ItemCondition
from app.models.credit_note import CreditNote, CreditNoteItem, CreditNoteSequence

TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")


def seed_real_accounting():
    db = SessionLocal()
    try:
        print("=" * 70)
        print(" BẮT ĐẦU KHỞI TẠO DỮ LIỆU KẾ TOÁN THỰC TẾ (HÓA ĐƠN, THU TIỀN, GIẢM NỢ, SỔ CÔNG NỢ)")
        print("=" * 70)

        # 1. Tìm tài khoản Kế toán
        accountant = db.query(User).filter(User.username == "accountant").first()
        if not accountant:
            accountant = db.query(User).filter(User.role.ilike("%accountant%")).first()
        acc_id = accountant.id if accountant else 1
        acc_name = accountant.full_name if accountant else "Đỗ Thị Kế Toán Trưởng"

        # 2. Lấy danh sách sản phẩm mẫu
        products = db.query(Product).all()
        if not products:
            print("LỖI: Chưa có sản phẩm trong CSDL!")
            return
        prod_map = {p.sku: p for p in products}
        p_ip15 = prod_map.get("IP15P-128-TI") or products[0]
        p_s24 = prod_map.get("SAM-S24U-512") or (products[1] if len(products) > 1 else products[0])
        p_mac = prod_map.get("MBA-M3-16-512") or (products[2] if len(products) > 2 else products[0])
        p_dell = prod_map.get("DELL-XPS13-PLUS") or (products[3] if len(products) > 3 else products[0])
        p_sony = prod_map.get("SN-WH1000XM5-BK") or (products[4] if len(products) > 4 else products[0])

        # 3. Lấy danh sách khách hàng
        customers = db.query(Customer).order_by(Customer.id.asc()).limit(15).all()
        if not customers:
            print("LỖI: Chưa có khách hàng trong CSDL!")
            return
        print(f"-> Tìm thấy {len(customers)} đại lý chính để phân bổ công nợ...")

        now_utc = datetime.now(timezone.utc)

        # 4. Xóa dữ liệu kế toán cũ nếu cần tạo mới đồng bộ
        db.query(CreditNoteItem).delete()
        db.query(CreditNote).delete()
        db.query(ReturnOrderItem).delete()
        db.query(ReturnOrder).delete()
        db.query(PaymentAllocation).delete()
        db.query(Payment).delete()
        db.query(InvoiceItem).delete()
        db.query(Invoice).delete()
        db.commit()
        print("-> Đã làm sạch các chứng từ kế toán cũ để nạp bộ dữ liệu thực tế chuẩn.")

        # Cấu hình các kịch bản hóa đơn và tuổi nợ thực tế
        # (Số ngày trước so với hiện tại, thời hạn nợ ngày, sản phẩm, số lượng, số tiền đã trả)
        scenarios = [
            # CUS-001 (Nguyễn Quốc Cường)
            (0, 10, 30, [(p_ip15, 2)], 20000000, "Lô 02 iPhone 15 Pro titan cho dự án bán lẻ"),     # Tuổi 10 ngày -> 0-30d, trong hạn
            (0, 42, 30, [(p_s24, 3)], 0, "Lô 03 Galaxy S24 Ultra phục vụ khách đặt trước"),          # Tuổi 42 ngày -> 31-60d, QUÁ HẠN 12 ngày!

            # CUS-002 (Trần Mai Phương)
            (1, 18, 30, [(p_mac, 2)], 0, "Lô 02 MacBook Air M3 cho khối văn phòng"),                 # Tuổi 18 ngày -> 0-30d, trong hạn
            (1, 72, 30, [(p_dell, 1)], 0, "Lô 01 Dell XPS 13 Plus bản OLED"),                         # Tuổi 72 ngày -> 61-90d, QUÁ HẠN 42 ngày!

            # CUS-003 (Công Ty Cổ Phần Công Nghệ F-Soft)
            (2, 105, 30, [(p_dell, 4)], 0, "Hợp đồng trang bị laptop đồ họa cho trung tâm phần mềm"), # Tuổi 105 ngày -> >90d, QUÁ HẠN 75 ngày!
            (2, 12, 30, [(p_ip15, 3)], None, "Đơn xuất bổ sung điện thoại quản lý"),                   # Tuổi 12 ngày -> 0-30d, THANH TOÁN ĐỦ (PAID)

            # CUS-004 (Đại Lý Thiết Bị Số Tuấn Phương)
            (3, 48, 30, [(p_s24, 4)], 50000000, "Đại lý Tuấn Phương nhập máy đón mùa cao điểm"),     # Tuổi 48 ngày -> 31-60d, QUÁ HẠN 18 ngày!

            # CUS-005 (Chuỗi Bán Lẻ TechZone Miền Trung)
            (4, 82, 30, [(p_mac, 3)], 0, "Lô MacBook phục vụ chuỗi cửa hàng Đà Nẵng"),               # Tuổi 82 ngày -> 61-90d, QUÁ HẠN 52 ngày!
            (4, 7, 30, [(p_sony, 4)], 0, "Lô tai nghe chống ồn Sony cho gian hàng triển lãm"),        # Tuổi 7 ngày -> 0-30d, trong hạn

            # CUS-006 (Đại Lý Điện Máy Nam Sài Gòn)
            (5, 98, 30, [(p_dell, 3), (p_s24, 2)], 0, "Hợp đồng nguyên tắc cung cấp thiết bị Q3"),   # Tuổi 98 ngày -> >90d, QUÁ HẠN 68 ngày!

            # CUS-007 (Công Ty TNHH Thương Mại Công Nghệ Việt)
            (6, 15, 30, [(p_ip15, 1), (p_mac, 1)], None, "Đơn hàng thanh toán ngay khi xuất kho"),    # Tuổi 15 ngày -> PAID (đã trả đủ)
            (6, 35, 30, [(p_sony, 2)], 0, "Lô tai nghe giao đại lý quận Cầu Giấy"),                  # Tuổi 35 ngày -> 31-60d, QUÁ HẠN 5 ngày!

            # CUS-008
            (7, 25, 30, [(p_s24, 1), (p_dell, 1)], 0, "Đơn xuất kho đại lý chi nhánh Hải Phòng"),     # Tuổi 25 ngày -> 0-30d, trong hạn

            # CUS-009
            (8, 65, 30, [(p_mac, 2)], 0, "Đơn hàng công nợ tháng trước chưa quyết toán"),             # Tuổi 65 ngày -> 61-90d, QUÁ HẠN 35 ngày!

            # CUS-010
            (9, 120, 30, [(p_ip15, 5)], 0, "Hợp đồng nợ tồn đọng cuối quý trước"),                    # Tuổi 120 ngày -> >90d, QUÁ HẠN 90 ngày!
        ]

        created_invoices = []
        inv_item_counter = 1
        inv_seq_num = 1

        print("-> Đang tạo danh sách Hóa Đơn Bán Hàng (Invoices)...")
        for cust_idx, days_ago, credit_days, items_spec, paid_spec, notes in scenarios:
            if cust_idx >= len(customers):
                continue
            cust = customers[cust_idx]

            issued_at = now_utc - timedelta(days=days_ago)
            due_date = issued_at + timedelta(days=credit_days)
            inv_id = f"HD-2026-{inv_seq_num:07d}"
            inv_seq_num += 1

            # Tính toán tiền hàng
            subtotal_amount = 0
            inv_items = []
            for prod, qty in items_spec:
                unit_price = int(prod.price)
                line_subtotal = unit_price * qty
                subtotal_amount += line_subtotal

                inv_item = InvoiceItem(
                    id=inv_item_counter,
                    invoice_id=inv_id,
                    dispatch_id=f"PXK-2026-{inv_seq_num:07d}",
                    dispatch_item_id=inv_item_counter,
                    order_id=f"ORD-2026-{inv_seq_num:07d}",
                    product_id=prod.id,
                    sku=prod.sku,
                    product_name=prod.name,
                    unit=prod.unit or "Chiếc",
                    quantity=qty,
                    unit_price=unit_price,
                    discount_amount=0,
                    vat_amount=0,
                    subtotal=line_subtotal,
                )
                inv_items.append(inv_item)
                inv_item_counter += 1

            total_amount = subtotal_amount
            if paid_spec is None:
                # Đã thanh toán 100%
                paid_amount = total_amount
                status = InvoiceStatus.PAID.value
            elif paid_spec > 0:
                paid_amount = min(paid_spec, total_amount)
                status = InvoiceStatus.PARTIALLY_PAID.value
            else:
                paid_amount = 0
                status = InvoiceStatus.UNPAID.value

            remaining_amount = total_amount - paid_amount

            inv = Invoice(
                id=inv_id,
                client_request_id=f"REQ-INV-{inv_id}",
                customer_id=cust.id,
                customer_name=cust.name,
                customer_address=cust.address,
                customer_tax_code=cust.tax_code or f"01099{cust_idx:05d}",
                subtotal_amount=subtotal_amount,
                discount_amount=0,
                vat_amount=0,
                total_amount=total_amount,
                paid_amount=paid_amount,
                remaining_amount=remaining_amount,
                status=status,
                issued_at=issued_at,
                due_date=due_date,
                issued_by=acc_id,
                notes=notes,
                created_at=issued_at,
                updated_at=issued_at,
            )
            db.add(inv)
            for itm in inv_items:
                db.add(itm)
            created_invoices.append(inv)

        # Cập nhật sequence
        inv_seq = InvoiceSequence(period_key="2026", current_number=inv_seq_num - 1, updated_at=now_utc)
        db.merge(inv_seq)
        db.commit()
        print(f"-> Đã tạo thành công {len(created_invoices)} Hóa đơn bán hàng thực tế.")

        # 5. Tạo Phiếu Thu Tiền (Payments & PaymentAllocations)
        print("-> Đang tạo Phiếu Thu Tiền & Ghi nhận đối trừ thanh toán...")
        payment_seq_num = 1
        alloc_id_counter = 1

        for inv in created_invoices:
            if inv.paid_amount > 0:
                pt_id = f"PT-2026-{payment_seq_num:07d}"
                payment_seq_num += 1
                payment_date = inv.issued_at + timedelta(days=2)

                pm = Payment(
                    id=pt_id,
                    client_request_id=f"REQ-PM-{pt_id}",
                    customer_id=inv.customer_id,
                    customer_name=inv.customer_name,
                    amount=inv.paid_amount,
                    payment_method=PaymentMethod.BANK_TRANSFER.value if inv.paid_amount > 30000000 else PaymentMethod.CASH.value,
                    payment_date=payment_date,
                    collector_id=acc_id,
                    collector_name=acc_name,
                    reference_code=f"VCB-{pt_id}-BANKREF",
                    notes=f"Thu tiền thanh toán cho hóa đơn {inv.id}",
                    created_at=payment_date,
                    updated_at=payment_date,
                )
                db.add(pm)

                alloc = PaymentAllocation(
                    id=alloc_id_counter,
                    payment_id=pt_id,
                    invoice_id=inv.id,
                    allocated_amount=inv.paid_amount,
                    created_at=payment_date,
                )
                db.add(alloc)
                alloc_id_counter += 1

        pm_seq = PaymentSequence(period_key="2026", current_number=payment_seq_num - 1, updated_at=now_utc)
        db.merge(pm_seq)
        db.commit()
        print(f"-> Đã tạo thành công {payment_seq_num - 1} Phiếu thu tiền đối trừ vào hóa đơn.")

        # 6. Tạo Phiếu Trả Hàng (ReturnOrders) & Chứng Từ Giảm Nợ (CreditNotes)
        # Giúp màn hình /credit-notes và /returns có đầy đủ dữ liệu kế toán thật!
        print("-> Đang tạo Phiếu Trả Hàng & Chứng Từ Giảm Nợ (Credit Notes)...")
        ret_seq_num = 1
        cn_seq_num = 1
        cn_item_counter = 1
        ret_item_counter = 1

        # Tạo 3 chứng từ giảm nợ thực tế
        credit_scenarios = [
            (created_invoices[0], p_ip15, 1, ReturnReason.DEFECTIVE_PRODUCT.value, "Lỗi màn hình OLED sọc xanh nhà sản xuất"),
            (created_invoices[2], p_mac, 1, ReturnReason.DAMAGED_IN_TRANSIT.value, "Cấn móp góc máy trong quá trình vận chuyển giao hàng"),
            (created_invoices[8], p_sony, 1, ReturnReason.WRONG_DELIVERY.value, "Giao nhầm mã màu phiên bản đặc biệt"),
        ]

        for inv, prod, qty, reason, note_desc in credit_scenarios:
            ret_id = f"TH-2026-{ret_seq_num:07d}"
            cn_id = f"CN-2026-{cn_seq_num:07d}"
            ret_seq_num += 1
            cn_seq_num += 1

            ret_date = inv.issued_at + timedelta(days=4)
            unit_val = int(prod.price)
            ret_val = unit_val * qty

            # Phiếu trả hàng đã duyệt nhận vào kho (CONFIRMED)
            ro = ReturnOrder(
                id=ret_id,
                client_request_id=f"REQ-RO-{ret_id}",
                invoice_id=inv.id,
                customer_id=inv.customer_id,
                customer_name=inv.customer_name,
                status=ReturnStatus.CONFIRMED.value,
                return_reason=reason,
                notes=note_desc,
                origin_warehouse_id=1,
                requested_by=acc_id,
                requested_by_name=acc_name,
                requested_at=ret_date,
                confirmed_by=1,
                confirmed_by_name="Hoàng Văn Thủ Kho",
                confirmed_at=ret_date + timedelta(hours=2),
                total_returned_value=ret_val,
                created_at=ret_date,
                updated_at=ret_date,
            )
            db.add(ro)

            first_inv_item = inv.items[0] if inv.items else None
            first_inv_item_id = first_inv_item.id if first_inv_item else 1

            roi = ReturnOrderItem(
                id=ret_item_counter,
                return_id=ret_id,
                invoice_item_id=first_inv_item_id,
                product_id=prod.id,
                sku=prod.sku,
                product_name=prod.name,
                unit=prod.unit or "Chiếc",
                quantity=qty,
                condition=ItemCondition.DAMAGED.value if reason == ReturnReason.DEFECTIVE_PRODUCT.value else ItemCondition.GOOD.value,
                lot_id=None,
                lot_number=None,
                unit_price=unit_val,
                discount_amount=0,
                vat_amount=0,
                subtotal=ret_val,
            )
            db.add(roi)
            ret_item_counter += 1

            # Chứng từ giảm nợ (Credit Note)
            cn = CreditNote(
                id=cn_id,
                client_request_id=f"REQ-CN-{cn_id}",
                return_order_id=ret_id,
                invoice_id=inv.id,
                customer_id=inv.customer_id,
                customer_name=inv.customer_name,
                adjustment_amount=ret_val,
                adjustment_date=ret_date + timedelta(hours=3),
                created_by=acc_id,
                created_by_name=acc_name,
                notes=f"Chứng từ điều chỉnh giảm trừ công nợ khi trả hàng theo phiếu {ret_id}. {note_desc}",
                created_at=ret_date + timedelta(hours=3),
                updated_at=ret_date + timedelta(hours=3),
            )
            db.add(cn)

            cni = CreditNoteItem(
                id=cn_item_counter,
                credit_note_id=cn_id,
                return_order_item_id=roi.id,
                product_id=prod.id,
                sku=prod.sku,
                product_name=prod.name,
                unit=prod.unit or "Chiếc",
                quantity=qty,
                unit_price=unit_val,
                discount_amount=0,
                vat_amount=0,
                subtotal=ret_val,
            )
            db.add(cni)
            cn_item_counter += 1

        # Tạo thêm 2 phiếu trả hàng đã duyệt nhận kho (CONFIRMED) nhưng CHƯA lập Credit Note
        # để người dùng có thể bấm nút "+ Lập chứng từ giảm nợ" và chọn ngay trên giao diện
        pending_returns = [
            (created_invoices[3], p_s24, 1, ReturnReason.DEFECTIVE_PRODUCT.value, "Đại lý báo thiết bị lỗi nguồn khi đập hộp, kho đã kiểm nhận và nhập lại kho"),
            (created_invoices[4], p_sony, 2, ReturnReason.WRONG_DELIVERY.value, "Giao nhầm phiên bản màu tai nghe, kho đã nhận trả nhập lại"),
        ]
        for inv, prod, qty, reason, note_desc in pending_returns:
            ret_id = f"TH-2026-{ret_seq_num:07d}"
            ret_seq_num += 1
            ret_date = inv.issued_at + timedelta(days=5)
            unit_val = int(prod.price)
            ret_val = unit_val * qty

            ro = ReturnOrder(
                id=ret_id,
                client_request_id=f"REQ-RO-{ret_id}",
                invoice_id=inv.id,
                customer_id=inv.customer_id,
                customer_name=inv.customer_name,
                status=ReturnStatus.CONFIRMED.value,
                return_reason=reason,
                notes=note_desc,
                origin_warehouse_id=1,
                requested_by=acc_id,
                requested_by_name=acc_name,
                requested_at=ret_date,
                confirmed_by=1,
                confirmed_by_name="Hoàng Văn Thủ Kho",
                confirmed_at=ret_date + timedelta(hours=2),
                total_returned_value=ret_val,
                created_at=ret_date,
                updated_at=ret_date,
            )
            db.add(ro)

            first_inv_item = inv.items[0] if inv.items else None
            first_inv_item_id = first_inv_item.id if first_inv_item else 1

            roi = ReturnOrderItem(
                id=ret_item_counter,
                return_id=ret_id,
                invoice_item_id=first_inv_item_id,
                product_id=prod.id,
                sku=prod.sku,
                product_name=prod.name,
                unit=prod.unit or "Chiếc",
                quantity=qty,
                condition=ItemCondition.DAMAGED.value if reason == ReturnReason.DEFECTIVE_PRODUCT.value else ItemCondition.GOOD.value,
                lot_id=None,
                lot_number=None,
                unit_price=unit_val,
                discount_amount=0,
                vat_amount=0,
                subtotal=ret_val,
            )
            db.add(roi)
            ret_item_counter += 1

        db.merge(ReturnSequence(period_key="2026", current_number=ret_seq_num - 1, updated_at=now_utc))
        db.merge(CreditNoteSequence(period_key="2026", current_number=cn_seq_num - 1, updated_at=now_utc))
        db.commit()
        print(f"-> Đã tạo thành công {cn_seq_num - 1} Chứng từ giảm nợ và 2 Phiếu trả hàng sẵn sàng khấu trừ.")

        # 7. Cập nhật số dư nợ hiện tại (current_debt) trong CustomerCreditProfile và CustomerDebtProfile
        print("-> Đang đồng bộ số dư nợ thực tế (current_debt) vào hồ sơ tín dụng đại lý...")
        all_cust_ids = [c.id for c in customers]
        for cid in all_cust_ids:
            cust_invs = db.query(Invoice).filter(Invoice.customer_id == cid).all()
            total_debt_calc = sum(i.remaining_amount for i in cust_invs)

            cp = db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == cid).first()
            if cp:
                cp.current_debt = total_debt_calc
                cp.updated_at = now_utc

            dp = db.query(CustomerDebtProfile).filter(CustomerDebtProfile.customer_id == cid).first()
            if dp:
                dp.current_debt = float(total_debt_calc)
                dp.updated_at = now_utc

        db.commit()
        print("-> Hoàn tất cập nhật số dư công nợ cho toàn bộ đại lý!")
        print("=" * 70)
        print(" KHỞI TẠO DỮ LIỆU KẾ TOÁN THÀNH CÔNG VĨ ĐẠI!")
        print("=" * 70)

    except Exception as e:
        db.rollback()
        print(f"LỖI KHI SEED DỮ LIỆU: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    seed_real_accounting()
