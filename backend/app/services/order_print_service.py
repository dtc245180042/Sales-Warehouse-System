"""
Order Print Service (SCRUM-614, SCRUM-615, SCRUM-617, SCRUM-619)
Dịch vụ xử lý dữ liệu in ấn, phân quyền RBAC và sinh trang in ĐƠN ĐẶT HÀNG chuẩn A4 kèm Barcode.
"""

import html
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.auth import User, UserRole
from app.models.order import Order
from app.models.customer import Customer
from app.models.order_delivery_profile import OrderDeliveryProfile
from app.models.customer_assignment import CustomerAssignment
from app.services.barcode_service import generate_code128_svg


def format_currency_vnd(amount: Optional[float]) -> str:
    """Định dạng số tiền theo chuẩn VNĐ (ví dụ: 1,500,000 đ)."""
    if amount is None:
        return "0 đ"
    rounded = int(round(float(amount)))
    return f"{rounded:,} đ".replace(",", ".")


def _normalize_role(role_val: Optional[str]) -> str:
    """Chuẩn hóa tên vai trò về dạng lowercase snake_case (ví dụ: 'Sales Rep' -> 'sales_rep')."""
    if not role_val:
        return ""
    return str(role_val).strip().lower().replace(" ", "_").replace("-", "_")


def validate_order_print_permission(order: Order, user: User, db: Session) -> None:
    """
    Ràng buộc quyền truy cập chức năng in/xuất PDF theo đơn hàng được phân công (SCRUM-619).
    - admin, sales_manager, warehouse, wh_manager, accountant: Được phép in mọi đơn.
    - sales_rep: Chỉ được in đơn do mình tạo (staff_id/staff_name) HOẶC đơn thuộc đại lý mình phụ trách.
    - customer: Được in đơn của chính mình.
    """
    role = _normalize_role(user.role)
    
    # 1. Các vai trò quản trị và nghiệp vụ kho / kế toán có toàn quyền xem chứng từ
    if role in [
        "admin",
        "sales_manager",
        "warehouse",
        "wh_manager",
        "accountant",
    ]:
        return

    # 2. Vai trò khách hàng / đại lý: Chỉ xem đơn của chính mình
    if role == "customer":
        if order.customer_id != str(user.id) and order.customer_name != user.full_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập chứng từ đơn hàng của tài khoản khác."
            )
        return

    # 3. Vai trò Nhân viên kinh doanh (sales_rep)
    if role == "sales_rep":
        # Trường hợp A: Trực tiếp là người tạo đơn
        if order.staff_id and str(order.staff_id) == str(user.id):
            return
        if order.staff_name and user.full_name and order.staff_name.strip().lower() == user.full_name.strip().lower():
            return

        # Trường hợp B: Được phân công phụ trách đại lý này trong customer_assignments
        assignment = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == order.customer_id,
            CustomerAssignment.assigned_staff_id == user.id
        ).first()
        if assignment:
            return

        # Trường hợp C: Đại lý có trường assigned_sales_rep khớp với username hoặc full_name của user
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        if customer and customer.assigned_sales_rep:
            rep = customer.assigned_sales_rep.strip().lower()
            if rep in [user.username.strip().lower(), (user.full_name or "").strip().lower()]:
                return

        # Nếu không thỏa mãn bất kỳ điều kiện nào -> Chặn 403
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập hoặc in đơn hàng của đại lý này do chưa được phân công phụ trách."
        )

    # Vai trò không xác định khác
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Vai trò người dùng của bạn không được cấp quyền in chứng từ đơn hàng."
    )


