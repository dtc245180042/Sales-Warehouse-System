from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

class SKUUnitVersionModel(BaseModel):
    """
    Model lưu trữ từng phiên bản cấu hình đơn vị tính (SCRUM-393).
    Giúp khóa lịch sử quy đổi để khi sửa hệ số, các giao dịch cũ không bị ảnh hưởng.
    """
    version: int
    base_unit: str                         # Đơn vị cơ sở (ví dụ: "Lon")
    units: Dict[str, float]                # Danh sách đơn vị & hệ số quy đổi (ví dụ: {"Thùng": 24.0, "Lốc": 6.0, "Lon": 1.0})
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SKUUnitConfigModel(BaseModel):
    """
    Model tổng quản lý cấu hình đơn vị tính của một SKU (SCRUM-394).
    """
    sku: str
    current_version: int = 1
    versions: List[SKUUnitVersionModel] = []

class TransactionRecordModel(BaseModel):
    """
    Model giao dịch / ghi sổ chứng từ kho & đơn hàng (SCRUM-391 & SCRUM-392).
    Lưu cả số lượng theo đơn vị nhập lẫn số lượng đã quy đổi về đơn vị cơ sở.
    """
    transaction_id: str
    sku: str
    input_quantity: float                 # Số lượng người dùng nhập (VD: 10)
    input_unit: str                        # Đơn vị nhập (VD: "Thùng")
    base_quantity: float                  # Số lượng quy đổi về cơ sở (VD: 240.0)
    base_unit: str                        # Đơn vị cơ sở (VD: "Lon")
    conversion_factor: float              # Hệ số áp dụng tại thời điểm tạo (VD: 24.0)
    applied_version: int                  # Phiên bản hệ số quy đổi được áp dụng
    created_at: datetime = Field(default_factory=datetime.utcnow)