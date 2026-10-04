"""
GÓI KIỂM THỬ: PKG-02 - DUY TRÌ PHIÊN, ĐĂNG XUẤT & THÔNG TIN CÁ NHÂN (SESSION & PROFILE)
Story áp dụng: S1-02 & S1-06 / SCRUM-199 & SCRUM-203
Endpoints áp dụng:
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- GET /api/v1/auth/me
"""

import sys
from pathlib import Path

thu_muc_backend = Path(__file__).resolve().parent.parent.parent.parent
thu_muc_test_client = Path(__file__).resolve().parent.parent.parent
for p in [str(thu_muc_test_client), str(thu_muc_backend)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from core.context import khoi_tao_app_test
from core.reporter import BoBaoCaoKiemThu


def chay_kiem_thu_session_logout(bao_cao: BoBaoCaoKiemThu):
    print("\n--- Đang thực thi: [Package 02: Duy trì Phiên, Đăng xuất & Thông tin Cá nhân] ---")
    app, client, engine, SessionTest = khoi_tao_app_test()

    # Chuẩn bị đăng nhập lấy token làm việc
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "sales_mgr", "password": "SalesMgr@1234"}
    )
    token_sales = login_res.json().get("access_token", "")
    headers_sales = {"Authorization": f"Bearer {token_sales}"}

    # Đăng nhập lấy token của warehouse để test kho
    login_wh = client.post(
        "/api/v1/auth/login",
        json={"username": "wh_mgr", "password": "WhMgr@1234"}
    )
    token_wh = login_wh.json().get("access_token", "")
    headers_wh = {"Authorization": f"Bearer {token_wh}"}

    # --- Ca test 1: Security - Refresh token thiếu Authorization header ---
    try:
        res = client.post("/api/v1/auth/refresh")
        pass_dk = res.status_code == 401
        bao_cao.ghi_nhan(
            "TC-SESS-01",
            "Gia hạn phiên khi không truyền Authorization Bearer header",
            pass_dk,
            f"HTTP {res.status_code} - Từ chối khi không có token Bearer"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-SESS-01", "Gia hạn phiên khi không truyền Authorization Bearer header", False, str(e))

    # --- Ca test 2: Functional - Refresh token hợp lệ khi còn phiên ---
    try:
        res = client.post("/api/v1/auth/refresh", headers=headers_sales)
        data = res.json()
        pass_dk = res.status_code == 200 and "access_token" in data and data.get("token_type") == "bearer"
        bao_cao.ghi_nhan(
            "TC-SESS-02",
            "Gia hạn phiên tự động thành công khi người dùng đang hoạt động",
            pass_dk,
            f"HTTP {res.status_code} - Đã cấp token mới thành công"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-SESS-02", "Gia hạn phiên tự động thành công khi người dùng đang hoạt động", False, str(e))

    # --- Ca test 3: Security - Đăng xuất an toàn vô hiệu hóa phiên phía máy chủ ---
    try:
        res = client.post("/api/v1/auth/logout", headers=headers_sales)
        data = res.json()
        pass_dk = res.status_code == 200 and "Đăng xuất thành công" in data.get("message", "")
        bao_cao.ghi_nhan(
            "TC-SESS-03",
            "Đăng xuất an toàn vô hiệu hóa phiên phía máy chủ",
            pass_dk,
            f"HTTP {res.status_code} - {data.get('message')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-SESS-03", "Đăng xuất an toàn vô hiệu hóa phiên phía máy chủ", False, str(e))

    # --- Ca test 4: Security - Sử dụng lại token cũ sau khi đăng xuất bị từ chối ---
    try:
        res = client.get("/api/v1/auth/me", headers=headers_sales)
        pass_dk = res.status_code == 401
        bao_cao.ghi_nhan(
            "TC-SESS-04",
            "Sử dụng lại token cũ sau khi đã đăng xuất bị từ chối",
            pass_dk,
            f"HTTP {res.status_code} - Phiên cũ đã bị thu hồi lập tức"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-SESS-04", "Sử dụng lại token cũ sau khi đã đăng xuất bị từ chối", False, str(e))

    # --- Ca test 5: Security - Lấy thông tin cá nhân khi không có token ---
    try:
        res = client.get("/api/v1/auth/me")
        pass_dk = res.status_code == 401
        bao_cao.ghi_nhan(
            "TC-NAV-01",
            "Lấy thông tin người dùng đang đăng nhập khi không có token",
            pass_dk,
            f"HTTP {res.status_code} - Yêu cầu xác thực"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-NAV-01", "Lấy thông tin người dùng đang đăng nhập khi không có token", False, str(e))

    # --- Ca test 6: Functional - Lấy thông tin cá nhân hiển thị tên, vai trò và kho phụ trách ---
    try:
        res = client.get("/api/v1/auth/me", headers=headers_wh)
        data = res.json()
        pass_dk = (
            res.status_code == 200
            and data.get("username") == "wh_mgr"
            and data.get("role") == "WH Manager"
            and "assigned_warehouse" in data
        )
        bao_cao.ghi_nhan(
            "TC-NAV-02",
            "Lấy thông tin người dùng hiển thị tên, vai trò và kho phụ trách",
            pass_dk,
            f"HTTP {res.status_code} - User: {data.get('username')}, Role: {data.get('role')}, Kho: {data.get('assigned_warehouse')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-NAV-02", "Lấy thông tin người dùng hiển thị tên, vai trò và kho phụ trách", False, str(e))
