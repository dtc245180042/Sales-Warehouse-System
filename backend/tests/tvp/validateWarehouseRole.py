VALID_WAREHOUSES = ["KHO_HA_NOI", "KHO_DA_NANG", "KHO_HCM"]

def validate_warehouse_role_constraint(user_data: dict):
    roles = user_data.get("roles", [])
    warehouses = user_data.get("assigned_warehouses", [])
    
    if "WAREHOUSE" in roles:
        if not warehouses:
            return {"is_valid": False, "message": "Lỗi: Vai trò KHO bắt buộc phải gán ít nhất một kho cụ thể."}
            
        invalid = [w for w in warehouses if w not in VALID_WAREHOUSES]
        if invalid:
            return {"is_valid": False, "message": f"Kho không hợp lệ: {invalid}"}
            
    return {"is_valid": True, "message": "Hợp lệ."}

if __name__ == "__main__":
    print(validate_warehouse_role_constraint({"roles": ["WAREHOUSE"], "assigned_warehouses": []}))