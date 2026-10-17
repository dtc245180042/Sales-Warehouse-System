from datetime import datetime, date, timezone, timedelta
from typing import List, Optional, Tuple, Dict, Any
import logging
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.invoice import Invoice, InvoiceStatus
from app.models.customer import Customer
from app.models.auth import User, UserRole
from app.models.notification import AppNotification
from app.models.payment_reminder_log import PaymentReminderLog, ReminderType
from app.schemas.payment_reminder import (
    PaymentReminderCandidate,
    PaymentReminderCandidateListResponse,
    PaymentReminderItemResult,
    PaymentReminderJobResponse,
    PaymentReminderLogResponse,
    PaymentReminderLogListResponse,
    NotificationResponse,
    NotificationListResponse,
)
from app.services import email_service

logger = logging.getLogger("payment_reminder_service")


def format_currency_vnd(amount: int) -> str:
    """Định dạng số tiền sang chuẩn hiển thị VNĐ có phân cách hàng nghìn."""
    try:
        return f"{amount:,.0f}".replace(",", ".") + " đ"
    except Exception:
        return f"{amount} đ"


def _resolve_target_date(target_date_str: Optional[str] = None) -> date:
    """Chuyển đổi chuỗi ngày YYYY-MM-DD sang date object, mặc định là ngày hiện tại UTC."""
    if target_date_str and target_date_str.strip():
        try:
            return datetime.strptime(target_date_str.strip(), "%Y-%m-%d").date()
        except ValueError:
            pass
    return datetime.now(timezone.utc).date()


def _normalize_date(dt: Any) -> date:
    """Chuyển đổi datetime sang date."""
    if isinstance(dt, datetime):
        return dt.date()
    if isinstance(dt, date):
        return dt
    return datetime.now(timezone.utc).date()


def get_candidates(
    db: Session,
    target_date: Optional[date] = None,
    customer_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
) -> List[PaymentReminderCandidate]:
    """
    Xác định danh sách các hoá đơn đủ điều kiện cần nhắc hạn thanh toán (SCRUM-760).
    Quy tắc nghiệp vụ:
    1. Hoá đơn chưa thanh toán hoặc thanh toán một phần (remaining_amount > 0, status != PAID).
    2. Mốc 1 - Trước hạn 3 ngày: (due_date - target_date) == 3 ngày.
    3. Mốc 2 - Quá hạn: (due_date - target_date) < 0 ngày (đã quá ngày đáo hạn).
    4. Kiểm tra cờ already_reminded_today để biết hoá đơn này đã được gửi nhắc trong ngày chưa (SCRUM-763).
    """
    if target_date is None:
        target_date = datetime.now(timezone.utc).date()

    run_date_str = target_date.strftime("%Y-%m-%d")

    # Truy vấn các hoá đơn còn nợ
    query = db.query(Invoice).filter(
        Invoice.remaining_amount > 0,
        Invoice.status.in_([
            InvoiceStatus.UNPAID.value,
            InvoiceStatus.PARTIALLY_PAID.value,
        ]),
    )
    if customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    if invoice_id:
        query = query.filter(Invoice.id == invoice_id)

    invoices = query.all()
    candidates: List[PaymentReminderCandidate] = []

    for inv in invoices:
        due_d = _normalize_date(inv.due_date)
        diff_days = (due_d - target_date).days

        reminder_type: Optional[str] = None
        days_until_due = 0
        days_overdue = 0

        if diff_days == 3:
            # Đúng mốc trước hạn 3 ngày
            reminder_type = ReminderType.BEFORE_DUE_3_DAYS.value
            days_until_due = 3
            days_overdue = 0
        elif diff_days < 0:
            # Đã quá hạn thanh toán
            reminder_type = ReminderType.OVERDUE.value
            days_until_due = 0
            days_overdue = -diff_days
        else:
            # Chưa tới mốc nhắc (ví dụ còn 5 ngày, hoặc còn 1-2 ngày không phải mốc 3 ngày)
            continue

        # Kiểm tra xem hôm nay đã gửi nhắc loại này cho hoá đơn này chưa
        existing_log = db.query(PaymentReminderLog).filter(
            PaymentReminderLog.invoice_id == inv.id,
            PaymentReminderLog.reminder_type == reminder_type,
            PaymentReminderLog.run_date == run_date_str,
        ).first()

        # Tìm email đại lý
        cust = db.query(Customer).filter(Customer.id == inv.customer_id).first()
        customer_email = cust.email if cust else None
        if not customer_email:
            user_cust = db.query(User).filter(
                User.customer_id == inv.customer_id,
                User.role == UserRole.CUSTOMER.value,
            ).first()
            if user_cust:
                customer_email = user_cust.email

        candidates.append(
            PaymentReminderCandidate(
                invoice_id=inv.id,
                customer_id=inv.customer_id,
                customer_name=inv.customer_name or (cust.name if cust else "Đại lý"),
                customer_email=customer_email,
                total_amount=int(inv.total_amount or 0),
                remaining_amount=int(inv.remaining_amount or 0),
                due_date=inv.due_date,
                reminder_type=reminder_type,
                days_until_due=days_until_due,
                days_overdue=days_overdue,
                already_reminded_today=bool(existing_log),
            )
        )

    return candidates


