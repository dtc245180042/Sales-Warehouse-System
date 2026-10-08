from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

class ProductImportRow(BaseModel):
    sku: str = Field(..., description="Mã SKU sản phẩm")
    name: str = Field(..., description="Tên sản phẩm")
    category: Optional[str] = Field(default=None, description="Tên nhóm hàng")
    category_id: Optional[int] = Field(default=None, description="ID danh mục (nếu có)")
    unit: Optional[str] = Field(default="cái", description="Đơn vị tính cơ sở")
    packaging_spec: Optional[str] = Field(default=None, description="Quy cách đóng gói")
    cost_price: Optional[float] = Field(default=0.0, description="Giá vốn")
    price: float = Field(ge=0, description="Giá bán niêm yết")
    quantity: Optional[int] = Field(default=0, description="Số lượng ban đầu (tùy chọn)")
    description: Optional[str] = Field(default=None, description="Mô tả")
    status: Optional[str] = Field(default="ACTIVE", description="Trạng thái kinh doanh")
    action: Optional[str] = Field(default="CREATE", description="Hành động: CREATE hoặc UPDATE")

class ImportPreviewResponse(BaseModel):
    total_rows: int
    valid_count: int
    invalid_rows_count: int
    to_create_count: int
    to_update_count: int
    valid_data: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]

class ImportExecuteResponse(BaseModel):
    success_count: int
    created_count: int = 0
    updated_count: int = 0
    created_skus: List[str] = []
    updated_skus: List[str] = []
    failed_count: int = 0