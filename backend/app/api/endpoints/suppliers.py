"""
suppliers.py — SCRUM-217 API Router
Quản lý danh mục nhà cung cấp.

Auto-discovery: file này được nạp tự động, KHÔNG cần sửa main.py hay __init__.py.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.schemas.supplier import (
    SupplierCreate,
    SupplierUpdate,
    SupplierResponse,
    SupplierDeleteResponse,
)
from app.services import supplier_service

router = APIRouter(prefix="/suppliers", tags=["Nhà cung cấp"])


# ─── SCRUM-409: GET danh sách ─────────────────────────────────────────────────

@router.get("", response_model=List[SupplierResponse], summary="Lấy danh sách nhà cung cấp")
@router.get("/", response_model=List[SupplierResponse], include_in_schema=False)
def get_suppliers(
    search: Optional[str] = Query(None, description="Tìm theo tên, mã NCC, người liên hệ, mã số thuế"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: active | inactive"),
    skip: int = Query(0, ge=0, description="Số bản ghi bỏ qua (phân trang)"),
    limit: int = Query(100, ge=1, le=500, description="Số bản ghi tối đa trả về"),
    db: Session = Depends(lay_phien_db),
):
    """Lấy danh sách tất cả nhà cung cấp. Hỗ trợ tìm kiếm và lọc theo trạng thái."""
    return supplier_service.get_all_suppliers(
        db=db, search=search, status_filter=status, skip=skip, limit=limit
    )


@router.get("/{supplier_id}", response_model=SupplierResponse, summary="Lấy chi tiết nhà cung cấp")
def get_supplier_detail(
    supplier_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Lấy chi tiết một nhà cung cấp theo ID hoặc mã NCC."""
    return supplier_service.get_supplier_by_id(db=db, supplier_id=supplier_id)


# ─── SCRUM-409: POST tạo mới ──────────────────────────────────────────────────

@router.post(
    "",
    response_model=SupplierResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo mới nhà cung cấp",
)
@router.post("/", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_supplier(
    supplier_in: SupplierCreate,
    db: Session = Depends(lay_phien_db),
):
    """
    Tạo mới một nhà cung cấp.

    **Ràng buộc (SCRUM-410):**
    - Mã NCC phải là chữ hoa, số, dấu gạch ngang (2–20 ký tự).
    - Mã số thuế phải đúng định dạng VN (10 hoặc 13 chữ số).
    - Mã NCC và mã số thuế không được trùng với nhà cung cấp đã có.
    - Điều khoản thanh toán tối đa 100 ký tự.
    """
    return supplier_service.create_supplier(db=db, supplier_in=supplier_in)


# ─── PUT cập nhật ─────────────────────────────────────────────────────────────

@router.put("/{supplier_id}", response_model=SupplierResponse, summary="Cập nhật nhà cung cấp")
def update_supplier(
    supplier_id: str,
    supplier_in: SupplierUpdate,
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật thông tin nhà cung cấp. Kiểm tra trùng mã số thuế nếu thay đổi."""
    return supplier_service.update_supplier(
        db=db, supplier_id=supplier_id, supplier_in=supplier_in
    )


# ─── SCRUM-408 + SCRUM-412: DELETE thông minh ────────────────────────────────

@router.delete(
    "/{supplier_id}",
    response_model=SupplierDeleteResponse,
    summary="Xóa hoặc ngừng giao dịch nhà cung cấp",
)
def delete_supplier(
    supplier_id: str,
    db: Session = Depends(lay_phien_db),
):
    """
    Xóa hoặc ngừng giao dịch nhà cung cấp theo nghiệp vụ:

    - **Chưa có phiếu nhập kho** → Xóa vĩnh viễn (`action: deleted`).
    - **Đã có phiếu nhập kho** → Không được xóa. Hệ thống tự động chuyển sang
      trạng thái `inactive` và trả về cảnh báo (`action: deactivated`, `warning: ...`).

    **(SCRUM-408 + SCRUM-412)**
    """
    return supplier_service.delete_or_deactivate_supplier(db=db, supplier_id=supplier_id)
