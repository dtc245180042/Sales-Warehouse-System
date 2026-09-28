import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAILS_FROM_EMAIL = os.getenv("EMAILS_FROM_EMAIL", "noreply@saleswarehouse.com")
EMAILS_FROM_NAME = os.getenv("EMAILS_FROM_NAME", "Sales-Warehouse System")


def send_password_reset_email(to_email: str, reset_url: str, expire_minutes: int = 15) -> bool:
    """Gửi email chứa liên kết đặt lại mật khẩu.
    Nếu SMTP chưa được cấu hình, ghi nhận thông tin ra log/console (tiện lợi cho môi trường dev/test).
    """
    subject = "Sales-Warehouse - Yêu cầu đặt lại mật khẩu"

    # HTML Email Template chuyên nghiệp
    html_content = f"""
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }}
            .container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }}
            .header {{ background: #1e293b; color: #ffffff; padding: 24px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 20px; font-weight: 600; }}
            .content {{ padding: 32px 24px; color: #334155; line-height: 1.6; }}
            .btn-container {{ text-align: center; margin: 28px 0; }}
            .btn {{ background-color: #2563eb; color: #ffffff !important; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; }}
            .btn:hover {{ background-color: #1d4ed8; }}
            .link-box {{ background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; word-break: break-all; font-size: 13px; color: #64748b; border-radius: 4px; }}
            .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Hệ thống Quản lý Bán hàng & Kho</h1>
            </div>
            <div class="content">
                <p>Xin chào,</p>
                <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với địa chỉ email: <strong>{to_email}</strong>.</p>
                <p>Vui lòng nhấn vào nút bên dưới để tiến hành tạo mật khẩu mới:</p>
                <div class="btn-container">
                    <a href="{reset_url}" class="btn" target="_blank">Đặt lại mật khẩu</a>
                </div>
                <p>Hoặc bạn có thể dán đường dẫn sau vào trình duyệt:</p>
                <div class="link-box">{reset_url}</div>
                <p style="margin-top: 24px; font-size: 13px; color: #ef4444;">
                    * Lưu ý: Liên kết này chỉ có hiệu lực trong vòng <strong>{expire_minutes} phút</strong>. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email và mật khẩu của bạn vẫn an toàn.
                </p>
            </div>
            <div class="footer">
                <p>&copy; Sales-Warehouse System. Email tự động, vui lòng không phản hồi.</p>
            </div>
        </div>
    </body>
    </html>
    """

    if not SMTP_HOST:
        logger.info(f"[EMAIL DEV MOCK] Đã tạo liên kết đặt lại mật khẩu cho {to_email}: {reset_url}")
        print(f"\n==================== [DEV EMAIL SIMULATOR] ====================")
        print(f" Đến: {to_email}")
        print(f" Tiêu đề: {subject}")
        print(f" Liên kết đặt lại mật khẩu: {reset_url}")
        print(f" Hết hạn sau: {expire_minutes} phút")
        print(f"===============================================================\n")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{EMAILS_FROM_NAME} <{EMAILS_FROM_EMAIL}>"
        msg["To"] = to_email

        part = MIMEText(html_content, "html")
        msg.attach(part)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(EMAILS_FROM_EMAIL, [to_email], msg.as_string())

        logger.info(f"Đã gửi email đặt lại mật khẩu thành công đến {to_email}")
        return True
    except Exception as e:
        logger.error(f"Lỗi khi gửi email đến {to_email}: {e}")
        return False
