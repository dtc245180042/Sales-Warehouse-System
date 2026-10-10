from typing import List, Optional, Any
from datetime import datetime, timezone
from sqlalchemy import or_
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
        order.expected_delivery_date = getattr(prof, "expected_delivery_date", None)
    else:
        order.delivery_address_id = None
        order.delivery_address_name = None
        order.delivery_receiver_name = None
        order.delivery_phone = None
        order.delivery_address = None
        order.delivery_notes = None
        order.expected_delivery_date = None
    return order


def _enrich_order_lock_warning(db: Session, order: Order) -> Order:
    """Gắn cảnh báo khóa giao dịch vào response đơn hàng (SC-228)."""
    from app.models.customer_lock import CustomerLockProfile
    from app.models.customer import Customer
    cus = db.query(Customer).filter(Customer.id == order.customer_id).first()
    lock_prof = db.query(CustomerLockProfile).filter(CustomerLockProfile.customer_id == order.customer_id).first()
    is_locked = bool(lock_prof and lock_prof.is_locked) or (cus and cus.status == "locked")
    if is_locked:
        reason = (lock_prof.lock_reason if lock_prof else None) or "Mất khả năng thanh toán/Quá hạn nợ"
        order.customer_is_locked = True
        order.customer_lock_warning = (
            f"Cảnh báo: Đại lý '{order.customer_name}' đang bị khoá giao dịch (Lý do: {reason}). "
            "Đơn hàng đang dở vẫn được phép tiếp tục xử lý theo quy định."
        )
    else:
        order.customer_is_locked = False
        order.customer_lock_warning = None
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
        # Nếu đơn nháp do chính sales rep tạo, cho phép xem
        is_owner = (order.staff_id and str(order.staff_id) == str(current_user.id))
        if not is_owner:
            assignment = db.query(CustomerAssignment).filter(
                CustomerAssignment.customer_id == order.customer_id,
                CustomerAssignment.assigned_staff_id == current_user.id
            ).first()
            if not assignment:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy đơn hàng '{order_id}'."
                )

    order = _attach_delivery_profile(order, db)
    return _enrich_order_lock_warning(db, order)


def calculate_order_totals(
    db: Session,
    customer_id: str,
    items: List[Any],
    price_list_id: Optional[int] = None,
    current_user: Optional[User] = None
) -> dict:
    """
    Tính toán tạm thời tổng tiền hàng, chiết khấu và tổng phải thu realtime (S3-09, S4-01).
    Tự động áp giá theo nhóm khách hàng, kiểm tra giá sàn và tính lại chiết khấu sản lượng.
    """
    from app.models.customer import Customer
    from app.services.order_pricing_service import lookup_line_pricing

    customer = db.query(Customer).filter((Customer.id == customer_id) | (Customer.code == customer_id)).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Không tìm thấy đại lý '{customer_id}'.")

    subtotal = 0.0
    total_discount = 0.0
    item_responses = []
    approval_reasons = []

    for item in items:
        pid = getattr(item, "product_id", None)
        qty = int(getattr(item, "quantity", 1) or 1)
        req_price = getattr(item, "price", None)
        unit = getattr(item, "unit", "cái")
        sku = getattr(item, "sku", None)

        pricing_res = lookup_line_pricing(
            db=db,
            customer_id=customer.id,
            product_id=str(pid) if pid is not None else None,
            sku=sku,
            quantity=qty,
            custom_price=float(req_price) if req_price is not None and req_price > 0 else None,
            strict_block=False
        )

        line_subtotal = pricing_res.applied_unit_price * qty
        line_discount = pricing_res.total_discount

        subtotal += line_subtotal
        total_discount += line_discount

        if pricing_res.is_below_floor and pricing_res.approval_reason:
            approval_reasons.append(pricing_res.approval_reason)

        item_responses.append({
            "product_id": str(pricing_res.product_id),
            "sku": pricing_res.sku,
            "name": pricing_res.product_name,
            "unit": unit or pricing_res.unit,
            "unit_price": pricing_res.applied_unit_price,
            "floor_price": pricing_res.floor_price,
            "is_below_floor": pricing_res.is_below_floor,
            "requires_approval": pricing_res.requires_approval,
            "quantity": qty,
            "discount_amount": line_discount,
            "discount_rate": float(pricing_res.discount_rate or 0.0),
            "subtotal": max(0.0, line_subtotal - line_discount),
            "applied_discount_name": pricing_res.applied_discount_policy_name,
            "warning_message": pricing_res.approval_reason if pricing_res.is_below_floor else None
        })

    final_total = max(0.0, subtotal - total_discount)
    requires_approval = len(approval_reasons) > 0

    return {
        "subtotal": subtotal,
        "discount": total_discount,
        "total": final_total,
        "requires_approval": requires_approval,
        "approval_reasons": approval_reasons,
        "warning_message": "; ".join(approval_reasons) if requires_approval else None,
        "items": item_responses
    }


