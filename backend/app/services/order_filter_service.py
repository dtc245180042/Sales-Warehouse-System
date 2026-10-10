from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.order import Order

def filter_orders_service(
    db: Session,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    staff_id: Optional[str] = None,
    region: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user_role: Optional[str] = None,
    current_user_staff_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
):
    query = db.query(Order)

    # 1. Áp dụng giới hạn dữ liệu theo quyền (SCRUM-608)
    if current_user_role == "SALES_STAFF" and current_user_staff_id:
        query = query.filter(Order.staff_id == current_user_staff_id)

    # 2. Bộ lọc nghiệp vụ (SCRUM-606, SCRUM-609)
    if status:
        query = query.filter(Order.status == status)
    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
    if staff_id and current_user_role != "SALES_STAFF":
        query = query.filter(Order.staff_id == staff_id)
    if start_date:
        query = query.filter(Order.created_at >= start_date)
    if end_date:
        query = query.filter(Order.created_at <= end_date)

    # 3. Tính tổng tiền của TẤT CẢ kết quả đang lọc (SCRUM-610)
    total_amount = db.query(func.coalesce(func.sum(Order.total), 0.0)).filter(
        Order.id.in_(query.with_entities(Order.id))
    ).scalar()

    total_items = query.count()

    # 4. Phân trang (SCRUM-606)
    offset = (page - 1) * page_size
    orders = query.order_by(Order.created_at.desc()).offset(offset).limit(page_size).all()

    return {
        "total_items": total_items,
        "total_amount": float(total_amount),
        "page": page,
        "page_size": page_size,
        "total_pages": (total_items + page_size - 1) // page_size if page_size else 1,
        "items": orders
    }