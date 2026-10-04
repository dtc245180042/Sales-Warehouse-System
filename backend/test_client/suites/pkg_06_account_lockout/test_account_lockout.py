"""
GÓI KIỂM THỬ: PKG-06 - KHÓA VÀ MỞ KHÓA TÀI KHOẢN (ACCOUNT LOCKOUT & HANDOVER)
Story áp dụng: S1-10 / SCRUM-207
Endpoints áp dụng:
- POST /api/v1/users/{user_id}/lock
- POST /api/v1/users/{user_id}/unlock
- POST /api/v1/auth/login
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
from app.models.auth import User, UserRole
from app.core.security import bam_mat_khau


def chay_kiem_thu_account_lockout(bao_cao: BoBaoCaoKiemThu):
    print("\n--- Đang thực thi: [Package 06: Khóa và Mở khóa Tài khoản] ---")
    app, client, engine, SessionTest = khoi_tao_app_test()

    def _lay_header(username, password):
        res = client.post("/api/v1/auth/login", json={"username": username, "password": password})
        token = res.json().get("access_token", "")
        return {"Authorization": f"Bearer {token}"}

    headers_admin = _lay_header("admin", "Admin@123456")

    admin_info = client.get("/api/v1/auth/me", headers=headers_admin).json()
    admin_id = admin_info.get("id", 1)

    # Chuẩn bị 1 nhân viên kinh doanh để test khóa và bàn giao
    db = SessionTest()
    target_rep_id = None
    try:
        rep_user = User(
            username="TEST_TMP_SALES_REP_LOCK",
            email="test_tmp_lock_rep@warehouse.local",
            full_name="Nhân Viên Phụ Trách Đại Lý",
            hashed_password=bam_mat_khau("SalesRep@1234"),
            role=UserRole.SALES_REP.value,
            is_active=True,
            token_version=1
        )
        db.add(rep_user)
        db.commit()
        db.refresh(rep_user)
        target_rep_id = rep_user.id
    finally:
        db.close()

    # --- Ca test 1: Validation - Bắt buộc ghi lý do khóa ---
    try:
        res = client.post(
            f"/api/v1/users/{target_rep_id}/lock",
            headers=headers_admin,
            json={}
        )
        pass_dk = res.status_code == 422
        bao_cao.ghi_nhan(
            "TC-LOCK-01",
            "Khóa tài khoản: Bắt buộc ghi lý do khóa (reason)",
            pass_dk,
            f"HTTP {res.status_code} - Bắt lỗi thiếu trường reason"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-LOCK-01", "Khóa tài khoản: Bắt buộc ghi lý do khóa (reason)", False, str(e))

    # --- Ca test 2: Security - Quản trị viên tự khóa tài khoản của chính mình bị từ chối ---
    try:
        res = client.post(
            f"/api/v1/users/{admin_id}/lock",
            headers=headers_admin,
            json={"reason": "Thử tự khóa tài khoản Admin"}
        )
        pass_dk = res.status_code == 400 and "Không thể tự khóa tài khoản của chính mình" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-LOCK-02",
            "Bảo vệ Admin: Quản trị viên tự khóa tài khoản của chính mình bị từ chối",
            pass_dk,
            f"HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-LOCK-02", "Bảo vệ Admin: Quản trị viên tự khóa tài khoản của chính mình bị từ chối", False, str(e))

    # --- Ca test 3: Functional - Khóa nhân viên kinh doanh có cảnh báo bàn giao đại lý và thu hồi phiên ---
    try:
        res = client.post(
            f"/api/v1/users/{target_rep_id}/lock",
            headers=headers_admin,
            json={"reason": "Nhân viên nghỉ việc từ tháng 10"}
        )
        data = res.json()
        pass_dk = (
            res.status_code == 200
            and data.get("session_revoked") is True
            and data.get("handover_warning") is not None
            and "bàn giao" in data.get("handover_warning", "").lower()
        )
        bao_cao.ghi_nhan(
            "TC-LOCK-03",
            "Khóa tài khoản Nhân viên kinh doanh kèm cảnh báo bàn giao đại lý phụ trách",
            pass_dk,
            f"HTTP {res.status_code} - session_revoked={data.get('session_revoked')}, Cảnh báo: {data.get('handover_warning')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-LOCK-03", "Khóa tài khoản Nhân viên kinh doanh kèm cảnh báo bàn giao đại lý phụ trách", False, str(e))

    # --- Ca test 4: Security - Tài khoản đã bị khóa không thể đăng nhập ---
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "TEST_TMP_SALES_REP_LOCK", "password": "SalesRep@1234"}
        )
        data = res.json()
        pass_dk = res.status_code == 403 and "Tài khoản đã bị vô hiệu hóa" in data.get("detail", "")
        bao_cao.ghi_nhan(
            "TC-LOCK-04",
            "Tài khoản bị khóa không thể đăng nhập vào hệ thống",
            pass_dk,
            f"HTTP {res.status_code} - {data.get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-LOCK-04", "Tài khoản bị khóa không thể đăng nhập vào hệ thống", False, str(e))

    # --- Ca test 5: Functional - Mở khóa tài khoản đã bị khóa ---
    try:
        res = client.post(
            f"/api/v1/users/{target_rep_id}/unlock",
            headers=headers_admin
        )
        data = res.json()
        pass_dk = res.status_code == 200 and "mở khóa thành công" in data.get("message", "").lower()
        bao_cao.ghi_nhan(
            "TC-LOCK-05",
            "Mở khóa tài khoản đã bị khóa thành công",
            pass_dk,
            f"HTTP {res.status_code} - {data.get('message')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-LOCK-05", "Mở khóa tài khoản đã bị khóa thành công", False, str(e))

    # --- Ca test 6: Functional - Đăng nhập lại bình thường sau khi mở khóa ---
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "TEST_TMP_SALES_REP_LOCK", "password": "SalesRep@1234"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and "access_token" in data
        bao_cao.ghi_nhan(
            "TC-LOCK-06",
            "Tài khoản đăng nhập lại bình thường sau khi được mở khóa",
            pass_dk,
            f"HTTP {res.status_code} - Đăng nhập lại thành công sau khi mở khóa"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-LOCK-06", "Tài khoản đăng nhập lại bình thường sau khi được mở khóa", False, str(e))
