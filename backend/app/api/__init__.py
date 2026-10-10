import importlib
import pkgutil
from pathlib import Path
from fastapi import APIRouter, Depends
from app.core.config import settings
from app.core.dependencies import chan_tai_khoan_customer_noi_bo

# Router cho /api (đáp ứng tương thích ngược với các API như /api/permissions, /api/roles)
api_router = APIRouter(prefix="/api")

# Router chuẩn RESTful cho /api/v1
api_v1_router = APIRouter(prefix=settings.API_V1_STR)

# 1. Khởi tạo các router cốt lõi ban đầu
from app.api.permissions import router as permissions_router
from app.api.roles import router as roles_router
from app.api.auth import router as auth_router
from app.api.users import router as users_router

# Auth router không chặn Customer (để cho phép đăng nhập, xem thông tin tài khoản, đổi pass, logout)
api_router.include_router(auth_router)
api_v1_router.include_router(auth_router)

# Các router nội bộ quản trị: Bắt buộc áp dụng guard Default-Deny với Customer
api_router.include_router(permissions_router, dependencies=[Depends(chan_tai_khoan_customer_noi_bo)])
api_router.include_router(roles_router, dependencies=[Depends(chan_tai_khoan_customer_noi_bo)])
api_router.include_router(users_router, dependencies=[Depends(chan_tai_khoan_customer_noi_bo)])

api_v1_router.include_router(users_router, dependencies=[Depends(chan_tai_khoan_customer_noi_bo)])
api_v1_router.include_router(permissions_router, dependencies=[Depends(chan_tai_khoan_customer_noi_bo)])
api_v1_router.include_router(roles_router, dependencies=[Depends(chan_tai_khoan_customer_noi_bo)])

# 2. CƠ CHẾ AUTO-DISCOVERY CHỐNG XUNG ĐỘT (ZERO-CONFLICT PLUG-AND-PLAY):
# Tự động nạp mọi router mới được thêm vào app/api/ hoặc app/api/endpoints/
# Tự động áp dụng Default-Deny (chặn Role Customer) cho mọi router quản trị backoffice.
# Chỉ duy nhất các router 'portal' và 'auth' là được mở cho đại lý.

EXCLUDED_MODULES = {"__init__", "permissions", "roles", "auth", "users"}
current_dir = Path(__file__).parent

# Quét các module ngay trong app/api/
for module_info in pkgutil.iter_modules([str(current_dir)]):
    name = module_info.name
    if not name.startswith("_") and name not in EXCLUDED_MODULES:
        try:
            mod = importlib.import_module(f"app.api.{name}")
            if hasattr(mod, "router") and isinstance(getattr(mod, "router"), APIRouter):
                deps = [] if name in ["portal", "auth"] else [Depends(chan_tai_khoan_customer_noi_bo)]
                api_v1_router.include_router(getattr(mod, "router"), dependencies=deps)
                api_router.include_router(getattr(mod, "router"), dependencies=deps)
        except Exception as e:
            print(f"[AutoRouter] Error loading module app.api.{name}: {e}")

# Quét các module trong app/api/endpoints/
endpoints_dir = current_dir / "endpoints"
if endpoints_dir.is_dir():
    for module_info in pkgutil.iter_modules([str(endpoints_dir)]):
        name = module_info.name
        if not name.startswith("_"):
            try:
                mod = importlib.import_module(f"app.api.endpoints.{name}")
                if hasattr(mod, "router") and isinstance(getattr(mod, "router"), APIRouter):
                    deps = [] if name in ["portal", "auth"] else [Depends(chan_tai_khoan_customer_noi_bo)]
                    api_v1_router.include_router(getattr(mod, "router"), dependencies=deps)
                    api_router.include_router(getattr(mod, "router"), dependencies=deps)
            except Exception as e:
                print(f"[AutoRouter] Error loading module app.api.endpoints.{name}: {e}")
