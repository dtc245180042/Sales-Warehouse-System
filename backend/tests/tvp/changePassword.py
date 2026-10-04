import re
import bcrypt

# Giả lập Database lưu thông tin tài khoản và danh sách phiên đăng nhập
MOCK_USER_DB = {
    "usr_101": {
        "user_id": "usr_101",
        # Mật khẩu hiện tại băm từ "OldPassword123"
        "password_hash": bcrypt.hashpw(b"OldPassword123", bcrypt.gensalt()).decode('utf-8')
    }
}

MOCK_ACTIVE_SESSIONS = [
    {"session_id": "sess_current", "user_id": "usr_101", "is_active": True},
    {"session_id": "sess_phone_app", "user_id": "usr_101", "is_active": True},
    {"session_id": "sess_laptop_chrome", "user_id": "usr_101", "is_active": True}
]

def change_password(user_id: str, current_password: str, new_password: str, current_session_id: str):
    """
    Xử lý đổi mật khẩu cho người dùng đang đăng nhập (SCRUM-201)
    """
    user = MOCK_USER_DB.get(user_id)
    if not user:
        return {"status": 404, "success": False, "message": "Tài khoản không tồn tại."}

    # 1. Bắt buộc nhập và kiểm tra mật khẩu hiện tại
    if not current_password:
        return {"status": 400, "success": False, "message": "Vui lòng nhập mật khẩu hiện tại."}

    if not bcrypt.checkpw(current_password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        return {"status": 400, "success": False, "message": "Mật khẩu hiện tại không chính xác."}

    # 2. Kiểm tra mật khẩu mới: Tối thiểu 8 ký tự, chứa cả chữ và số
    if len(new_password) < 8 or not re.search(r'[a-zA-Z]', new_password) or not re.search(r'[0-9]', new_password):
        return {
            "status": 400,
            "success": False,
            "message": "Mật khẩu mới phải có tối thiểu 8 ký tự và bao gồm cả chữ cái lẫn chữ số."
        }

    # Kiểm tra mật khẩu mới không được trùng mật khẩu cũ
    if current_password == new_password:
        return {"status": 400, "success": False, "message": "Mật khẩu mới không được giống mật khẩu hiện tại."}

    # Cập nhật mật khẩu mới (Băm mật khẩu trước khi lưu)
    new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user["password_hash"] = new_hash

    # 3. Đổi xong thu hồi tất cả các phiên đăng nhập khác (trừ phiên hiện tại)
    revoked_count = 0
    for session in MOCK_ACTIVE_SESSIONS:
        if session["user_id"] == user_id and session["session_id"] != current_session_id:
            if session["is_active"]:
                session["is_active"] = False
                revoked_count += 1

    return {
        "status": 200,
        "success": True,
        "message": "Đổi mật khẩu thành công. Đã thu hồi các phiên đăng nhập khác.",
        "revoked_other_sessions_count": revoked_count
    }


# ==========================================
# TEST CASES
# ==========================================
if __name__ == "__main__":
    print("--- TEST ĐỔI MẬT KHẨU (SCRUM-201) ---")

    # Test 1: Mật khẩu hiện tại sai
    print("\n[Test 1] Nhập sai mật khẩu hiện tại:")
    print(change_password("usr_101", "WrongOldPwd", "NewPass1234", "sess_current"))

    # Test 2: Mật khẩu mới quá ngắn hoặc thiếu chữ/số
    print("\n[Test 2] Mật khẩu mới không đủ độ mạnh (không có số):")
    print(change_password("usr_101", "OldPassword123", "ShortPwd", "sess_current"))

    # Test 3: Đổi mật khẩu thành công & thu hồi phiên khác
    print("\n[Test 3] Đổi mật khẩu hợp lệ:")
    res = change_password("usr_101", "OldPassword123", "NewPassword2026", "sess_current")
    print(res)

    print("\n[Trạng thái danh sách phiên làm việc sau khi đổi mật khẩu]:")
    for s in MOCK_ACTIVE_SESSIONS:
        print(s)