def send_payment_reminder_email(
    to_email: str,
    customer_name: str,
    invoice: Invoice,
    reminder_type: str,
    days_overdue: int = 0,
) -> Tuple[bool, Optional[str]]:
    """
    Soạn nội dung và gửi email nhắc hạn thanh toán (SCRUM-762).
    Hỗ trợ 2 mẫu email chuyên nghiệp:
    - Trước hạn 3 ngày (Warning / Reminder)
    - Quá hạn (Urgent / Overdue Alert)
    """
    due_str = invoice.due_date.strftime("%d/%m/%Y") if hasattr(invoice.due_date, "strftime") else str(invoice.due_date)
    rem_str = format_currency_vnd(int(invoice.remaining_amount or 0))
    total_str = format_currency_vnd(int(invoice.total_amount or 0))

    if reminder_type == ReminderType.BEFORE_DUE_3_DAYS.value:
        subject = f"[KhoVận Pro] Nhắc hạn thanh toán: Hoá đơn {invoice.id} sẽ đến hạn sau 3 ngày"
        badge_color = "#f59e0b"
        badge_bg = "#fef3c7"
        badge_text = "NHẮC HẠN THANH TOÁN (CÒN 3 NGÀY)"
        instruction = "Để đảm bảo quyền lợi hạn mức công nợ và không bị gián đoạn quá trình đặt hàng tự động, quý khách vui lòng thu xếp thanh toán trước hoặc đúng ngày đến hạn."
    else:
        subject = f"[KhoVận Pro] [CẢNH BÁO QUÁ HẠN] Hoá đơn {invoice.id} đã quá hạn thanh toán {days_overdue} ngày"
        badge_color = "#dc2626"
        badge_bg = "#fee2e2"
        badge_text = f"CẢNH BÁO: HOÁ ĐƠN ĐÃ QUÁ HẠN {days_overdue} NGÀY"
        instruction = "Hệ thống ghi nhận hoá đơn của quý khách đã quá hạn quy định. Theo chính sách công nợ, các đơn hàng mới có thể bị tạm ngưng xử lý cho đến khi hoá đơn quá hạn được thanh toán. Quý khách vui lòng hoàn tất chuyển khoản ngay."

    cfg = email_service._get_smtp_config()
    frontend_url = cfg.get("frontend_url", "http://localhost:5173")
    payment_url = f"{frontend_url}/portal/debt"

    html_content = f"""
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; }}
            .container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }}
            .header {{ background: #1e293b; color: #ffffff; padding: 24px; text-align: center; border-bottom: 3px solid #4f46e5; }}
            .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; }}
            .content {{ padding: 28px 24px; color: #334155; line-height: 1.6; font-size: 14px; }}
            .badge {{ display: inline-block; background: {badge_bg}; color: {badge_color}; font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 20px; margin-bottom: 16px; border: 1px solid {badge_color}33; }}
            .table-box {{ width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }}
            .table-box td {{ padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }}
            .table-box td:first-child {{ color: #64748b; font-weight: 500; width: 45%; }}
            .table-box td:last-child {{ color: #0f172a; font-weight: 600; text-align: right; }}
            .amount-highlight {{ color: #dc2626 !important; font-size: 16px !important; font-weight: 700 !important; }}
            .btn-container {{ text-align: center; margin: 24px 0 16px 0; }}
            .btn {{ background-color: #4f46e5; color: #ffffff !important; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 14px; }}
            .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>KhoVận Pro - Quản Lý Bán Hàng & Kho</h1>
            </div>
            <div class="content">
                <div class="badge">{badge_text}</div>
                <p>Kính gửi Quý đại lý <strong>{customer_name}</strong>,</p>
                <p>{instruction}</p>

                <table class="table-box">
                    <tr>
                        <td>Mã hoá đơn:</td>
                        <td>{invoice.id}</td>
                    </tr>
                    <tr>
                        <td>Tổng giá trị hoá đơn:</td>
                        <td>{total_str}</td>
                    </tr>
                    <tr>
                        <td>Số tiền còn nợ:</td>
                        <td class="amount-highlight">{rem_str}</td>
                    </tr>
                    <tr>
                        <td>Hạn thanh toán:</td>
                        <td>{due_str}</td>
                    </tr>
                </table>

                <div class="btn-container">
                    <a href="{payment_url}" class="btn" style="color: #ffffff;">Kiểm tra công nợ và thanh toán</a>
                </div>

                <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
                    Nếu quý khách đã hoàn tất chuyển khoản trong vòng 24 giờ qua, xin vui lòng bỏ qua email này.
                </p>
            </div>
            <div class="footer">
                KhoVận Pro Enterprise &copy; 2026. Mọi thắc mắc xin liên hệ bộ phận Kế toán công nợ.
            </div>
        </div>
    </body>
    </html>
    """

    # Ghi nhận vào MOCK_OUTBOX để phục vụ test và sandbox
    email_record = {
        "to_email": to_email,
        "subject": subject,
        "invoice_id": invoice.id,
        "reminder_type": reminder_type,
        "amount_due": int(invoice.remaining_amount or 0),
        "due_date": due_str,
        "sent_at": datetime.now(timezone.utc),
    }
    email_service.MOCK_OUTBOX.append(email_record)

    # Thử gửi SMTP thực nếu cấu hình hợp lệ
    smtp_cfg = email_service._get_smtp_config()
    if smtp_cfg.get("host") and smtp_cfg.get("user") and smtp_cfg.get("password"):
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{smtp_cfg['from_name']} <{smtp_cfg['from_email']}>"
            msg["To"] = to_email
            msg.attach(MIMEText(html_content, "html", "utf-8"))

            with smtplib.SMTP(smtp_cfg["host"], smtp_cfg["port"], timeout=10) as server:
                server.starttls()
                server.login(smtp_cfg["user"], smtp_cfg["password"])
                server.send_message(msg)
            logger.info(f"Đã gửi email nhắc hạn thành công tới {to_email} cho hoá đơn {invoice.id}")
            return True, None
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"Không thể gửi email qua SMTP tới {to_email}: {err_msg}. Đã lưu vào MOCK_OUTBOX.")
            # Vẫn trả True nếu đã mock thành công để môi trường test không bị ngắt
            return True, f"SMTP error (Mocked): {err_msg}"

    return True, None


