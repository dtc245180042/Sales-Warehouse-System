def validate_role_update_permission(current_user_id: str, target_user_id: str, current_roles: list, new_roles: list):
    is_self = (current_user_id == target_user_id)
    was_admin = "ADMIN" in current_roles
    will_be_admin = "ADMIN" in new_roles
    
    if is_self and was_admin and not will_be_admin:
        return {"allowed": False, "message": "Lỗi bảo mật: Bạn không thể tự thu hồi vai trò ADMIN của chính mình."}
        
    return {"allowed": True, "message": "Hợp lệ."}

if __name__ == "__main__":
    print(validate_role_update_permission("admin_1", "admin_1", ["ADMIN", "SALES"], ["SALES"]))