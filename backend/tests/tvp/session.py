from datetime import datetime, timedelta

def extend_session(session_data: dict, extension_minutes: int = 30):
    now = datetime.now()
    if now > session_data.get("expires_at", now):
        return {"success": False, "message": "Phiên đã hết hạn, không thể gia hạn."}
    
    session_data["expires_at"] = now + timedelta(minutes=extension_minutes)
    session_data["last_activity"] = now
    return {"success": True, "message": "Gia hạn phiên thành công.", "session": session_data}

if __name__ == "__main__":
    sample_session = {"session_id": "sess_1", "expires_at": datetime.now() + timedelta(minutes=10)}
    print(extend_session(sample_session))