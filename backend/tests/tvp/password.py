import hashlib
import os
from datetime import datetime, timedelta

def generate_reset_token(user_id: str):
    raw_token = os.urandom(32).hex()
    hashed_token = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now() + timedelta(minutes=30)
    
    return {
        "user_id": user_id,
        "raw_token": raw_token,
        "token_hash": hashed_token,
        "expires_at": expires_at,
        "is_used": False
    }

if __name__ == "__main__":
    token_data = generate_reset_token("usr_101")
    print("Token Data:", token_data)