from typing import List, Optional, Tuple, Dict
from datetime import datetime, date, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from fastapi import HTTPException, status

from app.models.auth import User
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.order import Order
from app.models.debt_reconciliation import (
    DebtReconciliationStatement,
    DebtReconciliationEntry,
    DebtStatementStatus,
    DebtDocType,
)
from app.schemas.debt_reconciliation import (
    DebtStatementGenerateRequest,
    CustomerConfirmRequest,
    CustomerDisputeRequest,
)


class DebtReconciliationService:
    """
    Dịch vụ Lập biên bản đối chiếu công nợ định kỳ với đại lý (Story S7-06 / SC-267).
    """

    @classmethod
    def _generate_code(cls, db: Session, date_str: str) -> str:
        """Sinh mã số biên bản đối chiếu dạng BB-YYYYMM-XXXX."""
        prefix = f"BB-{date_str}-"
        last_rec = (
            db.query(DebtReconciliationStatement)
            .filter(DebtReconciliationStatement.id.like(f"{prefix}%"))
            .order_by(desc(DebtReconciliationStatement.id))
            .first()
        )
        if not last_rec:
            seq = 1
        else:
            try:
                seq = int(last_rec.id.split("-")[-1]) + 1
            except (ValueError, IndexError):
                seq = 1
        return f"{prefix}{seq:04d}"

    # --------------------------------------------------------------------------
    # 1. TỔNG HỢP SỐ LIỆU CÔNG NỢ THEO KỲ VÀ SINH BIÊN BẢN (SUBTASK 10)
    # --------------------------------------------------------------------------
    @classmethod
    def generate_statement(
        cls,
        db: Session,
        payload: DebtStatementGenerateRequest,
        current_user: User,
    ) -> DebtReconciliationStatement:
        """
        Tính toán số dư đầu kỳ, tổng phát sinh tăng/giảm và số dư cuối kỳ theo khoảng thời gian đối chiếu.
        Sinh các dòng chứng từ chi tiết và số dư lũy kế.
        """
        if payload.period_from > payload.period_to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ngày bắt đầu kỳ đối chiếu (period_from) phải nhỏ hơn hoặc bằng ngày kết thúc (period_to).",
            )

        customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy khách hàng / đại lý có mã {payload.customer_id}",
            )

        # Khoảng thời gian so sánh
        dt_start = datetime(payload.period_from.year, payload.period_from.month, payload.period_from.day, 0, 0, 0, tzinfo=timezone.utc)
        dt_end = datetime(payload.period_to.year, payload.period_to.month, payload.period_to.day, 23, 59, 59, tzinfo=timezone.utc)

        # ----------------------------------------------------------------------
        # A. Tính số dư đầu kỳ (Trước ngày dt_start)
        # ----------------------------------------------------------------------
        # 1. Tổng tiền hàng mua trước kỳ (từ Invoice hoặc Order)
        prior_invoices_sum = (
            db.query(func.coalesce(func.sum(Invoice.total_amount), 0))
            .filter(Invoice.customer_id == payload.customer_id, Invoice.created_at < dt_start)
            .scalar()
        ) or 0

        # Nếu chưa có invoice, fallback kiểm tra Order đã xác nhận
        if prior_invoices_sum == 0:
            prior_orders_sum = (
                db.query(func.coalesce(func.sum(Order.total), 0.0))
                .filter(Order.customer_id == payload.customer_id, Order.created_at < dt_start)
                .scalar()
            ) or 0.0
            prior_invoices_sum = int(prior_orders_sum)

        # 2. Tổng tiền thanh toán trước kỳ (từ Payment)
        prior_payments_sum = (
            db.query(func.coalesce(func.sum(Payment.amount), 0))
            .filter(Payment.customer_id == payload.customer_id, Payment.payment_date < dt_start)
            .scalar()
        ) or 0

        opening_balance = int(prior_invoices_sum - prior_payments_sum)

        # ----------------------------------------------------------------------
        # B. Thu thập các chứng từ phát sinh trong kỳ (dt_start <= date <= dt_end)
        # ----------------------------------------------------------------------
        raw_events = []

        # 1. Hóa đơn bán hàng trong kỳ
        invoices = (
            db.query(Invoice)
            .filter(
                Invoice.customer_id == payload.customer_id,
                Invoice.created_at >= dt_start,
                Invoice.created_at <= dt_end,
            )
            .all()
        )
        for inv in invoices:
            inv_date = inv.created_at.date() if inv.created_at else payload.period_from
            raw_events.append({
                "date": inv_date,
                "created_at": inv.created_at,
                "doc_type": DebtDocType.INVOICE.value,
                "doc_number": inv.id,
                "description": f"Hóa đơn xuất bán hàng #{inv.id}",
                "increase": int(inv.total_amount or 0),
                "decrease": 0,
            })

        # Nếu không có invoice trong kỳ, fallback lấy Orders
        if not invoices:
            orders = (
                db.query(Order)
                .filter(
                    Order.customer_id == payload.customer_id,
                    Order.created_at >= dt_start,
                    Order.created_at <= dt_end,
                )
                .all()
            )
            for ord_item in orders:
                ord_date = ord_item.created_at.date() if ord_item.created_at else payload.period_from
                raw_events.append({
                    "date": ord_date,
                    "created_at": ord_item.created_at,
                    "doc_type": DebtDocType.INVOICE.value,
                    "doc_number": ord_item.code or ord_item.id,
                    "description": f"Đơn hàng giao đại lý #{ord_item.code or ord_item.id}",
                    "increase": int(ord_item.total or 0),
                    "decrease": 0,
                })

        # 2. Phiếu thu thanh toán trong kỳ
        payments = (
            db.query(Payment)
            .filter(
                Payment.customer_id == payload.customer_id,
                Payment.payment_date >= dt_start,
                Payment.payment_date <= dt_end,
            )
            .all()
        )
        for pay in payments:
            pay_date = pay.payment_date.date() if pay.payment_date else payload.period_from
            raw_events.append({
                "date": pay_date,
                "created_at": pay.payment_date,
                "doc_type": DebtDocType.PAYMENT.value,
                "doc_number": pay.id,
                "description": f"Thanh toán tiền hàng #{pay.id} ({pay.payment_method})",
                "increase": 0,
                "decrease": int(pay.amount or 0),
            })

        # Sắp xếp các sự kiện phát sinh theo thứ tự thời gian tăng dần
        raw_events.sort(key=lambda x: (x["date"], x["created_at"]))

        # ----------------------------------------------------------------------
        # C. Tính số dư lũy kế và tổng phát sinh
        # ----------------------------------------------------------------------
        entries: List[DebtReconciliationEntry] = []
        running_bal = opening_balance
        total_inc = 0
        total_dec = 0

        date_month_str = payload.period_to.strftime("%Y%m")
        statement_id = cls._generate_code(db, date_month_str)

        for ev in raw_events:
            total_inc += ev["increase"]
            total_dec += ev["decrease"]
            running_bal = running_bal + ev["increase"] - ev["decrease"]

            entry = DebtReconciliationEntry(
                statement_id=statement_id,
                entry_date=ev["date"],
                doc_type=ev["doc_type"],
                doc_number=ev["doc_number"],
                description=ev["description"],
                increase_amount=ev["increase"],
                decrease_amount=ev["decrease"],
                running_balance=running_bal,
            )
            entries.append(entry)

        closing_balance = opening_balance + total_inc - total_dec

        statement = DebtReconciliationStatement(
            id=statement_id,
            statement_code=statement_id,
            customer_id=customer.id,
            customer_code=customer.code or customer.id,
            customer_name=customer.name,
            customer_tax_code=customer.tax_code,
            customer_address=customer.address,
            customer_phone=customer.phone,
            representative=payload.representative or getattr(customer, "contact_person", None),
            period_from=payload.period_from,
            period_to=payload.period_to,
            opening_balance=opening_balance,
            period_increase=total_inc,
            period_decrease=total_dec,
            closing_balance=closing_balance,
            status=DebtStatementStatus.SENT.value,
            notes=payload.notes,
            created_by_id=current_user.id if current_user else None,
            created_by_name=current_user.full_name or getattr(current_user, "username", None),
            created_at=datetime.now(timezone.utc),
            entries=entries,
        )

        db.add(statement)
        db.commit()
        db.refresh(statement)
        return statement

    # --------------------------------------------------------------------------
    # 2. ĐẠI LÝ XÁC NHẬN HOẶC PHẢN HỒI LỆCH TRÊN CỔNG ĐẠI LÝ (SUBTASK 8)
    # --------------------------------------------------------------------------
    @classmethod
    def customer_confirm(
        cls,
        db: Session,
        statement_id: str,
        payload: CustomerConfirmRequest,
        current_user: User,
    ) -> DebtReconciliationStatement:
        """Đại lý xác nhận đồng ý với số liệu công nợ trên cổng B2B."""
        st = db.query(DebtReconciliationStatement).filter(DebtReconciliationStatement.id == statement_id).first()
        if not st:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy biên bản đối chiếu {statement_id}",
            )

        st.status = DebtStatementStatus.CONFIRMED.value
        st.customer_confirmed_at = datetime.now(timezone.utc)
        st.customer_feedback_notes = payload.feedback_notes or "Đại lý đã kiểm tra và đồng ý với toàn bộ số liệu đối chiếu công nợ."
        st.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(st)
        return st

    @classmethod
    def customer_dispute(
        cls,
        db: Session,
        statement_id: str,
        payload: CustomerDisputeRequest,
        current_user: User,
    ) -> DebtReconciliationStatement:
        """Đại lý phản hồi không đồng ý và gửi số liệu chênh lệch kèm lý do."""
        st = db.query(DebtReconciliationStatement).filter(DebtReconciliationStatement.id == statement_id).first()
        if not st:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy biên bản đối chiếu {statement_id}",
            )

        diff = abs(st.closing_balance - payload.customer_claimed_balance)

        st.status = DebtStatementStatus.DISPUTED.value
        st.customer_claimed_balance = payload.customer_claimed_balance
        st.discrepancy_amount = diff
        st.dispute_reason = payload.dispute_reason
        st.customer_feedback_notes = payload.feedback_notes
        st.disputed_at = datetime.now(timezone.utc)
        st.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(st)
        return st

    # --------------------------------------------------------------------------
    # 3. TRUY VẤN BIÊN BẢN VÀ DANH SÁCH
    # --------------------------------------------------------------------------
    @classmethod
    def get_statement(cls, db: Session, statement_id: str) -> DebtReconciliationStatement:
        """Xem chi tiết biên bản đối chiếu và danh sách chứng từ."""
        st = db.query(DebtReconciliationStatement).filter(DebtReconciliationStatement.id == statement_id).first()
        if not st:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy biên bản đối chiếu {statement_id}",
            )
        return st

    @classmethod
    def list_statements(
        cls,
        db: Session,
        customer_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        period_from: Optional[date] = None,
        period_to: Optional[date] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[DebtReconciliationStatement], int]:
        """Danh sách các biên bản đối chiếu có phân trang và bộ lọc."""
        q = db.query(DebtReconciliationStatement)
        if customer_id:
            q = q.filter(DebtReconciliationStatement.customer_id == customer_id)
        if status_filter:
            q = q.filter(DebtReconciliationStatement.status == status_filter)
        if period_from:
            q = q.filter(DebtReconciliationStatement.period_from >= period_from)
        if period_to:
            q = q.filter(DebtReconciliationStatement.period_to <= period_to)

        total = q.count()
        items = q.order_by(desc(DebtReconciliationStatement.created_at)).offset(skip).limit(limit).all()
        return items, total

    # --------------------------------------------------------------------------
    # 4. XUẤT PDF / HTML BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ CHUẨN MẪU (SUBTASK 12)
    # --------------------------------------------------------------------------
    @classmethod
    def generate_pdf_html(cls, db: Session, statement_id: str) -> str:
        """
        Tạo mẫu HTML/PDF chuẩn biên bản đối chiếu công nợ để gửi đại lý ký xác nhận.
        Gồm thông tin hai bên, kỳ đối chiếu, bảng tổng hợp số liệu, bảng kê chứng từ và chữ ký xác nhận.
        """
        st = cls.get_statement(db, statement_id)

        # Định dạng tiền tệ VNĐ
        def fmt_curr(val: Optional[int]) -> str:
            if val is None:
                return "0 đ"
            return f"{val:,.0f} đ".replace(",", ".")

        rows_html = ""
        if not st.entries:
            rows_html = """
            <tr>
                <td colspan="7" style="text-align: center; padding: 16px; color: #64748b; font-style: italic;">
                    Không có chứng từ mua hàng hoặc thanh toán phát sinh trong kỳ đối chiếu này.
                </td>
            </tr>
            """
        else:
            for idx, entry in enumerate(st.entries, 1):
                inc_text = fmt_curr(entry.increase_amount) if entry.increase_amount > 0 else "-"
                dec_text = fmt_curr(entry.decrease_amount) if entry.decrease_amount > 0 else "-"
                rows_html += f"""
                <tr>
                    <td style="text-align: center; padding: 8px 10px; border: 1px solid #cbd5e1;">{idx}</td>
                    <td style="text-align: center; padding: 8px 10px; border: 1px solid #cbd5e1;">{entry.entry_date.strftime('%d/%m/%Y')}</td>
                    <td style="text-align: center; padding: 8px 10px; border: 1px solid #cbd5e1; font-weight: 600;">{entry.doc_number}</td>
                    <td style="padding: 8px 10px; border: 1px solid #cbd5e1;">{entry.description or ''}</td>
                    <td style="text-align: right; padding: 8px 10px; border: 1px solid #cbd5e1; color: #1e293b;">{inc_text}</td>
                    <td style="text-align: right; padding: 8px 10px; border: 1px solid #cbd5e1; color: #059669;">{dec_text}</td>
                    <td style="text-align: right; padding: 8px 10px; border: 1px solid #cbd5e1; font-weight: 700;">{fmt_curr(entry.running_balance)}</td>
                </tr>
                """

        # Trạng thái hiển thị Watermark
        status_badge = {
            DebtStatementStatus.CONFIRMED.value: '<span style="color: #059669; font-weight: bold; border: 2px solid #059669; padding: 4px 12px; border-radius: 4px;">ĐÃ XÁC NHẬN KHỚP SỐ LIỆU</span>',
            DebtStatementStatus.DISPUTED.value: '<span style="color: #dc2626; font-weight: bold; border: 2px solid #dc2626; padding: 4px 12px; border-radius: 4px;">CÓ PHẢN HỒI CHÊNH LỆCH</span>',
            DebtStatementStatus.SENT.value: '<span style="color: #2563eb; font-weight: bold; border: 2px solid #2563eb; padding: 4px 12px; border-radius: 4px;">CHỜ ĐẠI LÝ KÝ DUYỆT</span>',
            DebtStatementStatus.DRAFT.value: '<span style="color: #64748b; font-weight: bold; border: 2px solid #64748b; padding: 4px 12px; border-radius: 4px;">DỰ THẢO</span>',
        }.get(st.status, "")

        dispute_section = ""
        if st.status == DebtStatementStatus.DISPUTED.value:
            dispute_section = f"""
            <div style="margin-top: 16px; padding: 12px 16px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
                <div style="font-weight: bold; color: #991b1b; margin-bottom: 4px;">Ý KIẾN PHẢN HỒI CHÊNH LỆCH CỦA ĐẠI LÝ:</div>
                <div style="color: #b91c1c; font-size: 13px;">
                    - Số dư nợ đại lý ghi nhận: <strong>{fmt_curr(st.customer_claimed_balance)}</strong> (Chênh lệch: <strong>{fmt_curr(st.discrepancy_amount)}</strong>)<br>
                    - Lý do phản hồi: <em>{st.dispute_reason or 'Không có lý do chi tiết'}</em><br>
                    - Thời điểm phản hồi: {st.disputed_at.strftime('%d/%m/%Y %H:%M') if st.disputed_at else ''}
                </div>
            </div>
            """

        confirm_section = ""
        if st.status == DebtStatementStatus.CONFIRMED.value and st.customer_confirmed_at:
            confirm_section = f"""
            <div style="margin-top: 16px; padding: 12px 16px; background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px;">
                <div style="font-weight: bold; color: #166534; margin-bottom: 4px;">XÁC NHẬN TỪ ĐẠI LÝ:</div>
                <div style="color: #15803d; font-size: 13px;">
                    Đại lý đã đồng ý chốt số dư công nợ cuối kỳ là <strong>{fmt_curr(st.closing_balance)}</strong> vào lúc {st.customer_confirmed_at.strftime('%d/%m/%Y %H:%M')}.<br>
                    Ghi chú: <em>{st.customer_feedback_notes or 'Khớp số liệu, không có khiếu nại.'}</em>
                </div>
            </div>
            """

        html_template = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Biên Bản Đối Chiếu Công Nợ - {st.statement_code}</title>
    <style>
        @page {{
            size: A4;
            margin: 15mm 15mm 15mm 15mm;
        }}
        body {{
            font-family: 'Times New Roman', Times, serif, 'DejaVu Sans';
            font-size: 13px;
            line-height: 1.4;
            color: #1e293b;
            background-color: #ffffff;
            margin: 0;
            padding: 20px;
        }}
        .header-section {{
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
        }}
        .title-block {{
            text-align: center;
            margin-bottom: 24px;
        }}
        .main-title {{
            font-size: 20px;
            font-weight: bold;
            color: #0f172a;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
        }}
        .sub-title {{
            font-size: 14px;
            font-style: italic;
            color: #475569;
        }}
        .parties-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }}
        .party-box {{
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 12px 16px;
        }}
        .party-title {{
            font-size: 14px;
            font-weight: bold;
            color: #0f172a;
            margin-bottom: 8px;
            text-transform: uppercase;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 4px;
        }}
        .party-info-row {{
            margin-bottom: 4px;
            font-size: 13px;
        }}
        .summary-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }}
        .summary-table th, .summary-table td {{
            border: 1px solid #cbd5e1;
            padding: 10px 12px;
        }}
        .summary-table th {{
            background-color: #f1f5f9;
            font-weight: bold;
            text-align: center;
        }}
        .detail-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
        }}
        .detail-table th {{
            background-color: #0f172a;
            color: #ffffff;
            font-weight: bold;
            font-size: 12px;
            padding: 8px 10px;
            border: 1px solid #0f172a;
            text-transform: uppercase;
        }}
        .signatures-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
            margin-top: 36px;
            text-align: center;
        }}
        .signature-title {{
            font-weight: bold;
            text-transform: uppercase;
            font-size: 12px;
            margin-bottom: 4px;
        }}
        .signature-hint {{
            font-size: 11px;
            font-style: italic;
            color: #64748b;
        }}
        .signature-space {{
            height: 70px;
        }}
        @media print {{
            body {{
                padding: 0;
            }}
            .no-print {{
                display: none !important;
            }}
        }}
    </style>
