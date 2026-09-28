def assign_role_and_warehouse(user_id: str, roles: list, warehouses: list = None):
    if warehouses is None:
        warehouses = []
        
    if "WAREHOUSE" in roles and not warehouses:
        return {"success": False, "message": "Vai trò KHO phải đính kèm ít nhất một kho."}
        
    return {
        "success": True,
        "user_id": user_id,
        "roles": list(set(roles)),
        "assigned_warehouses": warehouses if "WAREHOUSE" in roles else []
    }

if __name__ == "__main__":
    print(assign_role_and_warehouse("usr_001", ["WAREHOUSE"], ["KHO_HN_01"]))