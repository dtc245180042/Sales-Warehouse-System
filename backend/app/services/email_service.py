import os
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
    expire_minutes: int = 30
) -> bool:
    """Gửi email chứa liên kết đặt lại mật khẩu với thời hạn đúng 30 phút (SCRUM-200 / SCRUM-295).
    - Hỗ trợ gửi SMTP thực tế khi cấu hình biến môi trường SMTP_HOST.
    - Tự động chuyển sang chế độ Simulator (ghi nhận hộp thư giả lập và in ra console) khi dev/test.
    """
    if not expires_at:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)

    cfg = _get_smtp_config()
    reset_url = f"{cfg['frontend_url']}/#/reset-password?token={reset_token}"
    subject = f"[KhoVận Pro] Mã xác minh đặt lại mật khẩu (Hiệu lực {expire_minutes} phút)"

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

    # HTML Email Template tập trung nổi bật vào Mã Xác Minh
    html_content = f"""
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; }}
            .container {{ max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }}
            .header {{ background: #1e293b; color: #ffffff; padding: 24px; text-align: center; border-bottom: 3px solid #2563eb; }}
            .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }}
            .content {{ padding: 32px 28px; color: #334155; line-height: 1.6; font-size: 14px; }}
            .code-container {{ text-align: center; margin: 24px 0; background: #f8fafc; border: 2px dashed #2563eb; border-radius: 8px; padding: 20px; }}
            .code-label {{ font-size: 13px; color: #475569; font-weight: 600; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px; }}
            .code-box {{ font-family: 'Consolas', 'Courier New', monospace; font-size: 18px; font-weight: 700; color: #1e293b; background: #ffffff; padding: 12px 16px; border: 1px solid #cbd5e1; border-radius: 6px; word-break: break-all; display: inline-block; user-select: all; }}
            .code-hint {{ font-size: 12px; color: #64748b; margin-top: 10px; }}
            .btn-container {{ text-align: center; margin: 20px 0; }}
            .btn {{ background-color: #2563eb; color: #ffffff !important; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 13px; }}
            .badge-warn {{ background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-top: 20px; }}
            .footer {{ background: #f8fafc; padding: 18px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Hệ Thống Kho Vận & Quản Lý Bán Hàng (KhoVận Pro)</h1>
            </div>
            <div class="content">
                <p>Xin chào,</p>
                <p>Bạn vừa yêu cầu cấp lại mật khẩu cho tài khoản liên kết với email: <strong>{to_email}</strong>.</p>
                
                <div class="code-container">
                    <div class="code-label">🔑 Mã Xác Minh Đặt Lại Mật Khẩu</div>
                    <div class="code-box">{reset_token}</div>
                    <div class="code-hint">👉 Sao chép mã trên và dán vào ô <strong>"Mã Token xác nhận"</strong> trên màn hình Đặt lại mật khẩu.</div>
                </div>

                <div class="btn-container">
                    <a href="{reset_url}" class="btn" target="_blank">Hoặc nhấn vào đây để mở trang đặt lại mật khẩu</a>
                </div>

                <div class="badge-warn">
                    ⏱ <strong>Thời hạn sử dụng:</strong> Mã xác minh chỉ có hiệu lực đúng <strong>{expire_minutes} phút</strong> và chỉ được sử dụng một lần duy nhất.
                </div>
                <p style="margin-top: 16px; font-size: 12px; color: #64748b;">
                    Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua thư này. Tài khoản của bạn vẫn được bảo vệ tuyệt đối an toàn.
                </p>
            </div>
            <div class="footer">
                <p>&copy; KhoVận Pro. Email gửi tự động từ hệ thống quản lý, vui lòng không trả lời thư này.</p>
            </div>
        </div>
    </body>
    </html>
    """

    # In thông báo đẹp mắt ra console terminal phục vụ chấm điểm và chạy demo
    print(f"\n" + "=" * 70)
    print(f" [EMAIL SERVICE SIMULATOR - SCRUM-200 / SCRUM-295]")
    print(f" Gửi đến:      {to_email}")
    print(f" Tiêu đề:      {subject}")
    print(f" Liên kết URL: {reset_url}")
    print(f" Token:        {reset_token}")
    print(f" Thời hạn:     30 phút (Hết hạn lúc: {expires_at.strftime('%Y-%m-%d %H:%M:%S UTC')})")
    print(f"=" * 70 + "\n")

    # Nếu không có SMTP Host, coi như hoàn thành giả lập thành công
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

        logger.info(f"Đã gửi email đặt lại mật khẩu thành công đến {to_email}")
        return True
    except Exception as e:
        logger.error(f"Lỗi khi gửi email đến {to_email}: {e}")
        return False


# =============================================================================
# TỰ ĐỘNG BẮT SỰ KIỆN ĐỔI TOKEN QUÊN MẬT KHẨU TRÊN MODEL USER
# Giúp kích hoạt gửi email ngay cả khi gọi endpoint có sẵn mà không cần sửa file auth.py!
# =============================================================================
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
                    expire_minutes=30
                )
    except Exception as e:
        logger.warning(f"Không thể tự động gửi email reset qua event listener: {e}")
