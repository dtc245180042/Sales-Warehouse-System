import re
import bcrypt

def validate_password_policy(password: str) -> bool:
    if len(password) < 8:
        return False
    has_letter = bool(re.search(r'[a-zA-Z]', password))
    has_number = bool(re.search(r'[0-9]', password))
    return has_letter and has_number

def hash_password(password: str) -> str:
    if not validate_password_policy(password):
        raise ValueError("Mật khẩu không đạt quy tắc độ mạnh.")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

if __name__ == "__main__":
    pwd = "Password123"
    print("Valid:", validate_password_policy(pwd))
    print("Hashed:", hash_password(pwd))