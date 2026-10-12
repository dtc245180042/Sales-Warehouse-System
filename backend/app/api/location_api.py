from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/locations", tags=["Locations"])

# In-memory storage tạm thời
db_locations = {}

class LocationCreate(BaseModel):
    warehouse_id: str
    location_code: str
    location_name: str
    zone_or_shelf: str
    status: str = "ACTIVE"

@router.post("/", response_model=dict)
def create_location(data: LocationCreate):
    loc_id = f"LOC_{len(db_locations) + 1}"
    loc_data = {"id": loc_id, **data.dict()}
    db_locations[loc_id] = loc_data
    return loc_data

@router.get("/warehouse/{warehouse_id}", response_model=List[dict])
def get_locations_by_warehouse(warehouse_id: str):
    return [loc for loc in db_locations.values() if loc["warehouse_id"] == warehouse_id]