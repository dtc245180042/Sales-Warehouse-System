from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import hashlib
import secrets
import bcrypt

try:
    from jose import jwt, JWTError
except ImportError:
    import jwt
    JWTError = Exception

from app.core.config import settings

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its stored hash.

    Supports both bcrypt (default) and pbkdf2_sha256 (legacy).
    """
    if hashed_password.startswith("pbkdf2:"):
        parts = hashed_password.split("$")
        if len(parts) == 3:
            salt = parts[1]
            key_hex = parts[2]
            computed = hashlib.pbkdf2_hmac(
                "sha256",
                plain_password.encode("utf-8"),
                salt.encode("utf-8"),
                100000,
            ).hex()
            return secrets.compare_digest(key_hex, computed)

    try:
        plain_bytes = plain_password.encode("utf-8")[:72]
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt (input safely capped at 72 bytes)."""
    password_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token with the given payload and expiry time."""
    payload = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))

    payload.update({"exp": expire, "iat": now})
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode a JWT token and return its payload, or None if invalid / expired."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except (JWTError, Exception):
        return None


# ---------------------------------------------------------------------------
# Backward-compatibility aliases (legacy Vietnamese names — do NOT use in new code)
# ---------------------------------------------------------------------------
kiem_tra_mat_khau = verify_password
bam_mat_khau = get_password_hash
tao_token_truy_cap = create_access_token
giai_ma_token_truy_cap = decode_access_token