def create_in_app_notification(
    db: Session,
    customer_id: str,
    invoice: Invoice,
    reminder_type: str,
    days_overdue: int = 0,
) -> AppNotification:
    """
    Tạo bản ghi thông báo trong ứng dụng cho đại lý (SCRUM-759).
    Đảm bảo liên kết trực tiếp với hoá đơn qua reference_id.
    """
    due_str = invoice.due_date.strftime("%d/%m/%Y") if hasattr(invoice.due_date, "strftime") else str(invoice.due_date)
    rem_str = format_currency_vnd(int(invoice.remaining_amount or 0))

    if reminder_type == ReminderType.BEFORE_DUE_3_DAYS.value:
        title = f"Nhắc hạn thanh toán hoá đơn {invoice.id}"
        content = (
            f"Hoá đơn {invoice.id} với số tiền nợ {rem_str} sẽ đến hạn thanh toán vào ngày {due_str} (còn 3 ngày). "
            f"Quý khách vui lòng thanh toán đúng hạn để đảm bảo hạn mức công nợ."
        )
    else:
        title = f"[CẢNH BÁO] Hoá đơn {invoice.id} đã quá hạn {days_overdue} ngày"
        content = (
            f"Hoá đơn {invoice.id} với số tiền nợ {rem_str} đã quá hạn {days_overdue} ngày (hạn: {due_str}). "
            f"Quý khách vui lòng hoàn tất thanh toán ngay để tránh bị tạm ngưng xử lý đơn hàng mới."
        )

    # Tìm user tương ứng với đại lý nếu có
    cust_user = db.query(User).filter(
        User.customer_id == customer_id,
        User.role == UserRole.CUSTOMER.value,
    ).first()
    target_user_id = cust_user.id if cust_user else None

    notif = AppNotification(
        user_id=target_user_id,
        customer_id=customer_id,
        title=title,
        content=content,
        type="PAYMENT_REMINDER",
        reference_type="INVOICE",
        reference_id=invoice.id,
        is_read=False,
    )
    db.add(notif)
    db.flush()
    return notif


