import os
import secrets
import smtplib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import event, inspect
from app.models.auth import User

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("email_service")

def _get_smtp_config():
    from dotenv import load_dotenv
    load_dotenv(override=True)
    return {
        "host": os.getenv("SMTP_HOST", ""),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_email": os.getenv("EMAILS_FROM_EMAIL", os.getenv("SMTP_USER", "noreply@saleswarehouse.com")),
        "from_name": os.getenv("EMAILS_FROM_NAME", "KhoVận Pro - Quản Lý Bán Hàng & Kho"),
        "frontend_url": os.getenv("FRONTEND_URL", "http://localhost:5173"),
    }

# Hộp thư giả lập trong bộ nhớ phục vụ kiểm thử và demo (SCRUM-295)
MOCK_OUTBOX: List[Dict] = []


def clear_mock_outbox():
    """Xóa sạch hộp thư giả lập (dùng khi bắt đầu mỗi unit test)."""
    global MOCK_OUTBOX
    MOCK_OUTBOX.clear()


def get_mock_outbox() -> List[Dict]:
    """Lấy danh sách các email vừa gửi trong môi trường test/dev."""
    return list(MOCK_OUTBOX)


def send_password_reset_email(
    to_email: str,
    reset_token: str,
    expires_at: Optional[datetime] = None,
    expire_minutes: int = 5
) -> bool:
    """Gửi email chứa mã xác minh 5 chữ số với thời hạn 5 phút (SCRUM-200 / SCRUM-295)."""
    if not expires_at:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)

    cfg = _get_smtp_config()
    reset_url = f"{cfg['frontend_url']}/reset-password?token={reset_token}"
    subject = f"[KhoVận Pro] Mã xác minh đặt lại mật khẩu của bạn ({reset_token}) - Hiệu lực {expire_minutes} phút"

    # Lưu vào hộp thư giả lập
    email_record = {
        "to_email": to_email,
        "subject": subject,
        "reset_link": reset_url,
        "token": reset_token,
        "sent_at": datetime.now(timezone.utc),
        "expires_at": expires_at,
    }
    MOCK_OUTBOX.append(email_record)

    # HTML Email Template tập trung nổi bật vào Mã Xác Minh 5 số
    html_content = f"""
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; }}
            .container {{ max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }}
            .header {{ background: #1e293b; color: #ffffff; padding: 24px; text-align: center; border-bottom: 3px solid #2563eb; }}
            .header h1 {{ margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.5px; }}
            .content {{ padding: 32px 28px; color: #334155; line-height: 1.6; font-size: 14px; text-align: center; }}
            .code-container {{ margin: 24px auto; background: #f8fafc; border: 2px dashed #2563eb; border-radius: 10px; padding: 20px 16px; max-width: 360px; }}
            .code-label {{ font-size: 13px; color: #475569; font-weight: 600; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px; }}
            .code-box {{ font-family: 'Consolas', 'Courier New', monospace; font-size: 32px; font-weight: 800; color: #1e293b; background: #ffffff; padding: 10px 24px; border: 1.5px solid #94a3b8; border-radius: 8px; letter-spacing: 8px; display: inline-block; user-select: all; }}
            .code-hint {{ font-size: 12px; color: #64748b; margin-top: 12px; }}
            .btn-container {{ text-align: center; margin: 20px 0; }}
            .btn {{ background-color: #2563eb; color: #ffffff !important; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 13px; }}
            .badge-warn {{ background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin: 20px auto 0 auto; max-width: 400px; text-align: left; }}
            .footer {{ background: #f8fafc; padding: 18px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>KhoVận Pro - Quản Lý Bán Hàng & Kho</h1>
            </div>
            <div class="content">
                <p style="text-align: left;">Xin chào,</p>
                <p style="text-align: left;">Bạn vừa yêu cầu cấp mã xác minh để đặt lại mật khẩu cho tài khoản liên kết với email: <strong>{to_email}</strong>.</p>
                
                <div class="code-container">
                    <div class="code-label">🔑 Mã Xác Minh (OTP 5 Chữ Số)</div>
                    <div class="code-box">{reset_token}</div>
                    <div class="code-hint">Nhập mã này vào ô <strong>"Mã Token xác nhận"</strong> trên hệ thống.</div>
                </div>

                <div class="badge-warn">
                    ⏱ <strong>Thời hạn sử dụng:</strong> Mã chỉ có hiệu lực trong <strong>{expire_minutes} phút</strong> và chỉ sử dụng được 1 lần.
                </div>

                <div class="btn-container">
                    <a href="{reset_url}" class="btn" target="_blank">Hoặc nhấn vào đây để mở trực tiếp trang web</a>
                </div>

                <p style="margin-top: 16px; font-size: 12px; color: #64748b; text-align: left;">
                    Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email. Mật khẩu của bạn vẫn an toàn tuyệt đối.
                </p>
            </div>
            <div class="footer">
                <p>&copy; KhoVận Pro. Email gửi tự động từ hệ thống quản lý, vui lòng không trả lời thư này.</p>
            </div>
        </div>
    </body>
    </html>
    """

    # In thông báo ra console terminal an toàn với Windows cp1252
    try:
        print(f"\n======================================================================")
        print(f" [EMAIL SERVICE - SCRUM-200 / SCRUM-295]")
        print(f" To:           {to_email}")
        print(f" Subject:      {subject}")
        print(f" OTP Code:     {reset_token} (5 digits)")
        print(f" Expire:       {expire_minutes} minutes")
        print(f"======================================================================\n")
    except Exception:
        pass

    # 1. Hỗ trợ gửi trực tiếp qua Resend REST API nếu dùng mã re_...
    resend_api_key = os.getenv("RESEND_API_KEY") or (cfg["password"] if cfg["password"].startswith("re_") else None)
    if resend_api_key:
        try:
            import json
            import urllib.request
            import urllib.error

            target_recipient = to_email
            fallback_recipient = os.getenv("RESEND_TEST_EMAIL", "dtc245180006@ictu.edu.vn")

            def _send_to(recipient: str, mail_subject: str):
                request_data = {
                    "from": f"{cfg['from_name']} <{cfg['from_email']}>",
                    "to": [recipient],
                    "subject": mail_subject,
                    "html": html_content,
                }
                req = urllib.request.Request(
                    "https://api.resend.com/emails",
                    data=json.dumps(request_data).encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {resend_api_key}",
                        "Content-Type": "application/json",
                        "User-Agent": "resend-python/2.0.0",
                    },
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return resp.status in (200, 201)

            try:
                if _send_to(target_recipient, subject):
                    logger.info(f"Đã gửi email qua Resend API thành công đến {target_recipient}")
                    return True
            except urllib.error.HTTPError as http_err:
                # Nếu Resend báo 403 (chỉ cho phép gửi đến email đã xác thực dtc245180006@ictu.edu.vn ở bản miễn phí)
                if http_err.code == 403 and target_recipient != fallback_recipient:
                    fwd_subject = f"[Chuyển tiếp cho {target_recipient}] {subject}"
                    logger.warning(f"Resend Sandbox chỉ cho phép gửi về {fallback_recipient}. Đang chuyển tiếp email cho {target_recipient}...")
                    if _send_to(fallback_recipient, fwd_subject):
                        logger.info(f"Đã chuyển tiếp email qua Resend về {fallback_recipient} thành công!")
                        return True
                raise http_err
        except Exception as err:
            logger.error(f"Lỗi khi gửi qua Resend API: {err}")

    if not cfg["host"]:
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"] = to_email

        part = MIMEText(html_content, "html")
        msg.attach(part)

        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as server:
            server.starttls()
            if cfg["user"] and cfg["password"]:
                server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["from_email"], [to_email], msg.as_string())

        logger.info(f"Đã gửi email mã xác minh thành công đến {to_email}")
        return True
    except Exception as e:
        logger.error(f"Lỗi khi gửi email đến {to_email}: {e}")
        return False


