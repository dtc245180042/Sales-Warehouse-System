from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class SkuAvailabilityResponse(BaseModel):
    """Phản hồi thông tin tồn khả dụng của từng SKU theo kho phục vụ đại lý (SCRUM-505, SCRUM-507)."""
    model_config = ConfigDict(from_attributes=True)

    product_id: str
    sku: str
    product_name: str
    unit: str = "cái"
    warehouse_name: str
    warehouse_code: str
    physical_stock: int = Field(0, description="Tồn thực tế hiện có trong kho")
    reserved_stock: int = Field(0, description="Tồn đang giữ chỗ cho các đơn hàng khác")
    available_stock: int = Field(0, description="Tồn khả dụng = Tồn thực tế - Tồn giữ chỗ")
    min_stock: int = Field(0, description="Định mức tồn tối thiểu an toàn")
    max_orderable_quantity: int = Field(0, description="Số lượng tối đa còn có thể đặt")
    is_low_stock: bool = False
    is_out_of_stock: bool = False


class CheckLineItemAvailabilityRequest(BaseModel):
    """Mặt hàng yêu cầu kiểm tra tồn khả dụng trong đơn."""
    product_id: Optional[str] = None
    sku: Optional[str] = None
    quantity: int = Field(1, ge=1, description="Số lượng đặt")


class CheckOrderAvailabilityRequest(BaseModel):
    """Yêu cầu kiểm tra tồn khả dụng cho toàn bộ danh sách mặt hàng của đơn (SCRUM-506, SCRUM-507)."""
    customer_id: str = Field(..., description="Mã đại lý / khách hàng để tra cứu kho phục vụ")
    warehouse_name: Optional[str] = Field(None, description="Kho cụ thể (nếu muốn chỉ định)")
    items: List[CheckLineItemAvailabilityRequest] = Field(..., description="Danh sách mặt hàng cần kiểm tra")


class LineItemAvailabilityResult(BaseModel):
    """Kết quả kiểm tra tồn khả dụng cho từng dòng mặt hàng (SCRUM-506, SCRUM-507)."""
    product_id: str
    sku: str
    product_name: str
    unit: str = "cái"
    requested_quantity: int
    physical_stock: int
    reserved_stock: int
    available_stock: int
    max_orderable_quantity: int
    warehouse_name: str
    warehouse_code: str
    is_available: bool = Field(True, description="True nếu requested_quantity <= available_stock")
    warning_message: Optional[str] = Field(None, description="Thông báo cảnh báo hoặc gợi ý số lượng tối đa")


class CheckOrderAvailabilityResponse(BaseModel):
    """Kết quả kiểm tra toàn bộ đơn hàng (SCRUM-506, SCRUM-507)."""
    customer_id: str
    warehouse_name: str
    warehouse_code: str
    all_items_available: bool
    items: List[LineItemAvailabilityResult]
    summary_message: Optional[str] = None


class CustomerWarehouseProfileCreate(BaseModel):
    """Dữ liệu khai báo hoặc cập nhật kho phục vụ mặc định cho đại lý (SCRUM-505)."""
    customer_id: str
    warehouse_name: str
    warehouse_code: str
    is_default: bool = True
    notes: Optional[str] = None


class CustomerWarehouseProfileResponse(BaseModel):
    """Thông tin kho phục vụ của đại lý."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: str
    warehouse_name: str
    warehouse_code: str
    is_default: bool
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class StockReservationResponse(BaseModel):
    """Thông tin bản ghi giữ chỗ tồn kho (SCRUM-504)."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: str
    order_code: Optional[str] = None
    product_id: str
    sku: Optional[str] = None
    warehouse: str
    reserved_quantity: int
    status: str
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
