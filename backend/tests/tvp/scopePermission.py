def check_warehouse_scope_permission(user: dict, target_warehouse_id: str, action: str = "READ"):
    roles = user.get("roles", [])
    if "ADMIN" in roles:
        return {"allowed": True, "message": f"ADMIN được cấp toàn quyền [{action}]."}
        
    if "WAREHOUSE" in roles or "SALES" in roles:
        assigned = user.get("assigned_warehouses", [])
        if target_warehouse_id in assigned:
            return {"allowed": True, "message": f"Cho phép [{action}] trên kho {target_warehouse_id}."}
        return {"allowed": False, "message": f"Từ chối: Không được phân công kho {target_warehouse_id}."}
        
    return {"allowed": False, "message": "Không có quyền thao tác trên kho."}

if __name__ == "__main__":
    user_staff = {"roles": ["WAREHOUSE"], "assigned_warehouses": ["KHO_HA_NOI"]}
    print(check_warehouse_scope_permission(user_staff, "KHO_HCM"))