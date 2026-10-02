from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

router = APIRouter()

# --- SCHEMAS (Định dạng dữ liệu vào/ra) ---
class TransactionCreateSchema(BaseModel):
    product_id: str = Field(..., example="PROD_01")
    transaction_type: str = Field(..., example="IMPORT") # IMPORT, EXPORT, ADJUSTMENT
    input_quantity: float = Field(..., gt=0, example=5.0)
    input_unit: str = Field(..., example="Thung")

class UpdateRateSchema(BaseModel):
    product_id: str = Field(..., example="PROD_01")
    input_unit: str = Field(..., example="Thung")
    new_rate: float = Field(..., gt=0, example=24.0)

# --- MOCK DATABASE (Lưu tạm dữ liệu để không bao giờ bị lỗi 500 DB) ---
db_conversions = [
    {
        "product_id": "PROD_01",
        "input_unit": "Thung",
        "base_unit": "Chai",
        "conversion_rate": 24.0,
        "version": 1,
        "effective_from": str(datetime.now()),
        "effective_to": None,
        "is_active": True
    }
]

db_transactions = []

# --- API ENDPOINTS ---

# 1. SCRUM-391: API Quy đổi và ghi sổ giao dịch
@router.post("/transactions")
def create_transaction(item: TransactionCreateSchema):
    try:
        # Tìm hệ số quy đổi đang áp dụng
        conv = next(
            (c for c in db_conversions 
             if c["product_id"] == item.product_id 
             and c["input_unit"].lower() == item.input_unit.lower() 
             and c["is_active"]), 
            None
        )

        rate = conv["conversion_rate"] if conv else 1.0
        base_unit = conv["base_unit"] if conv else item.input_unit
        version = conv["version"] if conv else 1

        # Quy đổi về đơn vị cơ sở (SCRUM-391)
        base_qty = item.input_quantity * rate

        record = {
            "id": len(db_transactions) + 1,
            "product_id": item.product_id,
            "transaction_type": item.transaction_type,
            "input_quantity": item.input_quantity,
            "input_unit": item.input_unit,
            "base_quantity": base_qty,
            "base_unit": base_unit,
            "conversion_rate_used": rate,
            "conversion_version_used": version,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        db_transactions.append(record)
        return {"success": True, "message": "Ghi sổ giao dịch thành công!", "data": record}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý server: {str(e)}")

# 2. SCRUM-392: API Hiển thị báo cáo / chứng từ (Hiển thị song song 2 đơn vị)
@router.get("/transactions")
def get_transactions():
    results = []
    for t in db_transactions:
        results.append({
            "id": t["id"],
            "product_id": t["product_id"],
            "transaction_type": t["transaction_type"],
            "display_original": f"{t['input_quantity']} {t['input_unit']}",
            "display_base": f"{t['base_quantity']} {t['base_unit']}",
            "original_quantity": t["input_quantity"],
            "original_unit": t["input_unit"],
            "base_quantity": t["base_quantity"],
            "base_unit": t["base_unit"],
            "conversion_rate_used": t["conversion_rate_used"],
            "version_used": t["conversion_version_used"],
            "created_at": t["created_at"]
        })
    return {"success": True, "total": len(results), "data": results}

# 3. SCRUM-393: API Cập nhật hệ số quy đổi (Tạo phiên bản mới không làm hỏng lịch sử)
@router.post("/unit-conversions/update")
def update_conversion_rate(data: UpdateRateSchema):
    try:
        now_str = str(datetime.now())
        old_version = 0
        base_unit = "Chai"

        # Khóa phiên bản cũ
        for c in db_conversions:
            if c["product_id"] == data.product_id and c["input_unit"].lower() == data.input_unit.lower() and c["is_active"]:
                c["is_active"] = False
                c["effective_to"] = now_str
                old_version = c["version"]
                base_unit = c["base_unit"]

        # Tạo phiên bản mới (version + 1)
        new_conv = {
            "product_id": data.product_id,
            "input_unit": data.input_unit,
            "base_unit": base_unit,
            "conversion_rate": data.new_rate,
            "version": old_version + 1,
            "effective_from": now_str,
            "effective_to": None,
            "is_active": True
        }
        db_conversions.append(new_conv)
        return {"success": True, "message": "Đã cập nhật hệ số quy đổi (Phiên bản mới)", "data": new_conv}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")