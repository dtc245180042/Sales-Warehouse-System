from datetime import datetime, timedelta

MOCK_SESSIONS = [
    {"session_id": "sess_cur", "user_id": "usr_1", "status": "ACTIVE", "expires_at": datetime.now() + timedelta(hours=1)},
    {"session_id": "sess_old", "user_id": "usr_1", "status": "ACTIVE", "expires_at": datetime.now() + timedelta(hours=1)}
]

def revoke_other_sessions(user_id: str, current_session_id: str):
    revoked_count = 0
    for s in MOCK_SESSIONS:
        if s["user_id"] == user_id and s["status"] == "ACTIVE" and s["session_id"] != current_session_id:
            s["status"] = "REVOKED"
            revoked_count += 1
    return {"revoked_count": revoked_count, "message": f"Đã thu hồi {revoked_count} phiên làm việc khác."}

def session_auth_middleware(authorization_header: str):
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return {"status": 401, "error": "MISSING_TOKEN", "message": "Thiếu token xác thực."}
    token = authorization_header.split(" ")[1]
    session = next((s for s in MOCK_SESSIONS if s["session_id"] == token), None)
    
    if not session or session["status"] == "REVOKED" or datetime.now() > session["expires_at"]:
        return {"status": 401, "error": "INVALID_SESSION", "message": "Phiên làm việc hết hạn hoặc bị vô hiệu hóa."}
    return {"status": 200, "user_id": session["user_id"]}

if __name__ == "__main__":
    print(revoke_other_sessions("usr_1", "sess_cur"))
    print(session_auth_middleware("Bearer sess_old"))