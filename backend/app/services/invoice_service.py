from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone, timedelta
import hashlib
import logging
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.order import Order, OrderItem
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, DispatchStatus
from app.models.invoice import Invoice, InvoiceItem, InvoiceSequence, InvoiceStatus
from app.schemas.invoice import (
    InvoiceCreateRequest,
    InvoicePrintTemplateResponse,
    InvoiceItemResponse,
)

logger = logging.getLogger(__name__)
TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")


def lay_so_luong_tinh_tien(dispatch_item: StockDispatchItem) -> int:
    """
    Xác định số lượng tính tiền của dòng hàng trên hóa đơn (AC-1 & S6-08).
    - Khi phiếu xuất đã ở trạng thái DELIVERED: Tính theo số lượng thực giao (delivered_quantity).
    - Khi phiếu xuất ở trạng thái CONFIRMED (tương thích trước khi giao nhận): Tính theo thực xuất (dispatched_quantity).
    """
    dispatch = getattr(dispatch_item, "dispatch", None)
    if dispatch and getattr(dispatch, "status", None) == "DELIVERED":
        delivered = getattr(dispatch_item, "delivered_quantity", None)
        if delivered is not None and delivered > 0:
            return int(delivered)
    return int(dispatch_item.dispatched_quantity)


def kiem_tra_dieu_kien_lap_hoa_don(dispatch: StockDispatch) -> bool:
    """
    Kiểm tra phiếu xuất có đủ điều kiện để lập hóa đơn hay không (S6-08 / SC-259 & S7-01).
    - Chuẩn S6-08: Kích hoạt khi phiếu xuất đã xác nhận giao thành công (DELIVERED).
    - Tương thích ngược: Cho phép CONFIRMED khi chưa kích hoạt giao nhận.
    - Nghiêm cấm phát hành hóa đơn khi giao thất bại (DELIVERY_FAILED) hoặc trạng thái không hợp lệ.
    """
    if not dispatch or not dispatch.status:
        return False
    if dispatch.status in ["DELIVERY_FAILED", "CANCELLED", "DRAFT", "PENDING"]:
        return False
    return dispatch.status in [DispatchStatus.CONFIRMED.value, "DELIVERED"]


def hook_sau_khi_lap_hoa_don(db: Session, invoice: Invoice):
    """
    Điểm cắm tích hợp (Extension Point) dành cho Trang (S7-03 / S7-04 / S8-10).
    Khi Trang hoàn thành module Sổ công nợ, Trang sẽ cắm hàm ghi sổ nợ vào đây.
    Tuyệt đối bọc try-except để nếu hàm của Trang phát sinh lỗi thì KHÔNG làm hỏng hóa đơn.
    """
    try:
        # Trang sẽ cắm: customer_debt_service.ghi_cong_no(...)
        pass
    except Exception as e:
        logger.error(f"[Hook Trang] Lỗi khi gọi ghi công nợ cho hóa đơn {invoice.id}: {e}")


