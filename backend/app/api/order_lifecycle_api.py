from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.order import Order
from app.models.order_status import OrderStatusHistory, ALLOWED_TRANSITIONS
from app.services.order_lifecycle_service import cancel_order_service

router = APIRouter(prefix="/orders", tags=["Order Lifecycle"])

@router.get("/{order_id}/lifecycle")
def get_order_lifecycle(order_id: str, db: Session = Depends(get_db)):
    """API Tra cứu vòng đời và trạng thái hiện tại của đơn hàng (SCRUM-593)"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

    histories = db.query(OrderStatusHistory).filter(
        OrderStatusHistory.order_id == order_id
    ).order_by(OrderStatusHistory.changed_at.asc()).all()

    next_allowed_statuses = ALLOWED_TRANSITIONS.get(order.status, [])

    return {
        "order_id": order.id,
        "current_status": order.status,
        "next_allowed_statuses": next_allowed_statuses,
        "history": histories
    }

@router.post("/{order_id}/cancel")
def cancel_order_endpoint(
    order_id: str,
    reason: str = Body(..., embed=True),
    user_name: str = Body("NVKD", embed=True),
    db: Session = Depends(get_db)
):
    """API Hủy đơn hàng (SCRUM-594, SCRUM-595, SCRUM-597)"""
    return cancel_order_service(order_id, reason, user_name, db)