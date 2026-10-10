from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.customer import Customer
from app.models.user import User

router = APIRouter(prefix="/orders/filter-options", tags=["Order Filter Options"])

@router.get("")
def get_filter_options(db: Session = Depends(get_db)):
    """
    API trả về danh sách các tùy chọn cho bộ lọc đại lý, nhân viên (SCRUM-609)
    """
    customers = db.query(Customer.id, Customer.name).all()
    staffs = db.query(User.id, User.full_name).all() if hasattr(User, 'full_name') else []

    return {
        "customers": [{"id": c.id, "name": c.name} for c in customers],
        "staffs": [{"id": s.id, "name": getattr(s, 'full_name', str(s.id))} for s in staffs],
        "statuses": ["DRAFT", "PENDING", "APPROVED", "PACKING", "EXPORTED", "DELIVERED", "CLOSED", "CANCELLED"]
    }