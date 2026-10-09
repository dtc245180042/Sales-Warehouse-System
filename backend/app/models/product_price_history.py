from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    Numeric,
    String,
    DateTime,
    Text,
    Index,
)
from app.core.database import Base


class PriceTypeEnum:
    LISTED_PRICE = "LISTED_PRICE"  # Giá niêm yết sản phẩm
    FLOOR_PRICE = "FLOOR_PRICE"    # Giá sàn tối thiểu cho phép bán
    SALE_PRICE = "SALE_PRICE"      # Giá bán phân phối theo bảng giá


class ProductPriceHistory(Base):
    """
    Bảng lịch sử thay đổi giá sản phẩm bất biến (Append-Only) - S3-02 / SCRUM-223.
    Chỉ cho phép INSERT, không hỗ trợ bất kỳ phương thức sửa hay xóa nào.
    """
    __tablename__ = "product_price_histories"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    batch_id = Column(String(50), nullable=True, index=True)

    product_id = Column(String(50), nullable=False, index=True)
    product_sku = Column(String(50), nullable=True, index=True)
    product_name = Column(String(255), nullable=False)

    price_list_id = Column(Integer, nullable=True, index=True)
    price_list_name = Column(String(255), nullable=True)
    customer_group = Column(String(50), nullable=True, index=True)

    price_type = Column(String(50), nullable=False, index=True)  # LISTED_PRICE, FLOOR_PRICE, SALE_PRICE

    # Giá tiền VND nguyên đồng dùng BigInteger để loại bỏ sai số Float
    old_price = Column(BigInteger, nullable=False)
    new_price = Column(BigInteger, nullable=False)
    change_diff = Column(BigInteger, nullable=False)            # new_price - old_price
    change_percent = Column(Numeric(5, 2), nullable=False)      # Tỷ lệ % thay đổi

    # Lý do thay đổi giá bắt buộc giải trình minh bạch với đại lý
    reason = Column(Text, nullable=False)

    effective_from = Column(DateTime(timezone=True), nullable=False)

    # Người thực hiện thay đổi giá (kiểu Integer chuẩn theo users.id)
    changed_by_id = Column(Integer, nullable=True, index=True)
    changed_by_name = Column(String(100), nullable=True)
    changed_by_role = Column(String(50), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True
    )

    __table_args__ = (
        Index("idx_price_history_product_created", "product_id", "created_at"),
    )
