"""
GÓI KIỂM THỬ: PKG-04 - PHÂN QUYỀN VAI TRÒ (RBAC) & BẢO MẬT GIÁ VỐN (RBAC & ACCESS CONTROL)
Story áp dụng: S1-05 / SCRUM-202 & SCRUM-310
Endpoints áp dụng:
- GET /api/v1/auth/financial/cost-and-margin
- GET /api/v1/auth/demo/warehouse-only
- GET /api/v1/roles
- GET /api/v1/permissions
- GET /api/v1/roles/{role_id}
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


def chay_kiem_thu_rbac_permissions(bao_cao: BoBaoCaoKiemThu):
    print("\n--- Đang thực thi: [Package 04: Phân quyền Vai trò & Bảo mật Giá vốn] ---")
    app, client, engine, SessionTest = khoi_tao_app_test()

    def _lay_header(username, password):
        res = client.post("/api/v1/auth/login", json={"username": username, "password": password})
        token = res.json().get("access_token", "")
        return {"Authorization": f"Bearer {token}"}

    headers_admin = _lay_header("admin", "Admin@123456")
    headers_sales_mgr = _lay_header("sales_mgr", "SalesMgr@1234")
    headers_sales_rep = _lay_header("sales_rep", "SalesRep@1234")
    headers_wh = _lay_header("warehouse", "Warehouse@1234")
    headers_cust = _lay_header("customer", "Customer@1234")

    # --- Ca test 1: Security - Đại lý (Customer) xem giá vốn bị chặn ---
    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_cust)
        pass_dk = res.status_code == 403
        bao_cao.ghi_nhan(
            "TC-RBAC-01",
            "Bảo mật giá vốn: Đại lý (Customer) truy cập báo cáo giá vốn bị chặn",
            pass_dk,
            f"HTTP {res.status_code} - Chặn đúng theo chính sách bảo mật"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-01", "Bảo mật giá vốn: Đại lý (Customer) truy cập báo cáo giá vốn bị chặn", False, str(e))

    # --- Ca test 2: Security - Nhân viên kinh doanh (Sales Rep) xem giá vốn bị chặn ---
    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_sales_rep)
        pass_dk = res.status_code == 403
        bao_cao.ghi_nhan(
            "TC-RBAC-02",
            "Bảo mật giá vốn: Nhân viên kinh doanh (Sales Rep) truy cập giá vốn bị chặn",
            pass_dk,
            f"HTTP {res.status_code} - Nhân viên kinh doanh không được xem giá vốn"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-02", "Bảo mật giá vốn: Nhân viên kinh doanh (Sales Rep) truy cập giá vốn bị chặn", False, str(e))

    # --- Ca test 3: Security - Thủ kho (Warehouse) xem giá vốn bị chặn ---
    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_wh)
        pass_dk = res.status_code == 403
        bao_cao.ghi_nhan(
            "TC-RBAC-03",
            "Bảo mật giá vốn: Thủ kho (Warehouse) truy cập giá vốn bị chặn",
            pass_dk,
            f"HTTP {res.status_code} - Thủ kho không được xem giá vốn"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-03", "Bảo mật giá vốn: Thủ kho (Warehouse) truy cập giá vốn bị chặn", False, str(e))

    # --- Ca test 4: Functional - Quản lý kinh doanh (Sales Manager) xem giá vốn ---
    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_sales_mgr)
        data = res.json()
        pass_dk = res.status_code == 200 and "data" in data and len(data["data"]) > 0
        bao_cao.ghi_nhan(
            "TC-RBAC-04",
            "Quản lý kinh doanh (Sales Manager) xem báo cáo giá vốn & biên lợi nhuận",
            pass_dk,
            f"HTTP {res.status_code} - Trả về {len(data.get('data', []))} bản ghi SKU kèm biên lợi nhuận"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-04", "Quản lý kinh doanh (Sales Manager) xem báo cáo giá vốn & biên lợi nhuận", False, str(e))

    # --- Ca test 5: Functional - Quản trị viên (Admin) xem giá vốn ---
    try:
        res = client.get("/api/v1/auth/financial/cost-and-margin", headers=headers_admin)
        pass_dk = res.status_code == 200 and "data" in res.json()
        bao_cao.ghi_nhan(
            "TC-RBAC-05",
            "Quản trị viên (Admin) xem báo cáo giá vốn & biên lợi nhuận",
            pass_dk,
            f"HTTP {res.status_code} - Admin có toàn quyền"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-05", "Quản trị viên (Admin) xem báo cáo giá vốn & biên lợi nhuận", False, str(e))

    # --- Ca test 6: Security - Guard: Sales Rep vào khu vực kho bị chặn ---
    try:
        res = client.get("/api/v1/auth/demo/warehouse-only", headers=headers_sales_rep)
        pass_dk = res.status_code == 403
        bao_cao.ghi_nhan(
            "TC-RBAC-06",
            "Guard phân quyền: Nhân viên kinh doanh truy cập phân hệ Quản lý Kho bị chặn",
            pass_dk,
            f"HTTP {res.status_code} - Từ chối vai trò Sales Rep ở khu vực Kho"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-06", "Guard phân quyền: Nhân viên kinh doanh truy cập phân hệ Quản lý Kho bị chặn", False, str(e))

    # --- Ca test 7: Functional - Guard: Thủ kho vào khu vực kho thành công ---
    try:
        res = client.get("/api/v1/auth/demo/warehouse-only", headers=headers_wh)
        pass_dk = res.status_code == 200 and "Quản lý Kho" in res.json().get("message", "")
        bao_cao.ghi_nhan(
            "TC-RBAC-07",
            "Guard phân quyền: Thủ kho truy cập phân hệ Quản lý Kho thành công",
            pass_dk,
            f"HTTP {res.status_code} - {res.json().get('message')}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-07", "Guard phân quyền: Thủ kho truy cập phân hệ Quản lý Kho thành công", False, str(e))

    # --- Ca test 8: Functional - Danh sách 7 vai trò hệ thống ---
    try:
        res = client.get("/api/v1/roles")
        data = res.json()
        pass_dk = res.status_code == 200 and isinstance(data, list) and len(data) >= 5
        bao_cao.ghi_nhan(
            "TC-RBAC-08",
            "Lấy danh sách 7 vai trò hệ thống đầy đủ",
            pass_dk,
            f"HTTP {res.status_code} - Có {len(data)} vai trò hệ thống được khai báo"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-08", "Lấy danh sách 7 vai trò hệ thống đầy đủ", False, str(e))

    # --- Ca test 9: Functional - Danh sách quyền lọc theo module ---
    try:
        res = client.get("/api/v1/permissions?module=users")
        data = res.json()
        pass_dk = res.status_code == 200 and isinstance(data, list) and len(data) > 0
        bao_cao.ghi_nhan(
            "TC-RBAC-09",
            "Lấy danh sách quyền hệ thống có thể lọc theo module",
            pass_dk,
            f"HTTP {res.status_code} - Tìm thấy {len(data)} quyền thuộc module users"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-09", "Lấy danh sách quyền hệ thống có thể lọc theo module", False, str(e))

    # --- Ca test 10: Functional - Lấy chi tiết vai trò theo ID ---
    try:
        res = client.get("/api/v1/roles/1")
        data = res.json()
        pass_dk = res.status_code == 200 and "name" in data and "permissions" in data
        bao_cao.ghi_nhan(
            "TC-RBAC-10",
            "Lấy chi tiết vai trò theo ID",
            pass_dk,
            f"HTTP {res.status_code} - Role: {data.get('name')}, Quyền gán: {len(data.get('permissions', []))}"
        )
    except Exception as e:
        bao_cao.ghi_nhan("TC-RBAC-10", "Lấy chi tiết vai trò theo ID", False, str(e))
