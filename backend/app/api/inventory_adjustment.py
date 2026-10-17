# backend/app/api/inventory_adjustment.py
from fastapi import APIRouter, HTTPException, Query, Header
from typing import List, Optional
from app.schemas.inventory_adjustment import AdjustmentCreate, AdjustmentApprove

router = APIRouter(prefix="/inventory-adjustments", tags=["Inventory Adjustments"])

db_adjustments = {}

@router.post("")
def create_adjustment(
    payload: AdjustmentCreate,
    user_id: str = Header(default="EMP001"),
    user_role: str = Header(default="WAREHOUSE_STAFF")
):
    # SCRUM-791: Validate lý do và giá trị tổn thất
    reason_val = getattr(payload, "reason", None) or getattr(payload, "Reason", "")
    if not reason_val or len(str(reason_val).strip()) < 5:
        raise HTTPException(status_code=400, detail="Bắt buộc phải nhập lý do điều chỉnh hợp lệ")
        
    loss_val = getattr(payload, "loss_value", 0)
    if loss_val <= 0:
        raise HTTPException(status_code=400, detail="Giá trị tổn thất phải lớn hơn 0")

    adj_id = len(db_adjustments) + 1
    code = f"DC{adj_id:04d}"

    adjustment = {
        "id": adj_id,
        "code": code,
        "warehouse_id": payload.warehouse_id,
        "product_id": getattr(payload, "product_id", "SKU001"),
        "adjustment_type": payload.adjustment_type,
        "quantity_adjusted": payload.quantity_adjusted,
        "loss_value": loss_val,
        "reason": reason_val,
        "created_by": user_id,
        "approved_by": None,
        "status": "PENDING",
        "created_at": "2026-10-17T13:48:10.875Z"
    }

    db_adjustments[adj_id] = adjustment
    return adjustment


@router.put("/{adj_id}/approve")
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

    return adj


@router.get("")
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