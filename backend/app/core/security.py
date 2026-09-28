import hashlib
import secrets

try:
    import bcrypt
    HAS_BCRYPT = True
except ImportError:
    HAS_BCRYPT = False


def get_password_hash(password: str) -> str:
    """Tạo chuỗi hash an toàn cho mật khẩu.
    Sử dụng bcrypt nếu đã cài đặt, hoặc fallback sang PBKDF2-HMAC-SHA256 (chuẩn Python built-in).
    """
    if HAS_BCRYPT:
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"pbkdf2:sha256:100000${salt}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Xác thực mật khẩu plain-text với chuỗi hash."""
    if hashed_password.startswith("pbkdf2:"):
        parts = hashed_password.split("$")
        if len(parts) == 3:
            salt = parts[1]
            key_hex = parts[2]
            computed = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
            return secrets.compare_digest(key_hex, computed)

    if HAS_BCRYPT:
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            return False

    return False