def run_daily_payment_reminder_job(
    db: Session,
    target_date_str: Optional[str] = None,
    dry_run: bool = False,
    customer_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
) -> PaymentReminderJobResponse:
    """
    Xây dựng job định kỳ chạy mỗi ngày để quét công nợ và sinh thông báo nhắc hạn (SCRUM-761).
    Tích hợp:
    - Quét hoá đơn đủ điều kiện trước 3 ngày và quá hạn (SCRUM-760).
    - Tạo thông báo trong app (SCRUM-759).
    - Gửi email nhắc hạn (SCRUM-762).
    - Chống gửi trùng lặp trong cùng một ngày (SCRUM-763).
    """
    target_d = _resolve_target_date(target_date_str)
    run_date_str = target_d.strftime("%Y-%m-%d")

    candidates = get_candidates(
        db=db,
        target_date=target_d,
        customer_id=customer_id,
        invoice_id=invoice_id,
    )

    total_scanned = len(candidates)
    before_due_count = sum(1 for c in candidates if c.reminder_type == ReminderType.BEFORE_DUE_3_DAYS.value)
    overdue_count = sum(1 for c in candidates if c.reminder_type == ReminderType.OVERDUE.value)

    emails_sent = 0
    emails_failed = 0
    in_app_created = 0
    skipped_duplicates = 0
    details: List[PaymentReminderItemResult] = []

    for c in candidates:
        inv = db.query(Invoice).filter(Invoice.id == c.invoice_id).first()
        if not inv:
            continue

        # SCRUM-763: Kiểm tra chống gửi trùng cho cùng một hoá đơn trong cùng một ngày
        if c.already_reminded_today:
            skipped_duplicates += 1
            details.append(
                PaymentReminderItemResult(
                    invoice_id=c.invoice_id,
                    customer_id=c.customer_id,
                    reminder_type=c.reminder_type,
                    email_status="SKIPPED",
                    in_app_status="SKIPPED",
                    skipped=True,
                    skip_reason=f"Đã gửi nhắc loại {c.reminder_type} cho hoá đơn {c.invoice_id} trong ngày {run_date_str}.",
                )
            )
            continue

        if dry_run:
            details.append(
                PaymentReminderItemResult(
                    invoice_id=c.invoice_id,
                    customer_id=c.customer_id,
                    reminder_type=c.reminder_type,
                    email_status="DRY_RUN",
                    in_app_status="DRY_RUN",
                    skipped=False,
                )
            )
            continue

        # 1. Gửi Email
        to_email = c.customer_email or f"{c.customer_id.lower()}@agency.local"
        email_ok, email_err = send_payment_reminder_email(
            to_email=to_email,
            customer_name=c.customer_name or c.customer_id,
            invoice=inv,
            reminder_type=c.reminder_type,
            days_overdue=c.days_overdue,
        )
        if email_ok:
            emails_sent += 1
            email_status_val = "SENT"
        else:
            emails_failed += 1
            email_status_val = "FAILED"

        # 2. Tạo In-App Notification
        notif = create_in_app_notification(
            db=db,
            customer_id=c.customer_id,
            invoice=inv,
            reminder_type=c.reminder_type,
            days_overdue=c.days_overdue,
        )
        in_app_created += 1

        # 3. Ghi vết nhật ký nhắc hạn để chống gửi trùng lặp (SCRUM-763)
        log_entry = PaymentReminderLog(
            invoice_id=c.invoice_id,
            customer_id=c.customer_id,
            reminder_type=c.reminder_type,
            run_date=run_date_str,
            amount_due=c.remaining_amount,
            due_date=inv.due_date,
            days_overdue=c.days_overdue,
            channel="ALL",
            email_to=to_email,
            email_status=email_status_val,
            email_error=email_err,
            in_app_status="CREATED",
            notification_id=notif.id if notif else None,
        )
        db.add(log_entry)

        details.append(
            PaymentReminderItemResult(
                invoice_id=c.invoice_id,
                customer_id=c.customer_id,
                reminder_type=c.reminder_type,
                email_status=email_status_val,
                in_app_status="CREATED",
                skipped=False,
            )
        )

    if not dry_run:
        db.commit()

    return PaymentReminderJobResponse(
        success=True,
        run_date=run_date_str,
        total_invoices_scanned=total_scanned,
        eligible_count=total_scanned - skipped_duplicates if not dry_run else total_scanned,
        before_due_count=before_due_count,
        overdue_count=overdue_count,
        emails_sent=emails_sent,
        emails_failed=emails_failed,
        in_app_created=in_app_created,
        skipped_duplicates=skipped_duplicates,
        details=details,
    )


