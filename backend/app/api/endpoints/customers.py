from typing import List, Optional, Union
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    CustomerPaginationResponse,
    CustomerFilterOptions,
)
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["Khách hàng & Đại lý (SCRUM-229)"])


@router.get(
    "/filter-options",
    response_model=CustomerFilterOptions,
    summary="Lấy danh sách các tùy chọn lọc đại lý (SCRUM-229)"
)
def get_filter_options(db: Session = Depends(lay_phien_db)):
    """Trả về danh sách các giá trị khu vực, nhóm khách hàng, người phụ trách, trạng thái phục vụ bộ lọc."""
    return customer_service.get_filter_options(db=db)


@router.get("", response_model=Union[CustomerPaginationResponse, List[CustomerResponse]])
@router.get("/", response_model=Union[CustomerPaginationResponse, List[CustomerResponse]], include_in_schema=False)
def get_customers(
    response: Response,
    search: Optional[str] = Query(None, description="Tìm nhanh theo mã, tên hoặc số điện thoại"),
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm: TIER_1, TIER_2, WHOLESALE, VIP, RETAIL"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực: Miền Bắc, Miền Trung, Miền Nam, Tây Nguyên"),
    assigned_sales_rep: Optional[str] = Query(None, description="Lọc theo người phụ trách"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: active, inactive, locked"),
    page: Optional[int] = Query(None, ge=1, description="Số trang phân trang"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Kích thước trang"),
    db: Session = Depends(lay_phien_db),
):
    """
    Lấy danh sách khách hàng và đại lý (SCRUM-229):
    - Tìm kiếm nhanh theo mã đại lý, tên hoặc số điện thoại.
    - Lọc theo khu vực địa bàn, nhóm khách hàng, nhân viên kinh doanh phụ trách, trạng thái.
    - Hỗ trợ phân trang khi truyền tham số `page` và `page_size`.
    """
    result = customer_service.get_all_customers(
        db=db,
        search=search,
        customer_group=customer_group,
        region=region,
        assigned_sales_rep=assigned_sales_rep,
        status=status,
        page=page,
        page_size=page_size,
    )
    if isinstance(result, dict):
        response.headers["X-Total-Count"] = str(result["total"])
        return result
    response.headers["X-Total-Count"] = str(len(result))
    return result


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
