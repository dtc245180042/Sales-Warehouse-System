from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ProductBase(BaseModel):
    """Schema cơ bản của sản phẩm."""
    sku: str = Field(..., description="Mã định danh sản phẩm (SKU)")
    name: str = Field(..., description="Tên sản phẩm")
    unit: str = Field(..., description="Đơn vị tính (Lon, Chai, Hộp, v.v.)")
    pack: Optional[str] = Field(None, description="Quy cách đóng gói")
    selling_price: float = Field(..., description="Giá bán niêm yết (VNĐ)")
    status: str = Field("Có sẵn", description="Trạng thái kinh doanh")
    category: Optional[str] = Field(None, description="Danh mục sản phẩm")


class ProductPublicResponse(ProductBase):
    """Schema dành cho các vai trò thông thường (không có giá vốn và biên lợi nhuận)."""
    pass


class ProductManagerResponse(ProductBase):
    """Schema dành riêng cho Quản lý kinh doanh (Sales Manager) và Admin (SCRUM-202)."""
    cost_price: float = Field(..., description="Giá vốn nhập hàng (VNĐ)")
    profit_margin: str = Field(..., description="Biên lợi nhuận tính theo tỷ lệ phần trăm")


class ProductListResponse(BaseModel):
    """Schema phản hồi danh sách sản phẩm có phân quyền hiển thị tài chính."""
    total: int = Field(..., description="Tổng số sản phẩm")
    can_view_margins: bool = Field(
        ...,
        description="Cờ cho biết người dùng hiện tại có quyền xem giá vốn và biên lợi nhuận hay không (SCRUM-202)"
    )
    items: List[Dict[str, Any]] = Field(..., description="Danh sách sản phẩm sau khi lọc theo quyền")
