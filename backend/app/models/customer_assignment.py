from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship, backref

from app.core.database import Base


class CustomerAssignment(Base):
    """
    Bảng phụ quản lý phân công đại lý cho nhân viên kinh doanh (1 - 1 với customers).
    Tuân thủ nguyên tắc Additive-Only: không sửa đổi schema bảng customers gốc.
    """
    __tablename__ = "customer_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), ForeignKey("customers.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    assigned_staff_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_by = Column(String(255), nullable=True)
    assigned_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    notes = Column(Text, nullable=True)

    # Quan hệ ORM
    customer = relationship("Customer", backref=backref("assignment", uselist=False, cascade="all, delete-orphan", passive_deletes=True), foreign_keys=[customer_id])
    staff = relationship("User", foreign_keys=[assigned_staff_id])


class CustomerAssignmentHistory(Base):
    """
    Bảng lịch sử điều chỉnh phân công & chuyển giao địa bàn (Append-Only).
    Chỉ cho phép INSERT, không hỗ trợ sửa/xóa nhằm đảm bảo tính toàn vẹn kiểm toán.
    """
    __tablename__ = "customer_assignment_histories"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    batch_id = Column(String(50), nullable=True, index=True)  # UUID nhóm các bản ghi của một đợt bulk transfer
    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=False)
    
    from_staff_id = Column(String(50), nullable=True, index=True)
    from_staff_name = Column(String(255), nullable=True)
    
    to_staff_id = Column(String(50), nullable=True, index=True)
    to_staff_name = Column(String(255), nullable=True)
    
    # ASSIGN, REASSIGN, BULK_TRANSFER, UNASSIGN
    action_type = Column(String(50), nullable=False, index=True)
    
    # Bắt buộc lý do giải trình (5 - 500 ký tự)
    reason = Column(Text, nullable=False)
    performed_by = Column(String(255), nullable=False)
    
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
