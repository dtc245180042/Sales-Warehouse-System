from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from db_test import Base, engine

# Khai báo bảng Users thử nghiệm
class UserTest(Base):
    __tablename__ = "users_test"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

# Lệnh này sẽ tự động tạo bảng trong MySQL nếu chưa có
Base.metadata.create_all(bind=engine)
print("Đã tạo bảng users_test thành công trong MySQL!")