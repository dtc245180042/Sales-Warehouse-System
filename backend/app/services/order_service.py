from typing import List, Optional, Any
from datetime import datetime, timezone, timedelta
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
from app.schemas.order import (
    OrderCreate,
    OrderStatusUpdate,
    OrderItemCreate,
    PurchaseHistorySuggestionResponse,
    PurchaseHistoryItemSuggestion,
    PurchaseHistoryGroupSuggestion,
    LastOrderSummary,
    LastOrderItemSummary,
)
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
        line_discount = float(vol_calc.total_discount or 0.0)
        total_discount += line_discount

        item_responses.append({
            "product_id": str(prod.id if prod else pid),
            "sku": sku,
            "name": name,
            "unit": unit or (prod.unit if prod else "cái"),
            "unit_price": base_price,
            "quantity": qty,
            "discount_amount": line_discount,
            "discount_rate": float(vol_calc.discount_rate or 0.0),
            "subtotal": max(0.0, line_subtotal - line_discount),
            "applied_discount_name": vol_calc.applied_discount_policy_name
        })

    final_total = max(0.0, subtotal - total_discount)
    return {
        "subtotal": subtotal,
        "discount": total_discount,
        "total": final_total,
        "items": item_responses
    }


def search_products_for_order(db: Session, query_str: Optional[str] = None) -> List[dict]:
    """Tìm kiếm hàng hoá và trả về các đơn vị tính hợp lệ khi nhập đơn (S3-09, SCRUM-230)."""
    query = db.query(Product).filter(or_(Product.status.ilike("active"), Product.status.is_(None)))
    if query_str and query_str.strip():
        s = f"%{query_str.strip()}%"
        query = query.filter((Product.sku.ilike(s)) | (Product.name.ilike(s)))
    products = query.limit(30).all()

    p_ids = [p.id for p in products]
    stock_map = {}
    if p_ids:
        sps = db.query(ProductStockProfile).filter(ProductStockProfile.product_id.in_(p_ids)).all()
        stock_map = {sp.product_id: sp.stock for sp in sps}

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

        price_val = float(getattr(p, "price", 0.0) or getattr(p, "sale_price", 0.0) or 0.0)
        if price_val <= 0.0 and getattr(p, "cost_price", None):
            price_val = round(float(p.cost_price) * 1.2, -4)

        results.append({
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "price": price_val,
            "sale_price": price_val,
            "stock": stock_map.get(p.id, 100),
            "unit": p.unit or "cái",
            "packaging_spec": p.packaging_spec,
            "available_units": available_units,
        })
    return results