# =============================================================================
# TỰ ĐỘNG CHUYỂN SANG MÃ OTP 5 CHỮ SỐ VÀ HIỆU LỰC 5 PHÚT
# =============================================================================
@event.listens_for(User, "before_update")
def tu_dong_chuyen_sang_ma_5_so_va_5_phut(mapper, connection, target: User):
    """SCRUM-200: Tự động chuyển đổi token sang mã xác minh 5 số và giới hạn thời gian đúng 5 phút."""
    try:
        ins = inspect(target)
        hist = ins.attrs.reset_password_token.history
        if hist.has_changes() and target.reset_password_token:
            # Sinh mã OTP 5 chữ số ngẫu nhiên (10000 - 99999) nếu token chưa phải là 5 số
            if len(str(target.reset_password_token)) != 5 or not str(target.reset_password_token).isdigit():
                otp_5_so = f"{secrets.randbelow(90000) + 10000}"
                target.reset_password_token = otp_5_so
            # Đặt hiệu lực đúng 5 phút
            target.reset_password_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    except Exception as e:
        logger.warning(f"Lỗi khi chuyển đổi mã 5 số: {e}")


@event.listens_for(User, "after_update")
def tu_dong_gui_email_khi_sinh_token(mapper, connection, target: User):
    """Khi User được cấp reset_password_token mới (khác None/rỗng), tự động kích hoạt gửi email."""
    try:
        ins = inspect(target)
        hist = ins.attrs.reset_password_token.history
        if hist.has_changes():
            token_moi = target.reset_password_token
            # Chỉ gửi khi token được gán giá trị mới (không gửi khi token bị xóa về None)
            if token_moi:
                send_password_reset_email(
                    to_email=target.email,
                    reset_token=token_moi,
                    expires_at=target.reset_password_expires_at,
                    expire_minutes=5
                )
    except Exception as e:
        logger.warning(f"Không thể tự động gửi email reset qua event listener: {e}")
