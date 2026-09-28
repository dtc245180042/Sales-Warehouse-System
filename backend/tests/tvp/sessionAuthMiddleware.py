from datetime import datetime, timedelta

# Mô phỏng CSDL lưu trữ các phiên đăng nhập (Sessions Database)
ACTIVE_SESSIONS_DB = [
    {
        "session_id": "sess_valid_001",
        "user_id": "usr_101",
        "is_revoked": False,
        "expires_at": datetime.now() + timedelta(hours=1)  # Còn hạn 1 tiếng
    },
    {
        "session_id": "sess_expired_002",
        "user_id": "usr_102",
        "is_revoked": False,
        "expires_at": datetime.now() - timedelta(seconds=1)  # Đã hết hạn
    },
    {
        "session_id": "sess_revoked_003",
        "user_id": "usr_103",
        "is_revoked": True,  # Phiên đã bị thu hồi/vô hiệu hóa
        "expires_at": datetime.now() + timedelta(hours=1)
    }
]

def session_auth_middleware(authorization_header: str):
    """
    Middleware kiểm tra phiên làm việc (Session Auth Middleware)
    Chặn các request dùng phiên hết hạn hoặc đã bị revoke, trả về mã lỗi thích hợp.
    """
    # 1. Kiểm tra header Authorization
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return {
            "status_code": 401,
            "success": False,
            "error_code": "MISSING_TOKEN",
            "message": "Yêu cầu không hợp lệ. Vui lòng cung cấp Session Token."
        }

    token = authorization_header.split(" ")[1]

    # 2. Tra cứu Session trong CSDL
    session = next((s for s in ACTIVE_SESSIONS_DB if s["session_id"] == token), None)

    if not session:
        return {
            "status_code": 401,
            "success": False,
            "error_code": "INVALID_SESSION",
            "message": "Phiên làm việc không tồn tại hoặc không hợp lệ."
        }

    # 3. Kiểm tra nếu phiên đã bị Revoke (Thu hồi)
    if session["is_revoked"]:
        return {
            "status_code": 401,
            "success": False,
            "error_code": "SESSION_REVOKED",
            "message": "Phiên đăng nhập của bạn đã bị đăng xuất trên thiết bị này hoặc thiết bị khác."
        }

    # 4. Kiểm tra thời hạn hết hạn của phiên (Expired)
    if datetime.now() > session["expires_at"]:
        return {
            "status_code": 401,
            "success": False,
            "error_code": "SESSION_EXPIRED",
            "message": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        }

    # Trả về thành công kèm thông tin user để API phía sau sử dụng
    return {
        "status_code": 200,
        "success": True,
        "user": {
            "user_id": session["user_id"],
            "session_id": session["session_id"]
        }
    }


# ==========================================
# TEST CASES CHẠY THỬ NGHIỆM
# ==========================================
if __name__ == "__main__":
    print("--- BẮT ĐẦU TEST MIDDLEWARE KIỂM TRA PHIÊN (PYTHON) ---")

    # Test 1: Token hợp lệ -> Cho phép đi tiếp
    print("\n[Test 1] Token hợp lệ (sess_valid_001):")
    res1 = session_auth_middleware("Bearer sess_valid_001")
    print("- Status Code:", res1["status_code"])
    print("- Result:", res1)

    # Test 2: Token đã bị Revoke -> Chặn với mã SESSION_REVOKED
    print("\n[Test 2] Token đã bị thu hồi (sess_revoked_003):")
    res2 = session_auth_middleware("Bearer sess_revoked_003")
    print("- Status Code:", res2["status_code"])
    print("- Result:", res2)

    # Test 3: Token hết hạn -> Chặn với mã SESSION_EXPIRED
    print("\n[Test 3] Token hết hạn (sess_expired_002):")
    res3 = session_auth_middleware("Bearer sess_expired_002")
    print("- Status Code:", res3["status_code"])
    print("- Result:", res3)

    # Test 4: Thiếu Header Authorization -> Chặn với mã MISSING_TOKEN
    print("\n[Test 4] Không có token:")
    res4 = session_auth_middleware("")
    print("- Status Code:", res4["status_code"])
    print("- Result:", res4)