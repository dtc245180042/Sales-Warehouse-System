from pydantic import BaseModel, Field
from typing import List, Optional

class ProductImportRow(BaseModel):
    sku: str = Field(..., description="Mã sản phẩm")
    name: str = Field(..., description="Tên sản phẩm")
    category_id: int = Field(..., description="ID danh mục")
    price: float = Field(gt=0, description="Giá bán phải lớn hơn 0")
    quantity: int = Field(ge=0, description="Số lượng tồn kho")

class ImportPreviewResponse(BaseModel):
    total_rows: int
    valid_count: int
    invalid_rows_count: int
    to_create_count: int
    to_update_count: int
    valid_data: List[dict]
    errors: List[dict]