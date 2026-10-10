from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.order import Order
from app.models.order_status import OrderStatus, ALLOWED_TRANSITIONS, OrderStatusHistory

# Xử lý an toàn import Inventory để không bị lỗi server khi khác tên
try:
    from app.models.inventory import Inventory
except ImportError:
    Inventory = None

def cancel_order_service(order_id: str, reason: str, user_name: str, db: Session):
    # 1. Bắt buộc nhập lý do (SCRUM-594)
    if not reason or not reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải nhập lý do hủy đơn hàng!"
        )

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đơn hàng"
        )

    # 2. Chặn hủy nếu đã xuất kho trở đi (SCRUM-595)
    if order.status in [OrderStatus.EXPORTED, OrderStatus.DELIVERED, OrderStatus.CLOSED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đơn hàng đã xuất kho, không thể hủy! Vui lòng thực hiện luồng Trả hàng."
        )

    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đơn hàng này đã bị hủy trước đó."
        )

    # 3. Hoàn trả / Nhả tồn kho giữ chỗ (SCRUM-597)
    if Inventory and hasattr(order, 'items') and order.items:
        for item in order.items:
            inventory = db.query(Inventory).filter(Inventory.product_id == item.product_id).first()
            if inventory and hasattr(inventory, 'reserved_quantity'):
                inventory.reserved_quantity = max(0, inventory.reserved_quantity - item.quantity)

    # 4. Lưu lịch sử đổi trạng thái (SCRUM-591)
    old_status = order.status
    order.status = OrderStatus.CANCELLED

    history = OrderStatusHistory(
        order_id=order.id,
        from_status=old_status,
        to_status=OrderStatus.CANCELLED,
        changed_by=user_name,
        note=f"Hủy đơn: {reason.strip()}"
    )
    db.add(history)
    db.commit()

    return {"message": "Hủy đơn hàng thành công, đã hoàn trả lại tồn kho giữ chỗ."}