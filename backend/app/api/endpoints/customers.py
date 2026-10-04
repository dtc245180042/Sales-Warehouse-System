from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["Khách hàng & Đại lý"])


@router.get("", response_model=List[CustomerResponse])
@router.get("/", response_model=List[CustomerResponse], include_in_schema=False)
def get_customers(
    search: Optional[str] = Query(None, description="Tìm theo tên, mã hoặc số điện thoại"),
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm: TIER_1, TIER_2, WHOLESALE, VIP, RETAIL"),
    db: Session = Depends(lay_phien_db),
):
    """Lấy danh sách khách hàng và đại lý."""
    return customer_service.get_all_customers(db=db, search=search, customer_group=customer_group)


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer_detail(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Lấy thông tin chi tiết một khách hàng."""
    return customer_service.get_customer_by_id(db=db, customer_id=customer_id)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_customer(
    customer_in: CustomerCreate,
    db: Session = Depends(lay_phien_db),
):
    """Thêm mới một khách hàng hoặc đại lý."""
    return customer_service.create_customer(db=db, customer_in=customer_in)


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: str,
    customer_in: CustomerUpdate,
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật thông tin khách hàng."""
    return customer_service.update_customer(db=db, customer_id=customer_id, customer_in=customer_in)


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
):
    """Xóa một khách hàng."""
    customer_service.delete_customer(db=db, customer_id=customer_id)
    return {"message": f"Đã xóa khách hàng '{customer_id}' thành công."}
