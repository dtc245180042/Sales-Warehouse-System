from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Boolean,
    DateTime,
    Text,
)
from app.core.database import Base


class DebtRiskActionEnum:
    BLOCK = "BLOCK"                       # Chặn bán hoàn toàn
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL" # Chuyển sang trạng thái Cần duyệt
    WARNING_ONLY = "WARNING_ONLY"         # Chỉ cảnh báo, vẫn cho phép tạo đơn


class DebtRiskLevelEnum:
    SAFE = "SAFE"                         # An toàn: không nợ quá hạn, nợ trong hạn mức
    WARNING = "WARNING"                   # Cảnh báo: nợ >= 80% hạn mức
    OVERDUE = "OVERDUE"                   # Có nợ quá hạn ngày thanh toán
    LIMIT_EXCEEDED = "LIMIT_EXCEEDED"     # Tổng nợ vượt hạn mức tiền
    HIGH_RISK = "HIGH_RISK"               # Cả nợ quá hạn VÀ vượt hạn mức tiền


class DebtRiskEventTypeEnum:
    FLAGGED = "FLAGGED"                   # Gắn cờ rủi ro tự động
    UNFLAGGED = "UNFLAGGED"               # Gỡ cờ rủi ro tự động (sau thanh toán)
    AUTO_LOCKED = "AUTO_LOCKED"           # Tự động khóa bán do nợ
    AUTO_UNLOCKED = "AUTO_UNLOCKED"       # Tự động mở bán do đã thanh toán
    REEVALUATED = "REEVALUATED"           # Đánh giá lại định kỳ
    CONFIG_CHANGED = "CONFIG_CHANGED"     # Thay đổi cấu hình quy tắc


class DebtRiskConfig(Base):
    """
    Bảng cấu hình hành vi xử lý khi đại lý bị gắn cờ rủi ro công nợ (SCRUM-727).
    Cho phép quản trị viên hoặc kế toán trưởng tùy biến quy tắc:
    - Khi nợ quá hạn: BLOCK hoặc REQUIRE_APPROVAL hoặc WARNING_ONLY
    - Khi vượt hạn mức: BLOCK hoặc REQUIRE_APPROVAL hoặc WARNING_ONLY
    - Số ngày ân hạn (Grace period)
    - Số tiền nợ tối thiểu để kích hoạt gắn cờ
    Tuân thủ quy tắc Additive-Only của AGENTS.md.
    """
    __tablename__ = "debt_risk_configs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    config_code = Column(String(50), default="DEFAULT", unique=True, nullable=False, index=True)

    # Tự động gắn cờ rủi ro khi vi phạm
    auto_flag_enabled = Column(Boolean, default=True, nullable=False)

    # Hành vi khi có khoản nợ quá hạn (BLOCK, REQUIRE_APPROVAL, WARNING_ONLY)
    action_on_overdue = Column(
        String(50),
        default=DebtRiskActionEnum.BLOCK,
        nullable=False
    )

    # Hành vi khi vượt hạn mức tiền (BLOCK, REQUIRE_APPROVAL, WARNING_ONLY)
    action_on_credit_limit_exceeded = Column(
        String(50),
        default=DebtRiskActionEnum.REQUIRE_APPROVAL,
        nullable=False
    )

    # Số ngày ân hạn trước khi tính là quá hạn (0 = tính ngay ngày đến hạn)
    grace_period_days = Column(Integer, default=0, nullable=False)

    # Ngưỡng số nợ tối thiểu để bắt đầu gắn cờ rủi ro (VNĐ)
    min_debt_to_flag = Column(BigInteger, default=0, nullable=False)

    # Có tự động đồng bộ trạng thái khóa bán sang CustomerLockProfile không
    auto_lock_on_flag = Column(Boolean, default=True, nullable=False)

    description = Column(Text, nullable=True)
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


