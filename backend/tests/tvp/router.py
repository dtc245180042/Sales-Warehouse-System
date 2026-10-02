from fastapi import APIRouter, HTTPException, Header, Body
from pydantic import BaseModel, Field
from typing import List, Optional
import bcrypt
import re

# Khởi tạo APIRouter thay vì FastAPI
router = APIRouter()

# --------------------------------------------------------------------------
# MODELS (Pydantic Schema)
# --------------------------------------------------------------------------
class ChangePasswordRequest(BaseModel):
    user_id: str = Field(..., example="usr_101")
    current_password: str = Field(..., example="OldPassword123")
    new_password: str = Field(..., example="NewPassword2026")
    current_session_id: str = Field(..., example="sess_current")

class AssignRoleRequest(BaseModel):
    user_id: str = Field(..., example="usr_200")
    roles: List[str] = Field(..., example=["WAREHOUSE", "SALES"])
    assigned_warehouses: Optional[List[str]] = Field(default=[], example=["KHO_HN_01"])

# --------------------------------------------------------------------------
# MOCK DATABASE
# --------------------------------------------------------------------------
MOCK_USER_DB = {
    "usr_101": {
        "user_id": "usr_101",
        "password_hash": bcrypt.hashpw(b"OldPassword123", bcrypt.gensalt()).decode('utf-8')
    }
}

MOCK_SESSIONS = [
    {"session_id": "sess_current", "user_id": "usr_101", "is_active": True},
    {"session_id": "sess_phone", "user_id": "usr_101", "is_active": True}
]

# --------------------------------------------------------------------------
# ENDPOINTS (Đổi tất cả @app. thành @router.)
# --------------------------------------------------------------------------

@router.get("/", tags=["Root"])
def root():
    return {"message": "API System is running. Access /docs for Swagger UI testing."}

@router.post("/api/auth/change-password", tags=["Auth & Security - SCRUM-201"])
def api_change_password(payload: ChangePasswordRequest):
    user = MOCK_USER_DB.get(payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")

    if not bcrypt.checkpw(payload.current_password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác.")

    if len(payload.new_password) < 8 or not re.search(r'[a-zA-Z]', payload.new_password) or not re.search(r'[0-9]', payload.new_password):
        raise HTTPException(status_code=400, detail="Mật khẩu mới tối thiểu 8 ký tự, phải bao gồm cả chữ và số.")

    user["password_hash"] = bcrypt.hashpw(payload.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    revoked_count = 0
    for s in MOCK_SESSIONS:
        if s["user_id"] == payload.user_id and s["session_id"] != payload.current_session_id:
            s["is_active"] = False
            revoked_count += 1

    return {
        "success": True,
        "message": "Đổi mật khẩu thành công. Đã đăng xuất khỏi các thiết bị khác.",
        "revoked_sessions": revoked_count
    }

@router.post("/api/rbac/assign-role-warehouse", tags=["RBAC & Assignment - SCRUM-334/SCRUM-206"])
def api_assign_role_warehouse(payload: AssignRoleRequest):
    if "WAREHOUSE" in payload.roles and not payload.assigned_warehouses:
        raise HTTPException(status_code=400, detail="Tài khoản có vai trò WAREHOUSE bắt buộc phải gắn ít nhất 1 kho/địa bàn.")

    return {
        "success": True,
        "message": "Gán vai trò và địa bàn thành công.",
        "data": payload
    }

@router.get("/api/warehouses/lookup", tags=["Lookup - SCRUM-330"])
def api_lookup_warehouses(keyword: Optional[str] = "", region: Optional[str] = ""):
    warehouses = [
        {"id": "KHO_HN_01", "name": "Kho Trung Tâm Hà Nội", "region": "MIEN_BAC"},
        {"id": "KHO_DN_01", "name": "Kho Hải Châu Đà Nẵng", "region": "MIEN_TRUNG"},
        {"id": "KHO_HCM_01", "name": "Kho Tân Bình HCM", "region": "MIEN_NAM"}
    ]
    if keyword:
        warehouses = [w for w in warehouses if keyword.lower() in w["name"].lower() or keyword.lower() in w["id"].lower()]
    if region:
        warehouses = [w for w in warehouses if w["region"] == region]

    return {"total": len(warehouses), "data": warehouses}