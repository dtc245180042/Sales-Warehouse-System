from fastapi import FastAPI
from app.api.warehouse_router import router as warehouse_router
from app.api.import_router import router as import_router

app = FastAPI(title="Sales & Warehouse System")

# Giữ nguyên router quy đổi kho cũ (SCRUM-215)
app.include_router(warehouse_router)

# Thêm router import Excel mới (SCRUM-216)
app.include_router(import_router)