class InvoiceService:
    """
    Service quản lý toàn bộ nghiệp vụ Hóa đơn bán hàng (Story S7-01).
    Đặc tả cốt lõi:
    - Tính tiền theo thực xuất / thực giao (AC-1).
    - Sinh mã hóa đơn liên tục không nhảy cóc qua bảng `invoice_sequences` trong transaction (AC-2).
    - Gộp nhiều phiếu xuất của cùng 1 đại lý (AC-3).
    - Tính bất biến: Không sửa, không xóa (AC-4).
    - Dữ liệu in ấn chuẩn hóa (AC-5).
    - Ràng buộc Unique trên dispatch_item_id: Mỗi dòng phiếu xuất chỉ xuất hóa đơn đúng 1 lần.
    - Idempotency với client_request_id.
    - Phân quyền theo UserRole và Customer Scope.
    """

    @staticmethod
    def _generate_invoice_id(db: Session, now_vn: datetime) -> str:
        """
        Sinh số hóa đơn theo dãy liên tục không nhảy cóc (AC-2):
        - Format: HD-{YYYY}-{SEQUENCE:07d} (Ví dụ: HD-2026-0000001).
        - Quản lý qua bảng `invoice_sequences` ngay trong transaction.
        - Nếu transaction bị rollback thì bộ đếm tự động rollback, không làm tiêu số.
        """
        period_key = str(now_vn.year)
        seq = db.query(InvoiceSequence).filter(InvoiceSequence.period_key == period_key).first()
        if not seq:
            seq = InvoiceSequence(
                period_key=period_key,
                current_number=1,
                updated_at=now_vn,
            )
            db.add(seq)
            db.flush()
            next_num = 1
        else:
            seq.current_number += 1
            seq.updated_at = now_vn
            db.flush()
            next_num = seq.current_number

        return f"HD-{period_key}-{next_num:07d}"

    @classmethod
    def create_invoice(
        cls,
        db: Session,
        payload: InvoiceCreateRequest,
        current_user: User,
    ) -> Invoice:
        """
        Phát hành Hóa đơn bán hàng từ danh sách phiếu xuất kho (AC-1, AC-3).
        """
        # Kiểm tra quyền: Chỉ Admin, Accountant, Sales Manager mới được lập hóa đơn
        allowed_roles = [
            UserRole.ADMIN.value,
            UserRole.ACCOUNTANT.value,
            UserRole.SALES_MANAGER.value,
            "ADMIN", "ACCOUNTANT", "SALES_MANAGER", "MANAGER"
        ]
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Kế toán (Accountant), Giám đốc kinh doanh hoặc Admin mới có quyền phát hành hóa đơn.",
            )

        now_vn = datetime.now(TZ_VN)
        clean_dispatch_ids = list(dict.fromkeys(d.strip() for d in payload.dispatch_ids if d and d.strip())) if payload.dispatch_ids else []
        if not clean_dispatch_ids:
            # Lập hóa đơn trực tiếp từ giao diện (không qua phiếu xuất kho)
            cust_id = payload.customer_id or "CUS-001"
            customer = db.query(Customer).filter(or_(Customer.id == cust_id, Customer.code == cust_id)).first()
            invoice_id = cls._generate_invoice_id(db, now_vn)
            invoice = Invoice(
                id=invoice_id,
                client_request_id=payload.client_request_id.strip() if payload.client_request_id else None,
                customer_id=cust_id,
                customer_name=payload.customer_name or (customer.name if customer else "Khách Hàng"),
                customer_address=payload.customer_address or (customer.address if customer else None),
                customer_tax_code=payload.customer_tax_code or getattr(customer, "tax_code", None),
                subtotal_amount=0,
                discount_amount=0,
                vat_amount=0,
                total_amount=0,
                paid_amount=0,
                remaining_amount=0,
                status=InvoiceStatus.UNPAID.value,
                issued_at=now_vn,
                due_date=now_vn + timedelta(days=30),
                issued_by=current_user.id,
                notes=payload.notes,
                payload_hash=None,
                created_at=now_vn,
                updated_at=now_vn,
            )
            db.add(invoice)
            db.flush()

            total_subtotal = 0
            total_discount = 0
            total_vat = 0
            total_amount = 0

            raw_items = payload.items or []
            for idx, itm in enumerate(raw_items, start=1):
                qty = getattr(itm, 'quantity', None) if hasattr(itm, 'quantity') else (itm.get('quantity') if isinstance(itm, dict) else 1)
                qty = qty or 1
                u_price = getattr(itm, 'unit_price', None) if hasattr(itm, 'unit_price') else (itm.get('unit_price') if isinstance(itm, dict) else 0)
                u_price = u_price or 0
                disc = getattr(itm, 'discount_amount', None) if hasattr(itm, 'discount_amount') else (itm.get('discount_amount') if isinstance(itm, dict) else 0)
                disc = disc or 0
                vat = getattr(itm, 'vat_amount', None) if hasattr(itm, 'vat_amount') else (itm.get('vat_amount') if isinstance(itm, dict) else 0)
                vat = vat or 0
                line_sub = (qty * u_price) - disc + vat

                total_subtotal += (qty * u_price)
                total_discount += disc
                total_vat += vat
                total_amount += line_sub

                p_id = getattr(itm, 'product_id', None) if hasattr(itm, 'product_id') else (itm.get('product_id') if isinstance(itm, dict) else None)
                p_sku = getattr(itm, 'sku', None) if hasattr(itm, 'sku') else (itm.get('sku') if isinstance(itm, dict) else None)
                p_name = getattr(itm, 'product_name', None) if hasattr(itm, 'product_name') else (itm.get('product_name') if isinstance(itm, dict) else None)
                p_unit = getattr(itm, 'unit', None) if hasattr(itm, 'unit') else (itm.get('unit') if isinstance(itm, dict) else None)

                inv_item = InvoiceItem(
                    invoice_id=invoice.id,
                    dispatch_id="DIRECT",
                    dispatch_item_id=int(f"{invoice.id.replace('HD-', '').replace('-', '')}{idx}"),
                    order_id="DIRECT",
                    product_id=str(p_id or f"PROD-{idx}"),
                    sku=str(p_sku or f"SKU-{idx}"),
                    product_name=p_name or "Sản phẩm",
                    unit=p_unit or "cái",
                    quantity=qty,
                    unit_price=int(u_price),
                    discount_amount=int(disc),
                    vat_amount=int(vat),
                    subtotal=int(line_sub),
                )
                db.add(inv_item)

            invoice.subtotal_amount = int(total_subtotal)
            invoice.discount_amount = int(total_discount)
            invoice.vat_amount = int(total_vat)
            invoice.total_amount = int(total_amount)
            invoice.remaining_amount = int(total_amount)
            db.commit()
            db.refresh(invoice)
            hook_sau_khi_lap_hoa_don(db, invoice)
            return invoice

        # 1. Kiểm tra Idempotency qua client_request_id (AC-7)
        payload_hash = hashlib.sha256(",".join(sorted(clean_dispatch_ids)).encode("utf-8")).hexdigest()
        if payload.client_request_id:
            clean_client_id = payload.client_request_id.strip()
            existing_invoice = db.query(Invoice).filter(Invoice.client_request_id == clean_client_id).first()
            if existing_invoice:
                if existing_invoice.payload_hash == payload_hash:
                    # Gửi lại cùng nội dung -> Trả bản cũ (Idempotent 200)
                    return existing_invoice
                else:
                    # Khác nội dung -> Báo lỗi 409 Conflict
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"Yêu cầu trùng lặp client_request_id='{clean_client_id}' "
                            f"nhưng nội dung danh sách phiếu xuất khác nhau."
                        ),
                    )

        # 2. Truy vấn và xác thực tính hợp lệ của danh sách phiếu xuất kho (AC-3)
        dispatches: List[StockDispatch] = []
        customer_ids = set()

        for d_id in clean_dispatch_ids:
            dsp = db.query(StockDispatch).filter(StockDispatch.id == d_id).first()
            if not dsp:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy phiếu xuất kho với mã '{d_id}'.",
                )

            if not kiem_tra_dieu_kien_lap_hoa_don(dsp):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Phiếu xuất kho '{d_id}' chưa đủ điều kiện lập hóa đơn (Trạng thái hiện tại: {dsp.status}).",
                )

            dispatches.append(dsp)
            customer_ids.add(dsp.customer_id)

        # Chặn gộp phiếu của các đại lý khác nhau
        if len(customer_ids) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể gộp các phiếu xuất của nhiều đại lý khác nhau vào cùng một hóa đơn (Các đại lý: {list(customer_ids)}).",
            )

        cust_id = list(customer_ids)[0]
        customer = db.query(Customer).filter(or_(Customer.id == cust_id, Customer.code == cust_id)).first()

        # 3. Kiểm tra ràng buộc duy nhất dispatch_item_id: Chống lập hóa đơn trùng lặp
        all_dispatch_items: List[StockDispatchItem] = []
        for dsp in dispatches:
            for itm in dsp.items:
                all_dispatch_items.append(itm)

        if not all_dispatch_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Các phiếu xuất kho được chọn không có dòng sản phẩm nào để lập hóa đơn.",
            )

        item_ids = [itm.id for itm in all_dispatch_items]
        already_invoiced_items = db.query(InvoiceItem).filter(InvoiceItem.dispatch_item_id.in_(item_ids)).all()
        if already_invoiced_items:
            dup_item = already_invoiced_items[0]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Dòng sản phẩm SKU '{dup_item.sku}' (ID #{dup_item.dispatch_item_id}) "
                    f"của phiếu xuất '{dup_item.dispatch_id}' đã được lập hóa đơn trước đó tại hóa đơn '{dup_item.invoice_id}'. "
                    "Không được phép xuất hóa đơn hai lần cho cùng một dòng phiếu xuất."
                ),
            )

        # 4. Xác định hạn thanh toán (due_date) theo hồ sơ hạn mức nợ của đại lý
        credit_prof = db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == cust_id).first()
        max_days = credit_prof.max_debt_days if credit_prof and credit_prof.max_debt_days else 30
        due_date = now_vn + timedelta(days=max_days)

        # 5. Sinh mã hóa đơn liên tục không nhảy cóc trong transaction (AC-2)
        invoice_id = cls._generate_invoice_id(db, now_vn)

        invoice = Invoice(
            id=invoice_id,
            client_request_id=payload.client_request_id.strip() if payload.client_request_id else None,
            customer_id=cust_id,
            customer_name=customer.name if customer else (dispatches[0].customer_name or "Đại lý"),
            customer_address=customer.address if customer else dispatches[0].customer_address,
            customer_tax_code=getattr(customer, "tax_code", None),
            subtotal_amount=0,
            discount_amount=0,
            vat_amount=0,
            total_amount=0,
            paid_amount=0,
            remaining_amount=0,
            status=InvoiceStatus.UNPAID.value,
            issued_at=now_vn,
            due_date=due_date,
            issued_by=current_user.id,
            notes=payload.notes,
            payload_hash=payload_hash,
            created_at=now_vn,
            updated_at=now_vn,
        )
        db.add(invoice)
        db.flush()

        # 6. Duyệt và tính tiền từng dòng hàng theo thực xuất (AC-1)
        total_subtotal = 0
        total_discount = 0
        total_vat = 0
        total_amount = 0

        for d_item in all_dispatch_items:
            # Tra cứu đơn hàng gốc để lấy đơn giá, chiết khấu và thuế
            order_item = db.query(OrderItem).filter(
                OrderItem.order_id == d_item.dispatch.order_id,
                or_(OrderItem.product_id == d_item.product_id, OrderItem.sku == d_item.sku)
            ).first()

            order_obj = db.query(Order).filter(Order.id == d_item.dispatch.order_id).first()

            # Lấy số lượng tính tiền qua hàm cô lập lay_so_luong_tinh_tien
            billed_qty = lay_so_luong_tinh_tien(d_item)
            unit_price = int(round(order_item.price if order_item and order_item.price else 0))

            # Tính chiết khấu dòng
            line_discount = 0
            if order_item:
                if getattr(order_item, "discount_amount", None):
                    line_discount = int(round(order_item.discount_amount * billed_qty / (order_item.quantity or 1)))
                elif getattr(order_item, "discount", None):
                    line_discount = int(round(order_item.discount * billed_qty / (order_item.quantity or 1)))

            line_subtotal_before_tax = max(0, (billed_qty * unit_price) - line_discount)

            # Tính phân bổ thuế VAT theo tỷ lệ đơn hàng (nếu có)
            line_vat = 0
            if order_obj and order_obj.tax and order_obj.subtotal and order_obj.subtotal > 0:
                vat_rate = float(order_obj.tax) / float(order_obj.subtotal)
                line_vat = int(round(line_subtotal_before_tax * vat_rate))

            line_subtotal = line_subtotal_before_tax + line_vat

            inv_item = InvoiceItem(
                invoice_id=invoice.id,
                dispatch_id=d_item.dispatch_id,
                dispatch_item_id=d_item.id,
                order_id=d_item.dispatch.order_id,
                product_id=d_item.product_id,
                sku=d_item.sku,
                product_name=d_item.product_name,
                unit=getattr(order_item, "unit", "cái") or "cái",
                quantity=billed_qty,
                unit_price=unit_price,
                discount_amount=line_discount,
                vat_amount=line_vat,
                subtotal=line_subtotal,
            )
            db.add(inv_item)

            total_subtotal += (billed_qty * unit_price)
            total_discount += line_discount
            total_vat += line_vat
            total_amount += line_subtotal

        # 7. Cập nhật số tiền tổng lên Hóa đơn
        invoice.subtotal_amount = total_subtotal
        invoice.discount_amount = total_discount
        invoice.vat_amount = total_vat
        invoice.total_amount = total_amount
        invoice.remaining_amount = total_amount
        invoice.paid_amount = 0

        # 8. Cam kết Transaction
        try:
            db.commit()
            db.refresh(invoice)
        except IntegrityError as ie:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Xung đột dữ liệu khi lập hóa đơn: {str(ie)}",
            )
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi hệ thống khi lập hóa đơn: {str(e)}",
            )

        # 9. Kích hoạt Hook an toàn cho Trang
        try:
            hook_sau_khi_lap_hoa_don(db, invoice)
        except Exception as e:
            logger.error(f"[Hook Trang] Lỗi khi gọi ghi công nợ cho hóa đơn {invoice.id}: {e}")

        return invoice

    @classmethod
    def get_invoice_by_id(
        cls,
        db: Session,
        invoice_id: str,
        current_user: User,
    ) -> Invoice:
        """Tra cứu chi tiết hóa đơn, áp dụng phân quyền Customer Scope."""
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy hóa đơn với mã '{invoice_id}'.",
            )

        # Bảo vệ Customer Scope (chống IDOR)
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role == UserRole.CUSTOMER.value or user_role.lower() == "customer":
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            if invoice.customer_id != assigned_cust_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền truy cập vào hóa đơn của đại lý khác.",
                )

        return invoice

    @classmethod
    def list_invoices(
        cls,
        db: Session,
        current_user: User,
        customer_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Invoice], int]:
        """Danh sách hóa đơn có bộ lọc và phân quyền Customer Scope."""
        query = db.query(Invoice)

        # Phân quyền Customer Scope
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role == UserRole.CUSTOMER.value or user_role.lower() == "customer":
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            query = query.filter(Invoice.customer_id == assigned_cust_id)
        elif customer_id:
            query = query.filter(Invoice.customer_id == customer_id)

        if status_filter:
            query = query.filter(Invoice.status == status_filter.upper())
        if from_date:
            query = query.filter(Invoice.issued_at >= from_date)
        if to_date:
            query = query.filter(Invoice.issued_at <= to_date)

        total = query.count()
        items = query.order_by(Invoice.issued_at.desc()).offset(skip).limit(limit).all()
        return items, total

    @classmethod
    def get_print_template(
        cls,
        db: Session,
        invoice_id: str,
        current_user: User,
    ) -> InvoicePrintTemplateResponse:
        """Xuất dữ liệu in ấn & PDF chuẩn hóa cho Story S7-09 của Thủy (AC-5)."""
        invoice = cls.get_invoice_by_id(db, invoice_id, current_user)

        # Chuyển đổi tiền sang chữ cơ bản
        total_words = f"{invoice.total_amount:,} đồng"

        issued_str = invoice.issued_at.strftime("%d/%m/%Y %H:%M")
        due_str = invoice.due_date.strftime("%d/%m/%Y")

        items_resp = [InvoiceItemResponse.model_validate(it) for it in invoice.items]

        creator = db.query(User).filter(User.id == invoice.issued_by).first()
        creator_name = (creator.full_name or creator.username) if creator else "Kế toán"

        return InvoicePrintTemplateResponse(
            invoice_id=invoice.id,
            company_name="HỆ THỐNG PHÂN PHỐI BÁN HÀNG & KHO VẬN SALES-WAREHOUSE",
            company_address="Tòa nhà Công nghệ ICT, Cầu Giấy, Hà Nội",
            company_tax_code="0101234567",
            customer_name=invoice.customer_name or "Đại lý",
            customer_address=invoice.customer_address,
            customer_tax_code=invoice.customer_tax_code,
            issued_date_str=issued_str,
            due_date_str=due_str,
            items=items_resp,
            subtotal_amount=invoice.subtotal_amount,
            discount_amount=invoice.discount_amount,
            vat_amount=invoice.vat_amount,
            total_amount=invoice.total_amount,
            total_amount_in_words=total_words,
            created_by_name=creator_name,
        )
