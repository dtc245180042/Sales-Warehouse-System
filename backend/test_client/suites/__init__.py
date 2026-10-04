"""
Test Suites Package: Phân chia theo từng Phân Hệ Nghiệp Vụ (Domain Modules).
Bao phủ 10 User Stories (S1-01 -> S1-10) từ file Excel yêu cầu nghiệp vụ.
"""

from typing import Dict, Any

from .pkg_01_auth_login import chay_kiem_thu_auth_login
from .pkg_02_session_logout import chay_kiem_thu_session_logout
from .pkg_03_password_management import chay_kiem_thu_password_management
from .pkg_04_rbac_permissions import chay_kiem_thu_rbac_permissions
from .pkg_05_user_management import chay_kiem_thu_user_management
from .pkg_06_account_lockout import chay_kiem_thu_account_lockout

# Registry quản lý các domain test suites
SUITES_REGISTRY: Dict[str, Dict[str, Any]] = {
    "auth_login": {
        "title": "PKG-01: Xác thực Đăng nhập & Khóa 15 phút (S1-01)",
        "description": "Kiểm thử đăng nhập, kiểm tra tài khoản, sai mật khẩu và khóa 15 phút",
        "runner": chay_kiem_thu_auth_login,
    },
    "session_logout": {
        "title": "PKG-02: Duy trì Phiên, Đăng xuất & Thông tin Cá nhân (S1-02 & S1-06)",
        "description": "Kiểm thử refresh token, logout an toàn và hiển thị thông tin profile",
        "runner": chay_kiem_thu_session_logout,
    },
    "password_management": {
        "title": "PKG-03: Quản lý Mật khẩu: Quên & Đổi mật khẩu (S1-03 & S1-04)",
        "description": "Kiểm thử quên mật khẩu qua email token 30 phút, đổi mật khẩu và thu hồi phiên",
        "runner": chay_kiem_thu_password_management,
    },
    "rbac_permissions": {
        "title": "PKG-04: Phân quyền Vai trò (RBAC) & Bảo mật Giá vốn (S1-05)",
        "description": "Kiểm thử bảo mật giá vốn, guards theo vai trò và danh mục roles/permissions",
        "runner": chay_kiem_thu_rbac_permissions,
    },
    "user_management": {
        "title": "PKG-05: Quản lý Người dùng & Gán Vai trò (S1-08 & S1-09)",
        "description": "Kiểm thử tạo user, bắt trùng, ràng buộc vai trò kho, tìm kiếm và phân trang",
        "runner": chay_kiem_thu_user_management,
    },
    "account_lockout": {
        "title": "PKG-06: Khóa và Mở khóa Tài khoản (S1-10)",
        "description": "Kiểm thử khóa tài khoản có lý do, cảnh báo bàn giao đại lý và mở khóa",
        "runner": chay_kiem_thu_account_lockout,
    },
}


def chay_tat_ca_suites(bao_cao):
    """Chạy toàn bộ các test suites đã đăng ký trong registry."""
    if not SUITES_REGISTRY:
        print("\n[*] Hiện tại chưa có test suite nào trong thư mục suites/.")
        return

    for ma_suite, info in SUITES_REGISTRY.items():
        print(f"\n--- Đang thực thi Suite: [{info['title']}] ---")
        info["runner"](bao_cao)


def chay_suite_theo_ten(ten_suite: str, bao_cao) -> bool:
    """Chạy riêng một suite theo mã định danh."""
    ten_suite_clean = ten_suite.strip().lower()
    if ten_suite_clean in SUITES_REGISTRY:
        info = SUITES_REGISTRY[ten_suite_clean]
        print(f"\n--- Đang thực thi Suite: [{info['title']}] ---")
        info["runner"](bao_cao)
        return True
    return False