def search_products_for_order(
    db: Session,
    query_str: Optional[str] = None,
    customer_id: Optional[str] = None
) -> List[dict]:
    """Tìm kiếm hàng hoá và trả về các đơn vị tính hợp lệ kèm tồn khả dụng (S3-09, S4-03)."""
    query = db.query(Product).filter(or_(Product.status.ilike("active"), Product.status.is_(None)))
    if query_str and query_str.strip():
        s = f"%{query_str.strip()}%"
        query = query.filter((Product.sku.ilike(s)) | (Product.name.ilike(s)))
    products = query.limit(30).all()

    from app.services.inventory_reservation_service import calculate_sku_availability, get_customer_servicing_warehouse
    servicing_wh, _ = get_customer_servicing_warehouse(db, customer_id) if customer_id else ("Kho Tổng Hà Nội", "WH-HANOI")

    results = []
    for p in products:
        available_units = [p.unit or "cái"]
        if p.packaging_spec:
            spec_lower = p.packaging_spec.lower()
            for u in ["hộp", "thùng", "lon", "gói", "chai", "bộ", "cặp", "kg", "cái"]:
                if u in spec_lower and u not in available_units:
                    available_units.append(u)
        else:
            for default_u in ["hộp", "thùng"]:
                if default_u not in available_units:
                    available_units.append(default_u)

        avail_info = calculate_sku_availability(
            db=db,
            customer_id=customer_id,
            product_id=str(p.id),
            warehouse_name=servicing_wh
        )
        item_price = float(p.price or 0.0)

        results.append({
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "price": item_price,
            "sale_price": item_price,
            "stock": avail_info.available_stock,
            "available_stock": avail_info.available_stock,
            "physical_stock": avail_info.physical_stock,
            "reserved_stock": avail_info.reserved_stock,
            "warehouse": servicing_wh,
            "unit": p.unit or "cái",
            "packaging_spec": p.packaging_spec,
            "available_units": available_units,
        })
    return results


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

    # 0. Kiểm tra trạng thái khoá giao dịch của đại lý (SC-228)
    from app.services.customer_lock_service import check_customer_order_allowed
    allowed, lock_msg = check_customer_order_allowed(order_in.customer_id, db)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=lock_msg
        )
    is_draft = (order_in.status == "draft")

    # Ràng buộc khi tạo đơn chính thức (không phải nháp):
    if not is_draft:
        if order_in.expected_delivery_date:
            try:
                exp_date_str = str(order_in.expected_delivery_date).split("T")[0]
                exp_date = datetime.strptime(exp_date_str, "%Y-%m-%d").date()
                if exp_date < datetime.now(timezone.utc).date():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Ngày giao mong muốn không được là ngày trong quá khứ."
                    )
            except ValueError:
                pass

        if order_in.delivery_address_id:
            from app.services.customer_delivery_address_service import validate_delivery_address_for_customer
            validate_delivery_address_for_customer(db, order_in.customer_id, order_in.delivery_address_id)

    from app.models.stock_reservation import StockReservation
    count = db.query(Order).count() + 1
    order_id = f"ORD-{str(count).zfill(3)}"
    while (
        db.query(Order).filter(Order.id == order_id).first() or
        db.query(StockReservation).filter(StockReservation.order_id == order_id).first()
    ):
        count += 1
        order_id = f"ORD-{str(count).zfill(3)}"

    order_code = f"DH-2026-{str(count).zfill(3)}"
    while db.query(Order).filter(Order.code == order_code).first():
        count += 1
        order_code = f"DH-2026-{str(count).zfill(3)}"

    # 2. Tạo đơn hàng (Chỉ ghi các trường thuộc bảng Order gốc)
    valid_order_cols = {c.name for c in Order.__table__.columns}
    order_dict = order_in.model_dump(exclude={"items", "expected_delivery_date"})
    order_data = {k: v for k, v in order_dict.items() if k in valid_order_cols}
    order_data["id"] = order_id
    order_data["code"] = order_code
    if current_user and not order_data.get("staff_id"):
        order_data["staff_id"] = str(current_user.id)
        order_data["staff_name"] = current_user.full_name or current_user.username

    if not order_data.get("total") or order_data.get("total") == 0.0:
        computed_total = sum(item.subtotal for item in order_in.items)
        order_data["total"] = computed_total
        order_data["subtotal"] = computed_total

    # S4-02: Kiểm tra hạn mức công nợ & nợ quá hạn khi tạo đơn chính thức (SCRUM-496, SCRUM-497, SCRUM-498)
    credit_approval_reason = None
    if not is_draft and order_in.customer_id:
        computed_order_total = float(order_data.get("total", 0.0) or 0.0)
        order_paid = float(order_data.get("paid_amount", 0.0) or 0.0)
        unpaid = max(0.0, computed_order_total - order_paid)

        from app.services.customer_credit_service import check_credit_for_order_placement
        credit_check = check_credit_for_order_placement(
            db=db,
            customer_id=order_in.customer_id,
            unpaid_amount=unpaid,
            order_id=None,
        )
        if credit_check.get("is_blocked"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=credit_check["error_message"]
            )
        if credit_check.get("requires_approval"):
            order_data["status"] = "pending_approval"
            order_data["requires_approval"] = True
            credit_approval_reason = credit_check.get("approval_reason")
            order_data["approval_reason"] = credit_approval_reason

    new_order = Order(**order_data)
    from app.services.order_pricing_service import lookup_line_pricing
    from app.models.volume_discount import VolumeDiscountPolicy

    has_subfloor = False
    subfloor_reasons = []
    effective_pl_id = order_in.price_list_id

    for itm in order_in.items:
        itm_dict = itm.model_dump()
        itm_dict["subtotal"] = float(itm.subtotal if itm.subtotal is not None and itm.subtotal > 0 else (itm.price * itm.quantity))
        itm_dict["product_id"] = str(itm_dict["product_id"])

        # Tra cứu giá áp dụng, giá sàn và chiết khấu theo sản lượng (SCRUM-488..SCRUM-492)
        # Khách hàng đại lý bắt buộc phải có bảng giá hiệu lực (SCRUM-492)
        cust_obj = db.query(Customer).filter(
            or_(Customer.id == order_in.customer_id, Customer.code == order_in.customer_id)
        ).first()
        cust_group = (cust_obj.customer_group if cust_obj else "RETAIL") or "RETAIL"
        is_agent_group = cust_group != "RETAIL" or bool(order_in.price_list_id)

        pricing_res = lookup_line_pricing(
            db=db,
            customer_id=order_in.customer_id,
            product_id=itm_dict["product_id"],
            sku=itm.sku,
            quantity=itm.quantity,
            custom_price=itm.price if itm.price is not None and itm.price > 0 else None,
            strict_block=bool(not is_draft and is_agent_group)
        )

        if pricing_res.price_list_id and not effective_pl_id:
            effective_pl_id = pricing_res.price_list_id
            new_order.price_list_id = pricing_res.price_list_id

        # Ghi nhận giá sàn và trạng thái bán dưới sàn (SCRUM-490)
        itm_dict["floor_price"] = pricing_res.floor_price
        itm_dict["is_below_floor"] = pricing_res.is_below_floor

        if pricing_res.is_below_floor and pricing_res.approval_reason:
            has_subfloor = True
            subfloor_reasons.append(pricing_res.approval_reason)

        if pricing_res.applied_discount_policy_id:
            itm_dict["applied_discount_policy_id"] = pricing_res.applied_discount_policy_id
            itm_dict["applied_discount_policy_name"] = pricing_res.applied_discount_policy_name
            itm_dict["discount_rate"] = pricing_res.discount_rate
            itm_dict["discount_amount"] = int(round(pricing_res.total_discount))

            if not is_draft:
                disc_policy = db.query(VolumeDiscountPolicy).filter(
                    VolumeDiscountPolicy.id == pricing_res.applied_discount_policy_id
                ).first()
                if disc_policy:
                    disc_policy.applied_count += 1

        new_order.items.append(OrderItem(**itm_dict))

    # Đánh dấu đơn hàng cần duyệt nếu có sản phẩm bán dưới giá sàn hoặc vượt hạn mức (SCRUM-490, SCRUM-498)
    if has_subfloor:
        subfloor_text = "; ".join(subfloor_reasons)
        if credit_approval_reason:
            new_order.approval_reason = f"{credit_approval_reason}; {subfloor_text}"
        else:
            new_order.approval_reason = subfloor_text
        new_order.requires_approval = True
        if not is_draft and new_order.status in ["pending", "confirmed"]:
            new_order.status = "pending_approval"

    # Kiểm tra tồn khả dụng & Giữ chỗ tồn kho an toàn nếu KHÔNG PHẢI đơn nháp (SCRUM-504, SCRUM-505, SCRUM-506)
    if not is_draft:
        from app.services.inventory_reservation_service import reserve_stock_for_order
        reserve_stock_for_order(db=db, order=new_order)

    db.add(new_order)

    # Xử lý & Lưu Profile điểm giao hàng đại lý & ngày giao mong muốn (S3-04, S3-09)
    if order_in.delivery_address_id or order_in.delivery_address or order_in.expected_delivery_date:
        from app.services.customer_delivery_address_service import validate_delivery_address_for_customer
        from app.models.order_delivery_profile import OrderDeliveryProfile
        
        del_addr_id = order_in.delivery_address_id
        del_name = getattr(order_in, "delivery_address_name", None)
        rec_name = order_in.delivery_receiver_name
        rec_phone = order_in.delivery_phone
        rec_addr = order_in.delivery_address
        rec_notes = order_in.delivery_notes

        if del_addr_id:
            try:
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
            except Exception:
                if not is_draft:
                    raise

        delivery_profile = OrderDeliveryProfile(
            order_id=order_id,
            delivery_address_id=del_addr_id,
            delivery_address_name=del_name,
            delivery_receiver_name=rec_name,
            delivery_phone=rec_phone,
            delivery_address=rec_addr,
            delivery_notes=rec_notes,
            expected_delivery_date=order_in.expected_delivery_date,
        )
        db.add(delivery_profile)

    # 3. Khóa bảng giá nếu có liên kết (CHỈ KHI KHÔNG PHẢI NHÁP)
    if not is_draft:
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


