"""Script đặt lại toàn bộ mật khẩu tài khoản trong hệ thống về mật khẩu demo '123456'.
Đồng thời mở khóa các tài khoản nếu đang bị khóa do nhập sai nhiều lần.
Hỗ trợ cả cơ sở dữ liệu MySQL và SQLite.
"""
import os
import sys

# Đảm bảo UTF-8 trên Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Thêm đường dẫn backend vào sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.auth import User
from app.core.security import bam_mat_khau

NEW_PASSWORD = "123456"

def reset_passwords():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        hashed = bam_mat_khau(NEW_PASSWORD)
        for user in users:
            user.hashed_password = hashed
            user.failed_login_attempts = 0
            user.locked_until = None
            user.is_active = True
            user.must_change_password = False
        db.commit()
        print(f"Đã đặt lại mật khẩu thành công cho {len(users)} tài khoản trong CSDL chính!")
        print(f"Mật khẩu mới cho tất cả tài khoản: {NEW_PASSWORD}")
    except Exception as e:
        db.rollback()
        print(f"Lỗi khi đặt lại mật khẩu: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_passwords()
