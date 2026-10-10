from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Float,
    Boolean,
    DateTime,
    Text,
    event,
)
from app.core.database import Base


class ApprovalActionEnum:
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    RETURN = "RETURN"


class ApprovalStatusEnum:
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RETURNED = "RETURNED"


class OrderApprovalRequest(Base):
    """
    Bảng quản lý yêu cầu phê duyệt đơn hàng ngoại lệ (SCRUM-237 / S4-05).
    Lưu trữ lý do cần duyệt và mức độ vi phạm chi tiết (vượt hạn mức / bán dưới giá sàn).
    Tuân thủ nguyên tắc Additive-Only của AGENTS.md.
    """
    __tablename__ = "order_approval_requests"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(String(50), unique=True, nullable=False, index=True)
    order_code = Column(String(50), nullable=False, index=True)
    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=False)

    # Trạng thái duyệt: PENDING, APPROVED, REJECTED, RETURNED
    approval_status = Column(
        String(50),
        default=ApprovalStatusEnum.PENDING,
        nullable=False,
        index=True
    )

    # 1. Chi tiết vi phạm hạn mức công nợ
    has_credit_limit_violation = Column(Boolean, default=False, nullable=False)
    credit_limit_amount = Column(BigInteger, default=0, nullable=False)      # Hạn mức được cấp (VNĐ)
    current_debt_amount = Column(BigInteger, default=0, nullable=False)      # Dư nợ hiện tại trước đơn (VNĐ)
    order_unpaid_amount = Column(BigInteger, default=0, nullable=False)      # Nợ phát sinh của đơn này (VNĐ)
    credit_excess_amount = Column(BigInteger, default=0, nullable=False)     # Mức nợ vượt hạn mức (VNĐ)
    overdue_days = Column(Integer, default=0, nullable=False)                # Số ngày nợ quá hạn nếu có
    overdue_order_code = Column(String(50), nullable=True)                   # Mã đơn hàng bị nợ quá hạn

    # 2. Chi tiết vi phạm bán dưới giá sàn
    has_floor_price_violation = Column(Boolean, default=False, nullable=False)
    floor_price_violation_count = Column(Integer, default=0, nullable=False) # Số mặt hàng bán dưới giá sàn
    total_floor_price_gap = Column(Float, default=0.0, nullable=False)        # Tổng mức chênh lệch dưới giá sàn

    # Chuỗi JSON lưu chi tiết các vi phạm (để frontend/mobile hiển thị trực quan)
    violation_summary = Column(Text, nullable=True)                          # Tóm tắt lý do cần duyệt
    violation_details = Column(Text, nullable=True)                          # JSON chi tiết từng dòng vi phạm

    # 3. Kết quả xử lý phê duyệt
    processed_by_id = Column(Integer, nullable=True)
    processed_by_name = Column(String(255), nullable=True)
    processed_by_role = Column(String(100), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    decision_comment = Column(Text, nullable=True)

    # Đánh dấu đã giữ chỗ tồn kho sau khi được duyệt
    is_stock_reserved = Column(Boolean, default=False, nullable=False)

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


class OrderApprovalHistory(Base):
    """
    Bảng lưu audit trail lịch sử quyết định duyệt đơn bất biến (Append-Only) - S4-05.
    Đảm bảo lịch sử duyệt KHÔNG THỂ SỬA VÀ KHÔNG THỂ XOÁ.
    Có thể truy vết theo người xử lý, thời điểm và nội dung quyết định.
    """
    __tablename__ = "order_approval_histories"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(String(50), nullable=False, index=True)
    order_code = Column(String(50), nullable=True, index=True)

    action = Column(String(50), nullable=False, index=True)  # APPROVE, REJECT, RETURN
    previous_status = Column(String(50), nullable=False)
    new_status = Column(String(50), nullable=False)

    # Ý kiến xử lý (Bắt buộc với REJECT và RETURN)
    comment = Column(Text, nullable=True)

    performed_by_id = Column(Integer, nullable=True, index=True)
    performed_by_name = Column(String(255), nullable=False)
    performed_by_role = Column(String(100), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )


# Cài đặt chặn Update và Delete ở tầng SQLAlchemy ORM để đảm bảo tính bất biến (Immutability)
@event.listens_for(OrderApprovalHistory, "before_update")
def _prevent_update_order_approval_history(mapper, connection, target):
    raise ValueError("Lịch sử phê duyệt đơn hàng là dữ liệu bất biến, nghiêm cấm chỉnh sửa.")


@event.listens_for(OrderApprovalHistory, "before_delete")
def _prevent_delete_order_approval_history(mapper, connection, target):
    raise ValueError("Lịch sử phê duyệt đơn hàng là dữ liệu bất biến, nghiêm cấm xoá.")


# Tự động khởi tạo bảng nếu chưa có
try:
    from app.core.database import engine
    OrderApprovalRequest.__table__.create(bind=engine, checkfirst=True)
    OrderApprovalHistory.__table__.create(bind=engine, checkfirst=True)
except Exception:
    pass
