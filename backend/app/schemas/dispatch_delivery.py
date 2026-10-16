from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class DeliveryConfirmRequest(BaseModel):
    """Payload xác nhận giao hàng thành công kèm ảnh chứng từ có chữ ký (S6-08)."""
    receiver_name: str = Field(..., min_length=2, description="Họ tên người nhận thực tế tại đại lý/khách hàng")
    receiver_phone: Optional[str] = Field(None, description="Số điện thoại người nhận")
    delivered_at: Optional[datetime] = Field(None, description="Thời điểm giao hàng thực tế (mặc định lấy hiện tại)")
    proof_image_url: Optional[str] = Field(None, description="URL ảnh biên bản giao nhận có chữ ký đại lý (POD)")
    notes: Optional[str] = Field(None, description="Ghi chú biên bản giao nhận")


class DeliveryFailedRequest(BaseModel):
    """Payload xác nhận giao hàng không thành công và hoàn hàng về kho (S6-08)."""
    failure_reason: str = Field(..., min_length=3, description="Lý do giao hàng thất bại (bắt buộc)")
    failure_notes: Optional[str] = Field(None, description="Chi tiết lý do thất bại / phản hồi của khách hàng")
    notes: Optional[str] = Field(None, description="Ghi chú điều chuyển / hoàn kho")


class DispatchDeliveryResponse(BaseModel):
    """Dữ liệu chi tiết xác nhận giao hàng và đối soát chứng từ POD (S6-08)."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    dispatch_id: str
    order_id: str
    customer_id: str
    customer_name: Optional[str] = None
    warehouse_id: int
    warehouse_name: Optional[str] = None
    status: str
    receiver_name: Optional[str] = None
    receiver_phone: Optional[str] = None
    delivered_at: Optional[datetime] = None
    proof_image_url: Optional[str] = None
    failure_reason: Optional[str] = None
    failure_notes: Optional[str] = None
    returned_to_warehouse: bool = False
    returned_warehouse_id: Optional[int] = None
    returned_at: Optional[datetime] = None
    confirmed_by: int
    confirmed_by_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class UploadProofResponse(BaseModel):
    """Phản hồi sau khi tải ảnh chứng từ biên bản giao nhận thành công."""
    proof_image_url: str = Field(..., description="Đường dẫn xem ảnh chứng từ")
    original_filename: str = Field(..., description="Tên tệp gốc")
    file_size: int = Field(..., description="Kích thước tệp (bytes)")
