from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.sql import func
from app.models.reports import Base

class StockCardEntry(Base):
    __tablename__ = "stock_card_entries"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(String, index=True, nullable=False)
    warehouse_id = Column(String, index=True, nullable=False)
    transaction_type = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    doc_ref_id = Column(String, nullable=True)
    doc_type = Column(String, nullable=True)
    transaction_time = Column(DateTime(timezone=True), server_default=func.now())