def update_draft_order(
    db: Session,
    order_id: str,
    draft_in: Any,
    current_user: Optional[User] = None
) -> Order:
    """Cập nhật đơn hàng đang soạn (nháp) và lưu lại (S3-09, SCRUM-230)."""
    order = get_order_by_id(db, order_id, current_user=current_user)
    if order.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ có thể cập nhật đơn hàng ở trạng thái 'draft'. Đơn hàng này có trạng thái '{order.status}'."
        )

    if getattr(draft_in, "customer_id", None):
        order.customer_id = draft_in.customer_id
    if getattr(draft_in, "customer_name", None):
        order.customer_name = draft_in.customer_name
    if getattr(draft_in, "customer_phone", None) is not None:
        order.customer_phone = draft_in.customer_phone
    if getattr(draft_in, "customer_address", None) is not None:
        order.customer_address = draft_in.customer_address
    if getattr(draft_in, "price_list_id", None) is not None:
        order.price_list_id = draft_in.price_list_id
    if getattr(draft_in, "note", None) is not None:
        order.note = draft_in.note

    if getattr(draft_in, "items", None) is not None:
        # Xóa các dòng hàng cũ
        db.query(OrderItem).filter(OrderItem.order_id == order.id).delete()
        db.flush()

        from app.services.volume_discount_service import calculate_volume_discount
        subtotal = 0.0
        total_discount = 0.0
        for itm in draft_in.items:
            itm_dict = itm.model_dump()
            itm_dict["subtotal"] = float(itm.subtotal if itm.subtotal is not None and itm.subtotal > 0 else (itm.price * itm.quantity))
            itm_dict["order_id"] = order.id
            itm_dict["product_id"] = str(itm_dict["product_id"])

            calc = calculate_volume_discount(
                db=db,
                product_id=itm_dict["product_id"],
                quantity=itm.quantity,
                customer_id=order.customer_id,
                current_user=current_user
            )
            if calc.applied_policy_id:
                itm_dict["applied_discount_policy_id"] = calc.applied_policy_id
                itm_dict["applied_discount_policy_name"] = calc.applied_discount_policy_name
                itm_dict["discount_rate"] = calc.discount_rate
                itm_dict["discount_amount"] = calc.total_discount

            order_item = OrderItem(**itm_dict)
            db.add(order_item)
            subtotal += (itm.price * itm.quantity)
            total_discount += float(itm_dict.get("discount_amount") or 0.0)

        order.subtotal = getattr(draft_in, "subtotal", None) or subtotal
        order.discount = getattr(draft_in, "discount", None) or total_discount
        order.total = getattr(draft_in, "total", None) or max(0.0, order.subtotal - order.discount)

    # Cập nhật Profile điểm giao hàng
    from app.models.order_delivery_profile import OrderDeliveryProfile
    prof = db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == order.id).first()
    if not prof:
        prof = OrderDeliveryProfile(order_id=order.id)
        db.add(prof)

    if getattr(draft_in, "delivery_address_id", None) is not None:
        prof.delivery_address_id = draft_in.delivery_address_id
    if getattr(draft_in, "delivery_address_name", None) is not None:
        prof.delivery_address_name = draft_in.delivery_address_name
    if getattr(draft_in, "delivery_receiver_name", None) is not None:
        prof.delivery_receiver_name = draft_in.delivery_receiver_name
    if getattr(draft_in, "delivery_phone", None) is not None:
        prof.delivery_phone = draft_in.delivery_phone
    if getattr(draft_in, "delivery_address", None) is not None:
        prof.delivery_address = draft_in.delivery_address
    if getattr(draft_in, "delivery_notes", None) is not None:
        prof.delivery_notes = draft_in.delivery_notes
    if getattr(draft_in, "expected_delivery_date", None) is not None:
        prof.expected_delivery_date = draft_in.expected_delivery_date

    order.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return _attach_delivery_profile(order, db)


