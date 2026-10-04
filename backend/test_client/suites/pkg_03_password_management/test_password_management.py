"""
GÓI KIỂM THỬ: PKG-03 - QUẢN LÝ MẬT KHẨU: QUÊN & ĐỔI MẬT KHẨU (PASSWORD MANAGEMENT)
Story áp dụng: S1-03 & S1-04 / SCRUM-200 & SCRUM-307
Endpoints áp dụng:
- POST /api/v1/auth/forgot-password
- POST /api/v1/auth/reset-password
- POST /api/v1/auth/change-password
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
from app.models.auth import User


def chay_kiem_thu_password_management(bao_cao: BoBaoCaoKiemThu):
    print("\n--- Đang thực thi: [Package 03: Quản lý Mật khẩu: Quên & Đổi mật khẩu] ---")
    app, client, engine, SessionTest = khoi_tao_app_test()

    # =========================================================================
    # PHẦN 1: QUÊN VÀ ĐẶT LẠI MẬT KHẨU (STORY S1-03 / SCRUM-200)
    # =========================================================================

    # --- Ca test 1: Validation - Email sai định dạng ---
    try:
        res = client.post("/api/v1/auth/forgot-password", json={"email": "invalid_email_format"})
        pass_dk = res.status_code == 422
        bao_cao.ghi_nhan(
            "TC-PWD-01",
            "Quên mật khẩu: Kiểm tra email sai định dạng",
            pass_dk,
            f"HTTP {res.status_code} - Bắt lỗi email format chuẩn Pydantic"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-01", "Quên mật khẩu: Kiểm tra email sai định dạng", False, str(e))

    # --- Ca test 2: Security - Email không tồn tại trả về thông báo chung ---
    try:
        res = client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "khong_ton_tai_999@warehouse.local"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and "Nếu email tồn tại trong hệ thống" in data.get("message", "")
        bao_cao.ghi_nhan(
            "TC-PWD-02",
            "Quên mật khẩu: Email không tồn tại vẫn trả thông báo chung an toàn",
            pass_dk,
            f"HTTP {res.status_code} - Thông báo bảo mật không tiết lộ email"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-02", "Quên mật khẩu: Email không tồn tại vẫn trả thông báo chung an toàn", False, str(e))

    # --- Ca test 3: Functional - Quên mật khẩu thành công với email hợp lệ ---
    token_reset_thuc_te = None
    try:
        res = client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "customer@warehouse.local"}
        )
        # Truy vấn DB để lấy token vừa sinh
        db = SessionTest()
        try:
            cust = db.query(User).filter(User.email == "customer@warehouse.local").first()
            token_reset_thuc_te = cust.reset_password_token if cust else None
            expires_at = cust.reset_password_expires_at if cust else None
        finally:
            db.close()

        pass_dk = res.status_code == 200 and token_reset_thuc_te is not None and expires_at is not None
        bao_cao.ghi_nhan(
            "TC-PWD-03",
            "Quên mật khẩu: Yêu cầu đặt lại mật khẩu thành công với email hợp lệ",
            pass_dk,
            f"HTTP {res.status_code} - Đã tạo token trong DB, hiệu lực 30 phút"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-03", "Quên mật khẩu: Yêu cầu đặt lại mật khẩu thành công với email hợp lệ", False, str(e))

    # --- Ca test 4: Validation - Đặt lại mật khẩu với token không tồn tại ---
    try:
        res = client.post(
            "/api/v1/auth/reset-password",
            json={"token": "invalid_non_existent_token_999", "new_password": "NewValidPass@123"}
        )
        pass_dk = res.status_code == 400
        bao_cao.ghi_nhan(
            "TC-PWD-04",
            "Đặt lại mật khẩu: Sử dụng token không hợp lệ hoặc không tồn tại",
            pass_dk,
            f"HTTP {res.status_code} - Từ chối token không hợp lệ"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-04", "Đặt lại mật khẩu: Sử dụng token không hợp lệ hoặc không tồn tại", False, str(e))

    # --- Ca test 5: Validation - Mật khẩu mới yếu ---
    try:
        res = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token_reset_thuc_te or "some_token", "new_password": "123"}
        )
        pass_dk = res.status_code == 422
        bao_cao.ghi_nhan(
            "TC-PWD-05",
            "Đặt lại mật khẩu: Mật khẩu mới yếu (< 8 ký tự hoặc thiếu số/chữ)",
            pass_dk,
            f"HTTP {res.status_code} - Bắt lỗi độ mạnh mật khẩu"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-05", "Đặt lại mật khẩu: Mật khẩu mới yếu (< 8 ký tự hoặc thiếu số/chữ)", False, str(e))

    # --- Ca test 6: Functional - Đặt lại mật khẩu thành công ---
    try:
        res = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token_reset_thuc_te, "new_password": "NewResetPass@2026"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and "Đặt lại mật khẩu thành công" in data.get("message", "")

        # Kiểm tra đăng nhập bằng mật khẩu mới
        login_new = client.post(
            "/api/v1/auth/login",
            json={"username": "customer", "password": "NewResetPass@2026"}
        )
        pass_dk = pass_dk and login_new.status_code == 200

        bao_cao.ghi_nhan(
            "TC-PWD-06",
            "Đặt lại mật khẩu thành công với token hợp lệ còn hạn 30 phút",
            pass_dk,
            f"HTTP {res.status_code} - Đăng nhập lại với pass mới: HTTP {login_new.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-06", "Đặt lại mật khẩu thành công với token hợp lệ còn hạn 30 phút", False, str(e))

    # --- Ca test 7: Security - Dùng lại token lần 2 bị từ chối ---
    try:
        res = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token_reset_thuc_te, "new_password": "AnotherNewPass@2026"}
        )
        pass_dk = res.status_code == 400
        bao_cao.ghi_nhan(
            "TC-PWD-07",
            "Thử sử dụng lại token đặt lại mật khẩu lần 2 bị từ chối",
            pass_dk,
            f"HTTP {res.status_code} - Chặn tái sử dụng token thành công (One-time token)"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-07", "Thử sử dụng lại token đặt lại mật khẩu lần 2 bị từ chối", False, str(e))

    # =========================================================================
    # PHẦN 2: ĐỔI MẬT KHẨU KHI ĐANG ĐĂNG NHẬP (STORY S1-04 / SCRUM-307)
    # =========================================================================

    # Chuẩn bị đăng nhập lấy token tài khoản sales_rep
    login_rep = client.post(
        "/api/v1/auth/login",
        json={"username": "sales_rep", "password": "SalesRep@1234"}
    )
    token_rep = login_rep.json().get("access_token", "")
    headers_rep = {"Authorization": f"Bearer {token_rep}"}

    # --- Ca test 8: Security - Đổi mật khẩu không truyền Bearer token ---
    try:
        res = client.post(
            "/api/v1/auth/change-password",
            json={"old_password": "OldPassword@123", "new_password": "NewValidPass@2026"}
        )
        pass_dk = res.status_code == 401
        bao_cao.ghi_nhan(
            "TC-CHGPWD-01",
            "Đổi mật khẩu khi chưa xác thực Bearer token",
            pass_dk,
            f"HTTP {res.status_code} - Yêu cầu phiên đăng nhập"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-01", "Đổi mật khẩu khi chưa xác thực Bearer token", False, str(e))

    # --- Ca test 9: Validation - Mật khẩu cũ không chính xác ---
    try:
        res = client.post(
            "/api/v1/auth/change-password",
            headers=headers_rep,
            json={"old_password": "WrongOldPass@123", "new_password": "NewValidPass@2026"}
        )
        pass_dk = res.status_code == 400 and "Mật khẩu cũ không chính xác" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-CHGPWD-02",
            "Đổi mật khẩu: Mật khẩu cũ không chính xác",
            pass_dk,
            f"HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-02", "Đổi mật khẩu: Mật khẩu cũ không chính xác", False, str(e))

    # --- Ca test 10: Validation - Mật khẩu mới trùng mật khẩu cũ ---
    try:
        res = client.post(
            "/api/v1/auth/change-password",
            headers=headers_rep,
            json={"old_password": "SalesRep@1234", "new_password": "SalesRep@1234"}
        )
        pass_dk = res.status_code == 400 and "không được trùng" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-CHGPWD-03",
            "Đổi mật khẩu: Mật khẩu mới trùng với mật khẩu hiện tại",
            pass_dk,
            f"HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-03", "Đổi mật khẩu: Mật khẩu mới trùng với mật khẩu hiện tại", False, str(e))

    # --- Ca test 11: Validation - Mật khẩu mới yếu ---
    try:
        res = client.post(
            "/api/v1/auth/change-password",
            headers=headers_rep,
            json={"old_password": "SalesRep@1234", "new_password": "short"}
        )
        pass_dk = res.status_code == 422
        bao_cao.ghi_nhan(
            "TC-CHGPWD-04",
            "Đổi mật khẩu: Mật khẩu mới không đủ độ mạnh (< 8 ký tự hoặc thiếu chữ/số)",
            pass_dk,
            f"HTTP {res.status_code} - Bắt lỗi độ mạnh mật khẩu Pydantic"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-04", "Đổi mật khẩu: Mật khẩu mới không đủ độ mạnh (< 8 ký tự hoặc thiếu chữ/số)", False, str(e))

    # --- Ca test 12: Functional - Đổi mật khẩu thành công và thu hồi phiên cũ ---
    try:
        res = client.post(
            "/api/v1/auth/change-password",
            headers=headers_rep,
            json={"old_password": "SalesRep@1234", "new_password": "NewSalesRepPass@2026"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and "thu hồi" in data.get("message", "")

        # Kiểm tra token cũ ngay lập tức bị vô hiệu hóa
        check_old_token = client.get("/api/v1/auth/me", headers=headers_rep)
        pass_dk = pass_dk and check_old_token.status_code == 401

        # Đăng nhập lại với mật khẩu mới thành công
        login_new = client.post(
            "/api/v1/auth/login",
            json={"username": "sales_rep", "password": "NewSalesRepPass@2026"}
        )
        pass_dk = pass_dk and login_new.status_code == 200

        bao_cao.ghi_nhan(
            "TC-CHGPWD-05",
            "Đổi mật khẩu thành công và thu hồi toàn bộ các phiên đăng nhập khác",
            pass_dk,
            f"HTTP {res.status_code} - Token cũ bị từ chối: HTTP {check_old_token.status_code}, Đăng nhập mới: HTTP {login_new.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-05", "Đổi mật khẩu thành công và thu hồi toàn bộ các phiên đăng nhập khác", False, str(e))
