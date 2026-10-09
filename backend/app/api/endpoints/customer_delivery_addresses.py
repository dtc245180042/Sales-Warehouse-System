from typing import List, Optional
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.customer_delivery_address import (
    DeliveryAddressCreate,
    DeliveryAddressUpdate,
    DeliveryAddressResponse,
)
from app.services import customer_delivery_address_service
from app.services.customer_assignment_service import check_sales_rep_customer_scope

router = APIRouter(tags=["Điểm giao hàng đại lý (S3-04)"])


@router.get(
    "/customers/{customer_id}/delivery-addresses",
    response_model=List[DeliveryAddressResponse],
    summary="Lấy danh sách điểm giao hàng của đại lý"
)
def get_customer_delivery_addresses(
    customer_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Lấy toàn bộ các điểm giao hàng đã khai báo của đại lý/khách hàng."""
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    return customer_delivery_address_service.get_delivery_addresses(db=db, customer_id=customer_id)


@router.post(
    "/customers/{customer_id}/delivery-addresses",
    response_model=DeliveryAddressResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm điểm giao hàng mới cho đại lý"
)
def create_customer_delivery_address(
    customer_id: str,
    address_in: DeliveryAddressCreate,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Khai báo một điểm giao hàng mới (kho, chi nhánh, công trình) cho đại lý."""
    check_sales_rep_customer_scope(db=db, customer_id=customer_id, current_user=current_user)
    return customer_delivery_address_service.create_delivery_address(
        db=db,
        customer_id=customer_id,
        address_in=address_in,
    )


@router.get(
    "/delivery-addresses/{address_id}",
    response_model=DeliveryAddressResponse,
    summary="Lấy thông tin chi tiết một điểm giao hàng"
)
def get_delivery_address_detail(
    address_id: int,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Xem chi tiết một điểm giao hàng theo ID."""
    addr = customer_delivery_address_service.get_address_by_id(db=db, address_id=address_id)
    check_sales_rep_customer_scope(db=db, customer_id=addr.customer_id, current_user=current_user)
    return addr


@router.put(
    "/delivery-addresses/{address_id}",
    response_model=DeliveryAddressResponse,
    summary="Cập nhật thông tin điểm giao hàng"
)
def update_delivery_address(
    address_id: int,
    address_in: DeliveryAddressUpdate,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Chỉnh sửa thông tin địa chỉ, người nhận, số điện thoại, ghi chú đường đi."""
    addr = customer_delivery_address_service.get_address_by_id(db=db, address_id=address_id)
    check_sales_rep_customer_scope(db=db, customer_id=addr.customer_id, current_user=current_user)
    return customer_delivery_address_service.update_delivery_address(
        db=db,
        address_id=address_id,
        address_in=address_in,
    )


@router.patch(
    "/delivery-addresses/{address_id}/set-default",
    response_model=DeliveryAddressResponse,
    summary="Đặt điểm giao hàng làm mặc định"
)
def set_default_delivery_address(
    address_id: int,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Đặt điểm này làm mặc định, các điểm khác của cùng đại lý sẽ tự động chuyển về không mặc định."""
    addr = customer_delivery_address_service.get_address_by_id(db=db, address_id=address_id)
    check_sales_rep_customer_scope(db=db, customer_id=addr.customer_id, current_user=current_user)
    return customer_delivery_address_service.set_default_address(
        db=db,
        address_id=address_id,
    )


@router.delete(
    "/delivery-addresses/{address_id}",
    summary="Xóa điểm giao hàng"
)
def delete_delivery_address(
    address_id: int,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """Xóa một điểm giao hàng. Nếu đang là mặc định, điểm còn lại sẽ tự động trở thành mặc định."""
    addr = customer_delivery_address_service.get_address_by_id(db=db, address_id=address_id)
    check_sales_rep_customer_scope(db=db, customer_id=addr.customer_id, current_user=current_user)
    customer_delivery_address_service.delete_delivery_address(
        db=db,
        address_id=address_id,
    )
    return {"message": f"Đã xóa điểm giao hàng #{address_id} thành công."}
