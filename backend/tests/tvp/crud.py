from .database import SessionLocal
from .models import User

def create_user(username: str, email: str, password_hash: str):
    db = SessionLocal()
    try:
        new_user = User(
            username=username,
            email=email,
            password_hash=password_hash
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        print(f"Đã tạo User thành công với ID: {new_user.id}")
        return new_user
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def get_all_users():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        print("--- DANH SÁCH USER TRONG DATABASE ---")
        for u in users:
            print(f"ID: {u.id} | Username: {u.username} | Email: {u.email}")
        return users
    finally:
        db.close()

if __name__ == "__main__":
    get_all_users()