from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.services import supplier_service

router = APIRouter(prefix="/suppliers", tags=["Nhà cung cấp"])


@router.get("", response_model=List[SupplierResponse])
@router.get("/", response_model=List[SupplierResponse], include_in_schema=False)
def get_suppliers(
    search: Optional[str] = Query(None, description="Tìm theo tên nhà cung cấp, mã hoặc người liên hệ"),
    db: Session = Depends(lay_phien_db),
):
    """Lấy danh sách tất cả nhà cung cấp."""
    return supplier_service.get_all_suppliers(db=db, search=search)


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier_detail(
    supplier_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Lấy chi tiết một nhà cung cấp."""
    return supplier_service.get_supplier_by_id(db=db, supplier_id=supplier_id)


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_supplier(
    supplier_in: SupplierCreate,
    db: Session = Depends(lay_phien_db),
):
    """Tạo mới một nhà cung cấp."""
    return supplier_service.create_supplier(db=db, supplier_in=supplier_in)


@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: str,
    supplier_in: SupplierUpdate,
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật thông tin nhà cung cấp."""
    return supplier_service.update_supplier(db=db, supplier_id=supplier_id, supplier_in=supplier_in)


@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Xóa một nhà cung cấp."""
    supplier_service.delete_supplier(db=db, supplier_id=supplier_id)
    return {"message": f"Đã xóa nhà cung cấp '{supplier_id}' thành công."}
