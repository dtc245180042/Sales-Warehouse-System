from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.customer import Customer
from app.models.price_list import PriceList
from app.models.product_stock_profile import ProductStockProfile
from app.models.auth import User, UserRole
from app.models.customer_assignment import CustomerAssignment
from app.schemas.order import OrderCreate, OrderStatusUpdate
from app.services.product_service import ensure_seed_products
from app.services.customer_service import ensure_seed_customers

def _get_or_create_stock_profile(db: Session, product: Product, default_stock: int = 100) -> ProductStockProfile:
    profile = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == product.id).first()
    if not profile:
        profile = ProductStockProfile(
            product_id=product.id,
            sku=product.sku,
            stock=default_stock,
            min_stock=10,
            warehouse="Kho Tổng Hà Nội"
        )
        db.add(profile)
        db.flush()
    return profile

SEED_ORDERS = [
    {
        "id": "ORD-001",
        "code": "DH-2026-001",
        "customer_id": "CUS-001",
        "customer_name": "Nguyễn Quốc Cường",
        "customer_phone": "0903112233",
        "customer_address": "128 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. HCM",
        "subtotal": 32680000.0,
        "discount": 500000.0,
        "tax": 0.0,
        "total": 32180000.0,
        "paid_amount": 32180000.0,
        "change_amount": 0.0,
        "payment_method": "transfer",
        "payment_status": "paid",
        "status": "completed",
        "staff_id": "USR-003",
        "staff_name": "Lê Thị Nhân Viên Kinh Doanh",
        "note": "Giao giờ hành chính, gọi trước 15 phút.",
        "created_at": datetime(2026, 10, 1, 10, 15, tzinfo=timezone.utc),
        "items": [
            {
                "product_id": "PRD-001",
                "sku": "IP15P-128-TI",
                "name": "iPhone 15 Pro 128GB Titan Tự Nhiên",
                "price": 26990000.0,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": 26990000.0
            },
            {
                "product_id": "PRD-006",
                "sku": "AP-PRO-2-USBC",
                "name": "AirPods Pro 2 USB-C MagSafe Case",
                "price": 5690000.0,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": 5690000.0
            }
        ]
    },
    {
        "id": "ORD-002",
        "code": "DH-2026-002",
        "customer_id": "CUS-002",
        "customer_name": "Trần Mai Phương",
        "customer_phone": "0918223344",
        "customer_address": "45 Phố Tràng Tiền, Hoàn Kiếm, Hà Nội",
        "subtotal": 34780000.0,
        "discount": 500000.0,
        "tax": 0.0,
        "total": 34280000.0,
        "paid_amount": 34280000.0,
        "change_amount": 0.0,
        "payment_method": "card",
        "payment_status": "paid",
        "status": "shipping",
        "staff_id": "USR-003",
        "staff_name": "Lê Thị Nhân Viên Kinh Doanh",
        "note": "Đóng gói bọc bóng khí cẩn thận.",
        "created_at": datetime(2026, 10, 1, 9, 40, tzinfo=timezone.utc),
        "items": [
            {
                "product_id": "PRD-003",
                "sku": "MBA-M3-16-512",
                "name": "MacBook Air 13 inch M3 Midnight",
                "price": 32490000.0,
                "quantity": 1,
                "discount": 500000.0,
                "subtotal": 31990000.0
            },
            {
                "product_id": "PRD-007",
                "sku": "LOGI-MXM3S-GR",
                "name": "Chuột Logitech MX Master 3S",
                "price": 2290000.0,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": 2290000.0
            }
        ]
    }
]


def ensure_seed_orders(db: Session):
    ensure_seed_products(db)
    ensure_seed_customers(db)
    if db.query(Order).count() == 0:
        for o_data in SEED_ORDERS:
            items_data = o_data.pop("items")
            order = Order(**o_data)
            for itm in items_data:
                order.items.append(OrderItem(**itm))
            db.add(order)
        db.commit()


def get_all_orders(
    db: Session,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    customer_id: Optional[str] = None,
    current_user: Optional[User] = None,
) -> List[Order]:
    ensure_seed_orders(db)
    query = db.query(Order)

    # Scope Guard: Sales Rep chỉ thấy các đơn hàng thuộc đại lý mình phụ trách
    if current_user and current_user.role == UserRole.SALES_REP.value:
        query = query.join(
            CustomerAssignment, Order.customer_id == CustomerAssignment.customer_id
        ).filter(
            CustomerAssignment.assigned_staff_id == current_user.id
        )

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Order.code.ilike(s)) | (Order.customer_name.ilike(s)) | (Order.customer_phone.ilike(s))
        )
    if status_filter and status_filter != "all":
        query = query.filter(Order.status == status_filter)
    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
    orders = query.order_by(Order.created_at.desc()).all()
    for o in orders:
        _attach_delivery_profile(o, db)
    return orders


