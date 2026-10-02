from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.warehouse import SKUUnitCreateRequest, SKUUnitUpdateRequest

router = APIRouter()

# Mock Database lưu trữ danh sách đơn vị tính theo SKU
sku_configs_db = {}

# 1. API Khai báo mới (POST)
@router.post("/sku-units")
def create_sku_unit_config(data: SKUUnitCreateRequest):
    """Khai báo danh sách đơn vị tính và hệ số quy đổi cho SKU"""
    sku = data.sku
    
    units = [{"unit_name": data.base_unit, "conversion_rate": 1.0, "is_base": True}]
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

# 2. API Tra cứu cấu hình theo SKU (GET)
@router.get("/sku-units/{sku}")
def get_sku_unit_config(sku: str):
    """Tra cứu danh sách đơn vị tính quy đổi của SKU"""
    if sku not in sku_configs_db:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy cấu hình đơn vị tính cho SKU {sku}")
    return {
        "success": True,
        "data": sku_configs_db[sku]
    }

# 3. API Tra cứu tất cả các SKU đã cấu hình (GET) - Phục vụ màn hình quản trị
@router.get("/sku-units")
def list_all_sku_unit_configs():
    """Lấy toàn bộ danh sách cấu hình đơn vị tính phục vụ màn trị"""
    return {
        "success": True,
        "data": list(sku_configs_db.values())
    }

# 4. API Cập nhật/Sửa đơn vị tính của SKU (PUT)
@router.put("/sku-units/{sku}")
def update_sku_unit_config(sku: str, data: SKUUnitUpdateRequest):
    """Cập nhật/sửa danh sách đơn vị tính và hệ số quy đổi của SKU"""
    if sku not in sku_configs_db:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy SKU {sku} để cập nhật")
    
    current_base = data.base_unit if data.base_unit else sku_configs_db[sku]["base_unit"]
    
    new_units = [{"unit_name": current_base, "conversion_rate": 1.0, "is_base": True}]
    for item in data.conversions:
        if item.unit_name != current_base:
            new_units.append({
                "unit_name": item.unit_name,
                "conversion_rate": item.conversion_rate,
                "is_base": False
            })
            
    sku_configs_db[sku] = {
        "sku": sku,
        "base_unit": current_base,
        "units": new_units
    }
    
    return {
        "success": True,
        "message": f"Cập nhật đơn vị tính cho SKU {sku} thành công!",
        "data": sku_configs_db[sku]
    }