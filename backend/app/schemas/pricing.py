from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class LinePricingLookupRequest(BaseModel):
    """Yêu cầu tra cứu giá áp dụng, giá sàn và chiết khấu cho một dòng hàng (SCRUM-488)."""
    customer_id: str = Field(..., description="ID hoặc Mã đại lý / khách hàng")
    product_id: Optional[str] = Field(None, description="ID sản phẩm")
    sku: Optional[str] = Field(None, description="Mã SKU sản phẩm")
    quantity: int = Field(1, ge=1, description="Số lượng đặt mua")
    custom_price: Optional[float] = Field(None, ge=0, description="Đơn giá sửa thủ công (nếu có)")


class LinePricingLookupResponse(BaseModel):
    """Kết quả tra cứu giá áp dụng, giá sàn và chiết khấu dòng hàng (SCRUM-488..SCRUM-492)."""
    success: bool = True
    has_effective_price_list: bool = True
    price_list_id: Optional[int] = None
    price_list_code: Optional[str] = None
    price_list_name: Optional[str] = None
    customer_id: str
    customer_group: str
    customer_group_label: str
    product_id: str
    sku: str
    product_name: str
    unit: str = "cái"

    # Giá từ bảng giá hiệu lực
    listed_price: float = Field(..., description="Giá niêm yết")
    default_price: float = Field(..., description="Giá bán mặc định áp dụng theo nhóm khách hàng")
    floor_price: float = Field(..., description="Giá sàn tối thiểu cho phép bán")

    # Giá thực tế áp dụng (mặc định hoặc do sửa thủ công)
    applied_unit_price: float = Field(..., description="Đơn giá trước chiết khấu (đã xét sửa thủ công)")
    is_manual_price: bool = Field(False, description="True nếu người dùng sửa giá thủ công")

    # Đánh giá giá sàn và trạng thái cần duyệt (SCRUM-490, SCRUM-495)
    is_below_floor: bool = Field(False, description="True nếu giá bán thấp hơn giá sàn")
    requires_approval: bool = Field(False, description="Cờ yêu cầu phê duyệt đơn hàng")
    approval_reason: Optional[str] = Field(None, description="Lý do cần duyệt (nếu dưới giá sàn)")

    # Chiết khấu sản lượng theo số lượng (SCRUM-491)
    quantity: int = 1
    discount_rate: float = Field(0.0, description="Tỷ lệ % chiết khấu sản lượng")
    discount_amount_per_unit: float = Field(0.0, description="Tiền chiết khấu trên mỗi đơn vị sản phẩm")
    total_discount: float = Field(0.0, description="Tổng số tiền chiết khấu của dòng hàng")
    final_unit_price: float = Field(..., description="Đơn giá thực tế sau chiết khấu")
    line_total: float = Field(..., description="Thành tiền dòng hàng sau chiết khấu")
    applied_discount_policy_id: Optional[int] = None
    applied_discount_policy_name: Optional[str] = None

    message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OrderPricingValidateItem(BaseModel):
    product_id: Optional[str] = None
    sku: Optional[str] = None
    quantity: int = Field(1, ge=1)
    price: Optional[float] = None
    unit: Optional[str] = "cái"


class OrderPricingValidateRequest(BaseModel):
    """Kiểm tra toàn bộ giỏ hàng / danh sách dòng hàng của đơn."""
    customer_id: str
    items: List[OrderPricingValidateItem] = Field(..., min_length=1)
    price_list_id: Optional[int] = None


class OrderPricingValidateResponse(BaseModel):
    """Kết quả kiểm tra giỏ hàng: bảng giá hiệu lực, giá sàn, chiết khấu và chặn nếu thiếu giá."""
    valid: bool = True
    customer_id: str
    customer_group: str
    customer_group_label: str
    price_list_id: Optional[int] = None
    price_list_name: Optional[str] = None
    subtotal: float = 0.0
    discount: float = 0.0
    total: float = 0.0
    requires_approval: bool = False
    approval_reasons: List[str] = []
    blocking_errors: List[str] = []
    items: List[LinePricingLookupResponse] = []

    model_config = ConfigDict(from_attributes=True)
