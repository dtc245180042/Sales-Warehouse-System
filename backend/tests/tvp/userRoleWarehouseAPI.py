MOCK_USERS_DB = {}

def update_user_role_warehouse_api(user_id: str, roles: list, assigned_warehouses: list = None):
    if assigned_warehouses is None:
        assigned_warehouses = []
        
    if "WAREHOUSE" in roles and not assigned_warehouses:
        return {"status": 400, "message": "Người dùng thuộc vai trò KHO phải gán ít nhất 1 kho/địa bàn."}
        
    user_data = {
        "user_id": user_id,
        "roles": roles,
        "assigned_warehouses": assigned_warehouses if "WAREHOUSE" in roles else []
    }
    MOCK_USERS_DB[user_id] = user_data
    return {"status": 200, "data": user_data, "message": "Lưu thông tin thành công."}

if __name__ == "__main__":
    print(update_user_role_warehouse_api("usr_200", ["WAREHOUSE", "SALES"], ["KHO_DN_01"]))