from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.core.security import bam_mat_khau
from app.models.auth import Role, Permission, User, UserRole
from app.services.seed_service import seed_all
from app.api import api_router, api_v1_router


def khoi_tao_tai_khoan_ban_dau(phien_db: Session):
    """Khởi tạo tài khoản mẫu đầy đủ thông tin cho 7 vai trò hệ thống theo đúng SCRUM."""
    danh_sach_tai_khoan_mau = [
        ("admin", "admin@warehouse.local", "Admin@1234", UserRole.ADMIN.value, "Trần Quản Trị Hệ Thống", "0901234567", None),
        ("sales_mgr", "sales_mgr@warehouse.local", "SalesMgr@1234", UserRole.SALES_MANAGER.value, "Nguyễn Văn Giám Đốc Kinh Doanh", "0902345678", None),
        ("sales_rep", "sales_rep@warehouse.local", "SalesRep@1234", UserRole.SALES_REP.value, "Lê Thị Nhân Viên Kinh Doanh", "0903456789", None),
        ("wh_mgr", "wh_mgr@warehouse.local", "WhMgr@1234", UserRole.WH_MANAGER.value, "Phạm Văn Trưởng Kho", "0904567890", "Kho Tổng Hà Nội"),
        ("warehouse", "warehouse@warehouse.local", "Warehouse@1234", UserRole.WAREHOUSE.value, "Hoàng Văn Thủ Kho", "0905678901", "Kho Đà Nẵng"),
        ("accountant", "accountant@warehouse.local", "Accountant@1234", UserRole.ACCOUNTANT.value, "Đỗ Thị Kế Toán Trưởng", "0906789012", None),
        ("customer", "customer@warehouse.local", "Customer@1234", UserRole.CUSTOMER.value, "Công ty TNHH Đại Lý Tuấn Phương", "0907890123", None),
    ]
    for ten_dang_nhap, dia_chi_email, mat_khau_goc, vai_tro, ho_ten, sdt, kho in danh_sach_tai_khoan_mau:
        existing = phien_db.query(User).filter(
            (User.username == ten_dang_nhap) | (User.email == dia_chi_email)
        ).first()
        if not existing:
            tai_khoan_moi = User(
                username=ten_dang_nhap,
                email=dia_chi_email,
                full_name=ho_ten,
                phone_number=sdt,
                assigned_warehouse=kho,
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
        else:
            if not existing.full_name:
                existing.full_name = ho_ten
            if not existing.phone_number:
                existing.phone_number = sdt
            if not existing.assigned_warehouse and kho:
                existing.assigned_warehouse = kho
            if existing.role != vai_tro:
                existing.role = vai_tro
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

# ==============================================================================
# TÍCH HỢP HỆ THỐNG ROUTER TỰ ĐỘNG (ZERO-CONFLICT PLUG-AND-PLAY)
# Tất cả router (cũ và mới thêm) đều được nạp tự động qua api_router và api_v1_router.
# FILE main.py NÀY LÀ BẤT KHẢ XÂM PHẠM - CÁC AGENT TUYỆT ĐỐI KHÔNG SỬA ĐỔI FILE NÀY!
# ==============================================================================
app.include_router(api_router)
app.include_router(api_v1_router)


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
