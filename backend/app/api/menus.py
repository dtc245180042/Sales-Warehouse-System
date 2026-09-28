from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.navigation import MenuItem
from app.schemas.navigation import (
    MenuItemCreate,
    MenuItemUpdate,
    MenuItemResponse,
    UserMenuResponse
)
from app.services.menu_service import get_all_menus, get_user_navigation_menu

router = APIRouter(prefix="/menus", tags=["Menus & Navigation"])


@router.get("", response_model=List[MenuItemResponse])
def get_menus(db: Session = Depends(get_db)):
    """Lấy toàn bộ cây menu điều hướng hệ thống (gồm cả menu cha và các menu con)."""
    return get_all_menus(db)


@router.get("/user", response_model=UserMenuResponse)
def get_user_menus(
    role: Optional[str] = Query(None, description="Lọc menu theo vai trò người dùng (ví dụ: ADMIN, SALES, WAREHOUSE, MANAGER, ACCOUNTANT)"),
    permissions: Optional[str] = Query(None, description="Danh sách mã quyền, phân cách bởi dấu phẩy (ví dụ: order:view,customer:view)"),
    db: Session = Depends(get_db)
):
    """Lấy cây menu điều hướng động được cá nhân hóa theo vai trò hoặc danh sách quyền hạn.
    - Giúp Frontend hiển thị Sidebar linh hoạt mà không cần hard-code.
    - Tự động ẩn các menu hoặc nhóm chức năng khi người dùng không có quyền tương ứng.
    """
    perm_list = [p.strip() for p in permissions.split(",") if p.strip()] if permissions else None
    menus = get_user_navigation_menu(db=db, role_name=role, permission_codes=perm_list)
    return UserMenuResponse(role=role, menus=menus)


@router.post("", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
def create_menu_item(
    payload: MenuItemCreate,
    db: Session = Depends(get_db)
):
    """Thêm mới một mục menu điều hướng vào hệ thống."""
    # Kiểm tra mã menu đã tồn tại chưa
    existing = db.query(MenuItem).filter(MenuItem.code == payload.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã menu '{payload.code}' đã tồn tại trong hệ thống"
        )

    # Nếu có parent_id, kiểm tra parent có tồn tại không
    if payload.parent_id:
        parent = db.query(MenuItem).filter(MenuItem.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Menu cha (parent_id) không tồn tại"
            )

    item = MenuItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{menu_id}", response_model=MenuItemResponse)
def update_menu_item(
    menu_id: int,
    payload: MenuItemUpdate,
    db: Session = Depends(get_db)
):
    """Cập nhật thông tin hoặc quyền yêu cầu của một mục menu."""
    item = db.query(MenuItem).filter(MenuItem.id == menu_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy mục menu"
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(item, field, val)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{menu_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_menu_item(
    menu_id: int,
    db: Session = Depends(get_db)
):
    """Xóa một mục menu điều hướng."""
    item = db.query(MenuItem).filter(MenuItem.id == menu_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy mục menu"
        )

    db.delete(item)
    db.commit()
    return None
