"""
GÓI KIỂM THỬ: PKG-01 - XÁC THỰC ĐĂNG NHẬP & KHÓA 15 PHÚT (AUTHENTICATION & LOCKOUT)
Story áp dụng: S1-01 / SCRUM-287
Endpoint áp dụng: POST /api/v1/auth/login
"""

import sys
from pathlib import Path

# Đảm bảo import được backend và test_client
thu_muc_backend = Path(__file__).resolve().parent.parent.parent.parent
thu_muc_test_client = Path(__file__).resolve().parent.parent.parent
for p in [str(thu_muc_test_client), str(thu_muc_backend)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from core.context import khoi_tao_app_test
from core.reporter import BoBaoCaoKiemThu
from app.models.auth import User, UserRole
from app.core.security import bam_mat_khau


def chay_kiem_thu_auth_login(bao_cao: BoBaoCaoKiemThu):
    print("\n--- Đang thực thi: [Package 01: Xác thực Đăng nhập & Khóa 15 phút] ---")
    app, client, engine, SessionTest = khoi_tao_app_test()

    # --- Ca test 1: Validation - Thiếu trường bắt buộc ---
    try:
        res = client.post("/api/v1/auth/login", json={})
        if res.status_code == 422:
            bao_cao.ghi_nhan(
                "TC-AUTH-01",
                "Bắt lỗi thiếu trường bắt buộc khi đăng nhập",
                True,
                "HTTP 422 Unprocessable Entity chuẩn Pydantic schema"
            )
        else:
            bao_cao.ghi_nhan(
                "TC-AUTH-01",
                "Bắt lỗi thiếu trường bắt buộc khi đăng nhập",
                False,
                f"Kỳ vọng HTTP 422 nhưng nhận {res.status_code}"
            )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-01", "Bắt lỗi thiếu trường bắt buộc khi đăng nhập", False, str(e))

    # --- Ca test 2: Security - Tài khoản không tồn tại ---
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "non_existent_user_999", "password": "WrongPassword@123"}
        )
        data = res.json()
        pass_dk = res.status_code == 401 and "Tên đăng nhập hoặc mật khẩu không chính xác" in data.get("detail", "")
        bao_cao.ghi_nhan(
            "TC-AUTH-02",
            "Đăng nhập với tài khoản không tồn tại trong hệ thống",
            pass_dk,
            f"HTTP {res.status_code} - Thông báo chung an toàn: {data.get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-02", "Đăng nhập với tài khoản không tồn tại trong hệ thống", False, str(e))

    # --- Ca test 3: Security - Sai mật khẩu ---
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "sales_mgr", "password": "WrongPassword@123"}
        )
        data = res.json()
        pass_dk = res.status_code == 401 and "Tên đăng nhập hoặc mật khẩu không chính xác" in data.get("detail", "")
        bao_cao.ghi_nhan(
            "TC-AUTH-03",
            "Đăng nhập đúng tài khoản nhưng sai mật khẩu",
            pass_dk,
            f"HTTP {res.status_code} - Thông báo: {data.get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-03", "Đăng nhập đúng tài khoản nhưng sai mật khẩu", False, str(e))

    # --- Ca test 4: Security - Khóa tạm thời 15 phút sau 5 lần sai liên tiếp ---
    try:
        # Chuẩn bị một tài khoản riêng để kiểm thử khóa
        db = SessionTest()
        try:
            lock_user = User(
                username="TEST_TMP_LOCK_USER",
                email="test_tmp_lock@warehouse.local",
                full_name="User Test Khóa 15 Phút",
                hashed_password=bam_mat_khau("CorrectPass@123"),
                role=UserRole.CUSTOMER.value,
                is_active=True,
                failed_login_attempts=0
            )
            db.add(lock_user)
            db.commit()
        finally:
            db.close()

        # Thực hiện 5 lần đăng nhập sai
        last_res = None
        for i in range(5):
            last_res = client.post(
                "/api/v1/auth/login",
                json={"username": "TEST_TMP_LOCK_USER", "password": "WrongPassword@999"}
            )

        data = last_res.json()
        pass_dk = last_res.status_code == 403 and "Tài khoản tạm thời bị khóa trong 15 phút" in data.get("detail", "")
        bao_cao.ghi_nhan(
            "TC-AUTH-04",
            "Khóa tạm thời 15 phút sau 5 lần nhập sai liên tiếp",
            pass_dk,
            f"HTTP {last_res.status_code} - Thông báo: {data.get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-04", "Khóa tạm thời 15 phút sau 5 lần nhập sai liên tiếp", False, str(e))

    # --- Ca test 5: Happy Path - Đăng nhập thành công Admin ---
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "Admin@123456"}
        )
        data = res.json()
        pass_dk = (
            res.status_code == 200
            and "access_token" in data
            and data.get("token_type") == "bearer"
            and data.get("user", {}).get("role") == "Admin"
        )
        bao_cao.ghi_nhan(
            "TC-AUTH-05",
            "Đăng nhập thành công với tài khoản Quản trị hệ thống (Admin)",
            pass_dk,
            f"HTTP {res.status_code} - Role: {data.get('user', {}).get('role')}, Token type: {data.get('token_type')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-05", "Đăng nhập thành công với tài khoản Quản trị hệ thống (Admin)", False, str(e))

    # --- Ca test 6: Happy Path - Đăng nhập thành công Sales Manager ---
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "sales_mgr", "password": "SalesMgr@1234"}
        )
        data = res.json()
        pass_dk = (
            res.status_code == 200
            and "access_token" in data
            and data.get("user", {}).get("role") == "Sales Manager"
        )
        bao_cao.ghi_nhan(
            "TC-AUTH-06",
            "Đăng nhập thành công với tài khoản Quản lý kinh doanh (Sales Manager)",
            pass_dk,
            f"HTTP {res.status_code} - Role: {data.get('user', {}).get('role')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-06", "Đăng nhập thành công với tài khoản Quản lý kinh doanh (Sales Manager)", False, str(e))

    # --- Ca test 7: Happy Path - Đăng nhập thành công Customer ---
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "customer", "password": "Customer@1234"}
        )
        data = res.json()
        pass_dk = (
            res.status_code == 200
            and "access_token" in data
            and data.get("user", {}).get("role") == "Customer"
        )
        bao_cao.ghi_nhan(
            "TC-AUTH-07",
            "Đăng nhập thành công với tài khoản Đại lý (Customer)",
            pass_dk,
            f"HTTP {res.status_code} - Role: {data.get('user', {}).get('role')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-07", "Đăng nhập thành công với tài khoản Đại lý (Customer)", False, str(e))
