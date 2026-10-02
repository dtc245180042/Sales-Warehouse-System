"""
GÓI KIỂM THỬ: PKG-05 - QUẢN LÝ NGƯỜI DÙNG & GÁN VAI TRÒ (USER & ROLE MANAGEMENT)
Story áp dụng: S1-08 & S1-09 / SCRUM-205 & SCRUM-206
Endpoints áp dụng:
- POST /api/v1/users
- GET /api/v1/users
- PUT /api/v1/users/{user_id}
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


def chay_kiem_thu_user_management(bao_cao: BoBaoCaoKiemThu):
    print("\n--- Đang thực thi: [Package 05: Quản lý Người dùng & Gán Vai trò] ---")
    app, client, engine, SessionTest = khoi_tao_app_test()

    def _lay_header(username, password):
        res = client.post("/api/v1/auth/login", json={"username": username, "password": password})
        token = res.json().get("access_token", "")
        return {"Authorization": f"Bearer {token}"}

    headers_admin = _lay_header("admin", "Admin@123456")
    headers_cust = _lay_header("customer", "Customer@1234")

    # Lấy thông tin user id của admin để test chặn tự thu hồi
    admin_info = client.get("/api/v1/auth/me", headers=headers_admin).json()
    admin_id = admin_info.get("id", 1)

    # --- Ca test 1: Security - Người dùng không phải Admin gọi tạo tài khoản bị từ chối ---
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_cust,
            json={"username": "test_unauth", "email": "unauth@test.local", "role": "Customer"}
        )
        pass_dk = res.status_code == 403
        bao_cao.ghi_nhan(
            "TC-USER-01",
            "Người dùng không phải Quản trị viên gọi API tạo tài khoản bị từ chối",
            pass_dk,
            f"HTTP {res.status_code} - Bị chặn đúng quyền Admin"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-01", "Người dùng không phải Quản trị viên gọi API tạo tài khoản bị từ chối", False, str(e))

    # --- Ca test 2: Validation - Thiếu trường bắt buộc username hoặc email ---
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={"full_name": "Test Missing Fields"}
        )
        pass_dk = res.status_code == 422
        bao_cao.ghi_nhan(
            "TC-USER-02",
            "Tạo người dùng: Bắt lỗi thiếu username hoặc email bắt buộc",
            pass_dk,
            f"HTTP {res.status_code} - Báo thiếu trường bắt buộc Pydantic"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-02", "Tạo người dùng: Bắt lỗi thiếu username hoặc email bắt buộc", False, str(e))

    # --- Ca test 3: Validation - Email sai định dạng ---
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={"username": "test_inv_email", "email": "wrong-format-email"}
        )
        pass_dk = res.status_code == 422
        bao_cao.ghi_nhan(
            "TC-USER-03",
            "Tạo người dùng: Bắt lỗi địa chỉ email không đúng định dạng",
            pass_dk,
            f"HTTP {res.status_code} - Bắt lỗi định dạng email"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-03", "Tạo người dùng: Bắt lỗi địa chỉ email không đúng định dạng", False, str(e))

    # --- Ca test 4: Functional - Admin tạo người dùng mới với mật khẩu tự sinh tạm ---
    user_created_id = None
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={
                "username": "TEST_TMP_NVKD_01",
                "email": "test_tmp_nvkd01@warehouse.local",
                "role": "Sales Rep",
                "full_name": "Trần Văn Kinh Doanh",
                "phone_number": "0911223344"
            }
        )
        data = res.json()
        pass_dk = res.status_code == 201 and data.get("username") == "TEST_TMP_NVKD_01" and data.get("must_change_password") is True
        user_created_id = data.get("id")
        bao_cao.ghi_nhan(
            "TC-USER-04",
            "Admin tạo tài khoản người dùng mới thành công với mật khẩu tự sinh tạm",
            pass_dk,
            f"HTTP {res.status_code} - ID: {user_created_id}, must_change_password={data.get('must_change_password')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-04", "Admin tạo tài khoản người dùng mới thành công với mật khẩu tự sinh tạm", False, str(e))

    # --- Ca test 5: Business - Trùng tên đăng nhập ---
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={"username": "admin", "email": "unique_email_test@warehouse.local", "role": "Customer"}
        )
        pass_dk = res.status_code == 400 and "đã tồn tại" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-USER-05",
            "Tạo người dùng: Trùng tên đăng nhập (username) bị từ chối kèm thông báo cụ thể",
            pass_dk,
            f"HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-05", "Tạo người dùng: Trùng tên đăng nhập (username) bị từ chối kèm thông báo cụ thể", False, str(e))

    # --- Ca test 6: Business - Trùng địa chỉ email ---
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={"username": "unique_usr_test", "email": "customer@warehouse.local", "role": "Customer"}
        )
        pass_dk = res.status_code == 400 and "đã được đăng ký" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-USER-06",
            "Tạo người dùng: Trùng địa chỉ email bị từ chối kèm thông báo cụ thể",
            pass_dk,
            f"HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-06", "Tạo người dùng: Trùng địa chỉ email bị từ chối kèm thông báo cụ thể", False, str(e))

    # --- Ca test 7: Functional - Tìm kiếm người dùng theo từ khóa ---
    try:
        res = client.get("/api/v1/users?q=admin", headers=headers_admin)
        data = res.json()
        pass_dk = res.status_code == 200 and data.get("total", 0) >= 1
        bao_cao.ghi_nhan(
            "TC-USER-07",
            "Tìm kiếm tài khoản người dùng theo từ khóa (tên, username hoặc số điện thoại)",
            pass_dk,
            f"HTTP {res.status_code} - Tìm thấy {data.get('total')} kết quả khớp 'admin'"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-07", "Tìm kiếm tài khoản người dùng theo từ khóa (tên, username hoặc số điện thoại)", False, str(e))

    # --- Ca test 8: Functional - Lọc theo vai trò và trạng thái ---
    try:
        res = client.get("/api/v1/users?role=Customer&is_active=true", headers=headers_admin)
        data = res.json()
        pass_dk = res.status_code == 200 and all(u.get("role") == "Customer" for u in data.get("items", []))
        bao_cao.ghi_nhan(
            "TC-USER-08",
            "Lọc danh sách tài khoản theo vai trò và trạng thái",
            pass_dk,
            f"HTTP {res.status_code} - Trả về {len(data.get('items', []))} tài khoản role Customer"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-08", "Lọc danh sách tài khoản theo vai trò và trạng thái", False, str(e))

    # --- Ca test 9: Functional - Phân trang danh sách mặc định 20 dòng ---
    try:
        res = client.get("/api/v1/users", headers=headers_admin)
        data = res.json()
        pass_dk = res.status_code == 200 and data.get("page_size") == 20 and data.get("page") == 1
        bao_cao.ghi_nhan(
            "TC-USER-09",
            "Phân trang danh sách tài khoản người dùng (mặc định 20 dòng)",
            pass_dk,
            f"HTTP {res.status_code} - page={data.get('page')}, page_size={data.get('page_size')}, total={data.get('total')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-09", "Phân trang danh sách tài khoản người dùng (mặc định 20 dòng)", False, str(e))

    # --- Ca test 10: Functional - Chỉnh sửa thông tin họ tên, số điện thoại ---
    try:
        target_id = user_created_id or 2
        res = client.put(
            f"/api/v1/users/{target_id}",
            headers=headers_admin,
            json={"full_name": "Nguyễn Văn Đã Cập Nhật", "phone_number": "0987654321"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and data.get("full_name") == "Nguyễn Văn Đã Cập Nhật" and data.get("phone_number") == "0987654321"
        bao_cao.ghi_nhan(
            "TC-USER-10",
            "Chỉnh sửa thông tin họ tên và số điện thoại người dùng",
            pass_dk,
            f"HTTP {res.status_code} - Cập nhật họ tên: {data.get('full_name')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-10", "Chỉnh sửa thông tin họ tên và số điện thoại người dùng", False, str(e))

    # --- Ca test 11: Business - Ràng buộc vai trò kho không gắn kho bị từ chối ---
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={"username": "TEST_TMP_KHO_NO_WH", "email": "test_no_wh@warehouse.local", "role": "Warehouse"}
        )
        pass_dk = res.status_code == 400 and "phải được gắn với ít nhất một kho" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-ROLE-01",
            "Ràng buộc vai trò kho: Tạo tài khoản vai trò Kho nhưng KHÔNG gắn kho bị từ chối",
            pass_dk,
            f"HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-ROLE-01", "Ràng buộc vai trò kho: Tạo tài khoản vai trò Kho nhưng KHÔNG gắn kho bị từ chối", False, str(e))

    # --- Ca test 12: Functional - Tạo vai trò kho có gắn kho thành công ---
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={
                "username": "TEST_TMP_KHO_OK",
                "email": "test_kho_ok@warehouse.local",
                "role": "Warehouse",
                "assigned_warehouse": "Kho Tổng Bình Dương"
            }
        )
        data = res.json()
        pass_dk = res.status_code == 201 and data.get("assigned_warehouse") == "Kho Tổng Bình Dương"
        bao_cao.ghi_nhan(
            "TC-ROLE-02",
            "Tạo tài khoản vai trò Kho có gắn kho cụ thể thành công",
            pass_dk,
            f"HTTP {res.status_code} - Kho: {data.get('assigned_warehouse')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-ROLE-02", "Tạo tài khoản vai trò Kho có gắn kho cụ thể thành công", False, str(e))

    # --- Ca test 13: Security - Admin tự thu hồi quyền Admin của chính mình bị từ chối ---
    try:
        res = client.put(
            f"/api/v1/users/{admin_id}",
            headers=headers_admin,
            json={"role": "Customer"}
        )
        pass_dk = res.status_code == 400 and "Không thể tự thu hồi" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-ROLE-03",
            "Bảo vệ tài khoản quản trị: Quản trị viên tự thu hồi vai trò Admin của chính mình bị từ chối",
            pass_dk,
            f"HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-ROLE-03", "Bảo vệ tài khoản quản trị: Quản trị viên tự thu hồi vai trò Admin của chính mình bị từ chối", False, str(e))
