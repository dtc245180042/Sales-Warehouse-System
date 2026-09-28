from typing import Generator
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL

# Cấu hình engine: nếu sử dụng SQLite thì cần check_same_thread=False
la_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if la_sqlite else {},
    pool_pre_ping=True
)

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
                cols_to_add = [
                    ("role", "VARCHAR(50) DEFAULT 'Customer'"),
                    ("assigned_warehouse", "VARCHAR(100)"),
                    ("warehouse_id", "INTEGER"),
                    ("warehouse_name", "VARCHAR(100)"),
                    ("region", "VARCHAR(100)"),
                    ("failed_login_attempts", "INTEGER DEFAULT 0"),
                    ("locked_until", "DATETIME"),
                    ("lock_reason", "VARCHAR(255)"),
                    ("token_version", "INTEGER DEFAULT 1"),
                    ("reset_password_token", "VARCHAR(255)"),
                    ("reset_password_expires_at", "DATETIME"),
                    ("must_change_password", "BOOLEAN DEFAULT 0"),
                ]
                for col_name, col_def in cols_to_add:
                    if col_name not in columns:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                conn.commit()
    except Exception:
        pass


def lay_phien_db() -> Generator[Session, None, None]:
    """FastAPI Dependency cung cấp SQLAlchemy Session cho mỗi request."""
    phien_db = SessionLocal()
    try:
        yield phien_db
    finally:
        phien_db.close()


# Bí danh tương thích ngược (aliases)
get_db = lay_phien_db