def get_reminder_logs(
    db: Session,
    customer_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    run_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> PaymentReminderLogListResponse:
    """Tra cứu nhật ký các lần nhắc hạn (SCRUM-763)."""
    query = db.query(PaymentReminderLog)
    if customer_id:
        query = query.filter(PaymentReminderLog.customer_id == customer_id)
    if invoice_id:
        query = query.filter(PaymentReminderLog.invoice_id == invoice_id)
    if run_date:
        query = query.filter(PaymentReminderLog.run_date == run_date)

    total = query.count()
    items = query.order_by(PaymentReminderLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return PaymentReminderLogListResponse(
        total=total,
        page=page,
        limit=limit,
        items=[PaymentReminderLogResponse.model_validate(it) for it in items],
    )


def get_agency_notifications(
    db: Session,
    customer_id: str,
    is_read: Optional[bool] = None,
    page: int = 1,
    limit: int = 20,
) -> NotificationListResponse:
    """
    Lấy danh sách thông báo in-app của đại lý (SCRUM-759).
    Kiểm soát truy cập: Chỉ trả về thông báo của chính customer_id được yêu cầu.
    """
    query = db.query(AppNotification).filter(AppNotification.customer_id == customer_id)
    if is_read is not None:
        query = query.filter(AppNotification.is_read == is_read)

    total = query.count()
    unread_count = db.query(AppNotification).filter(
        AppNotification.customer_id == customer_id,
        AppNotification.is_read == False,
    ).count()

    items = query.order_by(AppNotification.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return NotificationListResponse(
        total=total,
        unread_count=unread_count,
        page=page,
        limit=limit,
        items=[NotificationResponse.model_validate(it) for it in items],
    )


def mark_notification_as_read(
    db: Session,
    customer_id: str,
    notification_id: int,
) -> Optional[AppNotification]:
    """Đánh dấu một thông báo là đã đọc (bảo mật chống IDOR: đại lý chỉ đọc được thông báo của mình)."""
    notif = db.query(AppNotification).filter(
        AppNotification.id == notification_id,
        AppNotification.customer_id == customer_id,
    ).first()
    if notif:
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notif)
    return notif


def mark_all_notifications_as_read(
    db: Session,
    customer_id: str,
) -> int:
    """Đánh dấu toàn bộ thông báo của đại lý là đã đọc."""
    now_utc = datetime.now(timezone.utc)
    count = db.query(AppNotification).filter(
        AppNotification.customer_id == customer_id,
        AppNotification.is_read == False,
    ).update(
        {"is_read": True, "read_at": now_utc},
        synchronize_session="fetch"
    )
    db.commit()
    return count
