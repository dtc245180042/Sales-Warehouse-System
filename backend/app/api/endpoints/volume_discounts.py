from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.models.auth import User, UserRole
from app.core.dependencies import lay_nguoi_dung_hien_tai, lay_nguoi_dung_tuy_chon
from app.schemas.volume_discount import (
    VolumeDiscountPolicyCreate,
    VolumeDiscountPolicyUpdate,
    VolumeDiscountPolicyResponse,
    VolumeDiscountCalculateRequest,
    VolumeDiscountCalculateResponse,
)
from app.services import volume_discount_service

router = APIRouter(prefix="/volume-discounts", tags=["Chính sách chiết khấu sản lượng"])


@router.post("", response_model=VolumeDiscountPolicyResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=VolumeDiscountPolicyResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_policy(
    policy_in: VolumeDiscountPolicyCreate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Khai báo chính sách chiết khấu theo sản lượng mới (Chỉ Quản lý kinh doanh hoặc Admin)."""
    return volume_discount_service.create_volume_discount_policy(
        db=db,
        policy_in=policy_in,
        current_user=current_user
    )


@router.get("", response_model=List[VolumeDiscountPolicyResponse])
@router.get("/", response_model=List[VolumeDiscountPolicyResponse], include_in_schema=False)
def get_policies(
    is_active: Optional[bool] = Query(None, description="Lọc theo trạng thái hoạt động"),
    applied_scope: Optional[str] = Query(None, description="Lọc theo phạm vi: ALL_PRODUCTS, CATEGORY, PRODUCT"),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """Lấy danh sách các chính sách chiết khấu theo sản lượng."""
    return volume_discount_service.get_all_policies(
        db=db,
        is_active=is_active,
        applied_scope=applied_scope
    )


@router.get("/{policy_id}", response_model=VolumeDiscountPolicyResponse)
def get_policy_detail(
    policy_id: int,
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """Xem chi tiết một chính sách chiết khấu và các bậc thang số lượng."""
    return volume_discount_service.get_policy_by_id(db=db, policy_id=policy_id)


@router.put("/{policy_id}", response_model=VolumeDiscountPolicyResponse)
def update_policy(
    policy_id: int,
    policy_in: VolumeDiscountPolicyUpdate,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Cập nhật chính sách chiết khấu và danh sách bậc thang số lượng."""
    return volume_discount_service.update_volume_discount_policy(
        db=db,
        policy_id=policy_id,
        policy_in=policy_in,
        current_user=current_user
    )


@router.delete("/{policy_id}")
def delete_policy(
    policy_id: int,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xóa chính sách chiết khấu (Chặn xóa nếu đã từng áp dụng vào đơn hàng)."""
    volume_discount_service.delete_volume_discount_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user
    )
    return {"message": f"Đã xóa chính sách chiết khấu '{policy_id}' thành công."}


@router.post("/calculate", response_model=VolumeDiscountCalculateResponse)
def calculate_discount(
    calc_in: VolumeDiscountCalculateRequest,
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
    db: Session = Depends(lay_phien_db),
):
    """Tính thử chiết khấu dự kiến khi đặt số lượng sản phẩm cho đại lý (SCRUM-483)."""
    return volume_discount_service.calculate_volume_discount(
        db=db,
        product_id=calc_in.product_id,
        quantity=calc_in.quantity,
        customer_id=calc_in.customer_id,
        current_user=current_user
    )
