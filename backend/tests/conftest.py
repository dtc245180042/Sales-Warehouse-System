import sys
from pathlib import Path

# Thêm thư mục backend vào sys.path để pytest tự nhận diện module app
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import app.models
from app.core.database import Base, engine
Base.metadata.create_all(bind=engine)
