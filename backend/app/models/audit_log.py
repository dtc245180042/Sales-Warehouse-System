import json
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    JSON,
)
from app.core.database import Base


class AuditLog(Base):
    """
    Bảng lưu vết nhật ký thao tác kiểm toán hệ thống (Audit Log / Audit Trail).
    Lưu trữ chi tiết mọi thao tác điều chỉnh tồn kho, hạn mức công nợ, giá và hoá đơn.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    
    # Loại thực thể nghiệp vụ: "INVENTORY", "DEBT", "PRICE", "INVOICE"
    entity_type = Column(String(50), nullable=False, index=True)
    
    # Mã định danh đối tượng (Ví dụ: SKU/Mã SP, Mã khách hàng, Mã bảng giá, Mã hoá đơn)
    entity_id = Column(String(100), nullable=False, index=True)
    
    # Tên hoặc nhãn hiển thị của đối tượng liên quan
    entity_name = Column(String(255), nullable=True)
    
    # Hành động: "ADJUST_STOCK", "ADJUST_DEBT_LIMIT", "UPDATE_PRICE", "CANCEL_INVOICE", "STATUS_CHANGE", "CREATE", "UPDATE", "DELETE"
    action = Column(String(50), nullable=False, index=True)
    
    # Snapshot dữ liệu trước và sau thao tác (JSON)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    
    # Tóm tắt biến động đã được chuẩn hóa để hiển thị trực quan
    change_summary = Column(Text, nullable=True)
    
    # Thông tin người thực hiện thao tác
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String(255), nullable=True, index=True)
    user_fullname = Column(String(255), nullable=True)
    user_role = Column(String(50), nullable=True)
    
    # Lý do điều chỉnh (Ví dụ: "Lệch kiểm kê kho cuối tháng", "Duyệt tăng hạn mức", "Điều chỉnh giá thị trường")
    reason = Column(Text, nullable=True)
    
    # Địa chỉ IP hoặc nguồn gọi
    ip_address = Column(String(100), nullable=True)
    
    # Trạng thái kết quả thao tác: "success", "failed", "warning"
    status = Column(String(50), nullable=True, default="success")

    # Thời điểm phát sinh
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

