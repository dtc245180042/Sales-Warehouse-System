from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class CategoryBase(BaseModel):
    """Schema cơ bản của nhóm hàng."""
    code: str = Field(..., min_length=2, max_length=50, description="Mã nhóm hàng viết hoa không dấu, ví dụ: DIEN_TU")
    name: str = Field(..., min_length=2, max_length=100, description="Tên nhóm hàng, ví dụ: Thiết bị điện tử")
    description: Optional[str] = Field(None, max_length=255, description="Mô tả chi tiết")
    parent_id: Optional[int] = Field(None, description="ID nhóm cha, để trống nếu là nhóm gốc (Level 1)")
    is_active: bool = Field(True, description="Trạng thái kích hoạt")


class CategoryCreate(CategoryBase):
    """Schema tạo mới nhóm hàng."""
    pass


class CategoryUpdate(BaseModel):
    """Schema cập nhật nhóm hàng."""
    code: Optional[str] = Field(None, min_length=2, max_length=50)
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryResponse(CategoryBase):
    """Schema trả về thông tin nhóm hàng."""
    id: int
    level: int = Field(1, description="Cấp độ phân tầng (1: Ngành hàng, 2: Nhóm hàng, 3: Tiểu nhóm...)")
    product_count: int = Field(0, description="Số lượng sản phẩm trực thuộc nhóm")
    children_count: int = Field(0, description="Số lượng nhóm con trực thuộc")
    total_product_count: int = Field(0, description="Tổng số lượng sản phẩm bao gồm cả các nhánh con dồn cấp (Roll-up)")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CategoryTreeResponse(CategoryResponse):
    """Schema cấu trúc cây nhóm hàng nhiều cấp (SCRUM-214)."""
    children: List["CategoryTreeResponse"] = Field(default_factory=list, description="Danh sách nhóm con cấp dưới")


CategoryTreeResponse.model_rebuild()


# -------------------------------------------------------------
# SCHEMAS SẢN PHẨM & CHUYỂN NHÓM SẢN PHẨM
# -------------------------------------------------------------

class ProductBase(BaseModel):
    sku: str = Field(..., min_length=2, max_length=50, description="Mã sản phẩm / SKU")
    name: str = Field(..., min_length=2, max_length=200, description="Tên sản phẩm")
    category_id: Optional[int] = Field(None, description="ID nhóm hàng quản lý")
    price: float = Field(0.0, ge=0, description="Giá bán")
    unit: str = Field("cái", max_length=20, description="Đơn vị tính")
    description: Optional[str] = None
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductResponse(ProductBase):
    id: int
    category_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TransferProductsRequest(BaseModel):
    """Yêu cầu chuyển sản phẩm giữa các nhóm hàng (SCRUM-214)."""
    source_category_id: int = Field(..., description="ID nhóm hàng nguồn hiện tại")
    target_category_id: int = Field(..., description="ID nhóm hàng đích cần chuyển đến")
    product_ids: List[int] = Field(..., min_length=1, description="Danh sách ID sản phẩm cần chuyển nhóm")


class TransferProductsResponse(BaseModel):
    """Kết quả chuyển sản phẩm giữa các nhóm hàng."""
    success: bool
    transferred_count: int
    message: str
    target_category_name: str
