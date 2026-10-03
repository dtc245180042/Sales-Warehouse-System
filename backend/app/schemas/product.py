from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field


class ProductBase(BaseModel):
    sku: str = Field(..., description="Mã SKU sản phẩm")
    barcode: Optional[str] = Field(None, description="Mã vạch barcode")
    name: str = Field(..., description="Tên sản phẩm")
    category: str = Field("Khác", description="Danh mục sản phẩm")
    supplier_id: Optional[str] = Field(None, description="Mã nhà cung cấp")
    supplier_name: Optional[str] = Field(None, description="Tên nhà cung cấp")
    cost_price: float = Field(0.0, ge=0, description="Giá vốn")
    sale_price: float = Field(0.0, ge=0, description="Giá bán")
    stock: int = Field(0, ge=0, description="Số lượng tồn kho")
    min_stock: int = Field(5, ge=0, description="Mức cảnh báo tồn kho tối thiểu")
    unit: str = Field("Chiếc", description="Đơn vị tính")
    image: Optional[str] = Field(None, description="Đường dẫn hoặc URL ảnh sản phẩm")
    description: Optional[str] = Field(None, description="Mô tả sản phẩm")
    status: str = Field("active", description="Trạng thái: active, out_of_stock, low_stock, inactive")


class ProductCreate(ProductBase):
    id: Optional[str] = Field(None, description="Mã ID tùy chọn (ví dụ: PRD-001)")


class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    cost_price: Optional[float] = None
    sale_price: Optional[float] = None
    stock: Optional[int] = None
    min_stock: Optional[int] = None
    unit: Optional[str] = None
    image: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class ProductStockUpdate(BaseModel):
    delta: int = Field(..., description="Lượng thay đổi tồn kho (dương để tăng, âm để giảm)")


class ProductResponse(ProductBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    def supplierId(self) -> Optional[str]:
        return self.supplier_id

    @computed_field
    def supplierName(self) -> Optional[str]:
        return self.supplier_name

    @computed_field
    def costPrice(self) -> float:
        return self.cost_price

    @computed_field
    def salePrice(self) -> float:
        return self.sale_price

    @computed_field
    def minStock(self) -> int:
        return self.min_stock

    @computed_field
    def createdAt(self) -> Optional[str]:
        return self.created_at.strftime("%Y-%m-%d") if self.created_at else None

    @computed_field
    def updatedAt(self) -> Optional[str]:
        return self.updated_at.strftime("%Y-%m-%d") if self.updated_at else None
