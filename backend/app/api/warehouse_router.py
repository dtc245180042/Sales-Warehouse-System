from fastapi import APIRouter, HTTPException
from app.schemas.warehouse import SKUUnitCreateRequest, SKUUnitResponse

# Bổ sung dòng khai báo router này:
router = APIRouter()

# Mock DB lưu cấu hình đơn vị tính SKU
sku_configs_db = {}

@router.post("/sku-units")
def create_sku_unit_config(data: SKUUnitCreateRequest):
    sku = data.sku
    units = [
        {"unit_name": data.base_unit, "conversion_rate": 1.0, "is_base": True}
    ]
    
    for item in data.conversions:
        if item.unit_name != data.base_unit:
            units.append({
                "unit_name": item.unit_name,
                "conversion_rate": item.conversion_rate,
                "is_base": False
            })
            
    sku_configs_db[sku] = {
        "sku": sku,
        "base_unit": data.base_unit,
        "units": units
    }
    
    return {
        "success": True,
        "message": f"Khai báo cấu hình đơn vị tính cho SKU {sku} thành công!",
        "data": sku_configs_db[sku]
    }


@router.get("/sku-units/{sku}")
def get_sku_unit_config(sku: str):
    if sku not in sku_configs_db:
        raise HTTPException(status_code=404, detail="SKU chưa được cấu hình đơn vị tính")
    return sku_configs_db[sku]