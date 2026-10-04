from fastapi import APIRouter, HTTPException, status
from datetime import datetime
from typing import Dict

from app.schemas.warehouse import SKUUnitUpdateRequest, ConvertQuantityRequest
from app.services.conversion_service import ConversionService

router = APIRouter(prefix="/api/v1/warehouse", tags=["Warehouse SKU Units"])

# Database giả lập lưu trữ cấu hình SKU kèm Versioning
sku_configs_db: Dict[str, dict] = {}

@router.post("/sku-units/{sku}")
def update_sku_unit_config(sku: str, data: SKUUnitUpdateRequest):
    """
    SCRUM-394 & SCRUM-393: Tạo mới hoặc cập nhật đơn vị tính cho SKU.
    Mỗi lần sửa hệ số sẽ TẠO VERSION MỚI thay vì ghi đè lên version cũ.
    """
    if sku not in sku_configs_db:
        sku_configs_db[sku] = {
            "sku": sku,
            "current_version": 0,
            "versions": []
        }
    
    # Tăng version lên để lưu lịch sử
    new_version = sku_configs_db[sku]["current_version"] + 1
    sku_configs_db[sku]["current_version"] = new_version
    
    # Đảm bảo đơn vị cơ sở luôn có hệ số quy đổi là 1
    new_units = data.units.copy()
    new_units[data.base_unit] = 1.0

    version_entry = {
        "version": new_version,
        "base_unit": data.base_unit,
        "units": new_units,
        "created_at": datetime.utcnow()
    }
    
    sku_configs_db[sku]["versions"].append(version_entry)
    
    return {
        "success": True,
        "message": f"Cập nhật đơn vị tính cho SKU {sku} thành công (Phiên bản {new_version})!",
        "data": version_entry
    }

@router.get("/sku-units/{sku}")
def get_sku_unit_config(sku: str):
    """
    SCRUM-395: Tra cứu cấu hình đơn vị tính hiện tại của SKU
    """
    if sku not in sku_configs_db or not sku_configs_db[sku]["versions"]:
        raise HTTPException(status_code=404, detail="Không tìm thấy cấu hình SKU")
    
    latest_version = sku_configs_db[sku]["versions"][-1]
    return {
        "success": True,
        "sku": sku,
        "current_version": sku_configs_db[sku]["current_version"],
        "config": latest_version
    }

@router.post("/convert-quantity")
def convert_quantity(request: ConvertQuantityRequest):
    """
    SCRUM-391 & SCRUM-392: API tính toán và quy đổi số lượng cho chứng từ/báo cáo
    """
    if request.sku not in sku_configs_db:
        raise HTTPException(status_code=404, detail="SKU chưa được khai báo đơn vị tính")
        
    try:
        result = ConversionService.convert_to_base_quantity(
            sku_data=sku_configs_db[request.sku],
            quantity=request.quantity,
            unit_name=request.unit_name,
            transaction_time=request.transaction_time
        )
        return {
            "success": True,
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))