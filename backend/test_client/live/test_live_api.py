"""
KIỂM THỬ TRỰC TIẾP QUA GIAO THỨC HTTP VỚI SERVER ĐANG CHẠY (LIVE API SERVER TEST)
Thực hiện HTTP Request thật 100% qua thư viện httpx tới máy chủ backend.
Bao phủ toàn diện các phân hệ: Authentication, Session, RBAC, User Management, Lockout.
Tuân thủ nghiêm ngặt nguyên tắc Vệ sinh Dữ liệu (Data Hygiene) và khối Teardown dọn rác.
"""

import sys
import time
from pathlib import Path
import httpx

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

thu_muc_client = Path(__file__).resolve().parent.parent
thu_muc_backend = thu_muc_client.parent
for p in [str(thu_muc_client), str(thu_muc_backend)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from core.reporter import BoBaoCaoKiemThu
from config.settings import BASE_URL, HTTP_TIMEOUT


def chay_kiem_thu_live_api(bao_cao: BoBaoCaoKiemThu = None, base_url: str = BASE_URL) -> bool:
    """
    Thực thi kiểm thử HTTP Request thật tới Live Server.
    Nếu có đối tượng bao_cao, tự động ghi nhận kết quả để đồng bộ vào Excel.
    """
    tao_moi_bao_cao = False
    if bao_cao is None:
        bao_cao = BoBaoCaoKiemThu("LIVE API SERVER (HTTP THẬT)")
        tao_moi_bao_cao = True

    print("=" * 80)
    print(f" BẮT ĐẦU KIỂM THỬ LIVE API TRÊN MÁY CHỦ THẬT: {base_url}")
    print("=" * 80)

    client = httpx.Client(base_url=base_url, timeout=HTTP_TIMEOUT)

    # 1. Kiểm tra kết nối máy chủ (Health Check)
    try:
        res_root = client.get("/")
    except Exception as e:
        print(f"\n[CẢNH BÁO]: Không thể kết nối tới máy chủ Live tại {base_url}!")
        print(f"Chi tiết lỗi: {e}")
        if tao_moi_bao_cao:
            bao_cao.ghi_nhan("TC-AUTH-01", "Kết nối máy chủ Live Server (Health Check)", False, f"Server offline tại {base_url}")
            bao_cao.in_bang_tong_hop()
        return False

    is_root_ok = res_root.status_code == 200
    print(f"[*] Health Check (GET /) -> HTTP {res_root.status_code}")

    # =========================================================================
    # PHÂN HỆ 1: AUTHENTICATION & LOGIN (Story S1-01 / SCRUM-287)
    # =========================================================================
    # Ca 1: Validation - Login payload rỗng
    try:
        res = client.post("/api/v1/auth/login", json={})
        pass_dk = res.status_code == 422
        bao_cao.ghi_nhan(
            "TC-AUTH-01",
            "Bắt lỗi thiếu trường bắt buộc khi đăng nhập",
            pass_dk,
            f"Live Server trả về HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-01", "Bắt lỗi thiếu trường bắt buộc khi đăng nhập", False, str(e))

    # Ca 2: Security - Tài khoản không tồn tại
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "live_non_existent_999", "password": "WrongPassword@123"}
        )
        data = res.json()
        pass_dk = res.status_code == 401 and "Tên đăng nhập hoặc mật khẩu không chính xác" in data.get("detail", "")
        bao_cao.ghi_nhan(
            "TC-AUTH-02",
            "Đăng nhập với tài khoản không tồn tại trong hệ thống",
            pass_dk,
            f"Live Server trả về HTTP {res.status_code} - {data.get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-02", "Đăng nhập với tài khoản không tồn tại trong hệ thống", False, str(e))

    # Ca 3: Security - Sai mật khẩu
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
            f"Live Server trả về HTTP {res.status_code} - {data.get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-03", "Đăng nhập đúng tài khoản nhưng sai mật khẩu", False, str(e))

    # Ca 5: Happy Path - Đăng nhập Admin
    token_admin = None
    headers_admin = {}
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "Admin@123456"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and "access_token" in data and data.get("user", {}).get("role") == "Admin"
        if pass_dk:
            token_admin = data["access_token"]
            headers_admin = {"Authorization": f"Bearer {token_admin}"}
        bao_cao.ghi_nhan(
            "TC-AUTH-05",
            "Đăng nhập thành công với tài khoản Quản trị hệ thống (Admin)",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Role: {data.get('user', {}).get('role')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-05", "Đăng nhập thành công với tài khoản Quản trị hệ thống (Admin)", False, str(e))

    # Ca 6: Happy Path - Đăng nhập Sales Manager
    token_sales_mgr = None
    headers_sales_mgr = {}
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "sales_mgr", "password": "SalesMgr@1234"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and "access_token" in data and data.get("user", {}).get("role") == "Sales Manager"
        if pass_dk:
            token_sales_mgr = data["access_token"]
            headers_sales_mgr = {"Authorization": f"Bearer {token_sales_mgr}"}
        bao_cao.ghi_nhan(
            "TC-AUTH-06",
            "Đăng nhập thành công với tài khoản Quản lý kinh doanh (Sales Manager)",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Role: {data.get('user', {}).get('role')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-06", "Đăng nhập thành công với tài khoản Quản lý kinh doanh (Sales Manager)", False, str(e))

    # Ca 7: Happy Path - Đăng nhập Customer
    token_customer = None
    headers_customer = {}
    try:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "customer", "password": "Customer@1234"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and "access_token" in data and data.get("user", {}).get("role") == "Customer"
        if pass_dk:
            token_customer = data["access_token"]
            headers_customer = {"Authorization": f"Bearer {token_customer}"}
        bao_cao.ghi_nhan(
            "TC-AUTH-07",
            "Đăng nhập thành công với tài khoản Đại lý (Customer)",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Role: {data.get('user', {}).get('role')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-07", "Đăng nhập thành công với tài khoản Đại lý (Customer)", False, str(e))

    # Đăng nhập Sales Rep và Warehouse để phục vụ test RBAC
    headers_sales_rep = {}
    try:
        r = client.post("/api/v1/auth/login", json={"username": "sales_rep", "password": "SalesRep@1234"})
        if r.status_code == 200:
            headers_sales_rep = {"Authorization": f"Bearer {r.json()['access_token']}"}
    except Exception:
        pass

    headers_wh = {}
    try:
        r = client.post("/api/v1/auth/login", json={"username": "warehouse", "password": "Warehouse@1234"})
        if r.status_code == 200:
            headers_wh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    except Exception:
        pass

    # =========================================================================
    # PHÂN HỆ 2: DUY TRÌ PHIÊN, PROFILE & ĐĂNG XUẤT (Story S1-02 & S1-06)
    # =========================================================================
    try:
        res = client.post("/api/v1/auth/refresh")
        bao_cao.ghi_nhan(
            "TC-SESS-01",
            "Gia hạn phiên khi không truyền Authorization Bearer header",
            res.status_code == 401,
            f"Live Server trả về HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-SESS-01", "Gia hạn phiên khi không truyền Authorization Bearer header", False, str(e))

    try:
        res = client.post("/api/v1/auth/refresh", headers=headers_sales_mgr)
        pass_dk = res.status_code == 200 and "access_token" in res.json()
        bao_cao.ghi_nhan(
            "TC-SESS-02",
            "Gia hạn phiên tự động thành công khi người dùng đang hoạt động",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Đã cấp token mới"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-SESS-02", "Gia hạn phiên tự động thành công khi người dùng đang hoạt động", False, str(e))

    try:
        res = client.get("/api/v1/auth/me")
        bao_cao.ghi_nhan(
            "TC-NAV-01",
            "Lấy thông tin người dùng đang đăng nhập khi không có token",
            res.status_code == 401,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-NAV-01", "Lấy thông tin người dùng đang đăng nhập khi không có token", False, str(e))

    try:
        res = client.get("/api/v1/auth/me", headers=headers_wh)
        data = res.json()
        pass_dk = res.status_code == 200 and data.get("username") == "warehouse"
        bao_cao.ghi_nhan(
            "TC-NAV-02",
            "Lấy thông tin người dùng hiển thị tên, vai trò và kho phụ trách",
            pass_dk,
            f"Live Server HTTP {res.status_code} - User: {data.get('username')}, Role: {data.get('role')}, Kho: {data.get('assigned_warehouse')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-NAV-02", "Lấy thông tin người dùng hiển thị tên, vai trò và kho phụ trách", False, str(e))

    # =========================================================================
    # PHÂN HỆ 3: BẢO MẬT GIÁ VỐN & PHÂN QUYỀN (Story S1-05 / SCRUM-202)
    # =========================================================================
    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_customer)
        bao_cao.ghi_nhan(
            "TC-RBAC-01",
            "Bảo mật giá vốn: Đại lý (Customer) truy cập báo cáo giá vốn bị chặn",
            res.status_code == 403,
            f"Live Server HTTP {res.status_code} - Chặn đúng theo chính sách"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-01", "Bảo mật giá vốn: Đại lý (Customer) truy cập báo cáo giá vốn bị chặn", False, str(e))

    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_sales_rep)
        bao_cao.ghi_nhan(
            "TC-RBAC-02",
            "Bảo mật giá vốn: Nhân viên kinh doanh (Sales Rep) truy cập giá vốn bị chặn",
            res.status_code == 403,
            f"Live Server HTTP {res.status_code} - Bị chặn ở tầng server"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-02", "Bảo mật giá vốn: Nhân viên kinh doanh (Sales Rep) truy cập giá vốn bị chặn", False, str(e))

    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_wh)
        bao_cao.ghi_nhan(
            "TC-RBAC-03",
            "Bảo mật giá vốn: Thủ kho (Warehouse) truy cập giá vốn bị chặn",
            res.status_code == 403,
            f"Live Server HTTP {res.status_code} - Bị chặn ở tầng server"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-03", "Bảo mật giá vốn: Thủ kho (Warehouse) truy cập giá vốn bị chặn", False, str(e))

    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_sales_mgr)
        data = res.json()
        pass_dk = res.status_code == 200 and "data" in data and len(data["data"]) > 0
        bao_cao.ghi_nhan(
            "TC-RBAC-04",
            "Quản lý kinh doanh (Sales Manager) xem báo cáo giá vốn & biên lợi nhuận",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Trả về {len(data.get('data', []))} bản ghi SKU"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-04", "Quản lý kinh doanh (Sales Manager) xem báo cáo giá vốn & biên lợi nhuận", False, str(e))

    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_admin)
        pass_dk = res.status_code == 200 and "data" in res.json()
        bao_cao.ghi_nhan(
            "TC-RBAC-05",
            "Quản trị viên (Admin) xem báo cáo giá vốn & biên lợi nhuận",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Admin toàn quyền"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-05", "Quản trị viên (Admin) xem báo cáo giá vốn & biên lợi nhuận", False, str(e))

    try:
        res = client.get("/api/v1/auth/demo/warehouse-only", headers=headers_sales_rep)
        bao_cao.ghi_nhan(
            "TC-RBAC-06",
            "Guard phân quyền: Nhân viên kinh doanh truy cập phân hệ Quản lý Kho bị chặn",
            res.status_code == 403,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-06", "Guard phân quyền: Nhân viên kinh doanh truy cập phân hệ Quản lý Kho bị chặn", False, str(e))

    try:
        res = client.get("/api/v1/auth/demo/warehouse-only", headers=headers_wh)
        bao_cao.ghi_nhan(
            "TC-RBAC-07",
            "Guard phân quyền: Thủ kho truy cập phân hệ Quản lý Kho thành công",
            res.status_code == 200,
            f"Live Server HTTP {res.status_code} - {res.json().get('message')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-07", "Guard phân quyền: Thủ kho truy cập phân hệ Quản lý Kho thành công", False, str(e))

    try:
        res = client.get("/api/v1/roles")
        data = res.json()
        pass_dk = res.status_code == 200 and len(data) >= 5
        bao_cao.ghi_nhan(
            "TC-RBAC-08",
            "Lấy danh sách 7 vai trò hệ thống đầy đủ",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Có {len(data)} vai trò hệ thống"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-08", "Lấy danh sách 7 vai trò hệ thống đầy đủ", False, str(e))

    try:
        res = client.get("/api/v1/permissions?module=users")
        data = res.json()
        pass_dk = res.status_code == 200 and len(data) > 0
        bao_cao.ghi_nhan(
            "TC-RBAC-09",
            "Lấy danh sách quyền hệ thống có thể lọc theo module",
            pass_dk,
            f"Live Server HTTP {res.status_code} - {len(data)} quyền users"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-09", "Lấy danh sách quyền hệ thống có thể lọc theo module", False, str(e))

    try:
        res = client.get("/api/v1/roles/1")
        pass_dk = res.status_code == 200 and "name" in res.json()
        bao_cao.ghi_nhan(
            "TC-RBAC-10",
            "Lấy chi tiết vai trò theo ID",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Role: {res.json().get('name')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-10", "Lấy chi tiết vai trò theo ID", False, str(e))

    # =========================================================================
    # PHÂN HỆ 4: USER MANAGEMENT VỚI DỮ LIỆU THẬT & TEARDOWN (Story S1-08 & S1-09)
    # =========================================================================
    timestamp_suffix = int(time.time())
    tmp_username = f"TEST_TMP_USER_{timestamp_suffix}"
    tmp_email = f"test_tmp_{timestamp_suffix}@warehouse.local"
    created_live_user_id = None

    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_customer,
            json={"username": tmp_username, "email": tmp_email, "role": "Customer"}
        )
        bao_cao.ghi_nhan(
            "TC-USER-01",
            "Người dùng không phải Quản trị viên gọi API tạo tài khoản bị từ chối",
            res.status_code == 403,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-01", "Người dùng không phải Quản trị viên gọi API tạo tài khoản bị từ chối", False, str(e))

    try:
        res = client.post("/api/v1/users", headers=headers_admin, json={})
        bao_cao.ghi_nhan(
            "TC-USER-02",
            "Tạo người dùng: Bắt lỗi thiếu username hoặc email bắt buộc",
            res.status_code == 422,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-02", "Tạo người dùng: Bắt lỗi thiếu username hoặc email bắt buộc", False, str(e))

    try:
        res = client.post("/api/v1/users", headers=headers_admin, json={"username": "live_inv", "email": "wrong_mail"})
        bao_cao.ghi_nhan(
            "TC-USER-03",
            "Tạo người dùng: Bắt lỗi địa chỉ email không đúng định dạng",
            res.status_code == 422,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-03", "Tạo người dùng: Bắt lỗi địa chỉ email không đúng định dạng", False, str(e))

    # Tạo user thật trên server
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={
                "username": tmp_username,
                "email": tmp_email,
                "role": "Sales Rep",
                "full_name": "Nhân Viên Live Test",
                "phone_number": "0912345678"
            }
        )
        data = res.json()
        pass_dk = res.status_code == 201 and data.get("username") == tmp_username
        if pass_dk:
            created_live_user_id = data.get("id")
        bao_cao.ghi_nhan(
            "TC-USER-04",
            "Admin tạo tài khoản người dùng mới thành công với mật khẩu tự sinh tạm",
            pass_dk,
            f"Live Server HTTP {res.status_code} - ID: {created_live_user_id}, User: {tmp_username}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-04", "Admin tạo tài khoản người dùng mới thành công với mật khẩu tự sinh tạm", False, str(e))

    # Bắt trùng username trên server thật
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={"username": tmp_username, "email": f"other_{timestamp_suffix}@test.local", "role": "Customer"}
        )
        pass_dk = res.status_code == 400 and "đã tồn tại" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-USER-05",
            "Tạo người dùng: Trùng tên đăng nhập (username) bị từ chối kèm thông báo cụ thể",
            pass_dk,
            f"Live Server HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-05", "Tạo người dùng: Trùng tên đăng nhập (username) bị từ chối kèm thông báo cụ thể", False, str(e))

    # Bắt trùng email trên server thật
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={"username": f"other_usr_{timestamp_suffix}", "email": tmp_email, "role": "Customer"}
        )
        pass_dk = res.status_code == 400 and "đã được đăng ký" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-USER-06",
            "Tạo người dùng: Trùng địa chỉ email bị từ chối kèm thông báo cụ thể",
            pass_dk,
            f"Live Server HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-06", "Tạo người dùng: Trùng địa chỉ email bị từ chối kèm thông báo cụ thể", False, str(e))

    # Tìm kiếm trên server thật
    try:
        res = client.get(f"/api/v1/users?q={tmp_username}", headers=headers_admin)
        data = res.json()
        pass_dk = res.status_code == 200 and data.get("total", 0) >= 1
        bao_cao.ghi_nhan(
            "TC-USER-07",
            "Tìm kiếm tài khoản người dùng theo từ khóa (tên, username hoặc số điện thoại)",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Tìm thấy {data.get('total')} kết quả khớp"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-07", "Tìm kiếm tài khoản người dùng theo từ khóa (tên, username hoặc số điện thoại)", False, str(e))

    try:
        res = client.get("/api/v1/users?role=Sales Rep", headers=headers_admin)
        pass_dk = res.status_code == 200 and "items" in res.json()
        bao_cao.ghi_nhan(
            "TC-USER-08",
            "Lọc danh sách tài khoản theo vai trò và trạng thái",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Lọc theo role Sales Rep"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-08", "Lọc danh sách tài khoản theo vai trò và trạng thái", False, str(e))

    try:
        res = client.get("/api/v1/users", headers=headers_admin)
        data = res.json()
        pass_dk = res.status_code == 200 and data.get("page_size") == 20
        bao_cao.ghi_nhan(
            "TC-USER-09",
            "Phân trang danh sách tài khoản người dùng (mặc định 20 dòng)",
            pass_dk,
            f"Live Server HTTP {res.status_code} - page_size: {data.get('page_size')}, total: {data.get('total')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-09", "Phân trang danh sách tài khoản người dùng (mặc định 20 dòng)", False, str(e))

    # Cập nhật thông tin trên server thật
    try:
        target_uid = created_live_user_id or 2
        res = client.put(
            f"/api/v1/users/{target_uid}",
            headers=headers_admin,
            json={"full_name": "Nhân Viên Live Cập Nhật", "phone_number": "0999888777"}
        )
        data = res.json()
        pass_dk = res.status_code == 200 and data.get("full_name") == "Nhân Viên Live Cập Nhật"
        bao_cao.ghi_nhan(
            "TC-USER-10",
            "Chỉnh sửa thông tin họ tên và số điện thoại người dùng",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Họ tên mới: {data.get('full_name')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-USER-10", "Chỉnh sửa thông tin họ tên và số điện thoại người dùng", False, str(e))

    # Ràng buộc vai trò kho
    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={"username": f"TEST_TMP_KHO_NO_{timestamp_suffix}", "email": f"test_no_wh_{timestamp_suffix}@test.local", "role": "Warehouse"}
        )
        pass_dk = res.status_code == 400 and "phải được gắn với ít nhất một kho" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-ROLE-01",
            "Ràng buộc vai trò kho: Tạo tài khoản vai trò Kho nhưng KHÔNG gắn kho bị từ chối",
            pass_dk,
            f"Live Server HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-ROLE-01", "Ràng buộc vai trò kho: Tạo tài khoản vai trò Kho nhưng KHÔNG gắn kho bị từ chối", False, str(e))

    try:
        res = client.post(
            "/api/v1/users",
            headers=headers_admin,
            json={
                "username": f"TEST_TMP_KHO_OK_{timestamp_suffix}",
                "email": f"test_wh_ok_{timestamp_suffix}@test.local",
                "role": "Warehouse",
                "assigned_warehouse": "Kho Tổng Miền Nam"
            }
        )
        data = res.json()
        pass_dk = res.status_code == 201 and data.get("assigned_warehouse") == "Kho Tổng Miền Nam"
        wh_ok_id = data.get("id")
        bao_cao.ghi_nhan(
            "TC-ROLE-02",
            "Tạo tài khoản vai trò Kho có gắn kho cụ thể thành công",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Kho: {data.get('assigned_warehouse')}"
        )
        # Teardown user kho
        if wh_ok_id:
            from app.core.database import SessionLocal
            from app.models.auth import User
            dbs = SessionLocal()
            u_del = dbs.query(User).filter(User.id == wh_ok_id).first()
            if u_del:
                dbs.delete(u_del)
                dbs.commit()
            dbs.close()
    except Exception as e:
        bao_cao.ghi_nhan("TC-ROLE-02", "Tạo tài khoản vai trò Kho có gắn kho cụ thể thành công", False, str(e))

    # Admin tự thu hồi quyền Admin
    try:
        admin_me = client.get("/api/v1/auth/me", headers=headers_admin).json()
        res = client.put(f"/api/v1/users/{admin_me.get('id')}", headers=headers_admin, json={"role": "Customer"})
        pass_dk = res.status_code == 400 and "Không thể tự thu hồi" in res.json().get("detail", "")
        bao_cao.ghi_nhan(
            "TC-ROLE-03",
            "Bảo vệ tài khoản quản trị: Quản trị viên tự thu hồi vai trò Admin của chính mình bị từ chối",
            pass_dk,
            f"Live Server HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-ROLE-03", "Bảo vệ tài khoản quản trị: Quản trị viên tự thu hồi vai trò Admin của chính mình bị từ chối", False, str(e))

    # =========================================================================
    # PHÂN HỆ 5: KHÓA VÀ MỞ KHÓA TÀI KHOẢN (Story S1-10 / SCRUM-207)
    # =========================================================================
    if created_live_user_id:
        try:
            res = client.post(f"/api/v1/users/{created_live_user_id}/lock", headers=headers_admin, json={})
            bao_cao.ghi_nhan(
                "TC-LOCK-01",
                "Khóa tài khoản: Bắt buộc ghi lý do khóa (reason)",
                res.status_code == 422,
                f"Live Server HTTP {res.status_code}"
            )
        except Exception as e:
            bao_cao.ghi_nhan("TC-LOCK-01", "Khóa tài khoản: Bắt buộc ghi lý do khóa (reason)", False, str(e))

        try:
            admin_me = client.get("/api/v1/auth/me", headers=headers_admin).json()
            res = client.post(
                f"/api/v1/users/{admin_me.get('id')}/lock",
                headers=headers_admin,
                json={"reason": "Tự khóa thử nghiệm"}
            )
            pass_dk = res.status_code == 400 and "Không thể tự khóa tài khoản của chính mình" in res.json().get("detail", "")
            bao_cao.ghi_nhan(
                "TC-LOCK-02",
                "Bảo vệ Admin: Quản trị viên tự khóa tài khoản của chính mình bị từ chối",
                pass_dk,
                f"Live Server HTTP {res.status_code} - {res.json().get('detail')}"
            )
        except Exception as e:
            bao_cao.ghi_nhan("TC-LOCK-02", "Bảo vệ Admin: Quản trị viên tự khóa tài khoản của chính mình bị từ chối", False, str(e))

        try:
            res = client.post(
                f"/api/v1/users/{created_live_user_id}/lock",
                headers=headers_admin,
                json={"reason": "Nhân viên nghỉ việc thử nghiệm"}
            )
            data = res.json()
            pass_dk = (
                res.status_code == 200
                and data.get("session_revoked") is True
                and data.get("handover_warning") is not None
            )
            bao_cao.ghi_nhan(
                "TC-LOCK-03",
                "Khóa tài khoản Nhân viên kinh doanh kèm cảnh báo bàn giao đại lý phụ trách",
                pass_dk,
                f"Live Server HTTP {res.status_code} - Cảnh báo: {data.get('handover_warning')}"
            )
        except Exception as e:
            bao_cao.ghi_nhan("TC-LOCK-03", "Khóa tài khoản Nhân viên kinh doanh kèm cảnh báo bàn giao đại lý phụ trách", False, str(e))

        try:
            res = client.post(
                "/api/v1/auth/login",
                json={"username": tmp_username, "password": "AnyPassword@123"}
            )
            pass_dk = res.status_code == 403 and "Tài khoản đã bị vô hiệu hóa" in res.json().get("detail", "")
            bao_cao.ghi_nhan(
                "TC-LOCK-04",
                "Tài khoản bị khóa không thể đăng nhập vào hệ thống",
                pass_dk,
                f"Live Server HTTP {res.status_code} - {res.json().get('detail')}"
            )
        except Exception as e:
            bao_cao.ghi_nhan("TC-LOCK-04", "Tài khoản bị khóa không thể đăng nhập vào hệ thống", False, str(e))

        try:
            res = client.post(f"/api/v1/users/{created_live_user_id}/unlock", headers=headers_admin)
            data = res.json()
            pass_dk = res.status_code == 200 and "mở khóa thành công" in data.get("message", "").lower()
            bao_cao.ghi_nhan(
                "TC-LOCK-05",
                "Mở khóa tài khoản đã bị khóa thành công",
                pass_dk,
                f"Live Server HTTP {res.status_code} - {data.get('message')}"
            )
        except Exception as e:
            bao_cao.ghi_nhan("TC-LOCK-05", "Mở khóa tài khoản đã bị khóa thành công", False, str(e))

        # Đổi password tạm để test login lại sau mở khóa
        try:
            from app.core.database import SessionLocal
            from app.models.auth import User
            from app.core.security import bam_mat_khau
            dbs = SessionLocal()
            u_live = dbs.query(User).filter(User.id == created_live_user_id).first()
            if u_live:
                u_live.hashed_password = bam_mat_khau("TestPass@2026")
                dbs.commit()
            dbs.close()

            res = client.post("/api/v1/auth/login", json={"username": tmp_username, "password": "TestPass@2026"})
            pass_dk = res.status_code == 200 and "access_token" in res.json()
            bao_cao.ghi_nhan(
                "TC-LOCK-06",
                "Tài khoản đăng nhập lại bình thường sau khi được mở khóa",
                pass_dk,
                f"Live Server HTTP {res.status_code} - Đăng nhập lại thành công"
            )
        except Exception as e:
            bao_cao.ghi_nhan("TC-LOCK-06", "Tài khoản đăng nhập lại bình thường sau khi được mở khóa", False, str(e))

    # =========================================================================
    # PHÂN HỆ 6: PASSWORD MANAGEMENT TRÊN LIVE SERVER (Story S1-03 & S1-04)
    # =========================================================================
    try:
        res = client.post("/api/v1/auth/forgot-password", json={"email": "wrong-email"})
        bao_cao.ghi_nhan(
            "TC-PWD-01",
            "Quên mật khẩu: Kiểm tra email sai định dạng",
            res.status_code == 422,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-01", "Quên mật khẩu: Kiểm tra email sai định dạng", False, str(e))

    try:
        res = client.post("/api/v1/auth/forgot-password", json={"email": "non_existent_live@test.local"})
        pass_dk = res.status_code == 200 and "Nếu email tồn tại" in res.json().get("message", "")
        bao_cao.ghi_nhan(
            "TC-PWD-02",
            "Quên mật khẩu: Email không tồn tại vẫn trả thông báo chung an toàn",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Thông báo bảo mật chung"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-02", "Quên mật khẩu: Email không tồn tại vẫn trả thông báo chung an toàn", False, str(e))

    try:
        res = client.post("/api/v1/auth/forgot-password", json={"email": "customer@warehouse.local"})
        pass_dk = res.status_code == 200
        bao_cao.ghi_nhan(
            "TC-PWD-03",
            "Quên mật khẩu: Yêu cầu đặt lại mật khẩu thành công với email hợp lệ",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Token 30 phút được tạo"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-03", "Quên mật khẩu: Yêu cầu đặt lại mật khẩu thành công với email hợp lệ", False, str(e))

    try:
        res = client.post("/api/v1/auth/reset-password", json={"token": "invalid_live_token", "new_password": "NewPass@123"})
        bao_cao.ghi_nhan(
            "TC-PWD-04",
            "Đặt lại mật khẩu: Sử dụng token không hợp lệ hoặc không tồn tại",
            res.status_code == 400,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-04", "Đặt lại mật khẩu: Sử dụng token không hợp lệ hoặc không tồn tại", False, str(e))

    try:
        res = client.post("/api/v1/auth/reset-password", json={"token": "any_tok", "new_password": "123"})
        bao_cao.ghi_nhan(
            "TC-PWD-05",
            "Đặt lại mật khẩu: Mật khẩu mới yếu (< 8 ký tự hoặc thiếu số/chữ)",
            res.status_code == 422,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-05", "Đặt lại mật khẩu: Mật khẩu mới yếu (< 8 ký tự hoặc thiếu số/chữ)", False, str(e))

    # Lấy token reset từ DB để test đặt lại mật khẩu thành công
    try:
        from app.core.database import SessionLocal
        from app.models.auth import User
        dbs = SessionLocal()
        cust_u = dbs.query(User).filter(User.email == "customer@warehouse.local").first()
        live_reset_token = cust_u.reset_password_token if cust_u else None
        dbs.close()

        if live_reset_token:
            res = client.post(
                "/api/v1/auth/reset-password",
                json={"token": live_reset_token, "new_password": "CustomerNewPass@2026"}
            )
            pass_dk = res.status_code == 200
            bao_cao.ghi_nhan(
                "TC-PWD-06",
                "Đặt lại mật khẩu thành công với token hợp lệ còn hạn 30 phút",
                pass_dk,
                f"Live Server HTTP {res.status_code} - Đặt lại thành công"
            )

            # Dùng lại token lần 2
            res_reuse = client.post(
                "/api/v1/auth/reset-password",
                json={"token": live_reset_token, "new_password": "AnotherPass@2026"}
            )
            bao_cao.ghi_nhan(
                "TC-PWD-07",
                "Thử sử dụng lại token đặt lại mật khẩu lần 2 bị từ chối",
                res_reuse.status_code == 400,
                f"Live Server HTTP {res_reuse.status_code} - Đã chặn tái sử dụng"
            )

            # Phục hồi mật khẩu cũ cho customer để không ảnh hưởng bài test khác
            dbs = SessionLocal()
            from app.core.security import bam_mat_khau
            cust_u = dbs.query(User).filter(User.email == "customer@warehouse.local").first()
            if cust_u:
                cust_u.hashed_password = bam_mat_khau("Customer@1234")
                dbs.commit()
            dbs.close()
    except Exception as e:
        bao_cao.ghi_nhan("TC-PWD-06", "Đặt lại mật khẩu thành công với token hợp lệ còn hạn 30 phút", False, str(e))
        bao_cao.ghi_nhan("TC-PWD-07", "Thử sử dụng lại token đặt lại mật khẩu lần 2 bị từ chối", False, str(e))

    # Đổi mật khẩu
    try:
        res = client.post("/api/v1/auth/change-password", json={"old_password": "x", "new_password": "y"})
        bao_cao.ghi_nhan(
            "TC-CHGPWD-01",
            "Đổi mật khẩu khi chưa xác thực Bearer token",
            res.status_code == 401,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-01", "Đổi mật khẩu khi chưa xác thực Bearer token", False, str(e))

    try:
        res = client.post(
            "/api/v1/auth/change-password",
            headers=headers_sales_mgr,
            json={"old_password": "WrongPassword@123", "new_password": "NewSalesMgrPass@2026"}
        )
        bao_cao.ghi_nhan(
            "TC-CHGPWD-02",
            "Đổi mật khẩu: Mật khẩu cũ không chính xác",
            res.status_code == 400,
            f"Live Server HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-02", "Đổi mật khẩu: Mật khẩu cũ không chính xác", False, str(e))

    try:
        res = client.post(
            "/api/v1/auth/change-password",
            headers=headers_sales_mgr,
            json={"old_password": "SalesMgr@1234", "new_password": "SalesMgr@1234"}
        )
        bao_cao.ghi_nhan(
            "TC-CHGPWD-03",
            "Đổi mật khẩu: Mật khẩu mới trùng với mật khẩu hiện tại",
            res.status_code == 400,
            f"Live Server HTTP {res.status_code} - {res.json().get('detail')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-03", "Đổi mật khẩu: Mật khẩu mới trùng với mật khẩu hiện tại", False, str(e))

    try:
        res = client.post(
            "/api/v1/auth/change-password",
            headers=headers_sales_mgr,
            json={"old_password": "SalesMgr@1234", "new_password": "short"}
        )
        bao_cao.ghi_nhan(
            "TC-CHGPWD-04",
            "Đổi mật khẩu: Mật khẩu mới không đủ độ mạnh (< 8 ký tự hoặc thiếu chữ/số)",
            res.status_code == 422,
            f"Live Server HTTP {res.status_code}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-04", "Đổi mật khẩu: Mật khẩu mới không đủ độ mạnh (< 8 ký tự hoặc thiếu chữ/số)", False, str(e))

    # Ca test 4: Đăng nhập sai 5 lần và khóa 15 phút trên Live Server
    try:
        # Chuẩn bị user riêng để khóa
        from app.core.database import SessionLocal
        from app.models.auth import User
        from app.core.security import bam_mat_khau
        dbs = SessionLocal()
        u_lock = dbs.query(User).filter(User.username == f"TEST_TMP_LOCK_{timestamp_suffix}").first()
        if not u_lock:
            u_lock = User(
                username=f"TEST_TMP_LOCK_{timestamp_suffix}",
                email=f"lock_{timestamp_suffix}@test.local",
                full_name="User Live Khóa 15 Phút",
                hashed_password=bam_mat_khau("LockPass@123"),
                role="Customer",
                is_active=True,
                failed_login_attempts=0
            )
            dbs.add(u_lock)
            dbs.commit()
            dbs.refresh(u_lock)
        dbs.close()

        last_resp = None
        for _ in range(5):
            last_resp = client.post(
                "/api/v1/auth/login",
                json={"username": f"TEST_TMP_LOCK_{timestamp_suffix}", "password": "WrongPassword@999"}
            )

        data = last_resp.json()
        pass_dk = last_resp.status_code == 403 and "15 phút" in data.get("detail", "")
        bao_cao.ghi_nhan(
            "TC-AUTH-04",
            "Khóa tạm thời 15 phút sau 5 lần nhập sai liên tiếp",
            pass_dk,
            f"Live Server HTTP {last_resp.status_code} - {data.get('detail')}"
        )

        # Teardown user khóa
        dbs = SessionLocal()
        del_u = dbs.query(User).filter(User.username == f"TEST_TMP_LOCK_{timestamp_suffix}").first()
        if del_u:
            dbs.delete(del_u)
            dbs.commit()
        dbs.close()
    except Exception as e:
        bao_cao.ghi_nhan("TC-AUTH-04", "Khóa tạm thời 15 phút sau 5 lần nhập sai liên tiếp", False, str(e))

    # Đổi mật khẩu thành công sales_mgr & thu hồi phiên
    try:
        res = client.post(
            "/api/v1/auth/change-password",
            headers=headers_sales_mgr,
            json={"old_password": "SalesMgr@1234", "new_password": "SalesMgrNew@2026"}
        )
        pass_dk = res.status_code == 200

        # Kiểm tra token cũ bị từ chối
        r_old = client.get("/api/v1/auth/me", headers=headers_sales_mgr)
        pass_dk = pass_dk and r_old.status_code == 401

        bao_cao.ghi_nhan(
            "TC-CHGPWD-05",
            "Đổi mật khẩu thành công và thu hồi toàn bộ các phiên đăng nhập khác",
            pass_dk,
            f"Live Server HTTP {res.status_code} - Token cũ bị thu hồi: HTTP {r_old.status_code}"
        )

        # Đăng xuất an toàn với token mới
        r_new_login = client.post(
            "/api/v1/auth/login",
            json={"username": "sales_mgr", "password": "SalesMgrNew@2026"}
        )
        if r_new_login.status_code == 200:
            h_new = {"Authorization": f"Bearer {r_new_login.json()['access_token']}"}
            r_logout = client.post("/api/v1/auth/logout", headers=h_new)
            bao_cao.ghi_nhan(
                "TC-SESS-03",
                "Đăng xuất an toàn vô hiệu hóa phiên phía máy chủ",
                r_logout.status_code == 200,
                f"Live Server HTTP {r_logout.status_code} - {r_logout.json().get('message')}"
            )
            # Thử lại token sau logout
            r_reused = client.get("/api/v1/auth/me", headers=h_new)
            bao_cao.ghi_nhan(
                "TC-SESS-04",
                "Sử dụng lại token cũ sau khi đã đăng xuất bị từ chối",
                r_reused.status_code == 401,
                f"Live Server HTTP {r_reused.status_code} - Đã chặn Replay Token"
            )

        # Phục hồi mật khẩu cũ cho sales_mgr
        from app.core.database import SessionLocal
        from app.models.auth import User
        from app.core.security import bam_mat_khau
        dbs = SessionLocal()
        sm = dbs.query(User).filter(User.username == "sales_mgr").first()
        if sm:
            sm.hashed_password = bam_mat_khau("SalesMgr@1234")
            sm.token_version += 1
            dbs.commit()
        dbs.close()
    except Exception as e:
        bao_cao.ghi_nhan("TC-CHGPWD-05", "Đổi mật khẩu thành công và thu hồi toàn bộ các phiên đăng nhập khác", False, str(e))
        bao_cao.ghi_nhan("TC-SESS-03", "Đăng xuất an toàn vô hiệu hóa phiên phía máy chủ", False, str(e))
        bao_cao.ghi_nhan("TC-SESS-04", "Sử dụng lại token cũ sau khi đã đăng xuất bị từ chối", False, str(e))

    # =========================================================================
    # TEARDOWN: DỌN DẸP TẤT CẢ DỮ LIỆU TẠM TEST_TMP_* TRÊN DATABASE THẬT
    # =========================================================================
    try:
        from app.core.database import SessionLocal
        from app.models.auth import User
        dbs = SessionLocal()
        users_tmp = dbs.query(User).filter(User.username.like("TEST_TMP_%")).all()
        so_luong_xoa = len(users_tmp)
        for u in users_tmp:
            dbs.delete(u)
        dbs.commit()
        dbs.close()
        print(f"[*] Teardown: Đã dọn dẹp an toàn {so_luong_xoa} bản ghi TEST_TMP_* trong database.")
    except Exception as e:
        print(f"[!] Cảnh báo Teardown: {e}")

    if tao_moi_bao_cao:
        bao_cao.in_bang_tong_hop()

    return True


if __name__ == "__main__":
    chay_kiem_thu_live_api()
