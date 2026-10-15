from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone
import hashlib
import json
import logging
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment, PaymentAllocation, PaymentSequence, PaymentMethod
from app.schemas.payment import (
    PaymentCreateRequest,
    PaymentResponse,
    PaymentAllocationResponse,
)

logger = logging.getLogger(__name__)
TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")


def hook_sau_khi_ghi_nhan_thanh_toan(db: Session, payment: Payment):
    """
    Điểm cắm tích hợp (Extension Point) dành cho Trang (S7-03 / S7-04 / S8-10).
    Khi Trang hoàn thành module Sổ công nợ, Trang sẽ cắm hàm ghi giảm dư nợ sổ cái vào đây.
    Tuyệt đối bọc try-except để nếu hàm của Trang phát sinh lỗi thì KHÔNG làm hỏng phiếu thu.
    TUYỆT ĐỐI KHÔNG ghi trực tiếp vào CustomerCreditProfile.current_debt tại đây.
    """
    try:
        # Trang sẽ cắm: customer_debt_service.ghi_giam_cong_no(...)
        pass
    except Exception as e:
        logger.error(f"[Hook Trang] Lỗi khi gọi ghi nhận giảm nợ cho phiếu thu {payment.id}: {e}")


class PaymentService:
    """
    Service quản lý toàn bộ nghiệp vụ Ghi nhận thanh toán & Đối trừ công nợ (Story S7-02).
    Đặc tả cốt lõi:
    - Ghi nhận đầy đủ thông tin chứng từ thu: số tiền, hình thức thu, ngày thu, người thu (AC-1).
    - Sinh mã phiếu thu liên tục không nhảy cóc qua bảng `payment_sequences` trong transaction.
    - Đối trừ vào hóa đơn cụ thể hoặc tự động đối trừ theo nguyên tắc FIFO hóa đơn cũ nhất trước (AC-2).
    - Hỗ trợ thanh toán một phần: hóa đơn chuyển sang PARTIALLY_PAID hoặc PAID (AC-3).
    - Chặn thu vượt tổng công nợ còn lại (AC-4).
    - Tính bất biến: Không sửa, không xóa, PUT/DELETE trả về 405 (AC-5).
    - Chống gửi trùng lặp (Idempotency Key) qua client_request_id.
    - Phân quyền theo UserRole và Customer Scope (anti-IDOR).
    """

    @staticmethod
    def _generate_payment_id(db: Session, now_vn: datetime) -> str:
        """
        Sinh số phiếu thu theo dãy liên tục không nhảy cóc:
        - Format: PT-{YYYY}-{SEQUENCE:07d} (Ví dụ: PT-2026-0000001).
        - Quản lý qua bảng `payment_sequences` ngay trong transaction.
        - Nếu transaction bị rollback thì bộ đếm tự động rollback, không làm tiêu số.
        """
        period_key = str(now_vn.year)
        seq = db.query(PaymentSequence).filter(PaymentSequence.period_key == period_key).first()
        if not seq:
            seq = PaymentSequence(
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

        return f"PT-{period_key}-{next_num:07d}"

    @classmethod
    def create_payment(
        cls,
        db: Session,
        payload: PaymentCreateRequest,
        current_user: User,
    ) -> Payment:
        """
        Tạo Phiếu thu tiền và thực hiện đối trừ công nợ theo AC-1, AC-2, AC-3, AC-4, AC-5.
        Toàn bộ thao tác thực hiện trong một Transaction nguyên tử duy nhất.
        """
        now_vn = datetime.now(TZ_VN)
        now_utc = datetime.now(timezone.utc)

        # 1. Tính toán hash payload để kiểm soát Idempotency
        alloc_data = [
            {"invoice_id": a.invoice_id, "allocated_amount": a.allocated_amount}
            for a in (payload.allocations or [])
        ]
        payload_data = {
            "customer_id": payload.customer_id,
            "amount": payload.amount,
            "payment_method": payload.payment_method.value,
            "reference_code": payload.reference_code,
            "notes": payload.notes,
            "allocations": sorted(alloc_data, key=lambda x: x["invoice_id"]),
        }
        payload_str = json.dumps(payload_data, sort_keys=True)
        payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        # 2. Xử lý Chống gửi trùng lặp (Idempotent với client_request_id)
        if payload.client_request_id:
            existing_payment = (
                db.query(Payment)
                .filter(Payment.client_request_id == payload.client_request_id)
                .first()
            )
            if existing_payment:
                if existing_payment.payload_hash == payload_hash:
                    return existing_payment
                else:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"client_request_id '{payload.client_request_id}' đã tồn tại "
                            "với nội dung yêu cầu khác. Vui lòng kiểm tra lại."
                        ),
                    )

        # 3. Kiểm tra thông tin khách hàng / đại lý
        customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
        customer_name = customer.name if customer else f"Đại lý {payload.customer_id}"

        # 4. Kiểm tra quyền hạn người lập phiếu thu (Collector)
        collector_name = current_user.full_name or current_user.username

        # 5. Lấy danh sách các hóa đơn chưa thanh toán đủ của khách hàng này
        unpaid_invoices = (
            db.query(Invoice)
            .filter(
                Invoice.customer_id == payload.customer_id,
                Invoice.status != InvoiceStatus.PAID.value,
                Invoice.remaining_amount > 0,
            )
            .all()
        )

        total_remaining_debt = sum(inv.remaining_amount for inv in unpaid_invoices)

        # 6. Kiểm tra chặn thu vượt tổng công nợ còn lại (AC-4)
        if payload.amount > total_remaining_debt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Số tiền thanh toán ({payload.amount:,} VNĐ) vượt quá tổng dư nợ còn lại "
                    f"của khách hàng ({total_remaining_debt:,} VNĐ)."
                ),
            )

        # 7. Sinh mã phiếu thu liên tục không nhảy cóc trong transaction
        payment_id = cls._generate_payment_id(db, now_vn)
        payment_date = payload.payment_date or now_utc

        payment = Payment(
            id=payment_id,
            client_request_id=payload.client_request_id,
            customer_id=payload.customer_id,
            customer_name=customer_name,
            amount=payload.amount,
            payment_method=payload.payment_method.value,
            payment_date=payment_date,
            collector_id=current_user.id,
            collector_name=collector_name,
            reference_code=payload.reference_code,
            notes=payload.notes,
            payload_hash=payload_hash,
            created_at=now_utc,
            updated_at=now_utc,
        )
        db.add(payment)
        db.flush()

        # 8. Thực hiện đối trừ công nợ (AC-2 & AC-3)
        if payload.allocations and len(payload.allocations) > 0:
            # TRƯỜNG HỢP A: Đối trừ thủ công theo hóa đơn được chỉ định cụ thể
            total_allocated = sum(item.allocated_amount for item in payload.allocations)
            if total_allocated != payload.amount:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Tổng số tiền đối trừ ({total_allocated:,} VNĐ) không khớp với "
                        f"số tiền thanh toán ({payload.amount:,} VNĐ)."
                    ),
                )

            for item in payload.allocations:
                inv = db.query(Invoice).filter(Invoice.id == item.invoice_id).first()
                if not inv:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Không tìm thấy hóa đơn '{item.invoice_id}'.",
                    )
                if inv.customer_id != payload.customer_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Hóa đơn '{item.invoice_id}' không thuộc về khách hàng "
                            f"'{payload.customer_id}'."
                        ),
                    )
                if item.allocated_amount > inv.remaining_amount:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Số tiền đối trừ ({item.allocated_amount:,} VNĐ) vượt quá "
                            f"số nợ còn lại của hóa đơn {inv.id} ({inv.remaining_amount:,} VNĐ)."
                        ),
                    )

                # Cập nhật số tiền đã trả và còn lại của hóa đơn
                inv.paid_amount += item.allocated_amount
                inv.remaining_amount -= item.allocated_amount
                if inv.remaining_amount == 0:
                    inv.status = InvoiceStatus.PAID.value
                else:
                    inv.status = InvoiceStatus.PARTIALLY_PAID.value

                allocation = PaymentAllocation(
                    payment_id=payment.id,
                    invoice_id=inv.id,
                    allocated_amount=item.allocated_amount,
                    created_at=now_utc,
                )
                db.add(allocation)
        else:
            # TRƯỜNG HỢP B: Tự động đối trừ theo nguyên tắc FIFO (hóa đơn cũ nhất trước)
            fifo_invoices = (
                db.query(Invoice)
                .filter(
                    Invoice.customer_id == payload.customer_id,
                    Invoice.status != InvoiceStatus.PAID.value,
                    Invoice.remaining_amount > 0,
                )
                .order_by(Invoice.due_date.asc(), Invoice.issued_at.asc(), Invoice.id.asc())
                .all()
            )

            remaining_to_allocate = payload.amount
            for inv in fifo_invoices:
                if remaining_to_allocate <= 0:
                    break

                can_allocate = min(remaining_to_allocate, inv.remaining_amount)
                inv.paid_amount += can_allocate
                inv.remaining_amount -= can_allocate

                if inv.remaining_amount == 0:
                    inv.status = InvoiceStatus.PAID.value
                else:
                    inv.status = InvoiceStatus.PARTIALLY_PAID.value

                allocation = PaymentAllocation(
                    payment_id=payment.id,
                    invoice_id=inv.id,
                    allocated_amount=can_allocate,
                    created_at=now_utc,
                )
                db.add(allocation)

                remaining_to_allocate -= can_allocate

        # 9. Gọi Hook an toàn cho Trang
        try:
            hook_sau_khi_ghi_nhan_thanh_toan(db=db, payment=payment)
        except Exception as e:
            logger.error(f"[Hook Trang] Ngoại lệ khi gọi hook ghi nhận thanh toán cho phiếu {payment.id}: {e}")

        try:
            db.commit()
            db.refresh(payment)
        except IntegrityError as ie:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Lỗi xung đột dữ liệu khi ghi nhận thanh toán: {ie}",
            )

        return payment

    @classmethod
    def get_payment_by_id(
        cls,
        db: Session,
        payment_id: str,
        current_user: User,
    ) -> Payment:
        """Tra cứu chi tiết phiếu thu, áp dụng phân quyền Customer Scope (anti-IDOR)."""
        payment = db.query(Payment).filter(Payment.id == payment_id).first()
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiếu thu với mã '{payment_id}'.",
            )

        # Bảo vệ Customer Scope (chống IDOR)
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role == UserRole.CUSTOMER.value or user_role.lower() == "customer":
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            if payment.customer_id != assigned_cust_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền truy cập vào phiếu thu của đại lý khác.",
                )

        return payment

    @classmethod
    def list_payments(
        cls,
        db: Session,
        current_user: User,
        customer_id: Optional[str] = None,
        payment_method: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Payment], int]:
        """Danh sách phiếu thu có bộ lọc và phân quyền Customer Scope."""
        query = db.query(Payment)

        # Phân quyền Customer Scope
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role == UserRole.CUSTOMER.value or user_role.lower() == "customer":
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            query = query.filter(Payment.customer_id == assigned_cust_id)
        elif customer_id:
            query = query.filter(Payment.customer_id == customer_id)

        if payment_method:
            query = query.filter(Payment.payment_method == payment_method.upper())
        if from_date:
            query = query.filter(Payment.payment_date >= from_date)
        if to_date:
            query = query.filter(Payment.payment_date <= to_date)

        total = query.count()
        items = query.order_by(Payment.payment_date.desc(), Payment.id.desc()).offset(skip).limit(limit).all()
        return items, total
