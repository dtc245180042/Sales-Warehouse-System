from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from datetime import datetime
from database import Base, engine

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class PasswordReset(Base):
    __tablename__ = "password_resets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

if __name__ == "__main__":
    # Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("==========================================")
    print("CẤU TRÚC BẢNG TRONG MYSQL ĐÃ SẴN SÀNG!")
    print("==========================================")