def _attach_delivery_profile(order: Optional[Order], db: Session) -> Optional[Order]:
    if not order:
        return None
    from app.models.order_delivery_profile import OrderDeliveryProfile
    prof = db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order.id).first()
    if prof:
        order.delivery_address_id = prof.delivery_address_id
        order.delivery_address_name = getattr(prof, "delivery_address_name", None)
        order.delivery_receiver_name = prof.delivery_receiver_name
        order.delivery_phone = prof.delivery_phone
        order.delivery_address = prof.delivery_address
        order.delivery_notes = prof.delivery_notes
    else:
        order.delivery_address_id = None
        order.delivery_address_name = None
        order.delivery_receiver_name = None
        order.delivery_phone = None
        order.delivery_address = None
        order.delivery_notes = None
    return order


def get_order_by_id(db: Session, order_id: str, current_user: Optional[User] = None) -> Order:
    ensure_seed_orders(db)
    order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng '{order_id}'."
        )

    # Scope Guard: Sales Rep truy cập đơn của đại lý ngoài phạm vi phụ trách -> trả 404 (chống IDOR)
    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == order.customer_id,
            CustomerAssignment.assigned_staff_id == current_user.id
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy đơn hàng '{order_id}'."
            )

    return _attach_delivery_profile(order, db)


def create_order(db: Session, order_in: OrderCreate, current_user: Optional[User] = None) -> Order:
    ensure_seed_orders(db)

    # Scope Guard: Sales Rep tạo đơn cho đại lý ngoài phạm vi phụ trách -> trả 404 (chống IDOR)
    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == order_in.customer_id,
            CustomerAssignment.assigned_staff_id == current_user.id
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy thông tin đại lý '{order_in.customer_id}' trong phạm vi phụ trách của bạn."
            )

    count = db.query(Order).count() + 1
    order_id = f"ORD-{str(count).zfill(3)}"
    while db.query(Order).filter(Order.id == order_id).first():
        count += 1
        order_id = f"ORD-{str(count).zfill(3)}"

    order_code = f"DH-2026-{str(count).zfill(3)}"
    while db.query(Order).filter(Order.code == order_code).first():
        count += 1
        order_code = f"DH-2026-{str(count).zfill(3)}"

    # 1. Trừ tồn kho và kiểm tra tính hợp lệ
    for item in order_in.items:
        prod = None
        str_pid = str(item.product_id).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        if not prod and item.sku:
            prod = db.query(Product).filter(Product.sku == item.sku).first()

        if prod:
            stock_profile = _get_or_create_stock_profile(db, prod, default_stock=100)
            if stock_profile.stock < item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sản phẩm '{prod.name}' không đủ tồn kho (Còn {stock_profile.stock}, yêu cầu {item.quantity})."
                )
            stock_profile.stock = max(0, stock_profile.stock - item.quantity)
            if stock_profile.stock == 0:
                prod.status = "out_of_stock"
            elif stock_profile.stock <= stock_profile.min_stock:
                prod.status = "low_stock"

    # 2. Tạo đơn hàng (Chỉ ghi các trường thuộc bảng Order gốc)
    valid_order_cols = {c.name for c in Order.__table__.columns}
    order_dict = order_in.model_dump(exclude={"items"})
    order_data = {k: v for k, v in order_dict.items() if k in valid_order_cols}
    order_data["id"] = order_id
    order_data["code"] = order_code
    if not order_data.get("total") or order_data.get("total") == 0.0:
        computed_total = sum(item.subtotal for item in order_in.items)
        order_data["total"] = computed_total
        order_data["subtotal"] = computed_total

    new_order = Order(**order_data)
    from app.services.volume_discount_service import calculate_volume_discount
    from app.models.volume_discount import VolumeDiscountPolicy

    for itm in order_in.items:
        itm_dict = itm.model_dump()
        itm_dict["product_id"] = str(itm_dict["product_id"])

        # Tính toán chiết khấu sản lượng tự động
        calc = calculate_volume_discount(
            db=db,
            product_id=itm_dict["product_id"],
            quantity=itm.quantity,
            customer_id=order_in.customer_id,
            current_user=current_user
        )
        if calc.applied_policy_id:
            itm_dict["applied_discount_policy_id"] = calc.applied_policy_id
            itm_dict["applied_discount_policy_name"] = calc.applied_discount_policy_name
            itm_dict["discount_rate"] = calc.discount_rate
            itm_dict["discount_amount"] = calc.total_discount

            # Tăng số lần áp dụng chính sách để bảo vệ cấm xóa cứng
            disc_policy = db.query(VolumeDiscountPolicy).filter(VolumeDiscountPolicy.id == calc.applied_policy_id).first()
            if disc_policy:
                disc_policy.applied_count += 1

        new_order.items.append(OrderItem(**itm_dict))

    db.add(new_order)

    # Xử lý & Lưu Profile điểm giao hàng đại lý (S3-04, SCRUM-441)
    if order_in.delivery_address_id or order_in.delivery_address:
        from app.services.customer_delivery_address_service import validate_delivery_address_for_customer
        from app.models.order_delivery_profile import OrderDeliveryProfile
        
        del_addr_id = order_in.delivery_address_id
        del_name = getattr(order_in, "delivery_address_name", None)
        rec_name = order_in.delivery_receiver_name
        rec_phone = order_in.delivery_phone
        rec_addr = order_in.delivery_address
        rec_notes = order_in.delivery_notes

        if del_addr_id:
            delivery_addr = validate_delivery_address_for_customer(db, order_in.customer_id, del_addr_id)
            if not del_name:
                del_name = delivery_addr.name
            if not rec_name:
                rec_name = delivery_addr.receiver_name
            if not rec_phone:
                rec_phone = delivery_addr.phone
            if not rec_addr:
                rec_addr = delivery_addr.address
            if not rec_notes:
                rec_notes = delivery_addr.directions_note

        delivery_profile = OrderDeliveryProfile(
            order_id=order_id,
            delivery_address_id=del_addr_id,
            delivery_address_name=del_name,
            delivery_receiver_name=rec_name,
            delivery_phone=rec_phone,
            delivery_address=rec_addr,
            delivery_notes=rec_notes,
        )
        db.add(delivery_profile)

    # 3. Khóa bảng giá nếu có liên kết (SCRUM-416)
    if order_in.price_list_id:
        pl = db.query(PriceList).filter(PriceList.id == order_in.price_list_id).first()
        if pl:
            pl.has_orders = True
            pl.orders_count += 1

    # 4. Cập nhật chi tiêu của khách hàng
    cus = db.query(Customer).filter(Customer.id == order_in.customer_id).first()
    if cus:
        cus.total_orders += 1
        cus.total_spent += order_in.total
        cus.last_order_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    db.commit()
    db.refresh(new_order)
    return _attach_delivery_profile(new_order, db)


