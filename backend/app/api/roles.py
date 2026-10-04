from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.auth import Role, Permission
from app.schemas.role import RoleResponse, RoleCreate, RoleAssignPermissions

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("", response_model=List[RoleResponse])
def get_roles(db: Session = Depends(get_db)):
    """Lấy danh sách tất cả các vai trò và quyền được gán kèm theo."""
    return db.query(Role).order_by(Role.id).all()


@router.get("/{role_id}", response_model=RoleResponse)
def get_role_by_id(role_id: int, db: Session = Depends(get_db)):
    """Lấy chi tiết vai trò theo ID."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy vai trò")
    return role


@router.post("/{role_id}/permissions", response_model=RoleResponse)
def assign_permissions_to_role(
    role_id: int,
    payload: RoleAssignPermissions,
    db: Session = Depends(get_db)
):
    """Cập nhật / gán danh sách quyền (theo danh sách mã code) cho một vai trò."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy vai trò")

    # Lấy các permissions tương ứng
    permissions = db.query(Permission).filter(Permission.code.in_(payload.permission_codes)).all()

    # Gán quyền mới cho role
    role.permissions = permissions
    db.commit()
    db.refresh(role)
    return role
