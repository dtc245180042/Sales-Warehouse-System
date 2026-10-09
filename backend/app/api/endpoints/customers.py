from typing import List, Optional, Union
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    CustomerStatusUpdate,
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
    search: Optional[str] = Query(None, description="Tìm nhanh theo mã, tên, MST hoặc số điện thoại"),
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm: TIER_1, TIER_2, WHOLESALE, VIP, RETAIL"),
    assigned_staff_id: Optional[str] = Query(None, description="Lọc theo nhân viên phụ trách hoặc 'unassigned'"),
    assigned_sales_rep: Optional[str] = Query(None, description="Lọc theo người phụ trách"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực/địa bàn: Miền Bắc, Miền Trung, Miền Nam, Tây Nguyên"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: active, inactive, locked"),
    page: Optional[int] = Query(None, ge=1, description="Số trang phân trang"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Kích thước trang"),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """
    Lấy danh sách khách hàng và đại lý (S3-03, SC-228, SCRUM-229):
    - Tìm kiếm nhanh theo mã đại lý, tên, MST hoặc số điện thoại.
    - Lọc theo khu vực địa bàn, nhóm khách hàng, nhân viên kinh doanh phụ trách, trạng thái.
    - Hỗ trợ phân trang khi truyền tham số `page` và `page_size`.
    - Sales Rep: Chỉ xem các đại lý mình phụ trách (lọc ở tầng query).
    - Manager/Admin: Xem 100% đại lý và hỗ trợ lọc theo nhân viên/khu vực/trạng thái.
    """
    result = customer_service.get_all_customers(
        db=db,
        search=search,
        customer_group=customer_group,
        assigned_staff_id=assigned_staff_id,
        assigned_sales_rep=assigned_sales_rep,
        region=region,
        status_filter=status,
        page=page,
        page_size=page_size,
        current_user=current_user,
    )
    if isinstance(result, dict):
        response.headers["X-Total-Count"] = str(result["total"])
        return result
    response.headers["X-Total-Count"] = str(len(result))
    return result


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