def get_order_print_payload(db: Session, order_id_or_code: str, user: User) -> Dict[str, Any]:
    """
    Truy vấn và đóng gói toàn bộ dữ liệu đơn hàng phục vụ in ấn / preview (SCRUM-614).
    """
    order = db.query(Order).filter(
        (Order.id == order_id_or_code) | (Order.code == order_id_or_code)
    ).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng với mã '{order_id_or_code}'."
        )

    # Kiểm tra quyền truy cập (SCRUM-619)
    validate_order_print_permission(order, user, db)

    # Lấy thông tin khách hàng
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()

    # Lấy thông tin điểm giao hàng (S3-04 / SCRUM-441)
    delivery_profile = db.query(OrderDeliveryProfile).filter(
        OrderDeliveryProfile.order_id == order.id
    ).first()

    # Sinh mã Barcode Code128 SVG (SCRUM-617)
    barcode_svg = generate_code128_svg(order.code or order.id, module_width=1.5, height=44, include_text=True)

    # Trạng thái và Watermark
    st = (order.status or "draft").lower()
    status_config = {
        "draft": {
            "title": "BẢN NHÁP",
            "badge_color": "#64748b",
            "badge_bg": "#f1f5f9",
            "watermark": "BẢN NHÁP — CHƯA XÁC NHẬN",
            "is_valid": False,
        },
        "pending": {
            "title": "CHỜ PHÊ DUYỆT",
            "badge_color": "#d97706",
            "badge_bg": "#fef3c7",
            "watermark": "CHỜ PHÊ DUYỆT",
            "is_valid": False,
        },
        "confirmed": {
            "title": "ĐÃ XÁC NHẬN",
            "badge_color": "#0284c7",
            "badge_bg": "#e0f2fe",
            "watermark": None,
            "is_valid": True,
        },
        "shipping": {
            "title": "ĐANG GIAO HÀNG",
            "badge_color": "#2563eb",
            "badge_bg": "#dbeafe",
            "watermark": None,
            "is_valid": True,
        },
        "completed": {
            "title": "HOÀN TẤT",
            "badge_color": "#16a34a",
            "badge_bg": "#dcfce7",
            "watermark": None,
            "is_valid": True,
        },
        "cancelled": {
            "title": "ĐÃ HỦY",
            "badge_color": "#dc2626",
            "badge_bg": "#fee2e2",
            "watermark": "ĐƠN HÀNG ĐÃ HỦY",
            "is_valid": False,
        },
    }
    cfg = status_config.get(st, status_config["draft"])

    # Tính toán các dòng hàng
    items_data = []
    calculated_subtotal = 0.0
    for idx, item in enumerate(order.items, start=1):
        line_qty = int(item.quantity or 1)
        line_price = float(item.price or 0.0)
        line_subtotal_raw = line_qty * line_price
        calculated_subtotal += line_subtotal_raw
        
        # Chiết khấu dòng
        line_discount_amount = float(item.discount or 0.0)
        line_final = float(item.subtotal if item.subtotal is not None else (line_subtotal_raw - line_discount_amount))
        
        discount_display = "-"
        if item.discount_rate and float(item.discount_rate) > 0:
            discount_display = f"{float(item.discount_rate):.1f}%"
        elif line_discount_amount > 0:
            discount_display = format_currency_vnd(line_discount_amount)

        items_data.append({
            "stt": idx,
            "product_id": item.product_id,
            "sku": item.sku or item.product_id,
            "name": item.name,
            "unit": item.unit or "cái",
            "quantity": line_qty,
            "price": line_price,
            "price_formatted": format_currency_vnd(line_price),
            "discount_display": discount_display,
            "discount_amount": line_discount_amount,
            "subtotal": line_final,
            "subtotal_formatted": format_currency_vnd(line_final),
            "applied_discount_policy_name": item.applied_discount_policy_name,
        })

    # Tính toán tổng kết tài chính (Khớp 100% database)
    subtotal_before_discount = calculated_subtotal if calculated_subtotal > 0 else float(order.subtotal or 0.0)
    discount_total = float(order.discount or 0.0)
    net_after_discount = max(0.0, subtotal_before_discount - discount_total)
    tax_amount = float(order.tax or 0.0)
    final_total = float(order.total or (net_after_discount + tax_amount))
    paid_amount = float(order.paid_amount or 0.0)
    remaining_debt = max(0.0, final_total - paid_amount)

    # Ngày tạo đơn
    created_dt_str = ""
    if order.created_at:
        try:
            created_dt_str = order.created_at.strftime("%d/%m/%Y %H:%M")
        except Exception:
            created_dt_str = str(order.created_at)[:16]

    # Điểm giao hàng (có cơ chế Fallback đầy đủ nếu chưa có OrderDeliveryProfile)
    receiver_name = (
        (delivery_profile.delivery_receiver_name if delivery_profile and delivery_profile.delivery_receiver_name else None)
        or (customer.name if customer else order.customer_name)
    )
    receiver_phone = (
        (delivery_profile.delivery_phone if delivery_profile and delivery_profile.delivery_phone else None)
        or (customer.phone if customer else order.customer_phone)
        or "-"
    )
    delivery_addr = (
        (delivery_profile.delivery_address if delivery_profile and delivery_profile.delivery_address else None)
        or (customer.address if customer else order.customer_address)
        or "Giao tại trụ sở đại lý"
    )
    expected_delivery_date = (
        (delivery_profile.expected_delivery_date if delivery_profile and delivery_profile.expected_delivery_date else None)
        or "Theo lịch trình giao hàng tiêu chuẩn"
    )

    payload = {
        "order_id": order.id,
        "order_code": order.code,
        "created_at": created_dt_str,
        "status": st,
        "status_title": cfg["title"],
        "status_badge_color": cfg["badge_color"],
        "status_badge_bg": cfg["badge_bg"],
        "watermark": cfg["watermark"],
        "is_valid": cfg["is_valid"],
        "barcode_svg": barcode_svg,
        "company_info": {
            "name": "CÔNG TY CỔ PHẦN PHÂN PHỐI THƯƠNG MẠI S&W",
            "address": "Tầng 5, Tòa nhà S&W Tower, Cầu Giấy, TP. Hà Nội",
            "hotline": "1900-6868",
            "email": "hotro@sales-warehouse.local",
        },
        "customer": {
            "id": order.customer_id,
            "code": customer.code if customer else order.customer_id,
            "name": order.customer_name,
            "phone": order.customer_phone or (customer.phone if customer else "-"),
            "tax_code": customer.tax_code if customer else "-",
            "address": order.customer_address or (customer.address if customer else "-"),
        },
        "delivery": {
            "receiver_name": receiver_name,
            "receiver_phone": receiver_phone,
            "address": delivery_addr,
            "expected_date": expected_delivery_date,
            "notes": delivery_profile.delivery_notes if delivery_profile and delivery_profile.delivery_notes else "-",
        },
        "staff": {
            "id": order.staff_id or "-",
            "name": order.staff_name or (user.full_name if user else "Nhân viên kinh doanh"),
        },
        "items": items_data,
        "financials": {
            "subtotal_before_discount": subtotal_before_discount,
            "subtotal_before_discount_formatted": format_currency_vnd(subtotal_before_discount),
            "discount_total": discount_total,
            "discount_total_formatted": format_currency_vnd(discount_total),
            "net_after_discount": net_after_discount,
            "net_after_discount_formatted": format_currency_vnd(net_after_discount),
            "tax_amount": tax_amount,
            "tax_amount_formatted": format_currency_vnd(tax_amount),
            "final_total": final_total,
            "final_total_formatted": format_currency_vnd(final_total),
            "paid_amount": paid_amount,
            "paid_amount_formatted": format_currency_vnd(paid_amount),
            "remaining_debt": remaining_debt,
            "remaining_debt_formatted": format_currency_vnd(remaining_debt),
            "payment_method": order.payment_method or "Ghi nợ công nợ",
            "payment_status": order.payment_status or "unpaid",
        },
        "note": order.note or "Không có ghi chú bổ sung.",
    }
    return payload


