from fastapi import FastAPI
from tests.tvp.router import router as tvp_router

# Phải có dòng khai báo biến 'app' này
app = FastAPI(title="Sales Warehouse System - TVP Test")

# Nhúng router của thư mục tests/tvp vào app chính
app.include_router(tvp_router, prefix="/tvp", tags=["tvp"])

@app.get("/")
def read_root():
    return {"message": "Backend is running", "tvp_docs": "/docs"}