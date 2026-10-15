from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone
import hashlib
import json
import logging
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnStatus
from app.models.credit_note import CreditNote, CreditNoteItem, CreditNoteSequence
from app.schemas.credit_note import CreditNoteCreateRequest

logger = logging.getLogger(__name__)
TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")


def hook_sau_khi_lap_chung_tu_giam_no(db: Session, credit_note: CreditNote) -> None:
    """
    Hook mở rộng an toàn để Trang (S7-03 / S8-10) cắm logic cập nhật Sổ nợ & Hạn mức khả dụng.
    Khi Trang hoàn thiện Story S8-10, Trang chỉ cần bổ sung code vào hàm này.
    Nếu hàm phát sinh lỗi, khối try-except ở Service sẽ bắt lại để không làm đứt gãy transaction kế toán.
    """
    pass


class CreditNoteService:
    """
    Service quản lý toàn bộ nghiệp vụ Lập chứng từ điều chỉnh giảm trừ công nợ khi trả hàng (Story S8-02).
    Tuân thủ các tiêu chí chấp nhận (AC) và nguyên tắc nhóm trưởng:
    - AC-1: Sinh từ Phiếu trả hàng đã được Quản lý kho xác nhận (ReturnOrder.status == CONFIRMED).
    - AC-2: Giá trị giảm trừ tính đúng theo đơn giá, chiết khấu và thuế gốc từ ReturnOrderItem (không lấy bảng giá hiện tại).
    - AC-3: Cập nhật giảm trừ nợ còn lại trên hoá đơn gốc (Invoice.remaining_amount).
    - AC-4: Bảo toàn tính bất biến của hoá đơn gốc (tổng tiền, chiết khấu, VAT, dòng hàng nguyên vẹn).
    - Duy nhất: 1 ReturnOrder chỉ được lập đúng 1 CreditNote.
    - An toàn: Không can thiệp trực tiếp CustomerCreditProfile.current_debt, bàn giao hook an toàn cho Trang.
    - Bộ đếm số: CN-YYYY-XXXXXXX liên tục, không nhảy cóc trong transaction.
    - Bất biến: PUT/DELETE trả về HTTP 405 Method Not Allowed.
    - Idempotent: client_request_id chống gửi trùng lặp.
    """

    @staticmethod
    def _generate_credit_note_id(db: Session, now_vn: datetime) -> str:
        """Sinh mã chứng từ giảm nợ liên tục không nhảy cóc trong transaction: CN-YYYY-XXXXXXX."""
        period_key = str(now_vn.year)
        seq = db.query(CreditNoteSequence).filter(CreditNoteSequence.period_key == period_key).first()
        if not seq:
            seq = CreditNoteSequence(
                period_key=period_key,
                current_number=0,
                updated_at=datetime.now(timezone.utc),
            )
            db.add(seq)
            db.flush()

        seq.current_number += 1
        seq.updated_at = datetime.now(timezone.utc)
        db.flush()
        return f"CN-{period_key}-{seq.current_number:07d}"

    @classmethod
    def create_credit_note(
        cls,
        db: Session,
        payload: CreditNoteCreateRequest,
        current_user: User,
    ) -> CreditNote:
        """Lập chứng từ điều chỉnh giảm trừ công nợ khi trả hàng (Story S8-02)."""
        now_utc = datetime.now(timezone.utc)
        now_vn = datetime.now(TZ_VN)

        # 1. Phân quyền vai trò: Chỉ Kế toán (Accountant) hoặc Quản trị viên (Admin)
        user_role = current_user.role if hasattr(current_user, "role") else ""
        allowed_roles = {UserRole.ACCOUNTANT.value, UserRole.ADMIN.value, "Accountant", "Admin"}
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Kế toán (Accountant) hoặc Quản trị viên (Admin) mới có quyền lập chứng từ giảm nợ.",
            )

        # 2. Xử lý Idempotency bằng client_request_id
        payload_dict = {
            "return_order_id": payload.return_order_id,
            "notes": payload.notes,
        }
        payload_str = json.dumps(payload_dict, sort_keys=True)
        payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        if payload.client_request_id:
            existing_cn = (
                db.query(CreditNote)
                .filter(CreditNote.client_request_id == payload.client_request_id)
                .first()
            )
            if existing_cn:
                if existing_cn.payload_hash == payload_hash:
                    return existing_cn
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Yêu cầu với client_request_id '{payload.client_request_id}' "
                        f"đã tồn tại với nội dung khác."
                    ),
                )

        # 3. Kiểm tra phiếu trả hàng (ReturnOrder)
        return_order = (
            db.query(ReturnOrder)
            .filter(ReturnOrder.id == payload.return_order_id)
            .first()
        )
        if not return_order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiếu trả hàng '{payload.return_order_id}'.",
            )

        # AC-1: Bắt buộc phiếu trả hàng phải ở trạng thái CONFIRMED (Quản lý kho đã nhận hàng)
        if return_order.status != ReturnStatus.CONFIRMED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Phiếu trả hàng '{return_order.id}' đang ở trạng thái '{return_order.status}'. "
                    f"Chỉ phiếu đã được Quản lý kho xác nhận nhập kho (CONFIRMED) mới được lập chứng từ giảm nợ."
                ),
            )

        # Ràng buộc 1-1: Kiểm tra xem phiếu trả hàng này đã từng được lập Credit Note hay chưa
        existing_for_return = (
            db.query(CreditNote)
            .filter(CreditNote.return_order_id == return_order.id)
            .first()
        )
        if existing_for_return:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Phiếu trả hàng '{return_order.id}' đã được lập chứng từ giảm nợ "
                    f"với mã '{existing_for_return.id}'. Mỗi phiếu trả hàng chỉ được lập 1 chứng từ duy nhất."
                ),
            )

        # 4. Kiểm tra Hoá đơn gốc (Invoice)
        invoice = db.query(Invoice).filter(Invoice.id == return_order.invoice_id).first()
        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy hoá đơn gốc '{return_order.invoice_id}' của phiếu trả hàng.",
            )

        # 5. Tính toán giá trị giảm trừ từ các dòng ReturnOrderItem (AC-2)
        return_items = (
            db.query(ReturnOrderItem)
            .filter(ReturnOrderItem.return_id == return_order.id)
            .all()
        )
        if not return_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Phiếu trả hàng '{return_order.id}' không có dòng hàng nào hợp lệ.",
            )

        total_adjustment = return_order.total_returned_value
        if total_adjustment <= 0:
            total_adjustment = sum(item.subtotal for item in return_items)

        if total_adjustment <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tổng giá trị giảm trừ bằng 0, không thể lập chứng từ giảm nợ.",
            )

        # 6. Sinh mã chứng từ liên tục không nhảy cóc
        credit_note_id = cls._generate_credit_note_id(db, now_vn)
        adjustment_date = payload.adjustment_date or now_utc

        created_by_name = (
            getattr(current_user, "full_name", None)
            or getattr(current_user, "username", None)
            or str(current_user.id)
        )

        credit_note = CreditNote(
            id=credit_note_id,
            client_request_id=payload.client_request_id,
            return_order_id=return_order.id,
            invoice_id=invoice.id,
            customer_id=return_order.customer_id,
            customer_name=return_order.customer_name,
            adjustment_amount=total_adjustment,
            adjustment_date=adjustment_date,
            created_by=current_user.id,
            created_by_name=created_by_name,
            notes=payload.notes,
            payload_hash=payload_hash,
            created_at=now_utc,
            updated_at=now_utc,
        )
        db.add(credit_note)
        db.flush()

        # 7. Sao lưu chi tiết dòng hàng giảm nợ từ ReturnOrderItem
        for r_item in return_items:
            cn_item = CreditNoteItem(
                credit_note_id=credit_note.id,
                return_order_item_id=r_item.id,
                product_id=r_item.product_id,
                sku=r_item.sku,
                product_name=r_item.product_name,
                unit=r_item.unit,
                quantity=r_item.quantity,
                unit_price=r_item.unit_price,
                discount_amount=r_item.discount_amount,
                vat_amount=r_item.vat_amount,
                subtotal=r_item.subtotal,
            )
            db.add(cn_item)

        # 8. Cập nhật giảm trừ nợ trên Hoá đơn gốc (AC-3 & AC-4)
        # AC-4: Giữ nguyên vẹn total_amount, subtotal_amount, discount_amount, vat_amount, items
        # AC-3: Giảm remaining_amount và cập nhật trạng thái thanh toán của hoá đơn
        deduct_amount = min(invoice.remaining_amount, total_adjustment)
        invoice.remaining_amount -= deduct_amount

        if invoice.remaining_amount == 0:
            invoice.status = InvoiceStatus.PAID.value
        else:
            invoice.status = InvoiceStatus.PARTIALLY_PAID.value

        # 9. Gọi Hook an toàn cho Trang cập nhật Sổ nợ & Hạn mức (S7-03 / S8-10)
        try:
            hook_sau_khi_lap_chung_tu_giam_no(db=db, credit_note=credit_note)
        except Exception as e:
            logger.error(
                f"[Hook Trang] Ngoại lệ khi gọi hook giảm nợ cho chứng từ {credit_note.id}: {e}"
            )

        # 10. Commit transaction nguyên tử
        try:
            db.commit()
            db.refresh(credit_note)
        except IntegrityError as ie:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Lỗi xung đột dữ liệu khi lập chứng từ giảm nợ: {ie}",
            )

        return credit_note

    @classmethod
    def get_credit_note_by_id(
        cls,
        db: Session,
        credit_note_id: str,
        current_user: User,
    ) -> CreditNote:
        """Tra cứu chi tiết chứng từ giảm nợ, áp dụng phân quyền Customer Scope (anti-IDOR)."""
        credit_note = (
            db.query(CreditNote)
            .filter(CreditNote.id == credit_note_id)
            .first()
        )
        if not credit_note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chứng từ giảm nợ với mã '{credit_note_id}'.",
            )

        # Bảo vệ Customer Scope (chống IDOR)
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role == UserRole.CUSTOMER.value or user_role.lower() == "customer":
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            if credit_note.customer_id != assigned_cust_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền truy cập vào chứng từ giảm nợ của đại lý khác.",
                )

        return credit_note

    @classmethod
    def list_credit_notes(
        cls,
        db: Session,
        current_user: User,
        customer_id: Optional[str] = None,
        invoice_id: Optional[str] = None,
        return_order_id: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[CreditNote], int]:
        """Danh sách chứng từ giảm nợ có bộ lọc và phân quyền Customer Scope."""
        query = db.query(CreditNote)

        # Phân quyền Customer Scope
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role == UserRole.CUSTOMER.value or user_role.lower() == "customer":
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            query = query.filter(CreditNote.customer_id == assigned_cust_id)
        elif customer_id:
            query = query.filter(CreditNote.customer_id == customer_id)

        if invoice_id:
            query = query.filter(CreditNote.invoice_id == invoice_id)
        if return_order_id:
            query = query.filter(CreditNote.return_order_id == return_order_id)
        if from_date:
            query = query.filter(CreditNote.adjustment_date >= from_date)
        if to_date:
            query = query.filter(CreditNote.adjustment_date <= to_date)

        total = query.count()
        items = (
            query.order_by(CreditNote.adjustment_date.desc(), CreditNote.id.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        return items, total
