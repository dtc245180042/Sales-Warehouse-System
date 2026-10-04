from typing import List, Optional, Any, Dict
from pydantic import BaseModel

class ProductImportRow(BaseModel):
    row_number: int
    sku: str
    name: str
    category: str
    unit: str
    cost_price: float
    status: str = "ACTIVE"

class RowError(BaseModel):
    row_number: int
    sku: Optional[str] = None
    errors: List[str]

class ImportPreviewResult(BaseModel):
    total_rows: int
    valid_rows_count: int
    invalid_rows_count: int
    to_create_count: int
    to_update_count: int
    valid_data: List[Dict[str, Any]]
    errors: List[RowError]

class ImportExecuteRequest(BaseModel):
    valid_data: List[Dict[str, Any]]

class ImportExecuteResult(BaseModel):
    success_count: int
    failed_count: int
    created_skus: List[str]
    updated_skus: List[str]
    errors: List[RowError]