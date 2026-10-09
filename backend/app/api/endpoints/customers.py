from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    CustomerStatusUpdate,
)
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["Khách hàng & Đại lý"])


@router.get("", response_model=List[CustomerResponse])
@router.get("/", response_model=List[CustomerResponse], include_in_schema=False)
def get_customers(
    search: Optional[str] = Query(None, description="Tìm theo tên, mã, MST hoặc số điện thoại"),
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm: TIER_1, TIER_2, WHOLESALE, VIP, RETAIL"),
    assigned_staff_id: Optional[str] = Query(None, description="Lọc theo nhân viên phụ trách hoặc 'unassigned'"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực/địa bàn"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: active, inactive"),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """
    Lấy danh sách khách hàng và đại lý.
    - Sales Rep: Chỉ xem các đại lý mình phụ trách (lọc ở tầng query).
    - Manager/Admin: Xem 100% đại lý và hỗ trợ lọc theo nhân viên/khu vực/trạng thái.
    """
    return customer_service.get_all_customers(
        db=db,
        search=search,
        customer_group=customer_group,
        assigned_staff_id=assigned_staff_id,
        region=region,
        status_filter=status,
        current_user=current_user,
    )


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer_detail(
    customer_id: str,
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """
    Lấy thông tin chi tiết một khách hàng / đại lý.
    - Sales Rep truy cập đại lý ngoài phạm vi phụ trách: trả 404 (chống IDOR).
    """
    return customer_service.get_customer_by_id(
        db=db,
        customer_id=customer_id,
        current_user=current_user,
    )


@router.get("/{customer_id}/applied-price-list")
def get_customer_applied_price_list(
    customer_id: str,
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """Liên kết nhóm khách hàng với bảng giá áp dụng cho đại lý (SCRUM-434)."""
    return customer_service.get_applied_price_list_for_customer(
        db=db,
        customer_id=customer_id,
        current_user=current_user,
    )


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_customer(
    customer_in: CustomerCreate,
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """
    Thêm mới một khách hàng hoặc đại lý.
    - Tự động khởi tạo hồ sơ công nợ và phân công.
    - Nếu Sales Rep tạo: Tự động gán cho chính họ trong cùng transaction.
    """
    return customer_service.create_customer(
        db=db,
        customer_in=customer_in,
        current_user=current_user,
    )


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: str,
    customer_in: CustomerUpdate,
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật thông tin khách hàng / đại lý."""
    return customer_service.update_customer(
        db=db,
        customer_id=customer_id,
        customer_in=customer_in,
        current_user=current_user,
    )


@router.patch("/{customer_id}/status", response_model=CustomerResponse)
def update_customer_status(
    customer_id: str,
    status_in: CustomerStatusUpdate,
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """Chuyển trạng thái giao dịch đại lý: active <-> inactive."""
    return customer_service.update_customer_status(
        db=db,
        customer_id=customer_id,
        status_in=status_in,
        current_user=current_user,
    )


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: str,
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """Xóa một đại lý (Chặn 400 nếu đã phát sinh giao dịch/đơn hàng - SCRUM-433)."""
    customer_service.delete_customer(
        db=db,
        customer_id=customer_id,
        current_user=current_user,
    )
    return {"message": f"Đã xóa đại lý '{customer_id}' thành công."}
