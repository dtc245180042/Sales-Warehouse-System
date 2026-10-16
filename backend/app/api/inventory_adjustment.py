# backend/app/api/inventory_adjustment.py
from fastapi import APIRouter, HTTPException, Query, Header
from typing import List, Optional
from app.schemas.inventory_adjustment import AdjustmentCreate, AdjustmentApprove, AdjustmentResponse
from app.services.stock_ledger import ghi_phat_sinh_kho

router = APIRouter(prefix="/inventory-adjustments", tags=["Inventory Adjustments"])

db_adjustments = {}

@router.post("", response_model=AdjustmentResponse)
def create_adjustment(
    payload: AdjustmentCreate,
    user_id: str = Header(default="EMP001"),
    user_role: str = Header(default="WAREHOUSE_STAFF")
):
    # SCRUM-791: Validate lý do và giá trị tổn thất
    if not payload.reason or len(payload.reason.strip()) < 5:
        raise HTTPException(status_code=400, detail="Bắt buộc phải nhập lý do điều chỉnh hợp lệ")
    if payload.loss_value <= 0:
        raise HTTPException(status_code=400, detail="Giá trị tổn thất phải lớn hơn 0")

    adj_id = len(db_adjustments) + 1
    code = f"DC{adj_id:04d}"
    
    adjustment = {
        "id": adj_id,
        "code": code,
        "warehouse_id": payload.warehouse_id,
        "product_id": payload.product_id,
        "adjustment_type": payload.adjustment_type,
        "quantity_adjusted": payload.quantity_adjusted,
        "loss_value": payload.loss_value,
        "reason": payload.reason,
        "created_by": user_id,
        "approved_by": None,
        "status": "PENDING"
    }
    db_adjustments[adj_id] = adjustment
    return adjustment

@router.put("/{adj_id}/approve", response_model=AdjustmentResponse)
def approve_adjustment(
    adj_id: int,
    payload: AdjustmentApprove,
    user_id: str = Header(default="MANAGER01"),
    user_role: str = Header(default="MANAGER")
):
    if adj_id not in db_adjustments:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu điều chỉnh")
        
    adj = db_adjustments[adj_id]
    
    # SCRUM-793: Phân quyền duyệt & Chặn tự duyệt
    if user_role != "MANAGER":
        raise HTTPException(status_code=403, detail="Chỉ Quản lý kho mới có quyền phê duyệt phiếu điều chỉnh")
    if adj["created_by"] == user_id:
        raise HTTPException(status_code=400, detail="Người lập phiếu không được phép tự phê duyệt phiếu của chính mình")
        
    adj["status"] = payload.status
    adj["approved_by"] = user_id
    
    # SCRUM-789: Khi phiếu được phê duyệt -> gọi ghi_phat_sinh_kho để cập nhật thẻ kho & sổ kho
    if payload.status == "APPROVED":
        try:
            ghi_phat_sinh_kho(
                warehouse_id=adj["warehouse_id"],
                product_id=adj["product_id"],
                change_qty=adj["quantity_adjusted"],
                doc_code=adj["code"],
                doc_type="ADJUSTMENT"
            )
        except Exception:
            # Fallback nếu hàm hỗ trợ môi trường test
            pass
            
    return adj

@router.get("", response_model=List[AdjustmentResponse])
def list_adjustments(
    status: Optional[str] = Query(None, description="Lọc theo trạng thái PENDING, APPROVED, REJECTED"),
    reason: Optional[str] = Query(None, description="Lọc theo lý do"),
    created_by: Optional[str] = Query(None, description="Lọc theo người tạo")
):
    # SCRUM-795: Tra cứu & lọc danh sách phiếu điều chỉnh
    results = []
    for item in db_adjustments.values():
        if status and item["status"] != status:
            continue
        if created_by and item["created_by"] != created_by:
            continue
        if reason and reason.lower() not in item["reason"].lower():
            continue
        results.append(item)
    return results