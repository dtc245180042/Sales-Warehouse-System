from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.auth import Permission
from app.schemas.permission import PermissionResponse

router = APIRouter(prefix="/permissions", tags=["Permissions"])


@router.get("", response_model=List[PermissionResponse])
def get_permissions(
    module: Optional[str] = Query(None, description="Lọc theo nhóm module"),
    db: Session = Depends(get_db)
):
    """Lấy danh sách quyền hạn trong hệ thống, có thể lọc theo module."""
    query = db.query(Permission)
    if module:
        query = query.filter(Permission.module == module)
    return query.order_by(Permission.module, Permission.code).all()
