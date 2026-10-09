from datetime import datetime
from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class VolumeDiscountTierBase(BaseModel):
    min_quantity: int = Field(..., gt=0, description="Số lượng tối thiểu phải lớn hơn 0")
    max_quantity: Optional[int] = Field(None, description="Số lượng tối đa (None nghĩa là không giới hạn)")
    discount_type: str = Field("PERCENT", description="Loại chiết khấu: PERCENT hoặc FIXED_AMOUNT")
    discount_value: Decimal = Field(..., ge=0, description="Giá trị chiết khấu: % (0-100) hoặc số tiền VND (>0)")

    @field_validator("discount_type")
    def validate_discount_type(cls, v):
        v = v.upper().strip()
        if v not in ("PERCENT", "FIXED_AMOUNT"):
            raise ValueError("Loại chiết khấu chỉ chấp nhận 'PERCENT' hoặc 'FIXED_AMOUNT'")
        return v

    @field_validator("discount_value")
    def validate_discount_value(cls, v, info):
        # Kiểm tra nếu là PERCENT thì <= 100
        disc_type = info.data.get("discount_type", "PERCENT")
        if disc_type == "PERCENT" and v > Decimal("100.00"):
            raise ValueError("Tỷ lệ chiết khấu phần trăm không được vượt quá 100%")
        if v < 0:
            raise ValueError("Giá trị chiết khấu không được âm")
        return v


class VolumeDiscountTierCreate(VolumeDiscountTierBase):
    pass


class VolumeDiscountTierResponse(VolumeDiscountTierBase):
    id: int
    policy_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VolumeDiscountPolicyBase(BaseModel):
    code: str = Field(..., min_length=2, max_length=50, description="Mã chính sách chiết khấu duy nhất")
    name: str = Field(..., min_length=2, max_length=255, description="Tên chính sách chiết khấu")
    description: Optional[str] = None
    applied_scope: str = Field("ALL_PRODUCTS", description="Phạm vi: ALL_PRODUCTS, CATEGORY, PRODUCT")
    target_id: Optional[str] = None
    customer_group: Optional[str] = Field("ALL", description="Nhóm khách hàng: ALL hoặc TIER_1, TIER_2, WHOLESALE, RETAIL, VIP")
    valid_from: datetime = Field(..., description="Thời điểm bắt đầu áp dụng")
    valid_to: Optional[datetime] = Field(None, description="Thời điểm kết thúc áp dụng")
    is_active: bool = True

    @field_validator("code")
    def normalize_code(cls, v):
        v = v.strip().upper()
        if not v:
            raise ValueError("Mã chính sách chiết khấu không được để trống")
        return v

    @field_validator("applied_scope")
    def validate_scope(cls, v):
        v = v.strip().upper()
        if v not in ("ALL_PRODUCTS", "CATEGORY", "PRODUCT"):
            raise ValueError("Phạm vi áp dụng chỉ chấp nhận 'ALL_PRODUCTS', 'CATEGORY', hoặc 'PRODUCT'")
        return v


class VolumeDiscountPolicyCreate(VolumeDiscountPolicyBase):
    tiers: List[VolumeDiscountTierCreate] = Field(default_factory=list, description="Danh sách các bậc chiết khấu")


class VolumeDiscountPolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    applied_scope: Optional[str] = None
    target_id: Optional[str] = None
    customer_group: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    is_active: Optional[bool] = None
    tiers: Optional[List[VolumeDiscountTierCreate]] = None


class VolumeDiscountPolicyResponse(VolumeDiscountPolicyBase):
    id: int
    applied_count: int = 0
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    tiers: List[VolumeDiscountTierResponse] = []

    class Config:
        from_attributes = True


class VolumeDiscountCalculateRequest(BaseModel):
    product_id: str = Field(..., description="ID sản phẩm")
    quantity: int = Field(..., gt=0, description="Số lượng đặt mua phải lớn hơn 0")
    customer_id: Optional[str] = Field(None, description="ID đại lý/khách hàng (để tra cứu nhóm khách)")


class VolumeDiscountCalculateResponse(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    original_unit_price: int
    discount_rate: Decimal = Decimal("0.00")
    discount_amount_per_unit: int = 0
    total_discount: int = 0
    final_unit_price: int
    total_amount: int
    applied_policy_id: Optional[int] = None
    applied_discount_policy_name: Optional[str] = None
    applied_tier_min: Optional[int] = None
