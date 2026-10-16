from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.order import Order
from app.models.customer import Customer
from app.models.auth import User
from app.models.order_status import OrderStatus, OrderStatusHistory
from app.models.order_delivery_profile import OrderDeliveryProfile
from app.models.stock_dispatch import StockDispatch, DispatchStatus
from app.models.delivery_tracking import OrderDeliveryMilestone
from app.schemas.delivery_tracking import (
    DeliveryTimelineResponse,
    DeliveryMilestoneItem,
    DeliveryMilestoneUpdateRequest,
)


STAGE_MAPPING: Dict[str, str] = {
    "pending": "Chờ duyệt",
    "pending_approval": "Chờ duyệt",
    "confirmed": "Đã duyệt",
    "approved": "Đã duyệt",
    "reserved": "Đã duyệt",
    "packing": "Đang soạn",
    "preparing": "Đang soạn",
    "exported": "Đã xuất",
    "dispatched": "Đã xuất",
    "shipping": "Đang giao",
    "delivering": "Đang giao",
    "delivered": "Đã giao",
    "completed": "Đã giao",
    "cancelled": "Đã hủy",
}

DEFAULT_MILESTONES = [
    (1, "APPROVED", "Đã duyệt"),
    (2, "PACKING", "Đang soạn"),
    (3, "EXPORTED", "Đã xuất"),
    (4, "DELIVERING", "Đang giao"),
    (5, "DELIVERED", "Đã giao"),
]