def calculate_order_totals(
    db: Session,
    customer_id: str,
    items: List[Any],
    price_list_id: Optional[int] = None,
    current_user: Optional[User] = None
) -> dict:
    """Tính toán tạm thời tổng tiền hàng, chiết khấu và tổng phải thu realtime (S3-09, SCRUM-230)."""
    from app.services.volume_discount_service import calculate_volume_discount
    from app.models.customer import Customer
    from app.models.price_list import PriceListItem

    customer = db.query(Customer).filter((Customer.id == customer_id) | (Customer.code == customer_id)).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Không tìm thấy đại lý '{customer_id}'.")

    subtotal = 0.0
    total_discount = 0.0
    item_responses = []

    for item in items:
        pid = getattr(item, "product_id", None)
        qty = int(getattr(item, "quantity", 1) or 1)
        req_price = getattr(item, "price", None)
        unit = getattr(item, "unit", "cái")

        prod = None
        str_pid = str(pid).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        if not prod:
            prod = db.query(Product).filter((Product.id == str_pid) | (Product.sku == str_pid) | (Product.name == str_pid)).first()

        sku = prod.sku if prod else ""
        name = prod.name if prod else f"Sản phẩm #{pid}"
        prod_price = float(getattr(prod, "price", 0.0) or getattr(prod, "sale_price", 0.0) or 0.0)
        if prod_price <= 0.0 and prod and getattr(prod, "cost_price", None):
            prod_price = round(float(prod.cost_price) * 1.2, -4)
        base_price = float(req_price if req_price is not None and req_price > 0 else prod_price)

        if price_list_id:
            pli = db.query(PriceListItem).filter(
                PriceListItem.price_list_id == price_list_id,
                (PriceListItem.product_id == prod.id if prod else False)
            ).first()
            if pli and pli.sale_price:
                base_price = float(pli.sale_price)

        line_subtotal = base_price * qty

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

        price_val = float(getattr(p, "price", 0.0) or getattr(p, "sale_price", 0.0) or 0.0)
        if price_val <= 0.0 and getattr(p, "cost_price", None):
            price_val = round(float(p.cost_price) * 1.2, -4)
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
            "price": price_val,
            "sale_price": price_val,
            "stock": stock_map.get(p.id, 100),
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

    # 1. Kiểm tra vi phạm hạn mức công nợ và giá sàn (SCRUM-237 / S4-05)
    requires_approval = False
    eval_res = None
    if not is_draft:
        for item in order_in.items:
            prod = None
            str_pid = str(item.product_id).strip()
            if str_pid.isdigit():
                prod = db.query(Product).filter(Product.id == int(str_pid)).first()
            if not prod:
                prod = db.query(Product).filter((Product.id == str_pid) | (Product.sku == str_pid)).first()
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
        from app.services.order_approval_service import evaluate_order_violations
        computed_total = order_in.total or sum((itm.price * itm.quantity) for itm in order_in.items)
        eval_res = evaluate_order_violations(
            db=db,
            customer_id=order_in.customer_id,
            items=order_in.items,
            total_amount=computed_total,
            paid_amount=order_in.paid_amount,
            price_list_id=order_in.price_list_id,
        )
        if eval_res["requires_approval"] or order_in.status == "pending_approval":
            requires_approval = True

    # 2. Tạo đơn hàng (Chỉ ghi các trường thuộc bảng Order gốc)
    valid_order_cols = {c.name for c in Order.__table__.columns}
    order_dict = order_in.model_dump(exclude={"items", "expected_delivery_date"})
    order_data = {k: v for k, v in order_dict.items() if k in valid_order_cols}
    order_data["id"] = order_id
    order_data["code"] = order_code
    if requires_approval:
        order_data["status"] = "pending_approval"
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
            order_data["approval_reason"] = credit_check.get("approval_reason")
        else:
            order_data["requires_approval"] = False
            order_data["approval_reason"] = None
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

    # Kiểm tra tồn khả dụng & Giữ chỗ tồn kho an toàn nếu KHÔNG PHẢI đơn nháp và KHÔNG PHẢI đơn chờ duyệt ngoại lệ (SCRUM-504, SCRUM-237)
    if not is_draft and not requires_approval and new_order.status != "pending_approval":
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

        # 4. Cập nhật chi tiêu của khách hàng (chỉ khi không phải chờ duyệt)
        if not requires_approval:
            cus = db.query(Customer).filter(Customer.id == order_in.customer_id).first()
            if cus:
                cus.total_orders += 1
                cus.total_spent += order_in.total
                cus.last_order_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 5. Ghi nhận thông tin chờ duyệt ngoại lệ nếu có vi phạm
    if requires_approval:
        from app.services.order_approval_service import record_or_update_approval_request
        record_or_update_approval_request(db, new_order, eval_res)

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

    # 2.5. Kiểm tra vi phạm ngoại lệ cần phê duyệt (SCRUM-237 / S4-05)
    from app.services.order_approval_service import evaluate_order_violations, record_or_update_approval_request
    eval_res = evaluate_order_violations(
        db=db,
        customer_id=order.customer_id,
        items=order.items,
        total_amount=order.total,
        paid_amount=order.paid_amount,
        price_list_id=order.price_list_id,
        order_id=order.id
    )
    if eval_res["requires_approval"]:
        order.status = "pending_approval"
        order.requires_approval = True
        order.approval_reason = eval_res.get("violation_summary") or eval_res.get("approval_reason")
        record_or_update_approval_request(db, order, eval_res)
        order.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(order)
        return _attach_delivery_profile(order, db)

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

    # 6. S4-02: Kiểm tra hạn mức công nợ & nợ quá hạn khi chốt đơn nháp (SCRUM-496, SCRUM-497, SCRUM-498)
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
    if credit_check.get("requires_approval"):
        order.status = "pending_approval"
        order.requires_approval = True
        order.approval_reason = credit_check.get("approval_reason")

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