def generate_order_print_html(db: Session, order_id_or_code: str, user: User) -> str:
    """
    Sinh tài liệu HTML in ấn chuẩn A4 hoàn chỉnh (Single Source of Truth) (SCRUM-614).
    Sử dụng System Fonts Offline-First, chống XSS triệt để, có watermark và Barcode SVG.
    """
    p = get_order_print_payload(db, order_id_or_code, user)

    # Chống XSS an toàn cho tất cả dữ liệu người dùng
    c_name = html.escape(str(p["customer"]["name"]))
    c_code = html.escape(str(p["customer"]["code"]))
    c_mst = html.escape(str(p["customer"]["tax_code"]))
    c_phone = html.escape(str(p["customer"]["phone"]))
    c_addr = html.escape(str(p["customer"]["address"]))

    d_name = html.escape(str(p["delivery"]["receiver_name"]))
    d_phone = html.escape(str(p["delivery"]["receiver_phone"]))
    d_addr = html.escape(str(p["delivery"]["address"]))
    d_date = html.escape(str(p["delivery"]["expected_date"]))

    order_code = html.escape(str(p["order_code"]))
    created_at = html.escape(str(p["created_at"]))
    staff_name = html.escape(str(p["staff"]["name"]))
    note = html.escape(str(p["note"]))

    # Khối watermark chìm nếu có
    watermark_html = ""
    if p["watermark"]:
        wm_text = html.escape(str(p["watermark"]))
        watermark_html = f'<div class="watermark-overlay">{wm_text}</div>'

    # Render danh sách dòng hàng
    rows_html = []
    for item in p["items"]:
        sku = html.escape(str(item["sku"]))
        name = html.escape(str(item["name"]))
        unit = html.escape(str(item["unit"]))
        policy_note = ""
        if item.get("applied_discount_policy_name"):
            policy_note = f'<br/><span style="font-size:10px; color:#0284c7;">🏷️ {html.escape(item["applied_discount_policy_name"])}</span>'

        rows_html.append(f"""
        <tr>
            <td style="text-align: center;">{item['stt']}</td>
            <td style="font-family: monospace; font-size: 11px;">{sku}</td>
            <td>
                <strong>{name}</strong>{policy_note}
            </td>
            <td style="text-align: center;">{unit}</td>
            <td style="text-align: right; font-weight: bold;">{item['quantity']}</td>
            <td style="text-align: right;">{item['price_formatted']}</td>
            <td style="text-align: center; color: #b45309; font-weight: 600;">{item['discount_display']}</td>
            <td style="text-align: right; font-weight: bold;">{item['subtotal_formatted']}</td>
        </tr>
        """)

    items_tbody = "".join(rows_html)

    # Tài liệu HTML in ấn hoàn chỉnh
    full_html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đơn đặt hàng {order_code}</title>
    <style>
        /* CSS Reset & System Fonts Offline-First */
        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 12px;
            line-height: 1.45;
            color: #1e293b;
            background-color: #f8fafc;
            padding: 20px;
        }}
        .page-container {{
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: #ffffff;
            padding: 16mm 18mm;
            position: relative;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            border-radius: 4px;
        }}
        
        /* Watermark chìm chéo 45 độ */
        .watermark-overlay {{
            position: absolute;
            top: 45%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-35deg);
            font-size: 42px;
            font-weight: 900;
            color: rgba(220, 38, 38, 0.12);
            text-transform: uppercase;
            letter-spacing: 4px;
            pointer-events: none;
            white-space: nowrap;
            z-index: 10;
            user-select: none;
            border: 5px dashed rgba(220, 38, 38, 0.15);
            padding: 15px 40px;
            border-radius: 12px;
        }}

        /* Header công ty & Barcode */
        .header-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
        }}
        .header-table td {{
            vertical-align: middle;
        }}
        .company-title {{
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }}
        .company-sub {{
            font-size: 11px;
            color: #475569;
            margin-top: 2px;
        }}
        .barcode-container {{
            text-align: right;
        }}

        /* Tiêu đề Đơn đặt hàng */
        .doc-title-section {{
            text-align: center;
            margin: 14px 0 16px 0;
        }}
        .doc-title {{
            font-size: 22px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-bottom: 4px;
        }}
        .doc-meta {{
            font-size: 11px;
            color: #64748b;
        }}
        .status-badge {{
            display: inline-block;
            margin-top: 6px;
            padding: 3px 12px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 700;
            color: {p['status_badge_color']};
            background-color: {p['status_badge_bg']};
            border: 1px solid {p['status_badge_color']}40;
        }}

        /* Bảng thông tin khách hàng & điểm giao */
        .info-grid {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
        }}
        .info-grid td {{
            width: 50%;
            padding: 10px 14px;
            vertical-align: top;
            font-size: 11.5px;
        }}
        .info-grid td:first-child {{
            border-right: 1px solid #e2e8f0;
        }}
        .section-heading {{
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #0369a1;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
            border-bottom: 1px dashed #cbd5e1;
            padding-bottom: 3px;
        }}
        .info-line {{
            margin-bottom: 3px;
        }}
        .info-label {{
            color: #64748b;
            display: inline-block;
            min-width: 90px;
        }}
        .info-val {{
            font-weight: 600;
            color: #0f172a;
        }}

        /* Bảng dòng hàng */
        .items-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
        }}
        .items-table th, .items-table td {{
            border: 1px solid #cbd5e1;
            padding: 7px 8px;
            font-size: 11.5px;
        }}
        .items-table th {{
            background-color: #f1f5f9;
            color: #0f172a;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 10.5px;
            letter-spacing: 0.3px;
        }}

        /* Khối tài chính tổng kết */
        .summary-container {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
        }}
        .summary-container td {{
            vertical-align: top;
        }}
        .note-box {{
            width: 52%;
            padding: 10px 12px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            font-size: 11px;
            color: #475569;
        }}
        .totals-table {{
            width: 45%;
            margin-left: auto;
            border-collapse: collapse;
            font-size: 11.5px;
        }}
        .totals-table td {{
            padding: 4px 6px;
        }}
        .totals-label {{
            color: #475569;
        }}
        .totals-val {{
            text-align: right;
            font-weight: 600;
            color: #0f172a;
        }}
        .total-highlight {{
            border-top: 2px solid #0f172a;
            border-bottom: 2px solid #0f172a;
            font-size: 13px !important;
            font-weight: 900 !important;
            color: #0369a1 !important;
            padding: 6px !important;
        }}

        /* Khối chữ ký */
        .signature-table {{
            width: 100%;
            margin-top: 20px;
            border-collapse: collapse;
            text-align: center;
        }}
        .signature-table td {{
            width: 50%;
            vertical-align: top;
            padding: 8px;
        }}
        .sig-title {{
            font-weight: 800;
            font-size: 11.5px;
            text-transform: uppercase;
            color: #0f172a;
        }}
        .sig-sub {{
            font-size: 10px;
            color: #64748b;
            font-style: italic;
            margin-top: 2px;
        }}
        .sig-space {{
            height: 60px;
        }}
        .sig-name {{
            font-weight: 700;
            font-size: 11.5px;
            color: #0f172a;
        }}

        .footer-note {{
            margin-top: 22px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            font-size: 9.5px;
            color: #94a3b8;
            text-align: center;
            font-style: italic;
        }}

        /* Tối ưu hóa cho lệnh in A4 và PDF xuất */
        @media print {{
            body {{
                background-color: #ffffff;
                padding: 0;
            }}
            .page-container {{
                width: 100%;
                min-height: auto;
                box-shadow: none;
                padding: 0;
                margin: 0;
            }}
            @page {{
                size: A4 portrait;
                margin: 12mm 15mm;
            }}
        }}
    </style>
