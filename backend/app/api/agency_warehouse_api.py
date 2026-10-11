from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/agency-warehouse", tags=["Agency Warehouse"])
db_agency_warehouse = {}

class AssignWarehouseReq(BaseModel):
    agency_id: str
    warehouse_id: str

@router.post("/assign")
def assign_default_warehouse(req: AssignWarehouseReq, db_warehouses: dict):
    if req.warehouse_id not in db_warehouses:
        raise HTTPException(status_code=404, detail="Kho không tồn tại!")
    
    wh = db_warehouses[req.warehouse_id]
    if wh.get("status") != "ACTIVE":
        raise HTTPException(status_code=400, detail="Không thể gán kho đã ngưng hoạt động!")
    
    db_agency_warehouse[req.agency_id] = req.warehouse_id
    return {
        "message": "Gán kho mặc định thành công",
        "agency_id": req.agency_id,
        "default_warehouse_id": req.warehouse_id
    }