class DeliveryTrackingService:
    """
    Service quản lý toàn bộ nghiệp vụ theo dõi tiến trình giao hàng (S6-09 / SCRUM-694).
    Đảm bảo:
    - 5 mốc cố định: Đã duyệt -> Đang soạn -> Đã xuất -> Đang giao -> Đã giao.
    - Lấy dữ liệu phản ánh lịch sử thực tế trong hệ thống (OrderStatusHistory, StockDispatch, OrderDeliveryProfile).
    - Bảo mật chống IDOR: Đại lý chỉ được xem đơn hàng của chính mình.
    """

    @staticmethod
    def get_delivery_timeline(
        db: Session,
        order_id: str,
        current_user: Optional[User] = None,
        current_customer: Optional[Customer] = None,
    ) -> DeliveryTimelineResponse:
        """
        Lấy thông tin timeline trạng thái giao hàng theo từng đơn.
        """
        # 1. Tìm đơn hàng
        order = db.query(Order).filter(
            (Order.id == order_id) | (Order.code == order_id)
        ).first()

        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy đơn hàng với mã '{order_id}'."
            )

        # 2. Kiểm soát phân quyền & chống IDOR
        if current_customer:
            if str(order.customer_id) != str(current_customer.id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền truy cập thông tin giao hàng của đơn hàng thuộc đại lý khác."
                )
        elif current_user:
            u_role = (current_user.role or "").strip().lower()
            if u_role == "customer":
                # Đối chiếu tài khoản customer
                linked_cust = None
                if getattr(current_user, "customer_id", None):
                    linked_cust = db.query(Customer).filter(Customer.id == current_user.customer_id).first()
                if not linked_cust:
                    linked_cust = db.query(Customer).filter(
                        (Customer.email == current_user.email) | (Customer.phone == current_user.phone_number)
                    ).first()

                if linked_cust and str(order.customer_id) != str(linked_cust.id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bạn không có quyền truy cập thông tin giao hàng của đơn hàng thuộc đại lý khác."
                    )
                elif not linked_cust and str(order.customer_id) != str(current_user.id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bạn không có quyền truy cập thông tin giao hàng của đơn hàng thuộc đại lý khác."
                    )

        # 3. Tra cứu dữ liệu thực tế liên quan
        histories = db.query(OrderStatusHistory).filter(
            OrderStatusHistory.order_id == order.id
        ).order_by(OrderStatusHistory.changed_at.asc()).all()

        dispatch = db.query(StockDispatch).filter(
            StockDispatch.order_id == order.id,
            StockDispatch.status == DispatchStatus.CONFIRMED.value
        ).order_by(StockDispatch.dispatched_at.desc()).first()

        delivery_prof = db.query(OrderDeliveryProfile).filter(
            OrderDeliveryProfile.order_id == order.id
        ).first()

        existing_milestones = db.query(OrderDeliveryMilestone).filter(
            OrderDeliveryMilestone.order_id == order.id
        ).all()
        milestone_map = {m.milestone_code: m for m in existing_milestones}

        # 4. Phân tích trạng thái thực tế từng mốc
        clean_status = (order.status or "pending").strip().lower()
        items: List[DeliveryMilestoneItem] = []

        # Mốc 1: APPROVED (Đã duyệt)
        m1 = milestone_map.get("APPROVED")
        m1_status = "PENDING"
        m1_updated_at = None
        m1_updated_by = None
        m1_notes = None

        if clean_status not in ["pending", "pending_approval", "draft"]:
            m1_status = "COMPLETED"
            # Tìm thời điểm duyệt từ lịch sử
            appr_hist = next(
                (h for h in histories if str(h.to_status).lower() in ["approved", "confirmed", "reserved"]),
                None
            )
            if appr_hist:
                m1_updated_at = appr_hist.changed_at.isoformat() if appr_hist.changed_at else None
                m1_updated_by = appr_hist.changed_by
                m1_notes = appr_hist.note or "Đơn hàng đã được phê duyệt."
            else:
                m1_updated_at = order.created_at.isoformat() if order.created_at else None
                m1_updated_by = getattr(order, "staff_name", None) or "Quản lý kinh doanh"
                m1_notes = "Đơn hàng đã được xác nhận và phê duyệt."

        if m1 and m1.status == "COMPLETED":
            m1_status = "COMPLETED"
            m1_updated_at = m1.updated_at.isoformat() if m1.updated_at else m1_updated_at
            m1_updated_by = m1.updated_by or m1_updated_by
            m1_notes = m1.notes or m1_notes

        items.append(DeliveryMilestoneItem(
            step=1,
            code="APPROVED",
            name="Đã duyệt",
            status=m1_status,
            updated_at=m1_updated_at,
            updated_by=m1_updated_by,
            notes=m1_notes,
        ))

        # Mốc 2: PACKING (Đang soạn)
        m2 = milestone_map.get("PACKING")
        m2_status = "PENDING"
        m2_updated_at = None
        m2_updated_by = None
        m2_notes = None

        if clean_status in ["packing", "preparing"]:
            m2_status = "IN_PROGRESS"
            pack_hist = next((h for h in histories if str(h.to_status).lower() in ["packing", "preparing"]), None)
            m2_updated_at = pack_hist.changed_at.isoformat() if pack_hist and pack_hist.changed_at else (order.updated_at.isoformat() if order.updated_at else None)
            m2_updated_by = pack_hist.changed_by if pack_hist else "Thủ kho"
            m2_notes = "Đang tiến hành gom hàng và đóng gói tại kho."
        elif clean_status in ["exported", "dispatched", "shipping", "delivering", "delivered", "completed"] or dispatch:
            m2_status = "COMPLETED"
            pack_hist = next((h for h in histories if str(h.to_status).lower() in ["packing", "preparing"]), None)
            m2_updated_at = pack_hist.changed_at.isoformat() if pack_hist and pack_hist.changed_at else (dispatch.dispatched_at.isoformat() if dispatch and dispatch.dispatched_at else (order.updated_at.isoformat() if order.updated_at else None))
            m2_updated_by = pack_hist.changed_by if pack_hist else "Thủ kho"
            m2_notes = "Đã hoàn thành kiểm đếm và đóng gói theo chuẩn xuất kho."
        elif m1_status == "COMPLETED" and clean_status != "cancelled":
            m2_status = "IN_PROGRESS"
            m2_notes = "Đơn hàng đã tiếp nhận vào hàng đợi soạn kho."

        if m2 and m2.status in ["COMPLETED", "IN_PROGRESS"]:
            m2_status = m2.status
            m2_updated_at = m2.updated_at.isoformat() if m2.updated_at else m2_updated_at
            m2_updated_by = m2.updated_by or m2_updated_by
            m2_notes = m2.notes or m2_notes

        items.append(DeliveryMilestoneItem(
            step=2,
            code="PACKING",
            name="Đang soạn",
            status=m2_status,
            updated_at=m2_updated_at,
            updated_by=m2_updated_by,
            notes=m2_notes,
        ))

        # Mốc 3: EXPORTED (Đã xuất)
        m3 = milestone_map.get("EXPORTED")
        m3_status = "PENDING"
        m3_updated_at = None
        m3_updated_by = None
        m3_notes = None
        m3_dispatch_id = dispatch.id if dispatch else None

        if dispatch or clean_status in ["exported", "dispatched", "shipping", "delivering", "delivered", "completed"]:
            m3_status = "COMPLETED"
            exp_hist = next((h for h in histories if str(h.to_status).lower() in ["exported", "dispatched"]), None)
            if dispatch and dispatch.dispatched_at:
                m3_updated_at = dispatch.dispatched_at.isoformat()
                m3_updated_by = f"Thủ kho (User #{dispatch.dispatched_by})"
                m3_notes = dispatch.notes or f"Xuất kho hoàn tất theo phiếu xuất kho {dispatch.id}."
            elif exp_hist:
                m3_updated_at = exp_hist.changed_at.isoformat() if exp_hist.changed_at else None
                m3_updated_by = exp_hist.changed_by
                m3_notes = exp_hist.note or "Hàng đã hoàn tất thủ tục xuất kho."
            else:
                m3_updated_at = order.updated_at.isoformat() if order.updated_at else None
                m3_updated_by = "Thủ kho"
                m3_notes = "Hàng đã rời kho bảo quản."

        if m3 and m3.status == "COMPLETED":
            m3_status = "COMPLETED"
            m3_updated_at = m3.updated_at.isoformat() if m3.updated_at else m3_updated_at
            m3_updated_by = m3.updated_by or m3_updated_by
            m3_notes = m3.notes or m3_notes
            m3_dispatch_id = m3.dispatch_id or m3_dispatch_id

        items.append(DeliveryMilestoneItem(
            step=3,
            code="EXPORTED",
            name="Đã xuất",
            status=m3_status,
            updated_at=m3_updated_at,
            updated_by=m3_updated_by,
            notes=m3_notes,
            dispatch_id=m3_dispatch_id,
        ))

        # Mốc 4: DELIVERING (Đang giao)
        m4 = milestone_map.get("DELIVERING")
        m4_status = "PENDING"
        m4_updated_at = None
        m4_updated_by = None
        m4_notes = None
        m4_driver_name = m4.driver_name if m4 else None
        m4_driver_phone = m4.driver_phone if m4 else None
        m4_license_plate = m4.license_plate if m4 else None

        if clean_status in ["delivered", "completed"]:
            m4_status = "COMPLETED"
            ship_hist = next((h for h in histories if str(h.to_status).lower() in ["shipping", "delivering"]), None)
            m4_updated_at = ship_hist.changed_at.isoformat() if ship_hist and ship_hist.changed_at else (order.updated_at.isoformat() if order.updated_at else None)
            m4_updated_by = ship_hist.changed_by if ship_hist else "Đội vận tải"
            m4_notes = "Chuyến hàng đã hoàn tất vận chuyển."
        elif clean_status in ["shipping", "delivering"]:
            m4_status = "IN_PROGRESS"
            ship_hist = next((h for h in histories if str(h.to_status).lower() in ["shipping", "delivering"]), None)
            m4_updated_at = ship_hist.changed_at.isoformat() if ship_hist and ship_hist.changed_at else (order.updated_at.isoformat() if order.updated_at else None)
            m4_updated_by = ship_hist.changed_by if ship_hist else "Tài xế giao hàng"
            m4_notes = "Xe đang trên tuyến vận chuyển đến địa chỉ nhận hàng của đại lý."
        elif m3_status == "COMPLETED" and clean_status != "cancelled":
            m4_status = "IN_PROGRESS"
            m4_notes = "Đang bàn giao cho đội vận chuyển và chuẩn bị lăn bánh."

        if m4 and m4.status in ["COMPLETED", "IN_PROGRESS"]:
            m4_status = m4.status
            m4_updated_at = m4.updated_at.isoformat() if m4.updated_at else m4_updated_at
            m4_updated_by = m4.updated_by or m4_updated_by
            m4_notes = m4.notes or m4_notes
            m4_driver_name = m4.driver_name or m4_driver_name
            m4_driver_phone = m4.driver_phone or m4_driver_phone
            m4_license_plate = m4.license_plate or m4_license_plate

        items.append(DeliveryMilestoneItem(
            step=4,
            code="DELIVERING",
            name="Đang giao",
            status=m4_status,
            updated_at=m4_updated_at,
            updated_by=m4_updated_by,
            notes=m4_notes,
            driver_name=m4_driver_name,
            driver_phone=m4_driver_phone,
            license_plate=m4_license_plate,
        ))

        # Mốc 5: DELIVERED (Đã giao)
        m5 = milestone_map.get("DELIVERED")
        m5_status = "PENDING"
        m5_updated_at = None
        m5_updated_by = None
        m5_notes = None

        if clean_status in ["delivered", "completed"]:
            m5_status = "COMPLETED"
            deliv_hist = next((h for h in histories if str(h.to_status).lower() in ["delivered", "completed"]), None)
            m5_updated_at = deliv_hist.changed_at.isoformat() if deliv_hist and deliv_hist.changed_at else (order.updated_at.isoformat() if order.updated_at else None)
            m5_updated_by = deliv_hist.changed_by if deliv_hist else "Người nhận hàng"
            m5_notes = deliv_hist.note or "Đại lý đã kiểm tra niêm phong và ký biên bản giao nhận hàng đủ."

        if m5 and m5.status == "COMPLETED":
            m5_status = "COMPLETED"
            m5_updated_at = m5.updated_at.isoformat() if m5.updated_at else m5_updated_at
            m5_updated_by = m5.updated_by or m5_updated_by
            m5_notes = m5.notes or m5_notes

        items.append(DeliveryMilestoneItem(
            step=5,
            code="DELIVERED",
            name="Đã giao",
            status=m5_status,
            updated_at=m5_updated_at,
            updated_by=m5_updated_by,
            notes=m5_notes,
        ))

        # 5. Lưu đồng bộ vào bảng order_delivery_milestones nếu chưa có bản ghi
        for it in items:
            rec = milestone_map.get(it.code)
            if not rec:
                dt_val = None
                if it.updated_at:
                    try:
                        dt_val = datetime.fromisoformat(it.updated_at)
                    except Exception:
                        dt_val = None
                new_milestone = OrderDeliveryMilestone(
                    order_id=order.id,
                    milestone_code=it.code,
                    milestone_name=it.name,
                    step_order=it.step,
                    status=it.status,
                    updated_at=dt_val,
                    updated_by=it.updated_by,
                    notes=it.notes,
                    dispatch_id=it.dispatch_id,
                    driver_name=it.driver_name,
                    driver_phone=it.driver_phone,
                    license_plate=it.license_plate,
                )
                db.add(new_milestone)
        db.commit()

        # 6. Thông tin người nhận và địa chỉ giao
        receiver_name = getattr(delivery_prof, "delivery_receiver_name", None) or order.customer_name
        receiver_phone = getattr(delivery_prof, "delivery_phone", None) or getattr(order, "customer_phone", None)
        receiver_address = getattr(delivery_prof, "delivery_address", None) or getattr(order, "customer_address", None)
        expected_delivery_date = getattr(delivery_prof, "expected_delivery_date", None)

        current_stage = STAGE_MAPPING.get(clean_status, clean_status.capitalize())

        return DeliveryTimelineResponse(
            order_id=order.id,
            order_code=order.code or order.id,
            current_status=order.status or "pending",
            current_stage=current_stage,
            customer_id=str(order.customer_id),
            customer_name=order.customer_name,
            delivery_address=receiver_address,
            receiver_name=receiver_name,
            receiver_phone=receiver_phone,
            expected_delivery_date=expected_delivery_date,
            dispatch_id=m3_dispatch_id,
            milestones=items,
            updated_at=order.updated_at.isoformat() if order.updated_at else None,
        )

    @staticmethod
    def update_delivery_milestone(
        db: Session,
        order_id: str,
        payload: DeliveryMilestoneUpdateRequest,
        current_user: User,
    ) -> DeliveryTimelineResponse:
        """
        Cập nhật tiến trình cho một mốc giao hàng (dành cho bộ phận Kho, Vận tải hoặc Quản trị).
        """
        # 1. Tìm đơn hàng
        order = db.query(Order).filter(
            (Order.id == order_id) | (Order.code == order_id)
        ).first()

        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy đơn hàng với mã '{order_id}'."
            )

        # 2. Kiểm tra vai trò được phép cập nhật mốc giao hàng
        u_role = (current_user.role or "").strip().lower()
        allowed_roles = [
            "admin",
            "wh manager",
            "warehouse",
            "sales manager",
            "director",
            "manager",
        ]
        if u_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ bộ phận Kho vận, Quản lý hoặc Quản trị viên mới có quyền cập nhật tiến trình giao hàng."
            )

        # 3. Kiểm tra mã mốc hợp lệ
        valid_codes = [m[1] for m in DEFAULT_MILESTONES]
        clean_code = payload.milestone_code.strip().upper()
        if clean_code not in valid_codes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã mốc '{payload.milestone_code}' không hợp lệ. Cho phép: {', '.join(valid_codes)}."
            )

        # 4. Tìm hoặc tạo bản ghi mốc
        step_dict = {m[1]: (m[0], m[2]) for m in DEFAULT_MILESTONES}
        step_order, step_name = step_dict[clean_code]

        milestone = db.query(OrderDeliveryMilestone).filter(
            OrderDeliveryMilestone.order_id == order.id,
            OrderDeliveryMilestone.milestone_code == clean_code,
        ).first()

        now_utc = datetime.now(timezone.utc)
        user_display = f"{current_user.full_name or current_user.username} (User #{current_user.id})"

        if not milestone:
            milestone = OrderDeliveryMilestone(
                order_id=order.id,
                milestone_code=clean_code,
                milestone_name=step_name,
                step_order=step_order,
                status=payload.status,
                updated_at=now_utc,
                updated_by=user_display,
                notes=payload.notes,
                driver_name=payload.driver_name,
                driver_phone=payload.driver_phone,
                license_plate=payload.license_plate,
            )
            db.add(milestone)
        else:
            milestone.status = payload.status
            milestone.updated_at = now_utc
            milestone.updated_by = user_display
            if payload.notes is not None:
                milestone.notes = payload.notes
            if payload.driver_name is not None:
                milestone.driver_name = payload.driver_name
            if payload.driver_phone is not None:
                milestone.driver_phone = payload.driver_phone
            if payload.license_plate is not None:
                milestone.license_plate = payload.license_plate

        # 5. Đồng bộ trạng thái đơn hàng và ghi OrderStatusHistory
        old_status = order.status
        if clean_code == "DELIVERING" and payload.status in ["IN_PROGRESS", "COMPLETED"]:
            if order.status != "shipping":
                order.status = "shipping"
                order.updated_at = now_utc
                db.add(OrderStatusHistory(
                    order_id=order.id,
                    from_status=old_status,
                    to_status="shipping",
                    changed_by=user_display,
                    changed_at=now_utc,
                    note=payload.notes or "Bắt đầu giao hàng cho đại lý"
                ))
        elif clean_code == "DELIVERED" and payload.status == "COMPLETED":
            if order.status != "delivered":
                order.status = "delivered"
                order.updated_at = now_utc
                db.add(OrderStatusHistory(
                    order_id=order.id,
                    from_status=old_status,
                    to_status="delivered",
                    changed_by=user_display,
                    changed_at=now_utc,
                    note=payload.notes or "Đại lý đã nhận hàng thành công"
                ))

        db.commit()

        # 6. Trả về timeline mới nhất
        return DeliveryTrackingService.get_delivery_timeline(
            db=db,
            order_id=order.id,
            current_user=current_user,
        )
