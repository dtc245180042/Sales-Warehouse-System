from db_test import SessionLocal
from models_test import UserTest

db = SessionLocal()

# 1. Thêm 1 user mới vào MySQL
new_user = UserTest(username="nguoidung1", password="hashed_password_123")
db.add(new_user)
db.commit()
print("Đã thêm user mới vào Database!")

# 2. Lấy danh sách user từ MySQL ra xem
users = db.query(UserTest).all()
for u in users:
    print(f"ID: {u.id} | Username: {u.username}")

db.close()