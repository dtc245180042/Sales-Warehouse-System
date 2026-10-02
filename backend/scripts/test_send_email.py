import sys
import os
from datetime import datetime, timezone, timedelta

# Thêm thư mục backend vào sys.path để import được app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.services.email_service import send_password_reset_email, _get_smtp_config

def main():
    if len(sys.argv) < 2:
        print("\nCách dùng:")
        print("  python scripts/test_send_email.py <email_nhan_tin_nhan>")
        print("Ví dụ:")
        print("  python scripts/test_send_email.py your_personal_email@gmail.com\n")
        return

    to_email = sys.argv[1].strip()
    cfg = _get_smtp_config()

    print("\n" + "=" * 65)
    print(" KIỂM TRA CẤU HÌNH GỬI EMAIL THỰC TẾ QUA GMAIL SMTP")
    print("=" * 65)
    print(f" SMTP Host:    {cfg['host'] or '(Chưa cấu hình -> Chế độ Simulator)'}")
    print(f" SMTP Port:    {cfg['port']}")
    print(f" SMTP User:    {cfg['user'] or '(Chưa cấu hình)'}")
    print(f" Password:     {'*' * len(cfg['password']) if cfg['password'] else '(Chưa cấu hình)'}")
    print(f" Gửi từ:       {cfg['from_email']}")
    print(f" Người nhận:   {to_email}")
    print("=" * 65)

    test_token = "demo_real_token_1234567890abcdef"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    print("\n[*] Đang tiến hành gửi email thử nghiệm...")
    success = send_password_reset_email(
        to_email=to_email,
        reset_token=test_token,
        expires_at=expires_at,
        expire_minutes=30
    )

    if success:
        if cfg["host"]:
            print(f"[+] THÀNH CÔNG! Đã gửi email thực tế đến '{to_email}'.")
            print("    Vui lòng kiểm tra Hộp thư đến (Inbox) hoặc mục Thư rác (Spam).\n")
        else:
            print("[+] CHẾ ĐỘ GIẢ LẬP: Đã ghi nhận gửi email thành công ra màn hình và bộ nhớ.")
            print("    (Để gửi về Gmail thật, hãy điền SMTP_HOST, SMTP_USER, SMTP_PASSWORD vào file backend/.env)\n")
    else:
        print(f"[-] THẤT BÀI! Không thể gửi email đến '{to_email}'. Vui lòng kiểm tra lại mật khẩu ứng dụng Gmail.\n")

if __name__ == "__main__":
    main()
