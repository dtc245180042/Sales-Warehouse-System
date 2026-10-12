from fastapi import HTTPException

db_active_transactions = {}

def validate_unique_warehouse_code(code: str, db_warehouses: dict):
    for wh in db_warehouses.values():
        if wh["code"].lower() == code.lower():
            raise HTTPException(status_code=400, detail=f"Mã kho '{code}' đã tồn tại!")

def validate_deactivate_warehouse(wh_id: str, db_warehouses: dict):
    if wh_id not in db_warehouses:
        raise HTTPException(status_code=404, detail="Kho không tồn tại!")
    
    active_tx = db_active_transactions.get(wh_id, 0)
    if active_tx > 0:
        raise HTTPException(status_code=400, detail="Không cho phép ngưng hoạt động khi còn giao dịch liên quan!")