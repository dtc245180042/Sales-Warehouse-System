import sys

# Đảm bảo in tiếng Việt trên console Windows không bị lỗi UnicodeEncodeError
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app.core.database import engine, Base, SessionLocal
from app.services.seed_service import seed_all
import app.models  # Đảm bảo các models được nạp vào metadata


def run_seed():
    print("=" * 60)
    print(" BẮT ĐẦU KHỞI TẠO CSDL VÀ DỮ LIỆU SEED (ROLES & PERMISSIONS)")
    print("=" * 60)

    # 1. Tạo các bảng nếu chưa có
    print("-> Đang kiểm tra và tạo các bảng trong cơ sở dữ liệu...")
    Base.metadata.create_all(bind=engine)
    print("-> Đã tạo/đồng bộ các bảng thành công.")

    # 2. Khởi tạo dữ liệu seed
    db = SessionLocal()
    try:
        print("-> Đang khởi tạo quyền mặc định, vai trò nghiệp vụ và gán quyền...")
        result = seed_all(db)
        print("\n [KẾT QUẢ KHỞI TẠO THÀNH CÔNG]:")
        print(f"   - Tổng quyền (Permissions): {result['permissions']['total']} (Tạo mới: {result['permissions']['created']}, Cập nhật: {result['permissions']['updated']})")
        print(f"   - Tổng vai trò (Roles): {result['roles']['total']} (Tạo mới: {result['roles']['created']})")
        print("   - Số quyền được gán cho từng vai trò:")
        for role, count in result['role_permissions'].items():
            print(f"     + {role:<12}: {count} quyền")
        print(f"   - Tài khoản Admin mặc định: {result['default_admin']['username']} ({result['default_admin']['email']})")
        print(f"   - Danh mục Menu điều hướng (Navigation): Đã khởi tạo {result['menus']['created']} menu mới, {result['menus']['updated']} cập nhật")
        print("=" * 60)
    except Exception as e:
        print(f"[LỖI] Khởi tạo dữ liệu thất bại: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
