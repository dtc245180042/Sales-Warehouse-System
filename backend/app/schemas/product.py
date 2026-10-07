import re
from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.models.product import ProductStatus


SKU_REGEX = re.compile(r"^[A-Za-z0-9_-]{2,50}$")


def validate_and_normalize_sku(value: Optional[str]) -> Optional[str]:
    """Kiểm tra và chuẩn hóa mã SKU (SCRUM-377):
    - Tự động cắt bỏ khoảng trắng đầu/cuối.
    - Chuyển toàn bộ thành chữ in HOA.
    - Kiểm tra độ dài từ 2 đến 50 ký tự, chỉ gồm chữ cái, chữ số, gạch ngang và gạch dưới.
    """
    if value is None:
        return value
    cleaned = value.strip().upper()
    if not cleaned:
        raise ValueError("Mã SKU không được để trống.")
    if not SKU_REGEX.match(cleaned):
        raise ValueError("Mã SKU chỉ được chứa chữ cái, số, dấu '-' hoặc '_', độ dài từ 2 đến 50 ký tự.")
    return cleaned


def validate_not_blank(value: Optional[str], field_name: str) -> Optional[str]:
    """Kiểm tra chuỗi không được chỉ chứa khoảng trắng."""
    if value is None:
        return value
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_name} không được để trống.")
    return cleaned


class ProductBase(BaseModel):
    """Thông tin cơ bản của sản phẩm danh mục (SCRUM-220 & SCRUM-214)."""
    sku: str = Field(..., description="Mã SKU duy nhất của sản phẩm", examples=["SP-VINAMILK-01"])
    name: str = Field(..., max_length=255, description="Tên gọi sản phẩm chuẩn hóa", examples=["Sữa tươi Vinamilk 100% 1L"])
    category: str = Field(..., max_length=100, description="Nhóm hàng danh mục", examples=["Sữa & Đồ uống"])
    category_id: Optional[int] = Field(None, description="ID nhóm hàng trong Cây phân cấp (SCRUM-214)")
    unit: str = Field(..., max_length=50, description="Đơn vị tính cơ sở", examples=["Hộp"])
    packaging_spec: Optional[str] = Field(None, max_length=255, description="Quy cách đóng gói", examples=["12 hộp/thùng"])
    image_url: Optional[str] = Field(None, max_length=500, description="Đường dẫn ảnh sản phẩm")
    barcode: Optional[str] = Field(None, max_length=50, description="Mã vạch sản phẩm")
    supplier_id: Optional[str] = Field(None, max_length=50, description="Mã nhà cung cấp")
    supplier_name: Optional[str] = Field(None, max_length=255, description="Tên nhà cung cấp")
    description: Optional[str] = Field(None, max_length=1000, description="Mô tả sản phẩm")

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "packaging_specification" in data and not data.get("packaging_spec"):
                data["packaging_spec"] = data["packaging_specification"]
            if "image" in data and not data.get("image_url"):
                data["image_url"] = data["image"]
            if "sale_price" in data and not data.get("price"):
                data["price"] = data["sale_price"]
        return data

    @field_validator("sku")
    @classmethod
    def check_sku(cls, v: str) -> str:
        res = validate_and_normalize_sku(v)
        if not res:
            raise ValueError("Mã SKU không được để trống.")
        return res

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        res = validate_not_blank(v, "Tên sản phẩm")
        if not res:
            raise ValueError("Tên sản phẩm không được để trống.")
        return res

    @field_validator("category")
    @classmethod
    def check_category(cls, v: str) -> str:
        res = validate_not_blank(v, "Nhóm hàng")
        if not res:
            raise ValueError("Nhóm hàng không được để trống.")
        return res

    @field_validator("unit")
    @classmethod
    def check_unit(cls, v: str) -> str:
        res = validate_not_blank(v, "Đơn vị tính cơ sở")
        if not res:
            raise ValueError("Đơn vị tính không được để trống.")
        return res


class ProductCreateRequest(ProductBase):
    """Schema tạo mới sản phẩm (SCRUM-376)."""
    cost_price: Optional[float] = Field(0.0, ge=0, description="Giá vốn (Chỉ Quản lý kinh doanh xem và sửa)")
    price: Optional[float] = Field(0.0, ge=0, description="Giá bán niêm yết")
    sale_price: Optional[float] = Field(None, ge=0, description="Giá bán niêm yết (alias)")
    stock: Optional[int] = Field(0, ge=0, description="Số lượng tồn kho ban đầu")
    min_stock: Optional[int] = Field(0, ge=0, description="Hạn mức cảnh báo tồn tối thiểu")
    status: Optional[str] = Field(ProductStatus.ACTIVE, description="Trạng thái kinh doanh")

    @field_validator("status", mode="before")
    @classmethod
    def check_status(cls, v: Optional[str]) -> str:
        if not v:
            return ProductStatus.ACTIVE
        v_upper = str(v).strip().upper()
        if v_upper in (ProductStatus.ACTIVE, ProductStatus.INACTIVE):
            return v_upper
        if v_upper in ("LOW_STOCK", "OUT_OF_STOCK"):
            return ProductStatus.ACTIVE
        return ProductStatus.ACTIVE


