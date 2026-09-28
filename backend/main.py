from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.core.security import bam_mat_khau
from app.models.auth import Role, Permission, User, UserRole
from app.services.seed_service import seed_all
from app.api import api_router
from app.api.auth import router as router_xac_thuc


def khoi_tao_tai_khoan_ban_dau(phien_db: Session):
    """Khởi tạo tài khoản mẫu cho 7 vai trò hệ thống nếu chưa có."""
    danh_sach_tai_khoan_mau = [
        ("admin", "admin@warehouse.local", "Admin@1234", UserRole.ADMIN.value),
        ("sales_mgr", "sales_mgr@warehouse.local", "SalesMgr@1234", UserRole.SALES_MANAGER.value),
        ("sales_rep", "sales_rep@warehouse.local", "SalesRep@1234", UserRole.SALES_REP.value),
        ("wh_mgr", "wh_mgr@warehouse.local", "WhMgr@1234", UserRole.WH_MANAGER.value),
        ("warehouse", "warehouse@warehouse.local", "Warehouse@1234", UserRole.WAREHOUSE.value),
        ("accountant", "accountant@warehouse.local", "Accountant@1234", UserRole.ACCOUNTANT.value),
        ("customer", "customer@warehouse.local", "Customer@1234", UserRole.CUSTOMER.value),
    ]
    for ten_dang_nhap, dia_chi_email, mat_khau_goc, vai_tro in danh_sach_tai_khoan_mau:
        existing = phien_db.query(User).filter(
            (User.username == ten_dang_nhap) | (User.email == dia_chi_email)
        ).first()
        if not existing:
            tai_khoan_moi = User(
                username=ten_dang_nhap,
                email=dia_chi_email,
                hashed_password=bam_mat_khau(mat_khau_goc),
                role=vai_tro,
                is_active=True,
                token_version=1
            )
            # Gán role tương ứng nếu có
            role_obj = phien_db.query(Role).filter(
                (Role.name == vai_tro.upper().replace(" ", "_")) | (Role.name == vai_tro.upper())
            ).first()
            if role_obj:
                tai_khoan_moi.roles.append(role_obj)
            phien_db.add(tai_khoan_moi)
    phien_db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Khởi chạy ứng dụng: tạo bảng và seed dữ liệu ban đầu."""
    Base.metadata.create_all(bind=engine)
    phien_db = SessionLocal()
    try:
        seed_all(phien_db)
        khoi_tao_tai_khoan_ban_dau(phien_db)
    finally:
        phien_db.close()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Hệ thống Bán hàng & Quản lý Kho (Sales & Warehouse System) - Backend API",
    version="1.0.0",
    lifespan=lifespan
)

# Cấu hình CORS để frontend giao tiếp thuận lợi
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tích hợp router chính (/api bao gồm permissions, roles, auth)
app.include_router(api_router)

# Tích hợp thêm router xác thực trực tiếp tại /api/v1
app.include_router(router_xac_thuc, prefix=settings.API_V1_STR)


@app.get("/", tags=["Health"])
def health_check():
    """Endpoint kiểm tra trạng thái hoạt động của backend service."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": "1.0.0",
        "message": "Sales-Warehouse Backend is running",
        "docs_url": "/docs",
        "api_prefix": "/api"
    }


# Bí danh tương thích ngược (aliases)
read_root = health_check
kiem_tra_suc_khoe_he_thong = health_check
quan_ly_vong_doi_ung_dung = lifespan
seed_initial_users = khoi_tao_tai_khoan_ban_dau

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
