from fastapi import FastAPI
from tests.tvp.router import router as tvp_router

app = FastAPI(title="Sales Warehouse System - TVP Test")
app.include_router(tvp_router, prefix="/tvp", tags=["tvp"])


@app.get("/")
def read_root():
    return {"message": "Backend is running", "tvp_docs": "/docs"}