</head>
<body>

    <!-- Nút in khi xem trên trình duyệt -->
    <div class="no-print" style="margin-bottom: 16px; text-align: right;">
        <button onclick="window.print()" style="background-color: #2563eb; color: #fff; padding: 8px 20px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer;">
            🖨️ In / Tải PDF Biên Bản
        </button>
    </div>

    <!-- Header Cty -->
    <div class="header-section">
        <div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a;">CÔNG TY CỔ PHẦN HỆ THỐNG KHO VẬN & PHÂN PHỐI</div>
            <div style="font-size: 12px; color: #475569;">Số 123 Đường Giải Phóng, Hai Bà Trưng, Hà Nội | MST: 0101234567</div>
            <div style="font-size: 12px; color: #475569;">Hotline kế toán công nợ: 1900 6868 | Email: ketoan@saleswarehouse.com</div>
        </div>
        <div style="text-align: right;">
            <div style="font-size: 13px; font-weight: bold; color: #0f172a;">Mã số: {st.statement_code}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Ngày lập: {st.created_at.strftime('%d/%m/%Y')}</div>
            <div style="margin-top: 6px;">{status_badge}</div>
        </div>
    </div>

    <!-- Tiêu đề chính -->
    <div class="title-block">
        <div class="main-title">BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ ĐỊNH KỲ</div>
        <div class="sub-title">Kỳ đối chiếu: Từ ngày <strong>{st.period_from.strftime('%d/%m/%Y')}</strong> đến ngày <strong>{st.period_to.strftime('%d/%m/%Y')}</strong></div>
    </div>

    <!-- Thông tin hai bên -->
    <div class="parties-grid">
        <div class="party-box">
            <div class="party-title">BÊN A (BÊN BÁN HÀNG):</div>
            <div class="party-info-row"><strong>Đơn vị:</strong> Công Ty Cổ Phần Hệ Thống Kho Vận</div>
            <div class="party-info-row"><strong>Mã số thuế:</strong> 0101234567</div>
            <div class="party-info-row"><strong>Địa chỉ:</strong> Số 123 Đường Giải Phóng, Hai Bà Trưng, Hà Nội</div>
            <div class="party-info-row"><strong>Đại diện lập:</strong> {st.created_by_name or 'Bộ phận Kế toán công nợ'}</div>
        </div>

        <div class="party-box">
            <div class="party-title">BÊN B (ĐẠI LÝ / KHÁCH HÀNG):</div>
            <div class="party-info-row"><strong>Tên đại lý:</strong> {st.customer_name}</div>
            <div class="party-info-row"><strong>Mã khách hàng:</strong> {st.customer_code or st.customer_id}</div>
            <div class="party-info-row"><strong>Mã số thuế:</strong> {st.customer_tax_code or '---'}</div>
            <div class="party-info-row"><strong>Địa chỉ:</strong> {st.customer_address or '---'}</div>
            <div class="party-info-row"><strong>Điện thoại:</strong> {st.customer_phone or '---'}</div>
        </div>
    </div>

    <!-- Bảng tổng hợp công nợ 4 chỉ tiêu -->
    <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">I. BẢNG TỔNG HỢP CÔNG NỢ TRONG KỲ:</div>
    <table class="summary-table">
        <thead>
            <tr>
                <th style="width: 25%;">Số dư nợ đầu kỳ<br><span style="font-size: 11px; font-weight: normal; color: #64748b;">(trước {st.period_from.strftime('%d/%m/%Y')})</span></th>
                <th style="width: 25%;">Tổng phát sinh tăng<br><span style="font-size: 11px; font-weight: normal; color: #64748b;">(Tiền mua hàng trong kỳ)</span></th>
                <th style="width: 25%;">Tổng phát sinh giảm<br><span style="font-size: 11px; font-weight: normal; color: #64748b;">(Đã thanh toán / Trả hàng)</span></th>
                <th style="width: 25%; background-color: #e2e8f0;">Số dư nợ cuối kỳ<br><span style="font-size: 11px; font-weight: normal; color: #64748b;">(Chốt đến ngày {st.period_to.strftime('%d/%m/%Y')})</span></th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style="text-align: right; font-weight: 600; font-size: 14px;">{fmt_curr(st.opening_balance)}</td>
                <td style="text-align: right; font-weight: 600; font-size: 14px; color: #1e293b;">{fmt_curr(st.period_increase)}</td>
                <td style="text-align: right; font-weight: 600; font-size: 14px; color: #059669;">{fmt_curr(st.period_decrease)}</td>
                <td style="text-align: right; font-weight: bold; font-size: 15px; background-color: #f8fafc; color: #0f172a;">{fmt_curr(st.closing_balance)}</td>
            </tr>
        </tbody>
    </table>

    <!-- Bảng chi tiết từng chứng từ -->
    <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px; margin-top: 16px;">II. BẢNG KÊ CHI TIẾT CÁC CHỨNG TỪ PHÁT SINH TRONG KỲ:</div>
    <table class="detail-table">
        <thead>
            <tr>
                <th style="width: 5%;">STT</th>
                <th style="width: 12%;">Ngày CT</th>
                <th style="width: 18%;">Số chứng từ</th>
                <th style="width: 27%;">Diễn giải nội dung</th>
                <th style="width: 13%; text-align: right;">Phát sinh tăng</th>
                <th style="width: 13%; text-align: right;">Phát sinh giảm</th>
                <th style="width: 12%; text-align: right;">Dư nợ lũy kế</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>

    <!-- Kết luận và Cam kết -->
    <div style="margin-top: 16px; font-size: 13px; line-height: 1.6;">
        <strong>Kết luận:</strong> Tính đến hết ngày {st.period_to.strftime('%d/%m/%Y')}, Đại lý <strong>{st.customer_name}</strong> còn nợ Bên A số tiền là: <strong>{fmt_curr(st.closing_balance)}</strong>.<br>
        Hai bên thống nhất xác nhận số liệu nêu trên là chính xác. Mọi thắc mắc hoặc điều chỉnh (nếu có) sẽ được xử lý trong vòng 03 ngày làm việc kể từ ngày nhận biên bản này.
    </div>

    <!-- Khối phản hồi nếu có -->
    {confirm_section}
    {dispute_section}

    <!-- Phần ký tên xác nhận 3 bên -->
    <div class="signatures-grid">
        <div>
            <div class="signature-title">KẾ TOÁN CÔNG NỢ</div>
            <div class="signature-hint">(Người lập biên bản)</div>
            <div class="signature-space"></div>
            <div style="font-weight: bold;">{st.created_by_name or 'Trần Thị Kế Toán'}</div>
        </div>

        <div>
            <div class="signature-title">KẾ TOÁN TRƯỞNG</div>
            <div class="signature-hint">(Kiểm tra & đối soát)</div>
            <div class="signature-space"></div>
            <div style="font-weight: bold;">Đỗ Thị Kế Toán Trưởng</div>
        </div>

        <div>
            <div class="signature-title">ĐẠI DIỆN ĐẠI LÝ (BÊN B)</div>
            <div class="signature-hint">(Ký, ghi rõ họ tên & đóng dấu)</div>
            <div class="signature-space"></div>
            <div style="font-weight: bold;">{st.representative or st.customer_name}</div>
        </div>
    </div>

</body>
</html>
        """
        return html_template
