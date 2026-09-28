from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base, SessionLocal
from app.api import api_router
from app.services.seed_service import seed_all
import app.models  # Nạp toàn bộ models vào metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi tạo tables và seed dữ liệu mặc định khi ứng dụng khởi động
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_all(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Sales & Warehouse Management System API",
    description="Hệ thống quản lý bán hàng và kho - API phân quyền RBAC và nghiệp vụ",
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

app.include_router(api_router)


@app.get("/")
def read_root():
    return {
        "message": "Sales-Warehouse Backend is running",
        "docs_url": "/docs",
        "api_prefix": "/api"
    }
