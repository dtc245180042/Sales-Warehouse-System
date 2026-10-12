from typing import List, Dict

def check_low_stock(current_stock_list: List[dict], db_thresholds: Dict[str, dict]) -> List[dict]:
    """
    So sánh tồn thực tế/khả dụng với ngưỡng tối thiểu đã khai báo.
    Trả về danh sách các SKU rơi vào trạng thái cảnh báo tồn thấp.
    """
    warnings = []
    for item in current_stock_list:
        sku = item.get("sku")
        wh_id = item.get("warehouse_id")
        current_qty = item.get("quantity", 0)
        
        key = f"{sku}_{wh_id}"
        threshold_info = db_thresholds.get(key)
        
        if threshold_info:
            min_threshold = threshold_info.get("min_threshold", 0)
            if current_qty < min_threshold:
                warnings.append({
                    "sku": sku,
                    "warehouse_id": wh_id,
                    "current_quantity": current_qty,
                    "min_threshold": min_threshold,
                    "shortage": min_threshold - current_qty,
                    "status": "WARNING_LOW_STOCK"
                })
    return warnings