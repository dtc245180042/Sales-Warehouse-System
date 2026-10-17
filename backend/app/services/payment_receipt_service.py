"""
Payment Receipt Print Service (SCRUM-270 / S7-09).
Dịch vụ cung cấp dữ liệu in ấn và tạo trang HTML in ấn Phiếu thu tiền A4/A5 chuẩn hóa kèm mã vạch Code128.
Tuân thủ:
- Mã duy nhất (PT-YYYY-XXXXXXX)
- Thông tin đại lý / khách hàng
- Số tiền (số + chữ)
- Hình thức thanh toán (Tiền mặt, Chuyển khoản, Thẻ)
- Người thu / kế toán ghi nhận
- Danh sách hóa đơn đối trừ
- Vector Barcode SVG Code128 offline-first
"""

import html
from typing import Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.auth import User, UserRole
from app.models.payment import Payment, PaymentMethod
from app.models.customer import Customer
from app.services.barcode_service import generate_code128_svg
from app.schemas.payment_receipt import (
    PaymentReceiptPrintData,
    PaymentReceiptAllocationItem,
)


def format_currency_vnd(amount: int | float | None) -> str:
    """Định dạng tiền tệ VNĐ (ví dụ: 15,000,000 đ)."""
    if amount is None:
        return "0 đ"
    rounded = int(round(float(amount)))
    return f"{rounded:,} đ".replace(",", ".")


def number_to_vietnamese_words(n: int) -> str:
    """Chuyển đổi số nguyên VNĐ sang chữ tiếng Việt chuẩn xác."""
    if n == 0:
        return "Không đồng"
    if n < 0:
        return "Âm " + number_to_vietnamese_words(-n)

    digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
    units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"]

    def read_three_digits(num: int, is_highest: bool = False) -> str:
        hundred = num // 100
        remainder = num % 100
        ten = remainder // 10
        one = remainder % 10

        parts = []
        if hundred > 0 or not is_highest:
            parts.append(digits[hundred] + " trăm")

        if ten > 1:
            parts.append(digits[ten] + " mươi")
            if one == 1:
                parts.append("mốt")
            elif one == 4:
                parts.append("tư")
            elif one == 5:
                parts.append("lăm")
            elif one > 0:
                parts.append(digits[one])
        elif ten == 1:
            parts.append("mười")
            if one == 5:
                parts.append("lăm")
            elif one > 0:
                parts.append(digits[one])
        elif ten == 0:
            if one > 0:
                if hundred > 0 or not is_highest:
                    parts.append("lẻ " + digits[one])
                else:
                    parts.append(digits[one])

        return " ".join(parts)

    group_list = []
    temp = n
    while temp > 0:
        group_list.append(temp % 1000)
        temp //= 1000

    words = []
    for i in reversed(range(len(group_list))):
        val = group_list[i]
        if val > 0:
            is_highest = (i == len(group_list) - 1)
            group_words = read_three_digits(val, is_highest=is_highest)
            words.append(group_words)
            if units[i]:
                words.append(units[i])

    result = " ".join(words).strip()
    result = " ".join(result.split())
    if result:
        result = result[0].upper() + result[1:] + " đồng chẵn."
    return result