</head>
<body>
    <div class="page-container">
        {watermark_html}

        <!-- Header Công ty & Barcode -->
        <table class="header-table">
            <tr>
                <td style="width: 60%;">
                    <div class="company-title">{html.escape(p['company_info']['name'])}</div>
                    <div class="company-sub">🏢 {html.escape(p['company_info']['address'])}</div>
                    <div class="company-sub">☎ Hotline: <strong>{html.escape(p['company_info']['hotline'])}</strong> | ✉ {html.escape(p['company_info']['email'])}</div>
                </td>
                <td style="width: 40%;" class="barcode-container">
                    {p['barcode_svg']}
                </td>
            </tr>
        </table>

        <!-- Tiêu đề Đơn đặt hàng -->
        <div class="doc-title-section">
            <h1 class="doc-title">ĐƠN ĐẶT HÀNG</h1>
            <div class="doc-meta">
                Mã đơn: <strong style="color: #0f172a; font-family: monospace; font-size: 13px;">{order_code}</strong>
                &nbsp;|&nbsp; Ngày lập: <strong>{created_at}</strong>
                &nbsp;|&nbsp; NVKD: <strong>{staff_name}</strong>
            </div>
            <div>
                <span class="status-badge">● {html.escape(p['status_title'])}</span>
            </div>
        </div>

        <!-- Bảng 2 cột: Đại lý & Điểm giao hàng -->
        <table class="info-grid">
            <tr>
                <td>
                    <div class="section-heading">👤 Thông tin Đại lý / Khách hàng</div>
                    <div class="info-line"><span class="info-label">Tên đại lý:</span> <span class="info-val">{c_name}</span></div>
                    <div class="info-line"><span class="info-label">Mã khách hàng:</span> <span class="info-val" style="font-family: monospace;">{c_code}</span></div>
                    <div class="info-line"><span class="info-label">Mã số thuế:</span> <span class="info-val">{c_mst}</span></div>
                    <div class="info-line"><span class="info-label">Số điện thoại:</span> <span class="info-val">{c_phone}</span></div>
                    <div class="info-line"><span class="info-label">Địa chỉ trụ sở:</span> <span class="info-val">{c_addr}</span></div>
                </td>
                <td>
                    <div class="section-heading">📍 Địa điểm giao hàng (S3-04)</div>
                    <div class="info-line"><span class="info-label">Người nhận hàng:</span> <span class="info-val">{d_name}</span></div>
                    <div class="info-line"><span class="info-label">Số ĐT nhận:</span> <span class="info-val">{d_phone}</span></div>
                    <div class="info-line"><span class="info-label">Địa chỉ kho giao:</span> <span class="info-val">{d_addr}</span></div>
                    <div class="info-line"><span class="info-label">Ngày giao dự kiến:</span> <span class="info-val" style="color: #0284c7;">{d_date}</span></div>
                </td>
            </tr>
        </table>

        <!-- Bảng chi tiết sản phẩm -->
        <table class="items-table">
            <thead>
                <tr>
                    <th style="width: 32px; text-align: center;">STT</th>
                    <th style="width: 85px;">Mã SKU</th>
                    <th>Tên sản phẩm & Quy cách</th>
                    <th style="width: 50px; text-align: center;">ĐVT</th>
                    <th style="width: 45px; text-align: right;">SL</th>
                    <th style="width: 85px; text-align: right;">Đơn giá</th>
                    <th style="width: 65px; text-align: center;">CK</th>
                    <th style="width: 100px; text-align: right;">Thành tiền</th>
                </tr>
            </thead>
            <tbody>
                {items_tbody}
            </tbody>
        </table>

        <!-- Khối Tổng kết tài chính & Ghi chú -->
        <table class="summary-container">
            <tr>
                <td class="note-box">
                    <strong style="color: #0f172a;">📝 Ghi chú đơn hàng:</strong>
                    <p style="margin-top: 4px; font-style: italic;">{note}</p>
                    <p style="margin-top: 8px; font-size: 10px; color: #64748b;">
                        Hình thức thanh toán: <strong>{html.escape(p['financials']['payment_method'])}</strong>
                    </p>
                </td>
                <td style="width: 48%;">
                    <table class="totals-table">
                        <tr>
                            <td class="totals-label">Cộng tiền hàng (chưa CK):</td>
                            <td class="totals-val">{p['financials']['subtotal_before_discount_formatted']}</td>
                        </tr>
                        <tr>
                            <td class="totals-label">Tổng chiết khấu sản lượng:</td>
                            <td class="totals-val" style="color: #b45309;">-{p['financials']['discount_total_formatted']}</td>
                        </tr>
                        <tr>
                            <td class="totals-label">Tiền hàng sau chiết khấu:</td>
                            <td class="totals-val">{p['financials']['net_after_discount_formatted']}</td>
                        </tr>
                        <tr>
                            <td class="totals-label">Thuế VAT:</td>
                            <td class="totals-val">{p['financials']['tax_amount_formatted']}</td>
                        </tr>
                        <tr class="total-highlight">
                            <td style="font-weight: 800;">TỔNG CỘNG THANH TOÁN:</td>
                            <td style="text-align: right; font-weight: 900;">{p['financials']['final_total_formatted']}</td>
                        </tr>
                        <tr>
                            <td class="totals-label">Số tiền đã thanh toán:</td>
                            <td class="totals-val" style="color: #16a34a;">{p['financials']['paid_amount_formatted']}</td>
                        </tr>
                        <tr>
                            <td class="totals-label">Số tiền còn lại (Ghi nợ):</td>
                            <td class="totals-val" style="color: #dc2626; font-weight: 800;">{p['financials']['remaining_debt_formatted']}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <!-- Khối 2 Chữ ký: Đại lý & NVKD -->
        <table class="signature-table">
            <tr>
                <td>
                    <div class="sig-title">ĐẠI DIỆN ĐẠI LÝ XÁC NHẬN</div>
                    <div class="sig-sub">(Ký, ghi rõ họ tên và đóng dấu)</div>
                    <div class="sig-space"></div>
                    <div class="sig-name">{c_name}</div>
                </td>
                <td>
                    <div class="sig-title">ĐẠI DIỆN KINH DOANH</div>
                    <div class="sig-sub">(Ký và ghi rõ họ tên)</div>
                    <div class="sig-space"></div>
                    <div class="sig-name">{staff_name}</div>
                </td>
            </tr>
        </table>

        <div class="footer-note">
            (*) Đơn đặt hàng là cơ sở pháp lý đối soát giao nhận và công nợ giữa Đại lý và Công ty. Quý khách vui lòng kiểm tra kỹ số lượng, chủng loại và đơn giá trước khi ký xác nhận.
        </div>
    </div>
</body>
</html>"""
    return full_html
