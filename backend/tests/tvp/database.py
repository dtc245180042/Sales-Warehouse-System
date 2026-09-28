import os
from pathlib import Path
from typing import Dict, Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import declarative_base, sessionmaker


def _read_env_file(path: Path) -> Dict[str, str]:
    values = {}
    if not path.exists():
        return values

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


_env_file = _read_env_file(Path(__file__).with_name(".env"))


def _setting(name: str, default: Optional[str] = None) -> Optional[str]:
    return os.environ.get(name, _env_file.get(name, default))


_db_user = _setting("DB_USER")
_db_password = _setting("DB_PASSWORD")
_db_host = _setting("DB_HOST")
_db_name = _setting("DB_NAME")

if not all((_db_user, _db_host, _db_name)) or _db_password is None:
    raise RuntimeError(
        "Database settings are incomplete; set DB_USER, DB_PASSWORD, "
        "DB_HOST, and DB_NAME in the environment or backend/tests/tvp/.env."
    )

DATABASE_URL = URL.create(
    "mysql+pymysql",
    username=_db_user,
    password=_db_password,
    host=_db_host,
    port=int(_setting("DB_PORT", "3306")),
    database=_db_name,
    query={"charset": "utf8mb4"},
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