class PaymentReceiptService:
    """Nghiệp vụ xuất chứng từ in ấn phiếu thu tiền."""

    @classmethod
    def get_payment_receipt_data(
        cls,
        db: Session,
        payment_id: str,
        current_user: User,
    ) -> PaymentReceiptPrintData:
        """
        Lấy thông tin chi tiết phiếu thu định dạng chuẩn để in ấn hoặc xuất PDF.
        Kiểm tra quyền truy cập (Customer Scope IDOR).
        """
        payment = db.query(Payment).filter(Payment.id == payment_id).first()
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiếu thu với mã '{payment_id}'.",
            )

        # Kiểm tra quyền riêng tư của Khách hàng (Customer Scope)
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role == UserRole.CUSTOMER.value or str(user_role).lower() == "customer":
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            if payment.customer_id != assigned_cust_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền truy cập phiếu thu của đại lý khác.",
                )

        # Lấy thông tin khách hàng từ DB
        customer = db.query(Customer).filter(
            (Customer.id == payment.customer_id) | (Customer.code == payment.customer_id)
        ).first()

        c_code = customer.code if customer else payment.customer_id
        c_name = customer.name if customer else (payment.customer_name or "Đại lý")
        c_phone = (customer.phone if customer else None) or "Chưa cập nhật"
        c_addr = (customer.address if customer else None) or "Trụ sở đại lý"
        c_tax = (customer.tax_code if customer else None) or "Chưa có"

        # Lấy thông tin người thu
        collector = db.query(User).filter(User.id == payment.collector_id).first()
        collector_name = payment.collector_name or (
            collector.full_name if collector else "Kế toán viên"
        )

        # Map hình thức thanh toán sang nhãn hiển thị tiếng Việt
        method_labels = {
            PaymentMethod.CASH.value: "Tiền mặt",
            PaymentMethod.BANK_TRANSFER.value: "Chuyển khoản ngân hàng",
            PaymentMethod.CARD.value: "Thẻ ngân hàng / POS",
            "CASH": "Tiền mặt",
            "BANK_TRANSFER": "Chuyển khoản ngân hàng",
            "CARD": "Thẻ ngân hàng / POS",
            "DEBT_OFFSET": "Bù trừ công nợ",
        }
        pm_display = method_labels.get(payment.payment_method, payment.payment_method)

        # Sinh mã vạch Code128 Vector SVG
        barcode_svg = generate_code128_svg(
            payment.id,
            module_width=1.5,
            height=40,
            include_text=True,
        )

        # Định dạng ngày giờ
        payment_date_str = (
            payment.payment_date.strftime("%d/%m/%Y %H:%M")
            if payment.payment_date
            else ""
        )
        created_at_str = (
            payment.created_at.strftime("%d/%m/%Y %H:%M")
            if payment.created_at
            else payment_date_str
        )

        # Danh sách allocations
        alloc_items = [
            PaymentReceiptAllocationItem(
                invoice_id=alloc.invoice_id,
                allocated_amount=alloc.allocated_amount,
                allocated_amount_formatted=format_currency_vnd(alloc.allocated_amount),
            )
            for alloc in payment.allocations
        ]

        amount_words = number_to_vietnamese_words(payment.amount)

        return PaymentReceiptPrintData(
            payment_id=payment.id,
            created_at_str=created_at_str,
            payment_date_str=payment_date_str,
            company_name="HỆ THỐNG PHÂN PHỐI BÁN HÀNG & KHO VẬN SALES-WAREHOUSE",
            company_address="Tòa nhà Công nghệ ICT, Cầu Giấy, Hà Nội",
            company_hotline="1900 6868",
            company_tax_code="0101234567",
            customer_id=payment.customer_id,
            customer_code=c_code,
            customer_name=c_name,
            customer_phone=c_phone,
            customer_address=c_addr,
            customer_tax_code=c_tax,
            amount=payment.amount,
            amount_formatted=format_currency_vnd(payment.amount),
            amount_in_words=amount_words,
            payment_method=payment.payment_method,
            payment_method_display=pm_display,
            reference_code=payment.reference_code or "Không có",
            notes=payment.notes or "Thu tiền mua hàng / thanh toán công nợ",
            collector_id=payment.collector_id,
            collector_name=collector_name,
            barcode_svg=barcode_svg,
            allocations=alloc_items,
        )

    @classmethod
    def generate_payment_receipt_html(
        cls,
        db: Session,
        payment_id: str,
        current_user: User,
    ) -> str:
        """
        Tạo tài liệu HTML in ấn Phiếu thu tiền hoàn chỉnh chuẩn A4 / A5 (Standalone Printable Document).
        Đảm bảo offline-first, hỗ trợ in trực tiếp từ trình duyệt và lưu PDF.
        """
        data = cls.get_payment_receipt_data(db, payment_id, current_user)

        # Xây dựng bảng hóa đơn đối trừ
        alloc_rows = []
        for idx, item in enumerate(data.allocations, start=1):
            inv_id = html.escape(item.invoice_id)
            amt_fmt = html.escape(item.allocated_amount_formatted)
            alloc_rows.append(f"""
            <tr>
                <td style="text-align: center;">{idx}</td>
                <td style="font-family: monospace; font-weight: 600; color: #1e40af;">{inv_id}</td>
                <td>Gạch nợ hóa đơn bán hàng</td>
                <td style="text-align: right; font-weight: bold; color: #047857;">{amt_fmt}</td>
                <td style="text-align: center;"><span style="color: #047857; font-weight: 600;">✓ Đã đối trừ</span></td>
            </tr>
            """)

        if not alloc_rows:
            alloc_rows.append("""
            <tr>
                <td colspan="5" style="text-align: center; color: #64748b; font-style: italic; padding: 12px;">
                    Thu tiền tạm ứng / Thanh toán trước (chưa phân bổ vào hóa đơn cụ thể)
                </td>
            </tr>
            """)

        alloc_tbody = "".join(alloc_rows)

        # Thông tin escape an toàn chống XSS
        p_id = html.escape(data.payment_id)
        p_date = html.escape(data.payment_date_str)
        c_name = html.escape(data.customer_name)
        c_code = html.escape(data.customer_code)
        c_phone = html.escape(data.customer_phone)
        c_addr = html.escape(data.customer_address)
        c_tax = html.escape(data.customer_tax_code)
        ref_code = html.escape(data.reference_code)
        notes = html.escape(data.notes)
        collector = html.escape(data.collector_name)
        method_str = html.escape(data.payment_method_display)

        html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Phiếu thu tiền {p_id}</title>
    <style>
        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 13px;
            line-height: 1.5;
            color: #1e293b;
            background-color: #f8fafc;
            padding: 20px;
        }}
        .receipt-container {{
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: #ffffff;
            padding: 18mm 20mm;
            position: relative;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            border-radius: 4px;
        }}
        .header-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
        }}
        .company-title {{
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            text-transform: uppercase;
        }}
        .company-sub {{
            font-size: 11px;
            color: #475569;
            margin-top: 2px;
        }}
        .barcode-cell {{
            text-align: right;
            vertical-align: middle;
        }}
        .title-section {{
            text-align: center;
            margin: 16px 0 24px 0;
        }}
        .doc-title {{
            font-size: 24px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: 1px;
        }}
        .doc-meta {{
            margin-top: 4px;
            font-size: 12px;
            color: #475569;
        }}
        .info-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px 16px;
        }}
        .info-row {{
            padding: 5px 0;
        }}
        .info-label {{
            color: #64748b;
            width: 180px;
            font-weight: 500;
            display: inline-block;
        }}
        .info-value {{
            color: #0f172a;
            font-weight: 600;
        }}
        .amount-highlight {{
            background: #ecfdf5;
            border: 1.5px solid #10b981;
            border-radius: 8px;
            padding: 12px 18px;
            margin-bottom: 20px;
        }}
        .amount-title {{
            font-size: 12px;
            font-weight: 700;
            color: #065f46;
            text-transform: uppercase;
        }}
        .amount-number {{
            font-size: 22px;
            font-weight: 900;
            color: #047857;
            margin-top: 2px;
        }}
        .amount-words {{
            font-size: 12px;
            color: #047857;
            font-style: italic;
            margin-top: 2px;
        }}
        .table-section-title {{
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 8px;
            text-transform: uppercase;
        }}
        .alloc-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
        }}
        .alloc-table th, .alloc-table td {{
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            font-size: 12px;
        }}
        .alloc-table th {{
            background-color: #f1f5f9;
            color: #0f172a;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 11px;
        }}
        .signature-table {{
            width: 100%;
            margin-top: 24px;
            border-collapse: collapse;
            text-align: center;
        }}
        .signature-table td {{
            width: 33.33%;
            vertical-align: top;
            padding: 6px;
        }}
        .sig-title {{
            font-weight: 800;
            font-size: 12px;
            text-transform: uppercase;
            color: #0f172a;
        }}
        .sig-sub {{
            font-size: 11px;
            color: #64748b;
            font-style: italic;
            margin-top: 2px;
        }}
        .sig-space {{
            height: 65px;
        }}
        .sig-name {{
            font-weight: 700;
            font-size: 12px;
            color: #0f172a;
        }}
        .footer-note {{
            margin-top: 35px;
            padding-top: 10px;
            border-top: 1px dashed #cbd5e1;
            font-size: 11px;
            color: #64748b;
            text-align: center;
            font-style: italic;
        }}
        @media print {{
            body {{
                background: none;
                padding: 0;
            }}
            .receipt-container {{
                box-shadow: none;
                padding: 10mm 15mm;
                width: 100%;
                min-height: auto;
            }}
        }}
    </style>