def copy_order_to_draft(
    db: Session,
    order_id: str,
    current_user: Optional[User] = None
) -> dict:
    """Sao chép đơn hàng cũ thành đơn nháp mới, tự động tính lại giá & chiết khấu theo bảng giá hiện hành (S4-09, SCRUM-241)."""
    ensure_seed_orders(db)

    # 1. Kiểm tra quyền hạn theo vai trò (RBAC)
    ALLOWED_ROLES = [UserRole.ADMIN.value, UserRole.SALES_MANAGER.value, UserRole.SALES_REP.value]
    if current_user and current_user.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền sao chép đơn hàng."
        )

    # 2. Tìm đơn hàng nguồn
    source_order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()
    if not source_order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng nguồn '{order_id}'."
        )

    # 3. Scope Guard: Kiểm tra phạm vi phụ trách đại lý nếu người dùng là Sales Rep
    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == source_order.customer_id,
            CustomerAssignment.assigned_staff_id == current_user.id
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Không tìm thấy thông tin đại lý '{source_order.customer_id}' trong phạm vi phụ trách của bạn."
            )

    # 4. Kiểm tra trạng thái khoá giao dịch của đại lý (SC-228)
    from app.services.customer_lock_service import check_customer_order_allowed
    allowed, lock_msg = check_customer_order_allowed(source_order.customer_id, db)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=lock_msg
        )

    # 5. Kiểm tra danh sách mặt hàng của đơn cũ
    if not source_order.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đơn hàng nguồn không có sản phẩm nào để sao chép."
        )

    # 6. Lọc và chuẩn bị dữ liệu sản phẩm, loại bỏ sản phẩm ngừng kinh doanh (inactive / deleted)
    from app.services.volume_discount_service import calculate_volume_discount
    from app.models.price_list import PriceListItem
    from app.models.order_delivery_profile import OrderDeliveryProfile

    warnings: List[str] = []
    valid_items = []

    for old_item in source_order.items:
        prod = None
        str_pid = str(old_item.product_id).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        if not prod and old_item.sku:
            prod = db.query(Product).filter(Product.sku == old_item.sku).first()
        if not prod:
            prod = db.query(Product).filter((Product.sku == str_pid) | (Product.name == str_pid)).first()

        # Kiểm tra nếu sản phẩm bị xóa hoặc ngừng kinh doanh
        if not prod or (prod.status and prod.status.lower() == "inactive"):
            p_name = prod.name if prod else (old_item.name or f"Mã #{old_item.product_id}")
            warnings.append(f"Sản phẩm '{p_name}' đã ngừng kinh doanh nên không được sao chép sang đơn mới.")
            continue

        valid_items.append((old_item, prod))

    if not valid_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể sao chép do tất cả sản phẩm trong đơn đã ngừng kinh doanh."
        )

    # 7. Sinh mã đơn mới
    count = db.query(Order).count() + 1
    new_order_id = f"ORD-{str(count).zfill(3)}"
    while db.query(Order).filter(Order.id == new_order_id).first():
        count += 1
        new_order_id = f"ORD-{str(count).zfill(3)}"

    new_order_code = f"DH-2026-{str(count).zfill(3)}"
    while db.query(Order).filter(Order.code == new_order_code).first():
        count += 1
        new_order_code = f"DH-2026-{str(count).zfill(3)}"

    # 8. Nhân viên phụ trách (gán cho người thực hiện thao tác sao chép)
    if current_user:
        staff_id = str(current_user.id)
        staff_name = current_user.full_name or current_user.username
    else:
        staff_id = source_order.staff_id
        staff_name = source_order.staff_name

    # 9. Tính lại giá & chiết khấu theo bảng giá hiện hành (SCRUM-622)
    price_list_id = source_order.price_list_id
    if price_list_id:
        pl = db.query(PriceList).filter(PriceList.id == price_list_id, PriceList.status == "active").first()
        if not pl:
            price_list_id = None

    subtotal = 0.0
    total_discount = 0.0
    new_order_items: List[OrderItem] = []

    for old_item, prod in valid_items:
        qty = int(old_item.quantity or 1)
        unit = old_item.unit or prod.unit or "cái"

        # Lấy giá hiện hành từ bảng giá hoặc giá niêm yết sản phẩm
        base_price = float(prod.price or 0.0)
        if price_list_id:
            pli = db.query(PriceListItem).filter(
                PriceListItem.price_list_id == price_list_id,
                PriceListItem.product_id == prod.id
            ).first()
            if pli and pli.sale_price is not None:
                base_price = float(pli.sale_price)

        line_subtotal = base_price * qty
        subtotal += line_subtotal

        # Tính chiết khấu sản lượng hiện hành
        vol_calc = calculate_volume_discount(
            db=db,
            product_id=str(prod.id),
            quantity=qty,
            customer_id=source_order.customer_id,
            current_user=current_user
        )
        line_discount = float(vol_calc.total_discount or 0.0)
        total_discount += line_discount

        item_subtotal = max(0.0, line_subtotal - line_discount)

        new_item = OrderItem(
            order_id=new_order_id,
            product_id=str(prod.id),
            sku=prod.sku,
            name=prod.name,
            unit=unit,
            price=base_price,
            quantity=qty,
            discount=line_discount,
            subtotal=item_subtotal,
            applied_discount_policy_id=vol_calc.applied_policy_id,
            applied_discount_policy_name=vol_calc.applied_discount_policy_name,
            discount_rate=vol_calc.discount_rate,
            discount_amount=vol_calc.total_discount,
        )
        new_order_items.append(new_item)

    final_total = max(0.0, subtotal - total_discount)

    # 10. Tạo đơn hàng mới với status='draft' và reset các trường tài chính / vận chuyển (SCRUM-625)
    note_prefix = f"[Sao chép từ đơn {source_order.code}]"
    old_note = source_order.note or ""
    clean_old_note = old_note
    if clean_old_note.startswith("[Sao chép từ đơn"):
        idx = clean_old_note.find("]")
        if idx != -1:
            clean_old_note = clean_old_note[idx + 1:].strip()

    new_note = f"{note_prefix} {clean_old_note}".strip()

    new_order = Order(
        id=new_order_id,
        code=new_order_code,
        customer_id=source_order.customer_id,
        customer_name=source_order.customer_name,
        customer_phone=source_order.customer_phone,
        customer_address=source_order.customer_address,
        price_list_id=price_list_id,
        subtotal=subtotal,
        discount=total_discount,
        tax=0.0,
        total=final_total,
        paid_amount=0.0,
        change_amount=0.0,
        payment_method=source_order.payment_method or "cash",
        payment_status="unpaid",
        status="draft",
        staff_id=staff_id,
        staff_name=staff_name,
        note=new_note,
        copied_from_order_id=source_order.id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    for itm in new_order_items:
        new_order.items.append(itm)

    db.add(new_order)
    db.flush()

    # 11. Tạo hồ sơ giao hàng mới độc lập (OrderDeliveryProfile), reset expected_delivery_date
    old_profile = db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == source_order.id).first()
    if old_profile:
        new_delivery_profile = OrderDeliveryProfile(
            order_id=new_order.id,
            delivery_address_id=old_profile.delivery_address_id,
            delivery_address_name=old_profile.delivery_address_name,
            delivery_receiver_name=old_profile.delivery_receiver_name,
            delivery_phone=old_profile.delivery_phone,
            delivery_address=old_profile.delivery_address,
            delivery_notes=old_profile.delivery_notes,
            expected_delivery_date=None,
        )
        db.add(new_delivery_profile)
    elif source_order.customer_address:
        new_delivery_profile = OrderDeliveryProfile(
            order_id=new_order.id,
            delivery_address=source_order.customer_address,
            delivery_receiver_name=source_order.customer_name,
            delivery_phone=source_order.customer_phone,
            expected_delivery_date=None,
        )
        db.add(new_delivery_profile)

    db.commit()
    db.refresh(new_order)
    new_order = _attach_delivery_profile(new_order, db)
    new_order = _enrich_order_lock_warning(db, new_order)

    return {
        "order": new_order,
        "warnings": warnings,
        "message": f"Đã sao chép đơn {source_order.code} sang đơn nháp mới {new_order.code}."
    }



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

        # 1. Duyệt đơn hàng vượt hạn mức công nợ (pending_approval -> confirmed / approved) (S4-05)
        # 1. Duyệt đơn hàng vượt hạn mức công nợ hoặc dưới sàn (pending_approval -> confirmed / approved) (S4-05)
        if old_status == "pending_approval" and new_status in ["confirmed", "approved"]:
            allowed_approvers = ["admin", "sales manager", "director", "accountant", "manager"]
            if u_role not in allowed_approvers:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Chỉ Quản lý kinh doanh (Sales Manager), Ban giám đốc hoặc Kế toán mới có quyền phê duyệt đơn hàng vượt hạn mức công nợ."
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

    # S4-02: Khi duyệt đơn từ pending_approval sang confirmed / pending / shipping
    if old_status == "pending_approval" and new_status in ["confirmed", "pending", "shipping", "completed"]:
    # S4-02: Khi duyệt đơn từ pending_approval sang confirmed / pending / shipping / completed / approved
    if old_status == "pending_approval" and new_status in ["confirmed", "pending", "shipping", "completed", "approved"]:
        order.requires_approval = False

    # Nghiệp vụ kiểm tra hạn mức công nợ khi XUẤT HÀNG (Hàng rời kho: status -> shipping hoặc completed)
    if new_status in ["shipping", "completed"] and old_status not in ["shipping", "completed"]:
        unpaid = max(0.0, float(order.total or 0.0) - float(order.paid_amount or 0.0))
        from app.models.order_approval import OrderApprovalRequest
        appr_req = db.query(OrderApprovalRequest).filter(OrderApprovalRequest.order_id == order.id).first()
        is_manager_approved = bool(old_status == "reserved" or (appr_req and appr_req.approval_status == "APPROVED"))
        if unpaid > 0 and order.customer_id:
            from app.services.customer_credit_service import get_or_create_credit_profile, check_credit_for_dispatch
            # Khóa dòng bi quan (Pessimistic Lock) giữ khóa đến hết transaction để chống Race Condition khi xuất kho đồng thời
            # Nếu đơn hàng đã được phê duyệt vượt hạn mức bởi Quản lý kinh doanh (S4-02, S4-05)
            is_approved = bool(order.approval_reason) or (old_status == "pending_approval" and new_status in ["confirmed", "shipping", "completed"])
            cred_prof = get_or_create_credit_profile(db=db, customer_id=order.customer_id, for_update=True)
            from app.models.order_approval import OrderApprovalRequest
            appr_req = db.query(OrderApprovalRequest).filter(OrderApprovalRequest.order_id == order.id).first()
            is_manager_approved = bool(old_status == "reserved" or (appr_req and appr_req.approval_status == "APPROVED") or is_approved)
            if not is_manager_approved:
                chk = check_credit_for_dispatch(
                    db=db,
                    customer_id=order.customer_id,
                    unpaid_amount=unpaid,
                    order_id=order.id,
                    is_manager_approved=is_manager_approved
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

    # Khi đơn hàng được duyệt từ pending_approval sang confirmed / approved -> chuyển sang giữ chỗ tồn kho (S4-05, S4-03)
    if old_status == "pending_approval" and new_status in ["confirmed", "approved"]:
        from app.services.inventory_reservation_service import reserve_stock_for_order
        try:
            reserve_stock_for_order(db=db, order=order)
        except Exception:
            pass

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


# ============================================================================
# SCRUM-236 (S4-04): Lịch sử mua hàng 3 tháng gần nhất & Gợi ý mặt hàng
# ============================================================================

def get_purchase_history_suggestions(
    db: Session,
    customer_id: str,
    current_user: Optional[User] = None,
    window_days: int = 90
) -> PurchaseHistorySuggestionResponse:
    """
    Truy vấn lịch sử mua hàng 3 tháng gần nhất của đại lý theo SKU và nhóm hàng,
    tính số lượng bình quân (avg_quantity) và cấu trúc dữ liệu phục vụ gợi ý khi gõ đơn.
    Đồng thời áp dụng Scope Guard kiểm tra quyền phụ trách của Sales Rep (SCRUM-236 / S3-06).
    """
    ensure_seed_orders(db)

    # 1. Kiểm tra tồn tại của khách hàng / đại lý
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        customer = db.query(Customer).filter(Customer.code == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý / khách hàng với mã '{customer_id}'."
        )

    # 2. Scope Guard: Sales Rep chỉ được xem lịch sử mua hàng của đại lý được phân công
    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == customer.id,
            CustomerAssignment.assigned_staff_id == current_user.id
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bạn không được phân công quản lý đại lý '{customer.name}' nên không thể xem lịch sử mua hàng."
            )

    # 3. Lọc các đơn hàng trong 90 ngày gần nhất (không tính đơn hủy cancelled và đơn nháp draft)
    now_utc = datetime.now(timezone.utc)
    cutoff_date = now_utc - timedelta(days=window_days)

    query = db.query(Order).filter(
        Order.customer_id == customer.id,
        Order.status.notin_(["cancelled", "draft"])
    )

    all_valid_orders = query.order_by(Order.created_at.desc()).all()

    filtered_orders = []
    for ord_obj in all_valid_orders:
        if not ord_obj.created_at:
            continue
        ord_dt = ord_obj.created_at
        if ord_dt.tzinfo is None:
            ord_dt = ord_dt.replace(tzinfo=timezone.utc)
        if ord_dt >= cutoff_date:
            filtered_orders.append(ord_obj)

    total_orders_in_window = len(filtered_orders)

    # Nếu không có đơn hàng nào trong 90 ngày
    if total_orders_in_window == 0:
        return PurchaseHistorySuggestionResponse(
            customer_id=customer.id,
            customer_name=customer.name,
            time_window_days=window_days,
            total_orders_in_window=0,
            has_purchase_history=False,
            items=[],
            groups=[],
            last_order=None
        )

    # 4. Xác định thông tin đơn hàng gần nhất (Last Order)
    latest_order = filtered_orders[0]
    last_order_items = []
    for item in latest_order.items:
        last_order_items.append(LastOrderItemSummary(
            product_id=str(item.product_id),
            sku=item.sku,
            name=item.name,
            unit=item.unit or "cái",
            quantity=item.quantity,
            price=item.price
        ))

    created_at_str = latest_order.created_at.strftime("%Y-%m-%d %H:%M") if latest_order.created_at else None
    last_order_summary = LastOrderSummary(
        order_id=latest_order.id,
        code=latest_order.code,
        created_at=created_at_str,
        total=latest_order.total,
        items=last_order_items
    )

    # 5. Gom nhóm theo SKU / Product ID để tính số lượng bình quân (avg_quantity)
    item_stats = {}
    for ord_obj in filtered_orders:
        ord_time_str = ord_obj.created_at.strftime("%Y-%m-%d %H:%M") if ord_obj.created_at else None

        for itm in ord_obj.items:
            key = str(itm.product_id)
            if key not in item_stats:
                item_stats[key] = {
                    "product_id": str(itm.product_id),
                    "sku": itm.sku,
                    "name": itm.name,
                    "unit": itm.unit or "cái",
                    "total_quantity": 0,
                    "order_ids": set(),
                    "last_quantity": itm.quantity,
                    "last_purchased_at": ord_time_str,
                    "last_price": itm.price,
                }
            stat = item_stats[key]
            stat["total_quantity"] += itm.quantity
            stat["order_ids"].add(ord_obj.id)
            if not stat.get("last_purchased_at"):
                stat["last_purchased_at"] = ord_time_str
                stat["last_quantity"] = itm.quantity
                stat["last_price"] = itm.price

    # 6. Tra cứu thông tin danh mục, tồn kho và giá hiện tại từ bảng Product
    product_keys = list(item_stats.keys())
    products_db = []
    int_ids = [int(k) for k in product_keys if k.isdigit()]
    if int_ids:
        products_db = db.query(Product).filter(Product.id.in_(int_ids)).all()
    prod_map = {str(p.id): p for p in products_db}

    sku_list = [v["sku"] for v in item_stats.values() if v.get("sku")]
    if sku_list:
        sku_products = db.query(Product).filter(Product.sku.in_(sku_list)).all()
        for sp in sku_products:
            prod_map[str(sp.id)] = sp
            prod_map[sp.sku] = sp

    suggestion_items: List[PurchaseHistoryItemSuggestion] = []

    for key, stat in item_stats.items():
        order_count = len(stat["order_ids"])
        total_qty = stat["total_quantity"]
        avg_qty = round(total_qty / max(order_count, 1), 1)

        prod_obj = prod_map.get(key) or (prod_map.get(stat["sku"]) if stat.get("sku") else None)
        category_name = "Khác"
        category_id = None
        current_price = stat["last_price"]
        unit = stat["unit"]
        stock_val = 0

        if prod_obj:
            if prod_obj.category:
                category_name = prod_obj.category
            category_id = prod_obj.category_id
            if prod_obj.price:
                current_price = prod_obj.price
            if prod_obj.unit:
                unit = prod_obj.unit
            stock_prof = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == prod_obj.id).first()
            if stock_prof:
                stock_val = stock_prof.stock

        suggestion_items.append(PurchaseHistoryItemSuggestion(
            product_id=stat["product_id"],
            sku=stat["sku"] or (prod_obj.sku if prod_obj else None),
            name=prod_obj.name if prod_obj else stat["name"],
            unit=unit,
            category=category_name,
            category_id=category_id,
            avg_quantity=avg_qty,
            total_quantity=total_qty,
            order_count=order_count,
            last_quantity=stat["last_quantity"],
            last_purchased_at=stat["last_purchased_at"],
            last_price=stat["last_price"],
            current_price=current_price,
            stock=stock_val
        ))

    # Sắp xếp theo số lần mua nhiều nhất
    suggestion_items.sort(key=lambda x: (x.order_count, x.total_quantity), reverse=True)

    # 7. Gom nhóm theo danh mục sản phẩm (Groups by Category)
    groups_dict = {}
    for itm in suggestion_items:
        cat_key = itm.category or "Khác"
        if cat_key not in groups_dict:
            groups_dict[cat_key] = {
                "category": cat_key,
                "category_id": itm.category_id,
                "items": [],
            }
        groups_dict[cat_key]["items"].append(itm)

    groups_result: List[PurchaseHistoryGroupSuggestion] = []
    for cat_name, gdata in groups_dict.items():
        g_items = gdata["items"]
        tot_suggested = round(sum(i.avg_quantity for i in g_items), 1)
        groups_result.append(PurchaseHistoryGroupSuggestion(
            category=cat_name,
            category_id=gdata["category_id"],
            item_count=len(g_items),
            total_suggested_quantity=tot_suggested,
            items=g_items
        ))

    groups_result.sort(key=lambda g: g.item_count, reverse=True)

    return PurchaseHistorySuggestionResponse(
        customer_id=customer.id,
        customer_name=customer.name,
        time_window_days=window_days,
        total_orders_in_window=total_orders_in_window,
        has_purchase_history=True,
        items=suggestion_items,
        groups=groups_result,
        last_order=last_order_summary
    )


def merge_items_anti_duplicate(
    current_items: List[OrderItemCreate],
    items_to_add: List[OrderItemCreate],
    strategy: str = "merge"
) -> List[OrderItemCreate]:
    """
    Quy tắc chống trùng dòng khi thêm sản phẩm/nhóm hàng từ lịch sử mua hàng (SCRUM-236).
    Nếu sản phẩm đã có trong đơn, cộng dồn hoặc cập nhật số lượng, không tạo thêm dòng mới.
    """
    result: List[OrderItemCreate] = [item.model_copy() for item in current_items]
    index_map = {str(item.product_id): idx for idx, item in enumerate(result)}

    for add_item in items_to_add:
        pid = str(add_item.product_id)
        if pid in index_map:
            idx = index_map[pid]
            target = result[idx]
            if strategy == "replace_qty":
                target.quantity = add_item.quantity
            else:
                target.quantity += add_item.quantity
            target.subtotal = round(target.price * target.quantity - target.discount, 2)
        else:
            new_copy = add_item.model_copy()
            new_copy.subtotal = round(new_copy.price * new_copy.quantity - new_copy.discount, 2)
            result.append(new_copy)
            index_map[pid] = len(result) - 1

    return result