def submit_draft_order(
    db: Session,
    order_id: str,
    current_user: Optional[User] = None
) -> Order:
    """Chốt đơn nháp và chuyển thành đơn hàng chính thức (trừ kho và kích hoạt kiểm tra công nợ) (S3-09)."""
    order = get_order_by_id(db, order_id, current_user=current_user)
    if order.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đơn hàng '{order_id}' không ở trạng thái nháp (trạng thái hiện tại: '{order.status}')."
        )

    if not order.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đơn hàng phải có ít nhất một mặt hàng trước khi chốt đơn."
        )

    # 1. Ràng buộc ngày giao mong muốn
    if getattr(order, "expected_delivery_date", None):
        try:
            exp_date_str = str(order.expected_delivery_date).split("T")[0]
            exp_date = datetime.strptime(exp_date_str, "%Y-%m-%d").date()
            if exp_date < datetime.now(timezone.utc).date():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Ngày giao mong muốn không được là ngày trong quá khứ."
                )
        except ValueError:
            pass

    # 2. Ràng buộc điểm giao hàng đại lý
    if getattr(order, "delivery_address_id", None):
        from app.services.customer_delivery_address_service import validate_delivery_address_for_customer
        validate_delivery_address_for_customer(db, order.customer_id, order.delivery_address_id)

    # 3. Kiểm tra tồn khả dụng & Giữ chỗ tồn kho an toàn (SCRUM-504, SCRUM-505, SCRUM-506)
    from app.services.inventory_reservation_service import reserve_stock_for_order
    reserve_stock_for_order(db=db, order=order)

    # 4. Tăng số lần áp dụng chính sách chiết khấu
    from app.models.volume_discount import VolumeDiscountPolicy
    for item in order.items:
        if getattr(item, "applied_discount_policy_id", None):
            disc_policy = db.query(VolumeDiscountPolicy).filter(
                VolumeDiscountPolicy.id == item.applied_discount_policy_id
            ).first()
            if disc_policy:
                disc_policy.applied_count += 1

    # 5. Cập nhật chi tiêu khách hàng
    cus = db.query(Customer).filter(Customer.id == order.customer_id).first()
    if cus:
        cus.total_orders += 1
        cus.total_spent += float(order.total or 0.0)
        cus.last_order_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 6. Kiểm tra bảng giá hiệu lực và giá sàn khi chốt đơn (SCRUM-490, SCRUM-492)
    from app.services.order_pricing_service import lookup_line_pricing
    cust_obj = db.query(Customer).filter(
        or_(Customer.id == order.customer_id, Customer.code == order.customer_id)
    ).first()
    cust_group = (cust_obj.customer_group if cust_obj else "RETAIL") or "RETAIL"
    is_agent_group = cust_group != "RETAIL" or bool(order.price_list_id)

    subfloor_reasons = []
    for item in order.items:
        pricing_res = lookup_line_pricing(
            db=db,
            customer_id=order.customer_id,
            product_id=str(item.product_id),
            sku=item.sku,
            quantity=item.quantity,
            custom_price=item.price,
            strict_block=is_agent_group  # Chặn chốt đơn nếu đại lý chưa có bảng giá hiệu lực
        )
        item.floor_price = pricing_res.floor_price
        item.is_below_floor = pricing_res.is_below_floor
        if pricing_res.is_below_floor and pricing_res.approval_reason:
            subfloor_reasons.append(pricing_res.approval_reason)

    # S4-02: Kiểm tra hạn mức công nợ & nợ quá hạn khi chốt đơn nháp (SCRUM-496, SCRUM-497, SCRUM-498)
    unpaid = max(0.0, float(order.total or 0.0) - float(order.paid_amount or 0.0))
    from app.services.customer_credit_service import check_credit_for_order_placement
    credit_check = check_credit_for_order_placement(
        db=db,
        customer_id=order.customer_id,
        unpaid_amount=unpaid,
        order_id=order.id,
    )
    if credit_check.get("is_blocked"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=credit_check["error_message"]
        )

    all_approval_reasons = list(subfloor_reasons)
    if credit_check.get("requires_approval") and credit_check.get("approval_reason"):
        all_approval_reasons.append(credit_check["approval_reason"])

    if all_approval_reasons:
        order.requires_approval = True
        order.approval_reason = "; ".join(all_approval_reasons)
        order.status = "pending_approval"
    else:
        order.status = "pending"
        order.requires_approval = False
        order.approval_reason = None

    order.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return _attach_delivery_profile(order, db)


