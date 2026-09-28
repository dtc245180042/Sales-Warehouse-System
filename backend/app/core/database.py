import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

# Mặc định lấy từ biến môi trường DATABASE_URL trong file .env
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sales_warehouse.db")

# Nếu dùng SQLite thì cần cờ check_same_thread=False
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db():
    """Khởi tạo cấu trúc bảng và tự động đồng bộ cột mới nếu CSDL đã tồn tại."""
    Base.metadata.create_all(bind=engine)
    try:
        with engine.connect() as conn:
            inspector = inspect(engine)
            if "users" in inspector.get_table_names():
                columns = [c["name"] for c in inspector.get_columns("users")]
                if "warehouse_id" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN warehouse_id INTEGER"))
                if "warehouse_name" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN warehouse_name VARCHAR(100)"))
                if "region" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN region VARCHAR(100)"))
                conn.commit()
    except Exception:
        pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()