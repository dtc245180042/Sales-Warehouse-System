from datetime import datetime
from typing import Dict, Optional

class ConversionService:
    @staticmethod
    def get_unit_config_at_time(sku_data: dict, timestamp: Optional[datetime] = None) -> dict:
        """
        SCRUM-393: Lấy đúng phiên bản cấu hình quy đổi tại thời điểm giao dịch
        để không ảnh hưởng đến giao dịch quá khứ.
        """
        if not timestamp:
            timestamp = datetime.utcnow()
            
        versions = sku_data.get("versions", [])
        # Sắp xếp các phiên bản giảm dần theo thời gian tạo
        sorted_versions = sorted(versions, key=lambda x: x["created_at"], reverse=True)
        
        for ver in sorted_versions:
            if ver["created_at"] <= timestamp:
                return ver
        
        return sorted_versions[-1] if sorted_versions else {}

    @classmethod
    def convert_to_base_quantity(cls, sku_data: dict, quantity: float, unit_name: str, transaction_time: Optional[datetime] = None) -> dict:
        """
        SCRUM-391 & SCRUM-392: Tính toán quy đổi số lượng nhập về đơn vị cơ sở
        """
        config = cls.get_unit_config_at_time(sku_data, transaction_time)
        units = config.get("units", {})
        
        if unit_name not in units:
            raise ValueError(f"Đơn vị tính '{unit_name}' không tồn tại trong cấu hình SKU.")
        
        factor = units[unit_name]
        base_quantity = quantity * factor
        
        return {
            "input_quantity": quantity,
            "input_unit": unit_name,
            "base_quantity": base_quantity,
            "base_unit": config["base_unit"],
            "conversion_factor": factor,
            "applied_version": config["version"]
        }