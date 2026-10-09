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
    
    # Thiết bị / Trình duyệt thao tác (Ví dụ: "Windows 11 · Chrome (Máy tính)")
    device = Column(String(255), nullable=True)
    
    # Trạng thái kết quả thao tác: "success", "failed", "warning"
    status = Column(String(50), nullable=True, default="success")

    # Thời điểm phát sinh
    created_at = Column(
        DateTime,
        default=datetime.now,
        nullable=False,
        index=True
    )


# Đảm bảo các cột device và status tự động tồn tại trong CSDL SQLite hiện hữu
try:
    from app.core.database import engine
    from sqlalchemy import text
    with engine.connect() as _conn:
        _res = _conn.execute(text("PRAGMA table_info(audit_logs)")).fetchall()
        _cols = [r[1] for r in _res]
        if _cols:
            if "device" not in _cols:
                _conn.execute(text("ALTER TABLE audit_logs ADD COLUMN device VARCHAR(255)"))
            if "status" not in _cols:
                _conn.execute(text("ALTER TABLE audit_logs ADD COLUMN status VARCHAR(50) DEFAULT 'success'"))
            _conn.commit()
except Exception:
    pass