class CustomerDebtFlag(Base):
    """
    Bảng lưu trạng thái gắn cờ rủi ro công nợ hiện thời của từng đại lý (SCRUM-729).
    Được cập nhật tự động bởi:
    - Job đánh giá hằng ngày (SCRUM-728)
    - Hook ghi nhận thanh toán (SCRUM-725)
    - Luồng kiểm tra tạo đơn (SCRUM-726)
    Tuân thủ quy tắc Additive-Only của AGENTS.md (không sửa bảng customers gốc).
    """
    __tablename__ = "customer_debt_flags"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), unique=True, nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)

    # Có đang bị gắn cờ rủi ro hay không
    is_flagged = Column(Boolean, default=False, nullable=False, index=True)

    # Cấp độ rủi ro: SAFE, WARNING, OVERDUE, LIMIT_EXCEEDED, HIGH_RISK
    risk_level = Column(
        String(50),
        default=DebtRiskLevelEnum.SAFE,
        nullable=False,
        index=True
    )

    # Hành vi áp dụng theo cấu hình: NONE, BLOCK, REQUIRE_APPROVAL, WARNING_ONLY
    action_applied = Column(String(50), default="NONE", nullable=False)

    # Đại lý có đang bị khóa bán do công nợ không
    is_blocked = Column(Boolean, default=False, nullable=False, index=True)

    # Đơn hàng mới có cần phê duyệt do công nợ không
    requires_approval = Column(Boolean, default=False, nullable=False)

    # Dữ liệu tài chính tại thời điểm đánh giá
    total_debt = Column(BigInteger, default=0, nullable=False)
    credit_limit = Column(BigInteger, default=0, nullable=False)
    excess_amount = Column(BigInteger, default=0, nullable=False)
    overdue_amount = Column(BigInteger, default=0, nullable=False)
    max_overdue_days = Column(Integer, default=0, nullable=False)
    oldest_overdue_invoice_code = Column(String(50), nullable=True)

    # Diễn giải chi tiết nguyên nhân gắn cờ
    flag_reason = Column(Text, nullable=True)

    last_evaluated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    evaluated_by = Column(String(100), default="SYSTEM", nullable=False)

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


class CustomerDebtFlagHistory(Base):
    """
    Bảng audit trail ghi nhận lịch sử cảnh báo và thay đổi trạng thái khóa/mở khóa do công nợ (SCRUM-731).
    Bảng này là Append-Only (chỉ ghi thêm, không sửa, không xóa) để đảm bảo tính bất biến kiểm toán.
    """
    __tablename__ = "customer_debt_flag_histories"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    customer_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)

    # Loại sự kiện: FLAGGED, UNFLAGGED, AUTO_LOCKED, AUTO_UNLOCKED, REEVALUATED, CONFIG_CHANGED
    event_type = Column(String(50), nullable=False, index=True)

    previous_risk_level = Column(String(50), nullable=True)
    new_risk_level = Column(String(50), nullable=False)

    previous_is_flagged = Column(Boolean, default=False, nullable=False)
    new_is_flagged = Column(Boolean, default=False, nullable=False)

    previous_is_blocked = Column(Boolean, default=False, nullable=False)
    new_is_blocked = Column(Boolean, default=False, nullable=False)

    total_debt = Column(BigInteger, default=0, nullable=False)
    overdue_amount = Column(BigInteger, default=0, nullable=False)
    excess_amount = Column(BigInteger, default=0, nullable=False)
    max_overdue_days = Column(Integer, default=0, nullable=False)

    # Lý do chi tiết
    reason = Column(Text, nullable=False)

    # Nguồn gốc sự kiện: DAILY_JOB, PAYMENT_HOOK, MANUAL_REEVALUATE, ORDER_CHECK
    source = Column(String(100), default="SYSTEM", nullable=False)

    actor_username = Column(String(100), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )


# Tự động tạo bảng nếu chưa có
try:
    from app.core.database import engine
    DebtRiskConfig.__table__.create(bind=engine, checkfirst=True)
    CustomerDebtFlag.__table__.create(bind=engine, checkfirst=True)
    CustomerDebtFlagHistory.__table__.create(bind=engine, checkfirst=True)
except Exception:
    pass
