"""Quản lý bối cảnh kiểm thử (Test Context), DB In-Memory và TestClient độc lập."""

import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Đảm bảo đường dẫn backend nằm trong sys.path
backend_root = Path(__file__).resolve().parent.parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau
from app.models.auth import Role, Permission, User, UserRole
from app.services.seed_service import seed_all
from main import app

# Khởi tạo engine SQLite In-Memory dùng chung cho phiên test
engine_in_memory = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SessionInMem = sessionmaker(autocommit=False, autoflush=False, bind=engine_in_memory)


def _ghi_de_phien_db():
    phien = SessionInMem()
    try:
        yield phien
    finally:
        phien.close()


app.dependency_overrides[lay_phien_db] = _ghi_de_phien_db
test_client = TestClient(app)


def khoi_tao_db_moi():
    """Tạo lại schema sạch và nạp dữ liệu người dùng mẫu cho từng gói test."""
    Base.metadata.drop_all(bind=engine_in_memory)
    Base.metadata.create_all(bind=engine_in_memory)

    phien: Session = SessionInMem()
    try:
        seed_all(phien)

        # Cập nhật vai trò Admin chuẩn xác (tránh lỗi role mặc định Customer)
        admin = phien.query(User).filter(User.username == "admin").first()
        if admin:
            admin.role = UserRole.ADMIN.value
            admin.hashed_password = bam_mat_khau("Admin@123456")
            admin.is_active = True

        # Tạo thêm các tài khoản kiểm thử cho 7 vai trò chuẩn
        tai_khoan_kiem_thu = [
            User(
                username="customer",
                email="customer@warehouse.local",
                full_name="Đại Lý Tuấn Phương",
                hashed_password=bam_mat_khau("Customer@1234"),
                role=UserRole.CUSTOMER.value,
                token_version=1,
                is_active=True,
            ),
            User(
                username="sales_mgr",
                email="sales_mgr@warehouse.local",
                full_name="Giám Đốc Kinh Doanh",
                hashed_password=bam_mat_khau("SalesMgr@1234"),
                role=UserRole.SALES_MANAGER.value,
                token_version=1,
                is_active=True,
            ),
            User(
                username="sales_rep",
                email="sales_rep@warehouse.local",
                full_name="Nhân Viên Kinh Doanh",
                hashed_password=bam_mat_khau("SalesRep@1234"),
                role=UserRole.SALES_REP.value,
                token_version=1,
                is_active=True,
            ),
            User(
                username="wh_mgr",
                email="wh_mgr@warehouse.local",
                full_name="Trưởng Kho Tổng",
                hashed_password=bam_mat_khau("WhMgr@1234"),
                role=UserRole.WH_MANAGER.value,
                assigned_warehouse="Kho Tổng Hà Nội",
                token_version=1,
                is_active=True,
            ),
            User(
                username="warehouse",
                email="warehouse@warehouse.local",
                full_name="Thủ Kho Hà Nội",
                hashed_password=bam_mat_khau("Warehouse@1234"),
                role=UserRole.WAREHOUSE.value,
                assigned_warehouse="Kho Hà Nội",
                token_version=1,
                is_active=True,
            ),
            User(
                username="accountant",
                email="accountant@warehouse.local",
                full_name="Kế Toán Công Nợ",
                hashed_password=bam_mat_khau("Accountant@1234"),
                role=UserRole.ACCOUNTANT.value,
                token_version=1,
                is_active=True,
            ),
        ]

        for u in tai_khoan_kiem_thu:
            ex = phien.query(User).filter(User.username == u.username).first()
            if not ex:
                phien.add(u)

        phien.commit()
    finally:
        phien.close()


def lay_client_va_db():
    """Trả về TestClient và phiên kết nối DB in-memory."""
    khoi_tao_db_moi()
    phien = SessionInMem()
    return test_client, phien


def khoi_tao_app_test():
    """Khởi tạo môi trường kiểm thử chuẩn theo quy định TEST_SKILL.md."""
    khoi_tao_db_moi()
    return app, test_client, engine_in_memory, SessionInMem
