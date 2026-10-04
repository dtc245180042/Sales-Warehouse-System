import sys
from pathlib import Path

# Đảm bảo thư mục backend nằm trong sys.path để tương thích khi chạy uvicorn app.main:app
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from main import app, lifespan, health_check

__all__ = ["app", "lifespan", "health_check"]