</head>
<body>
    <div class="receipt-container">
        <!-- Header: Doanh nghiệp & Barcode -->
        <table class="header-table">
            <tr>
                <td style="width: 65%; vertical-align: top;">
                    <div class="company-title">{html.escape(data.company_name)}</div>
                    <div class="company-sub">🏢 {html.escape(data.company_address)}</div>
                    <div class="company-sub">☎ Hotline: <strong>{html.escape(data.company_hotline)}</strong> | MST: <strong>{html.escape(data.company_tax_code)}</strong></div>
                </td>
                <td style="width: 35%;" class="barcode-cell">
                    {data.barcode_svg}
                </td>
            </tr>
        </table>

        <!-- Tiêu đề chứng từ -->
        <div class="title-section">
            <h1 class="doc-title">PHIẾU THU TIỀN</h1>
            <div class="doc-meta">
                Số phiếu: <strong style="color: #0f172a; font-family: monospace; font-size: 13px;">{p_id}</strong>
                &nbsp;|&nbsp; Ngày lập: <strong>{p_date}</strong>
            </div>
        </div>

        <!-- Thông tin chi tiết Người nộp tiền -->
        <div class="info-table">
            <div class="info-row">
                <span class="info-label">Đơn vị / Đại lý nộp tiền:</span>
                <span class="info-value">{c_name} (Mã: {c_code})</span>
            </div>
            <div class="info-row">
                <span class="info-label">Mã số thuế:</span>
                <span class="info-value">{c_tax}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Số điện thoại liên hệ:</span>
                <span class="info-value">{c_phone}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Địa chỉ đại lý:</span>
                <span class="info-value">{c_addr}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Hình thức nộp tiền:</span>
                <span class="info-value">{method_str}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Mã bút toán / Tham chiếu:</span>
                <span class="info-value" style="font-family: monospace;">{ref_code}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Lý do thu / Ghi chú:</span>
                <span class="info-value" style="font-style: italic;">{notes}</span>
            </div>
        </div>

        <!-- Khối nổi bật số tiền thu -->
        <div class="amount-highlight">
            <div class="amount-title">Số tiền đã ghi nhận:</div>
            <div class="amount-number">{data.amount_formatted}</div>
            <div class="amount-words">Viết bằng chữ: <strong>{data.amount_in_words}</strong></div>
        </div>

        <!-- Danh sách hóa đơn đối trừ công nợ -->
        <div class="table-section-title">Danh mục hóa đơn bán hàng được đối trừ công nợ:</div>
        <table class="alloc-table">
            <thead>
                <tr>
                    <th style="width: 40px; text-align: center;">STT</th>
                    <th style="width: 140px;">Số Hóa Đơn</th>
                    <th>Nội Dung Đối Trừ</th>
                    <th style="width: 140px; text-align: right;">Số Tiền Gạch Nợ</th>
                    <th style="width: 110px; text-align: center;">Trạng Thái</th>
                </tr>
            </thead>
            <tbody>
                {alloc_tbody}
            </tbody>
        </table>

        <!-- Khối 3 chữ ký: Người nộp tiền, Người lập phiếu, Thủ quỹ -->
        <table class="signature-table">
            <tr>
                <td>
                    <div class="sig-title">NGƯỜI NỘP TIỀN</div>
                    <div class="sig-sub">(Ký và ghi rõ họ tên)</div>
                    <div class="sig-space"></div>
                    <div class="sig-name">{c_name}</div>
                </td>
                <td>
                    <div class="sig-title">NGƯỜI THU TIỀN</div>
                    <div class="sig-sub">(Ký và ghi rõ họ tên)</div>
                    <div class="sig-space"></div>
                    <div class="sig-name">{collector}</div>
                </td>
                <td>
                    <div class="sig-title">KẾ TOÁN TRƯỞNG / THỦ QUỸ</div>
                    <div class="sig-sub">(Ký, đóng dấu xác nhận)</div>
                    <div class="sig-space"></div>
                    <div class="sig-name">Đỗ Thị Kế Toán Trưởng</div>
                </td>
            </tr>
        </table>

        <div class="footer-note">
            (*) Chứng từ gốc có giá trị xác nhận nộp tiền ngay tại chỗ giữa Đại lý và Hệ thống Sales-Warehouse. Quý khách vui lòng lưu giữ để đối chiếu công nợ.
        </div>
    </div>
</body>
</html>"""
        return html_content