def get_draft_orders(
    db: Session,
    current_user: Optional[User] = None
) -> List[Order]:
    """Lấy danh sách các đơn hàng nháp đang soạn dở (S3-09, SCRUM-230)."""
    ensure_seed_orders(db)
    query = db.query(Order).filter(Order.status == "draft")
    if current_user and current_user.role == UserRole.SALES_REP.value:
        query = query.filter(
            or_(
                Order.staff_id == str(current_user.id),
                Order.staff_id == current_user.id,
            )
        )
    orders = query.order_by(Order.updated_at.desc()).all()
    for o in orders:
        _attach_delivery_profile(o, db)
    return orders



def update_order_status(
    db: Session,
    order_id: str,
    new_status: str,
    current_user: Optional[User] = None,
) -> Order:
    order = get_order_by_id(db, order_id)
    old_status = order.status

    # RBAC Guard: Kiểm tra phân quyền vai trò đối với các hành động chuyển trạng thái đơn hàng (S4-05, SCRUM-203, SCRUM-498)
    if current_user:
        u_role = (current_user.role or "").strip().lower()

        # 1. Duyệt đơn hàng vượt hạn mức công nợ hoặc dưới sàn (pending_approval -> confirmed / approved) (S4-05)
        if old_status == "pending_approval" and new_status in ["confirmed", "approved"]:
            allowed_approvers = ["admin", "sales manager", "director", "accountant", "manager"]
            if u_role not in allowed_approvers:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Chỉ Quản lý kinh doanh (Sales Manager), Ban giám đốc hoặc Kế toán mới có quyền phê duyệt đơn hàng vượt hạn mức công nợ hoặc dưới giá sàn."
                )

        # 2. Duyệt / Xác nhận đơn hàng chờ xử lý (pending -> confirmed)
        if old_status == "pending" and new_status in ["confirmed", "approved"]:
            allowed_confirmers = ["admin", "sales manager", "director", "wh manager", "manager"]
            if u_role not in allowed_confirmers:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Nhân viên kinh doanh không có quyền duyệt/xác nhận đơn hàng. Yêu cầu Quản lý kinh doanh hoặc Quản trị viên."
                )

        # 3. Xuất kho & bắt đầu giao hàng (confirmed -> shipping)
        if new_status == "shipping" and old_status != "shipping":
            allowed_shippers = ["admin", "director", "wh manager", "warehouse", "sales manager", "manager"]
            if u_role not in allowed_shippers:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Nhân viên kinh doanh không có quyền chuyển đơn hàng sang trạng thái giao hàng. Thao tác này do bộ phận Kho vận phụ trách."
                )

        # 4. Xác nhận hoàn tất đơn hàng (shipping -> completed)
        if new_status == "completed" and old_status != "completed":
            allowed_completers = ["admin", "director", "wh manager", "warehouse", "accountant", "sales manager", "manager"]
            if u_role not in allowed_completers:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Nhân viên kinh doanh không có quyền xác nhận hoàn tất đơn hàng. Thao tác này do bộ phận Kho hoặc Kế toán phụ trách."
                )

        # 5. Hủy đơn hàng (cancelled)
        if new_status == "cancelled" and old_status != "cancelled":
            if u_role == "sales rep":
                is_owner = (
                    (order.staff_id and str(order.staff_id) == str(current_user.id)) or
                    (order.staff_name and current_user.full_name and order.staff_name == current_user.full_name)
                )
                if not is_owner:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bạn chỉ có thể yêu cầu hủy đơn hàng do chính mình lập."
                    )
                if old_status in ["shipping", "completed"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Không thể hủy đơn hàng đang giao hoặc đã hoàn thành."
                    )

    # S4-02: Khi duyệt đơn từ pending_approval sang confirmed / pending / shipping / completed / approved
    if old_status == "pending_approval" and new_status in ["confirmed", "pending", "shipping", "completed", "approved"]:
        order.requires_approval = False

    # Nghiệp vụ kiểm tra hạn mức công nợ khi XUẤT HÀNG (Hàng rời kho: status -> shipping hoặc completed)
    if new_status in ["shipping", "completed"] and old_status not in ["shipping", "completed"]:
        unpaid = max(0.0, float(order.total or 0.0) - float(order.paid_amount or 0.0))
        if unpaid > 0 and order.customer_id:
            from app.services.customer_credit_service import get_or_create_credit_profile, check_credit_for_dispatch
            # Khóa dòng bi quan (Pessimistic Lock) giữ khóa đến hết transaction để chống Race Condition khi xuất kho đồng thời
            is_approved = bool(order.approval_reason) or (old_status == "pending_approval" and new_status in ["confirmed", "shipping", "completed"])
            cred_prof = get_or_create_credit_profile(db=db, customer_id=order.customer_id, for_update=True)
            chk = check_credit_for_dispatch(
                db=db,
                customer_id=order.customer_id,
                unpaid_amount=unpaid,
                order_id=order.id,
                is_manager_approved=is_approved
            )
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

        # Hoàn tất giữ chỗ và trừ tồn kho vật lý (SCRUM-504)
        from app.services.inventory_reservation_service import fulfill_stock_reservations_for_order
        fulfill_stock_reservations_for_order(db, order.id)

    # Nếu chuyển sang hủy từ trạng thái chưa hủy, giải phóng tồn giữ chỗ (SCRUM-504, S4-06)
    if new_status == "cancelled" and old_status != "cancelled":
        from app.services.inventory_reservation_service import release_stock_reservations_for_order
        release_stock_reservations_for_order(db, order.id)

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
    order = _attach_delivery_profile(order, db)
    return _enrich_order_lock_warning(db, order)


def cancel_order(
    db: Session,
    order_id: str,
    current_user: Optional[User] = None,
) -> Order:
    return update_order_status(db, order_id, "cancelled", current_user=current_user)
