import hashlib
from datetime import datetime

MOCK_TOKENS = {
    "hash_valid_token": {"user_id": "usr_101", "expires_at": datetime(2028, 1, 1), "is_used": False}
}

def reset_password_api(raw_token: str, new_password: str):
    if len(new_password) < 8:
        return {"status": 400, "message": "Mật khẩu mới không đủ độ mạnh."}
        
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    token_record = MOCK_TOKENS.get(token_hash)
    
    if not token_record or token_record["is_used"] or datetime.now() > token_record["expires_at"]:
        return {"status": 400, "message": "Token không hợp lệ hoặc đã hết hạn."}
        
    token_record["is_used"] = True
    return {"status": 200, "message": "Cập nhật mật khẩu thành công."}

if __name__ == "__main__":
    print(reset_password_api("valid_token", "NewPassword2026"))