class ProductUpdateRequest(BaseModel):
    """Schema cập nhật sản phẩm (SCRUM-376, SCRUM-377, SCRUM-378)."""
    sku: Optional[str] = Field(None, description="Mã SKU mới nếu cập nhật")
    name: Optional[str] = Field(None, max_length=255, description="Tên sản phẩm")
    category: Optional[str] = Field(None, max_length=100, description="Nhóm hàng")
    category_id: Optional[int] = Field(None, description="ID nhóm hàng trong Cây phân cấp (SCRUM-214)")
    unit: Optional[str] = Field(None, max_length=50, description="Đơn vị tính cơ sở")
    packaging_spec: Optional[str] = Field(None, max_length=255, description="Quy cách đóng gói")
    cost_price: Optional[float] = Field(None, ge=0, description="Giá vốn sản phẩm")
    price: Optional[float] = Field(None, ge=0, description="Giá bán niêm yết")
    sale_price: Optional[float] = Field(None, ge=0, description="Giá bán niêm yết (alias)")
    description: Optional[str] = Field(None, max_length=1000, description="Mô tả sản phẩm")
    stock: Optional[int] = Field(None, ge=0, description="Số lượng tồn kho")
    min_stock: Optional[int] = Field(None, ge=0, description="Định mức tồn tối thiểu")
    barcode: Optional[str] = Field(None, max_length=50, description="Mã vạch")
    image_url: Optional[str] = Field(None, max_length=500, description="Đường dẫn ảnh sản phẩm")
    status: Optional[str] = Field(None, description="Trạng thái: ACTIVE hoặc INACTIVE")

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "packaging_specification" in data and not data.get("packaging_spec"):
                data["packaging_spec"] = data["packaging_specification"]
            if "image" in data and not data.get("image_url"):
                data["image_url"] = data["image"]
            if "sale_price" in data and not data.get("price"):
                data["price"] = data["sale_price"]
        return data

    @field_validator("sku")
    @classmethod
    def check_sku(cls, v: Optional[str]) -> Optional[str]:
        return validate_and_normalize_sku(v)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: Optional[str]) -> Optional[str]:
        return validate_not_blank(v, "Tên sản phẩm")

    @field_validator("category")
    @classmethod
    def check_category(cls, v: Optional[str]) -> Optional[str]:
        return validate_not_blank(v, "Nhóm hàng")

    @field_validator("unit")
    @classmethod
    def check_unit(cls, v: Optional[str]) -> Optional[str]:
        return validate_not_blank(v, "Đơn vị tính cơ sở")

    @field_validator("status")
    @classmethod
    def check_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in (ProductStatus.ACTIVE, ProductStatus.INACTIVE):
            raise ValueError("Trạng thái chỉ có thể là ACTIVE hoặc INACTIVE.")
        return v


class ProductStatusUpdateRequest(BaseModel):
    """Schema cập nhật trạng thái ngừng kinh doanh (SCRUM-375)."""
    status: str = Field(..., description="Trạng thái mới: ACTIVE hoặc INACTIVE")

    @field_validator("status")
    @classmethod
    def check_status(cls, v: str) -> str:
        if v not in (ProductStatus.ACTIVE, ProductStatus.INACTIVE):
            raise ValueError("Trạng thái chỉ có thể là ACTIVE hoặc INACTIVE.")
        return v


class ProductResponse(BaseModel):
    """Schema phản hồi thông tin sản phẩm (SCRUM-220).
    Lưu ý: `cost_price` được bảo mật theo vai trò (SCRUM-378).
    """
    id: int
    sku: str
    name: str
    category: str
    category_id: Optional[int] = None
    unit: str
    packaging_spec: Optional[str] = None
    cost_price: Optional[float] = None
    price: Optional[float] = 0.0
    sale_price: Optional[float] = 0.0
    salePrice: Optional[float] = 0.0
    stock: Optional[int] = 100
    min_stock: Optional[int] = 10
    image: Optional[str] = None
    image_url: Optional[str] = None
    status: str
    has_transactions: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    """Schema phản hồi danh sách sản phẩm phân trang (Coding Standards)."""
    items: List[ProductResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
