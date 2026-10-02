from fastapi import FastAPI
from app.api.warehouse_router import router as warehouse_router

app = FastAPI(
    title="Sales Warehouse System - TVP Test",
    description="API Quy đổi đơn vị tính kho & ghi sổ giao dịch (SCRUM-215)"
)

# Đăng ký Router
app.include_router(warehouse_router, prefix="/api/v1", tags=["Warehouse"])

@app.get("/")
def read_root():
    return {"status": "online", "docs": "/docs"}