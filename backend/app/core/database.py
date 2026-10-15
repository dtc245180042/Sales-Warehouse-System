from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL

# Cấu hình engine: nếu sử dụng SQLite thì cần check_same_thread=False và bật foreign_keys
la_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if la_sqlite else {},
    pool_pre_ping=True
)

if la_sqlite:
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def lay_phien_db() -> Generator[Session, None, None]:
    """FastAPI Dependency cung cấp SQLAlchemy Session cho mỗi request."""
    phien_db = SessionLocal()
    try:
        yield phien_db
    finally:
        phien_db.close()


# Bí danh tương thích ngược (aliases)
get_db = lay_phien_db
