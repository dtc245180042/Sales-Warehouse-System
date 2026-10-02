import importlib
import pkgutil
from pathlib import Path
from app.models.auth import Role, Permission, User, UserRole, role_permissions, user_roles

# ==============================================================================
# TỰ ĐỘNG IMPORT TẤT CẢ MODEL (ZERO-CONFLICT MODEL DISCOVERY)
# Bất kỳ Agent nào tạo model mới (ví dụ: product.py, order.py) trong app/models/
# chỉ cần kế thừa Base (từ app.core.database). Hệ thống sẽ tự động nạp vào metadata.
# CÁC AGENT TUYỆT ĐỐI KHÔNG CẦN CHỈNH SỬA FILE NÀY!
# ==============================================================================
_current_dir = Path(__file__).parent
for _module_info in pkgutil.iter_modules([str(_current_dir)]):
    if not _module_info.name.startswith("_"):
        try:
            importlib.import_module(f"app.models.{_module_info.name}")
        except Exception as _e:
            pass

__all__ = ["Role", "Permission", "User", "UserRole", "role_permissions", "user_roles"]
