from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    func
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class Category(Base):
    """Model quản lý nhóm hàng / ngành hàng theo cấu trúc cây nhiều cấp (SCRUM-214).
    
    Quy tắc cấu trúc:
    - Level 1: Ngành hàng lớn (parent_id = None, level = 1).
    - Level 2: Nhóm hàng con trực thuộc Level 1 (level = 2).
    - Level 3: Tiểu nhóm / Phân loại hàng trực thuộc Level 2 (level = 3).
    - Hỗ trợ tối thiểu 3 cấp và có thể mở rộng sâu hơn.
    """
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    parent_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    level = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Quan hệ tự tham chiếu (Self-referential) cha - con trong cùng model
    parent = relationship("Category", remote_side=[id], backref="children")

    def __repr__(self):
        return f"<Category id={self.id} code='{self.code}' name='{self.name}' level={self.level}>"
