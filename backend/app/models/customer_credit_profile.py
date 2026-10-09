from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    DateTime,
    Text,
)
from app.core.database import Base


class CustomerCreditProfile(Base):
    """
    Hồ sơ hạn mức công nợ và số ngày nợ tối đa theo đại lý (Additive Model).
    Tuân thủ quy tắc an toàn Additive-Only của AGENTS.md.
    """
    __tablename__ = "customer_credit_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), unique=True, nullable=False, index=True)
    
    # Hạn mức công nợ tối đa (VNĐ) - Dùng BigInteger để loại bỏ hoàn toàn sai số Float
    credit_limit = Column(BigInteger, default=0, nullable=False)
    
    # Số ngày nợ tối đa cho phép (0 = thanh toán ngay, 15, 30, 45, 60...)
    max_debt_days = Column(Integer, default=0, nullable=False)
    
    # Dư nợ đệm (Cache) để hiển thị nhanh trên UI; khi kiểm tra chặn luôn tính từ hóa đơn thật
    current_debt = Column(BigInteger, default=0, nullable=False)
    
    updated_by = Column(String(255), nullable=True)
    
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class CustomerCreditHistory(Base):
    """
    Bảng lịch sử điều chỉnh hạn mức công nợ (Append-Only).
    Chỉ cho phép INSERT, không hỗ trợ sửa hay xóa để bảo đảm tính toàn vẹn kiểm toán.
    """
    __tablename__ = "customer_credit_histories"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), nullable=False, index=True)
    
    old_credit_limit = Column(BigInteger, nullable=False)
    new_credit_limit = Column(BigInteger, nullable=False)
    
    old_max_debt_days = Column(Integer, nullable=False)
    new_max_debt_days = Column(Integer, nullable=False)
    
    # Lý do thay đổi bắt buộc (tối thiểu 5 ký tự)
    reason = Column(Text, nullable=False)
    
    changed_by = Column(String(255), nullable=False)
    
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