def update_order_status(db: Session, order_id: str, new_status: str) -> Order:
    order = get_order_by_id(db, order_id)
    old_status = order.status

    # Nghiệp vụ kiểm tra hạn mức công nợ khi XUẤT HÀNG (Hàng rời kho: status -> shipping hoặc completed)
    if new_status in ["shipping", "completed"] and old_status not in ["shipping", "completed"]:
        unpaid = max(0.0, float(order.total or 0.0) - float(order.paid_amount or 0.0))
        if unpaid > 0 and order.customer_id:
            from app.services.customer_credit_service import get_or_create_credit_profile, check_credit_for_dispatch
            # Khóa dòng bi quan (Pessimistic Lock) giữ khóa đến hết transaction để chống Race Condition khi xuất kho đồng thời
            cred_prof = get_or_create_credit_profile(db=db, customer_id=order.customer_id, for_update=True)
            chk = check_credit_for_dispatch(db=db, customer_id=order.customer_id, unpaid_amount=unpaid, order_id=order.id)
            if not chk["allowed"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=chk["error_message"]
                )
            # Cập nhật ngay dư nợ đã xuất trên dòng đang khóa để luồng kế tiếp đọc được ngay qua Current Read
            cred_prof.current_debt = int(cred_prof.current_debt or 0) + int(round(unpaid))

        # Ghi nhận thời điểm xuất kho thực tế dispatched_at
        from app.models.order_delivery_profile import OrderDeliveryProfile
        prof = db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order.id).first()
        if not prof:
            prof = OrderDeliveryProfile(order_id=order.id, dispatched_at=datetime.now(timezone.utc))
            db.add(prof)
        elif not getattr(prof, "dispatched_at", None):
            prof.dispatched_at = datetime.now(timezone.utc)

    # Nếu chuyển sang hủy từ trạng thái chưa hủy, hoàn lại tồn kho
    if new_status == "cancelled" and old_status != "cancelled":
        for itm in order.items:
            prod = None
            str_pid = str(itm.product_id).strip()
            if str_pid.isdigit():
                prod = db.query(Product).filter(Product.id == int(str_pid)).first()
            if not prod and itm.sku:
                prod = db.query(Product).filter(Product.sku == itm.sku).first()

            if prod:
                stock_profile = _get_or_create_stock_profile(db, prod, default_stock=100)
                stock_profile.stock += itm.quantity
                if stock_profile.stock > stock_profile.min_stock:
                    prod.status = "active"
                elif stock_profile.stock > 0:
                    prod.status = "low_stock"

    order.status = new_status
    db.flush()

    # SCRUM-452: Đồng bộ cache dư nợ của đại lý (current_debt) ngay trong transaction
    if order.customer_id:
        try:
            from app.services.customer_credit_service import get_or_create_credit_profile, calculate_actual_customer_debt
            cred_prof = get_or_create_credit_profile(db, order.customer_id, for_update=True)
            cred_prof.current_debt = calculate_actual_customer_debt(db, order.customer_id)
        except Exception:
            pass

    db.commit()
    db.refresh(order)
    return _attach_delivery_profile(order, db)


def cancel_order(db: Session, order_id: str) -> Order:
    return update_order_status(db, order_id, "cancelled")
