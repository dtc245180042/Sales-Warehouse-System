from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter(prefix="/warehouses", tags=["Warehouses"])
db_warehouses = {}

class WarehouseCreate(BaseModel):
    code: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    address: str
    manager_name: str
    status: str = "ACTIVE"

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    manager_name: Optional[str] = None
    status: Optional[str] = None

@router.post("/")
def create_warehouse(data: WarehouseCreate):
    wh_id = f"WH_{len(db_warehouses) + 1}"
    wh_data = {"id": wh_id, **data.dict()}
    db_warehouses[wh_id] = wh_data
    return wh_data

@router.get("/")
def list_warehouses(search: Optional[str] = None, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1)):
    result = list(db_warehouses.values())
    if search:
        search_lower = search.lower()
        result = [w for w in result if search_lower in w["code"].lower() or search_lower in w["name"].lower()]
    
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "total": len(result),
        "page": page,
        "page_size": page_size,
        "items": result[start:end]
    }