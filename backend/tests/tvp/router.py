"""FastAPI router bọc các API/chức năng trong tests/tvp để test độc lập."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any, List, Optional, Union

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()

ROLES = {
    "ADMIN": "ADMIN",
    "MANAGER": "MANAGER",
    "WAREHOUSE_STAFF": "WAREHOUSE",
    "SALES_STAFF": "SALES",
    "ACCOUNTANT": "ACCOUNTANT",
    "CUSTOMER": "CUSTOMER",
    "GUEST": "GUEST",
}

PERMISSIONS = {
    "USER_CREATE": "user:create",
    "USER_READ": "user:read",
    "USER_UPDATE": "user:update",
    "USER_DELETE": "user:delete",
    "INVENTORY_READ": "inventory:read",
    "INVENTORY_IMPORT": "inventory:import",
    "INVENTORY_EXPORT": "inventory:export",
    "ORDER_CREATE": "order:create",
    "ORDER_READ": "order:read",
    "ORDER_UPDATE": "order:update",
    "ORDER_CANCEL": "order:cancel",
    "REPORT_VIEW": "report:view",
}

ROLE_PERMISSIONS_MATRIX = {
    ROLES["ADMIN"]: list(PERMISSIONS.values()),
    ROLES["MANAGER"]: [
        PERMISSIONS["USER_READ"],
        PERMISSIONS["INVENTORY_READ"],
        PERMISSIONS["INVENTORY_IMPORT"],
        PERMISSIONS["INVENTORY_EXPORT"],
        PERMISSIONS["ORDER_CREATE"],
        PERMISSIONS["ORDER_READ"],
        PERMISSIONS["ORDER_UPDATE"],
        PERMISSIONS["REPORT_VIEW"],
    ],
    ROLES["WAREHOUSE_STAFF"]: [
        PERMISSIONS["INVENTORY_READ"],
        PERMISSIONS["INVENTORY_IMPORT"],
        PERMISSIONS["INVENTORY_EXPORT"],
        PERMISSIONS["ORDER_READ"],
    ],
    ROLES["SALES_STAFF"]: [
        PERMISSIONS["INVENTORY_READ"],
        PERMISSIONS["ORDER_CREATE"],
        PERMISSIONS["ORDER_READ"],
        PERMISSIONS["ORDER_UPDATE"],
    ],
    ROLES["ACCOUNTANT"]: [PERMISSIONS["ORDER_READ"], PERMISSIONS["REPORT_VIEW"]],
    ROLES["CUSTOMER"]: [
        PERMISSIONS["ORDER_CREATE"],
        PERMISSIONS["ORDER_READ"],
        PERMISSIONS["ORDER_CANCEL"],
    ],
    ROLES["GUEST"]: [PERMISSIONS["INVENTORY_READ"]],
}

MOCK_USERS: List[dict] = [
    {
        "userId": "USR_001",
        "fullName": "Nguyen Van A",
        "email": "nguyenvana@example.com",
        "roles": ["SALES"],
        "assignedWarehouses": [],
        "createdAt": datetime(2026, 1, 1),
    },
    {
        "userId": "USR_002",
        "fullName": "Tran Van B",
        "email": "tranvanb@example.com",
        "roles": ["WAREHOUSE"],
        "assignedWarehouses": ["KHO_HN_01"],
        "createdAt": datetime(2026, 1, 2),
    },
]

MOCK_WAREHOUSES = [
    {"id": "KHO_HN_01", "name": "Kho Trung Tâm Hà Nội", "region": "MIEN_BAC", "status": "ACTIVE"},
    {"id": "KHO_HN_02", "name": "Kho Từ Liêm - Hà Nội", "region": "MIEN_BAC", "status": "ACTIVE"},
    {"id": "KHO_DN_01", "name": "Kho Hải Châu - Đà Nẵng", "region": "MIEN_TRUNG", "status": "ACTIVE"},
    {"id": "KHO_HCM_01", "name": "Kho Tân Bình - TP.HCM", "region": "MIEN_NAM", "status": "ACTIVE"},
    {"id": "KHO_HCM_02", "name": "Kho Bình Thạnh - TP.HCM", "region": "MIEN_NAM", "status": "INACTIVE"},
]

VALID_WAREHOUSES = [warehouse["id"] for warehouse in MOCK_WAREHOUSES]
VALID_ROLES = set(ROLES.values())


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def _create_reset_token(user_id: str) -> tuple[str, dict]:
    if not user_id:
        raise ValueError("user_id không được để trống.")
    raw_token = secrets.token_urlsafe(32)
    token_record = {
        "userId": user_id,
        "tokenHash": hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        "expiresAt": datetime.utcnow() + timedelta(minutes=30),
        "isUsed": False,
    }
    MOCK_RESET_TOKENS.append(token_record)
    return raw_token, token_record


def _verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, salt_hex, digest_hex = encoded_hash.split("$", 2)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except (AttributeError, ValueError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return hmac.compare_digest(actual, expected)


MOCK_AUTH_USERS = [
    {
        "id": "usr_101",
        "email": "user@example.com",
        "passwordHash": _hash_password("OldPass123"),
    },
]

MOCK_RESET_TOKENS: List[dict] = []

MOCK_SESSIONS = [
    {
        "sessionId": "sess_current_123",
        "userId": "usr_101",
        "device": "Chrome - Windows",
        "status": "ACTIVE",
        "createdAt": datetime(2026, 9, 28, 8, 0, 0),
    },
    {
        "sessionId": "sess_other_456",
        "userId": "usr_101",
        "device": "Safari - iPhone",
        "status": "ACTIVE",
        "createdAt": datetime(2026, 9, 27, 10, 0, 0),
    },
    {
        "sessionId": "sess_other_789",
        "userId": "usr_101",
        "device": "Firefox - MacOS",
        "status": "ACTIVE",
        "createdAt": datetime(2026, 9, 26, 14, 0, 0),
    },
    {
        "sessionId": "sess_someone_else",
        "userId": "usr_102",
        "device": "Chrome - Android",
        "status": "ACTIVE",
        "createdAt": datetime(2026, 9, 28, 9, 0, 0),
    },
]


def _serialize_user(user: dict) -> dict:
    data = deepcopy(user)
    for key in ("createdAt", "updatedAt"):
        value = data.get(key)
        if isinstance(value, datetime):
            data[key] = value.isoformat()
    return data


def _validate_password(password: str) -> bool:
    if not password or len(password) < 8:
        return False
    has_letter = any(ch.isascii() and ch.isalpha() for ch in password)
    has_number = any(ch.isascii() and ch.isdigit() for ch in password)
    return has_letter and has_number


def _validate_password_strength(password: Optional[str]) -> dict:
    if not password or not isinstance(password, str):
        return {"isValid": False, "message": "Mật khẩu không được để trống."}
    if len(password) < 8:
        return {"isValid": False, "message": "Mật khẩu phải có độ dài tối thiểu 8 ký tự."}
    if not any(ch.isascii() and ch.isalpha() for ch in password):
        return {"isValid": False, "message": "Mật khẩu phải chứa ít nhất một chữ cái."}
    if not any(ch.isascii() and ch.isdigit() for ch in password):
        return {"isValid": False, "message": "Mật khẩu phải chứa ít nhất một chữ số."}
    return {"isValid": True, "message": "Mật khẩu đạt yêu cầu độ mạnh."}


def _has_permission(
    user_role: Optional[Union[str, List[str]]],
    required_permission: Optional[str],
) -> bool:
    if not user_role or not required_permission:
        return False
    roles = user_role if isinstance(user_role, list) else [user_role]
    return any(
        required_permission in ROLE_PERMISSIONS_MATRIX.get(role, [])
        for role in roles
        if isinstance(role, str)
    )


class AssignRoleBody(BaseModel):
    userId: str
    roles: List[str]
    assignedWarehouses: List[str] = Field(default_factory=list)


class ResetPasswordBody(BaseModel):
    token: str
    newPassword: str


class UpdateRolesBody(BaseModel):
    operatorId: str
    targetUserId: str
    currentRoles: List[str] = Field(default_factory=list)
    newRoles: List[str] = Field(default_factory=list)


class WarehouseUser(BaseModel):
    userId: str
    roles: List[str]
    assignedWarehouses: List[str] = Field(default_factory=list)


class WarehouseOperationBody(BaseModel):
    user: WarehouseUser
    warehouseId: str
    operationData: Any = None


class SaveUserBody(BaseModel):
    roles: List[str]
    assignedWarehouses: List[str] = Field(default_factory=list)


class ChangePasswordBody(BaseModel):
    userId: str
    currentSessionId: str
    oldPassword: str
    newPassword: str


class AssignRolesBody(BaseModel):
    currentAdminId: str
    targetUserId: str
    newRoles: List[str]
    assignedWarehouseIds: List[str] = Field(default_factory=list)
    currentUserRecord: dict = Field(default_factory=dict)


class PermissionCheckBody(BaseModel):
    userRole: Union[str, List[str]]
    requiredPermission: str


class PasswordValidateBody(BaseModel):
    password: str


@router.get("/users/roles")
def get_user_role_assignment(user_id: Optional[str] = Query(default=None, alias="userId")):
    """userRoleWarehouseAPI.js — getUserRoleAssignmentAPI"""
    if user_id:
        user = next((u for u in MOCK_USERS if u["userId"] == user_id), None)
        if not user:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
        return {
            "status": 200,
            "data": _serialize_user(user),
            "message": "Truy vấn thông tin gán vai trò thành công.",
        }
    return {
        "status": 200,
        "data": [_serialize_user(u) for u in MOCK_USERS],
        "message": "Truy vấn danh sách gán vai trò thành công.",
    }


@router.put("/users/roles")
def assign_user_role_and_warehouse(body: AssignRoleBody):
    """userRoleWarehouseAPI.js — assignUserRoleAndWarehouseAPI"""
    if not body.userId or not body.roles or any(role not in VALID_ROLES for role in body.roles):
        raise HTTPException(
            status_code=400,
            detail="Thông tin userId hoặc danh sách vai trò không hợp lệ.",
        )

    is_warehouse_role = "WAREHOUSE" in body.roles
    if is_warehouse_role and not body.assignedWarehouses:
        raise HTTPException(
            status_code=400,
            detail="Lỗi ràng buộc: Người dùng thuộc vai trò KHO phải được gắn với ít nhất một kho/địa bàn phụ trách.",
        )
    invalid_warehouses = [
        warehouse_id
        for warehouse_id in body.assignedWarehouses
        if warehouse_id not in VALID_WAREHOUSES
    ]
    if is_warehouse_role and invalid_warehouses:
        raise HTTPException(
            status_code=400,
            detail=f"Mã kho không hợp lệ: {', '.join(invalid_warehouses)}.",
        )

    unique_roles = list(dict.fromkeys(body.roles))
    unique_warehouses = list(dict.fromkeys(body.assignedWarehouses)) if is_warehouse_role else []

    user = next((u for u in MOCK_USERS if u["userId"] == body.userId), None)
    if user:
        user["roles"] = unique_roles
        user["assignedWarehouses"] = unique_warehouses
        user["updatedAt"] = datetime.utcnow()
        return {
            "status": 200,
            "data": _serialize_user(user),
            "message": "Cập nhật gán vai trò và kho/địa bàn thành công.",
        }

    new_user = {
        "userId": body.userId,
        "roles": unique_roles,
        "assignedWarehouses": unique_warehouses,
        "createdAt": datetime.utcnow(),
    }
    MOCK_USERS.append(new_user)
    return {
        "status": 201,
        "data": _serialize_user(new_user),
        "message": "Tạo mới gán vai trò và kho/địa bàn thành công.",
    }


@router.post("/auth/reset-password")
def reset_password(body: ResetPasswordBody):
    """resetPasswordAPI.js — handleResetPasswordAPI"""
    if not body.token or not body.newPassword:
        raise HTTPException(status_code=400, detail="Thiếu token hoặc mật khẩu mới.")
    if not _validate_password(body.newPassword):
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu mới phải có tối thiểu 8 ký tự, bao gồm cả chữ và số.",
        )

    hashed_input = hashlib.sha256(body.token.encode("utf-8")).hexdigest()
    token_record = next(
        (
            token
            for token in MOCK_RESET_TOKENS
            if hmac.compare_digest(token["tokenHash"], hashed_input)
        ),
        None,
    )
    if not token_record:
        raise HTTPException(
            status_code=404,
            detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc không tồn tại.",
        )
    if token_record["isUsed"]:
        raise HTTPException(
            status_code=400,
            detail="Liên kết này đã được sử dụng trước đó. Vui lòng gửi yêu cầu mới.",
        )
    if datetime.utcnow() >= token_record["expiresAt"]:
        raise HTTPException(
            status_code=400,
            detail="Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút).",
        )

    user = next((u for u in MOCK_AUTH_USERS if u["id"] == token_record["userId"]), None)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản người dùng.")

    user["passwordHash"] = _hash_password(body.newPassword)
    token_record["isUsed"] = True
    for session in MOCK_SESSIONS:
        if session["userId"] == user["id"] and session["status"] == "ACTIVE":
            session["status"] = "REVOKED"
            session["revokedAt"] = datetime.utcnow()
    return {
        "status": 200,
        "message": "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.",
    }


@router.get("/warehouses")
def warehouse_lookup(
    keyword: str = "",
    region: str = "",
    status: str = "ACTIVE",
):
    """warehouseLookupAPI.js — getWarehouseLookupAPI"""
    filtered = list(MOCK_WAREHOUSES)
    if status:
        filtered = [wh for wh in filtered if wh["status"] == status]
    if region:
        filtered = [wh for wh in filtered if wh["region"] == region]
    if keyword.strip():
        term = keyword.lower().strip()
        filtered = [
            wh
            for wh in filtered
            if term in wh["name"].lower() or term in wh["id"].lower()
        ]
    return {
        "status": 200,
        "total": len(filtered),
        "data": filtered,
        "message": "Tra cứu danh sách kho và địa bàn thành công.",
    }


@router.post("/users/roles/update")
def update_user_roles(body: UpdateRolesBody):
    """preventSelfAdminRevocation.js — updateUserRolesAPI"""
    if (
        not body.newRoles
        or any(role not in VALID_ROLES for role in body.currentRoles + body.newRoles)
    ):
        raise HTTPException(status_code=400, detail="Danh sách vai trò không hợp lệ.")
    is_self_update = body.operatorId == body.targetUserId
    is_currently_admin = "ADMIN" in body.currentRoles
    remains_admin = "ADMIN" in body.newRoles
    if is_self_update and is_currently_admin and not remains_admin:
        raise HTTPException(
            status_code=403,
            detail="Lỗi bảo mật: Bạn không thể tự xóa hoặc thu hồi vai trò Quản trị viên (ADMIN) của chính mình.",
        )
    return {
        "status": 200,
        "success": True,
        "message": "Cập nhật vai trò thành công.",
        "updatedUser": {
            "userId": body.targetUserId,
            "roles": body.newRoles,
            "updatedAt": datetime.utcnow().isoformat(),
        },
    }


@router.post("/warehouses/operations")
def warehouse_operation(body: WarehouseOperationBody):
    """scopePermission.js — performWarehouseOperation"""
    user = body.user
    if not user.roles:
        raise HTTPException(
            status_code=403,
            detail="Người dùng chưa được xác thực hoặc thiếu thông tin vai trò.",
        )
    if any(role not in VALID_ROLES for role in user.roles):
        raise HTTPException(status_code=400, detail="Danh sách vai trò không hợp lệ.")
    if "ADMIN" in user.roles:
        allowed = True
        message = "ADMIN được cấp quyền [UPDATE] trên toàn bộ hệ thống."
    elif "WAREHOUSE" in user.roles or "SALES" in user.roles:
        if "SALES" in user.roles and "WAREHOUSE" not in user.roles:
            raise HTTPException(
                status_code=403,
                detail="Vai trò SALES chỉ được đọc dữ liệu trong phạm vi kho được phân công.",
            )
        allowed = body.warehouseId in user.assignedWarehouses
        message = (
            f"Cho phép [UPDATE] dữ liệu thuộc kho [{body.warehouseId}]."
            if allowed
            else f"Từ chối truy cập: Bạn không được phân công quản lý kho [{body.warehouseId}]."
        )
    else:
        allowed = False
        message = "Vai trò người dùng không có quyền thao tác trên dữ liệu kho."

    if not allowed:
        raise HTTPException(status_code=403, detail=message)
    return {
        "status": 200,
        "success": True,
        "message": f"Thao tác dữ liệu tại kho [{body.warehouseId}] thành công.",
        "data": body.operationData,
        "permission": message,
    }


@router.post("/users/validate-warehouse-role")
def validate_warehouse_role(body: SaveUserBody):
    """validateWarehouseRole.js — saveUser"""
    if any(role not in VALID_ROLES for role in body.roles):
        raise HTTPException(status_code=400, detail="Danh sách vai trò chứa giá trị không hợp lệ.")
    if "WAREHOUSE" in body.roles:
        if not body.assignedWarehouses:
            raise HTTPException(
                status_code=400,
                detail="Lỗi validation: Tài khoản thuộc vai trò kho phải được gắn tối thiểu một kho hoặc địa bàn.",
            )
        invalid = [wid for wid in body.assignedWarehouses if wid not in VALID_WAREHOUSES]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Lỗi validation: Kho/địa bàn [{', '.join(invalid)}] không tồn tại hoặc không hợp lệ.",
            )
    return {
        "success": True,
        "message": "Lưu thông tin người dùng thành công.",
        "data": body.dict(),
    }


@router.post("/auth/change-password")
def change_password(body: ChangePasswordBody):
    """revokeSessionsOnPasswordChange.js — changePasswordAPI"""
    if not body.userId:
        raise HTTPException(status_code=400, detail="ID người dùng không hợp lệ.")

    strength = _validate_password_strength(body.newPassword)
    if not strength["isValid"]:
        raise HTTPException(status_code=400, detail=strength["message"])

    user = next((u for u in MOCK_AUTH_USERS if u["id"] == body.userId), None)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản người dùng.")
    if not _verify_password(body.oldPassword, user["passwordHash"]):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác.")

    current_session = next(
        (
            session
            for session in MOCK_SESSIONS
            if session["userId"] == body.userId
            and session["sessionId"] == body.currentSessionId
            and session["status"] == "ACTIVE"
        ),
        None,
    )
    if not current_session:
        raise HTTPException(status_code=401, detail="Phiên hiện tại không hợp lệ.")

    user["passwordHash"] = _hash_password(body.newPassword)
    revoked_count = 0
    for session in MOCK_SESSIONS:
        if session["userId"] == body.userId and session["status"] == "ACTIVE":
            if session is current_session:
                continue
            session["status"] = "REVOKED"
            session["revokedAt"] = datetime.utcnow()
            revoked_count += 1

    active = [
        s
        for s in MOCK_SESSIONS
        if s["userId"] == body.userId and s["status"] == "ACTIVE"
    ]
    return {
        "status": 200,
        "success": True,
        "message": (
            f"Đổi mật khẩu thành công. Đã thu hồi {revoked_count} phiên đăng nhập "
            "trên các thiết bị khác. Giữ lại phiên hiện tại."
        ),
        "activeSessions": [
            {
                **s,
                "createdAt": s["createdAt"].isoformat() if isinstance(s.get("createdAt"), datetime) else s.get("createdAt"),
                "revokedAt": s["revokedAt"].isoformat() if isinstance(s.get("revokedAt"), datetime) else s.get("revokedAt"),
            }
            for s in active
        ],
    }


@router.post("/users/assign")
def assign_roles_and_warehouses(body: AssignRolesBody):
    """userRoleAssignment.js — assignRolesAndWarehouses"""
    if not body.newRoles or any(role not in VALID_ROLES for role in body.newRoles):
        raise HTTPException(status_code=400, detail="Người dùng phải có ít nhất một vai trò.")

    current_roles = body.currentUserRecord.get("roles") or []
    is_self = body.currentAdminId == body.targetUserId
    currently_admin = "ADMIN" in current_roles
    new_has_admin = "ADMIN" in body.newRoles
    if is_self and currently_admin and not new_has_admin:
        raise HTTPException(
            status_code=400,
            detail="Không thể tự thu hồi vai trò Quản trị viên (ADMIN) của chính mình.",
        )

    is_warehouse = "WAREHOUSE" in body.newRoles
    if is_warehouse and not body.assignedWarehouseIds:
        raise HTTPException(
            status_code=400,
            detail="Thủ kho phải được gắn với ít nhất một kho cụ thể.",
        )
    invalid_warehouses = [
        warehouse_id
        for warehouse_id in body.assignedWarehouseIds
        if warehouse_id not in VALID_WAREHOUSES
    ]
    if is_warehouse and invalid_warehouses:
        raise HTTPException(
            status_code=400,
            detail=f"Mã kho không hợp lệ: {', '.join(invalid_warehouses)}.",
        )

    updated_user = {
        "userId": body.targetUserId,
        "roles": list(dict.fromkeys(body.newRoles)),
        "assignedWarehouses": body.assignedWarehouseIds if is_warehouse else [],
        "updatedAt": datetime.utcnow().isoformat(),
    }
    return {
        "success": True,
        "updatedUser": updated_user,
        "message": "Gán vai trò và kho cho người dùng thành công.",
    }


@router.post("/rbac/check")
def check_permission(body: PermissionCheckBody):
    """roleMatrix.js — hasPermission"""
    allowed = _has_permission(body.userRole, body.requiredPermission)
    return {
        "allowed": allowed,
        "userRole": body.userRole,
        "requiredPermission": body.requiredPermission,
        "message": "CHO PHÉP" if allowed else "TỪ CHỐI",
    }


@router.post("/auth/password/validate")
def validate_password(body: PasswordValidateBody):
    """passwordPolicy.js — validatePasswordStrength"""
    return _validate_password_strength(body.password)
