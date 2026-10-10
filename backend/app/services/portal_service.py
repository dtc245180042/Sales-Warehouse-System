import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.customer_delivery_address import CustomerDeliveryAddress
from app.models.customer_assignment import CustomerAssignment
from app.models.order import Order, OrderItem
from app.models.order_delivery_profile import OrderDeliveryProfile
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.price_list import PriceList, PriceListItem
from app.models.portal_idempotency import PortalIdempotencyRecord
from app.models.audit_log import AuditLog
from app.schemas.portal import (
    PortalProductResponse,
    PortalProductPaginationResponse,
    PortalCreditResponse,
    PortalCartItemIn,
    PortalCartCalculateResponse,
    PortalCartItemCalculated,
    PortalOrderCreateRequest,
    PortalOrderResponse,
)
from app.services.volume_discount_service import calculate_volume_discount

PORTAL_LOW_STOCK_THRESHOLD = 20


def get_portal_credit(db: Session, customer: Customer) -> PortalCreditResponse:
    """Lấy thông tin hạn mức công nợ toàn vẹn cho đại lý (SCRUM-628).
    - Dispatched debt: Nợ các đơn đã xuất kho (shipping, completed)
    - Committed debt: Nợ các đơn đang chờ duyệt/xử lý (pending, confirmed)
    - Bịt hoàn toàn lỗ hổng Pending Leak bằng SQL SUM
    """
    profile = db.query(CustomerCreditProfile).filter(
        CustomerCreditProfile.customer_id == customer.id
    ).first()

    credit_limit = profile.credit_limit if profile else 0
    max_debt_days = profile.max_debt_days if profile else 0

    # 1. Nợ đã xuất kho (shipping, completed)
    dispatched_debt_raw = db.query(
        func.coalesce(func.sum(Order.total - Order.paid_amount), 0.0)
    ).filter(
        Order.customer_id == customer.id,
        Order.status.in_(["shipping", "completed"])
    ).scalar()
    dispatched_debt = int(round(dispatched_debt_raw or 0.0))

    # 2. Nợ cam kết từ các đơn chờ duyệt / đang xử lý (pending, confirmed)
    committed_debt_raw = db.query(
        func.coalesce(func.sum(Order.total - Order.paid_amount), 0.0)
    ).filter(
        Order.customer_id == customer.id,
        Order.status.in_(["pending", "confirmed"])
    ).scalar()
    committed_debt = int(round(committed_debt_raw or 0.0))

    total_used_credit = dispatched_debt + committed_debt
    available_credit = max(0, credit_limit - total_used_credit)

    # 3. Kiểm tra nợ quá hạn ngày lịch
    has_overdue = False
    if max_debt_days > 0:
        today_date = datetime.now(timezone.utc).date()
        unpaid_orders = db.query(Order).filter(
            Order.customer_id == customer.id,
            Order.status.in_(["shipping", "completed"])
        ).all()
        for o in unpaid_orders:
            rem = max(0.0, float(o.total or 0.0) - float(o.paid_amount or 0.0))
            if rem > 0:
                disp_dt = o.created_at
                prof = db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id == o.id).first()
                if prof and getattr(prof, "dispatched_at", None):
                    disp_dt = prof.dispatched_at
                if disp_dt:
                    d_date = disp_dt.date() if hasattr(disp_dt, "date") else disp_dt
                    if (today_date - d_date).days > max_debt_days:
                        has_overdue = True
                        break

    return PortalCreditResponse(
        credit_limit=credit_limit,
        max_debt_days=max_debt_days,
        dispatched_debt=dispatched_debt,
        committed_debt=committed_debt,
        total_used_credit=total_used_credit,
        available_credit=available_credit,
        has_overdue=has_overdue,
        allow_order_on_credit=(credit_limit > 0 and not has_overdue and available_credit > 0),
    )


def check_portal_order_credit_limit(db: Session, customer_id: str, new_order_unpaid: int) -> dict:
    """Kiểm tra hạn mức công nợ cho đơn mới (chặn cứng vượt hạn mức)."""
    profile = db.query(CustomerCreditProfile).filter(
        CustomerCreditProfile.customer_id == customer_id
    ).first()

    credit_limit = profile.credit_limit if profile else 0
    if new_order_unpaid <= 0:
        return {"allowed": True, "error_message": None}

    if credit_limit <= 0:
        return {
            "allowed": False,
            "error_message": "Đại lý chưa được cấp hạn mức công nợ. Vui lòng thanh toán đủ 100% khi nhận hàng."
        }

    # Tính tổng nợ đã xuất
    dispatched_debt = db.query(
        func.coalesce(func.sum(Order.total - Order.paid_amount), 0.0)
    ).filter(
        Order.customer_id == customer_id,
        Order.status.in_(["shipping", "completed"])
    ).scalar() or 0.0

    # Tính tổng nợ cam kết
    committed_debt = db.query(
        func.coalesce(func.sum(Order.total - Order.paid_amount), 0.0)
    ).filter(
        Order.customer_id == customer_id,
        Order.status.in_(["pending", "confirmed"])
    ).scalar() or 0.0

    total_used = int(round(dispatched_debt + committed_debt))
    available_credit = max(0, credit_limit - total_used)

    if new_order_unpaid > available_credit:
        excess = new_order_unpaid - available_credit
        return {
            "allowed": False,
            "error_message": (
                f"Đơn hàng vượt hạn mức công nợ khả dụng! "
                f"Hạn mức: {credit_limit:,} đ, Đã xuất kho: {int(round(dispatched_debt)):,} đ, "
                f"Đang chờ duyệt: {int(round(committed_debt)):,} đ, Còn lại: {available_credit:,} đ. "
                f"Đơn cần nợ: {new_order_unpaid:,} đ (Vượt: {excess:,} đ)."
            ),
            "credit_limit": credit_limit,
            "available_credit": available_credit
        }

    return {"allowed": True, "error_message": None, "available_credit": available_credit}


def _get_active_price_list_for_customer(db: Session, customer: Customer) -> Optional[PriceList]:
    """Tìm Bảng giá đang hiệu lực của nhóm đại lý."""
    group_name = (customer.customer_group or "WHOLESALE").strip()
    now_utc = datetime.now(timezone.utc)
    
    # 1. Tìm bảng giá khớp chính xác nhóm khách hàng, lấy bản mới nhất theo id
    price_list = db.query(PriceList).filter(
        PriceList.customer_group == group_name,
        PriceList.status == "APPROVED",
        (PriceList.valid_from.is_(None) | (PriceList.valid_from <= now_utc)),
        (PriceList.valid_to.is_(None) | (PriceList.valid_to >= now_utc))
    ).order_by(PriceList.id.desc()).first()

    if not price_list:
        # 2. Tìm bảng giá chứa nhóm khách hàng
        price_list = db.query(PriceList).filter(
            PriceList.customer_group.ilike(f"%{group_name}%"),
            PriceList.status == "APPROVED",
            (PriceList.valid_from.is_(None) | (PriceList.valid_from <= now_utc)),
            (PriceList.valid_to.is_(None) | (PriceList.valid_to >= now_utc))
        ).order_by(PriceList.id.desc()).first()

    if not price_list:
        # Fallback tìm bảng giá APPROVED chung mới nhất
        price_list = db.query(PriceList).filter(
            PriceList.status == "APPROVED",
            (PriceList.valid_from.is_(None) | (PriceList.valid_from <= now_utc)),
            (PriceList.valid_to.is_(None) | (PriceList.valid_to >= now_utc))
        ).order_by(PriceList.id.desc()).first()

    return price_list


def get_portal_products(
    db: Session,
    customer: Customer,
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
) -> PortalProductPaginationResponse:
    """Lấy danh mục sản phẩm cổng đại lý với giá theo nhóm (SCRUM-631).
    - Quy tắc B2B: Sản phẩm KHÔNG nằm trong bảng giá nhóm bị ẨN HOÀN TOÀN.
    - Không trả về cost_price hay số lượng tồn kho cụ thể.
    - Trả về nhãn trạng thái tồn kho ATP theo ngưỡng.
    """
    price_list = _get_active_price_list_for_customer(db, customer)
    if not price_list or not price_list.items:
        return PortalProductPaginationResponse(items=[], total=0, page=page, limit=limit)

    pli_map = {}
    int_ids = []
    str_skus = []
    for item in price_list.items:
        pid_str = str(item.product_id)
        pli_map[pid_str] = item
        if pid_str.isdigit():
            int_id = int(pid_str)
            int_ids.append(int_id)
            pli_map[int_id] = item
        if getattr(item, "product_sku", None):
            pli_map[item.product_sku] = item
            str_skus.append(item.product_sku)

    filters = []
    if int_ids:
        filters.append(Product.id.in_(int_ids))
    if str_skus:
        filters.append(Product.sku.in_(str_skus))
    if not filters:
        return PortalProductPaginationResponse(items=[], total=0, page=page, limit=limit)

    from sqlalchemy import or_
    query = db.query(Product).filter(
        or_(*filters),
        (Product.status.ilike("active") | Product.status.is_(None))
    )

    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter((Product.name.ilike(s)) | (Product.sku.ilike(s)))

    if category_id:
        query = query.filter(Product.category_id == category_id)

    total = query.count()
    products = query.offset((page - 1) * limit).limit(limit).all()

    # Tải tồn kho ATP
    p_ids = [p.id for p in products]
    stock_profiles = db.query(ProductStockProfile).filter(ProductStockProfile.product_id.in_(p_ids)).all()
    stock_map = {sp.product_id: sp.stock for sp in stock_profiles}

    results = []
    for p in products:
        pli = pli_map.get(str(p.id)) or pli_map.get(p.id) or pli_map.get(p.sku)
        if not pli:
            continue

        raw_stock = stock_map.get(p.id, 100)
        if raw_stock > PORTAL_LOW_STOCK_THRESHOLD:
            stock_badge = "IN_STOCK"
        elif raw_stock > 0:
            stock_badge = "LOW_STOCK"
        else:
            stock_badge = "OUT_OF_STOCK"

        results.append(PortalProductResponse(
            id=str(p.id),
            sku=p.sku or "",
            name=p.name or "",
            unit=p.unit or "cái",
            packaging_spec=getattr(p, "packaging_spec", None),
            image_url=getattr(p, "image_url", None),
            sale_price=int(round(float(pli.sale_price or p.price or 0.0))),
            stock_status=stock_badge,
            min_order_quantity=getattr(pli, "min_order_quantity", 1) or 1,
        ))

    return PortalProductPaginationResponse(
        items=results,
        total=total,
        page=page,
        limit=limit,
    )


def calculate_portal_cart(
    db: Session,
    customer: Customer,
    items: List[PortalCartItemIn]
) -> dict:
    """Tính toán giỏ hàng server-side độc quyền cho Cổng đại lý (SCRUM-629).
    - Xác thực từng sản phẩm trong bảng giá B2B.
    - Áp chiết khấu sản lượng Volume Discount.
    - Tính toán nguyên số VND.
    """
    price_list = _get_active_price_list_for_customer(db, customer)
    if not price_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhóm đại lý của bạn hiện chưa có bảng giá kinh doanh hiệu lực."
        )

    pli_map = {}
    for item in price_list.items:
        pli_map[str(item.product_id)] = item
        if getattr(item, "product_sku", None):
            pli_map[item.product_sku] = item

    subtotal = 0
    total_discount = 0
    calculated_items = []

    for itm in items:
        pid_str = str(itm.product_id).strip()
        pli = pli_map.get(pid_str)

        prod = None
        if pid_str.isdigit():
            prod = db.query(Product).filter(Product.id == int(pid_str)).first()
        if not prod:
            prod = db.query(Product).filter((Product.sku == pid_str) | (Product.name == pid_str)).first()

        if not pli and prod:
            pli = pli_map.get(str(prod.id)) or (pli_map.get(prod.sku) if prod.sku else None)

        if not pli:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sản phẩm '{itm.product_id}' không có trong bảng giá được áp dụng cho đại lý của bạn."
            )

        unit_price = int(round(float(pli.sale_price or 0.0)))
        line_subtotal = unit_price * itm.quantity
        subtotal += line_subtotal

        # Chiết khấu sản lượng
        vol_calc = calculate_volume_discount(
            db=db,
            product_id=str(prod.id if prod else itm.product_id),
            quantity=itm.quantity,
            customer_id=customer.id
        )
        line_disc = int(round(float(vol_calc.total_discount or 0.0)))
        total_discount += line_disc
        line_tot = max(0, line_subtotal - line_disc)

        calculated_items.append({
            "product_id": str(prod.id if prod else itm.product_id),
            "sku": prod.sku if prod else "",
            "name": prod.name if prod else f"Sản phẩm #{itm.product_id}",
            "unit": itm.unit or (prod.unit if prod else "cái"),
            "unit_price": unit_price,
            "quantity": itm.quantity,
            "line_subtotal": line_subtotal,
            "discount_rate": float(vol_calc.discount_rate or 0.0),
            "line_discount": line_disc,
            "line_total": line_tot,
            "applied_policy_name": vol_calc.applied_discount_policy_name,
        })

    final_total = max(0, subtotal - total_discount)
    return {
        "items": calculated_items,
        "subtotal": subtotal,
        "total_discount": total_discount,
        "tax_amount": 0,
        "total_amount": final_total,
    }


def create_portal_order(
    db: Session,
    customer: Customer,
    data: PortalOrderCreateRequest,
    idempotency_key: str,
    client_ip: str = "127.0.0.1",
    user_id: Optional[int] = None,
    username: Optional[str] = None
) -> dict:
    """Tạo đơn hàng từ Cổng đại lý với luồng an toàn Concurrency (SCRUM-632).
    1. Khóa dòng Customer bi quan (with_for_update)
    2. Kiểm tra Idempotency Record (chống trùng request)
    3. Kiểm tra IDOR địa chỉ nhận hàng
    4. Tính lại giỏ hàng và kiểm tra chống trượt giá (409 Conflict)
    5. Kiểm tra hạn mức công nợ (chống pending leak)
    6. Tạo đơn hàng với status='pending' và source='portal'
    7. Lưu Idempotency Record & Audit Log
    """
    if not idempotency_key or not idempotency_key.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Header 'X-Idempotency-Key' là bắt buộc để chống gửi trùng đơn."
        )

    # 1. Khóa dòng Customer bi quan
    locked_customer = db.query(Customer).filter(Customer.id == customer.id).with_for_update().first()
    if not locked_customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")

    # 2. Hash payload kiểm tra Idempotency
    norm_dict = data.model_dump()
    req_hash = hashlib.sha256(json.dumps(norm_dict, sort_keys=True).encode("utf-8")).hexdigest()

    existing_record = db.query(PortalIdempotencyRecord).filter(
        PortalIdempotencyRecord.customer_id == locked_customer.id,
        PortalIdempotencyRecord.idempotency_key == idempotency_key.strip()
    ).first()

    if existing_record:
        if existing_record.request_hash == req_hash and existing_record.response_payload:
            # Khớp hash -> Trả lại đơn đã tạo trước đó
            cached_data = json.loads(existing_record.response_payload)
            cached_data["_is_replay"] = True
            return cached_data
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Idempotency Key này đã được sử dụng với nội dung đơn hàng khác."
            )

    # 3. Kiểm tra địa chỉ giao hàng (IDOR check)
    addr = db.query(CustomerDeliveryAddress).filter(
        CustomerDeliveryAddress.id == data.delivery_address_id,
        CustomerDeliveryAddress.customer_id == locked_customer.id
    ).first()
    if not addr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Điểm giao hàng không hợp lệ hoặc không thuộc về đại lý của bạn."
        )

    # 4. Tính toán giỏ hàng Server-side & Kiểm tra trượt giá
    calc = calculate_portal_cart(db, locked_customer, data.items)
    server_total = int(round(calc["total_amount"]))

    if server_total != data.expected_total:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Giá đơn hàng đã thay đổi (Dự kiến: {data.expected_total:,} đ, "
                f"Tính toán thực tế: {server_total:,} đ). Vui lòng cập nhật lại giỏ hàng."
            )
        )

    # 5. Kiểm tra công nợ chống Pending Leak
    chk = check_portal_order_credit_limit(db, locked_customer.id, server_total)
    if not chk["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=chk["error_message"]
        )

    # 6. Gán NVKD phụ trách hoặc đánh dấu is_unassigned
    assignment = db.query(CustomerAssignment).filter(
        CustomerAssignment.customer_id == locked_customer.id
    ).first()
    staff_id = str(assignment.assigned_staff_id) if (assignment and assignment.assigned_staff_id) else None
    is_unassigned = bool(staff_id is None)

    # 7. Tạo Order
    order_id = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    date_prefix = datetime.now().strftime("%Y%m%d")
    order_code = f"DH-{date_prefix}-{uuid.uuid4().hex[:4].upper()}"

    new_order = Order(
        id=order_id,
        code=order_code,
        customer_id=locked_customer.id,
        customer_name=locked_customer.name,
        customer_phone=locked_customer.phone,
        customer_address=addr.address,
        source="portal",
        status="pending",
        is_unassigned=is_unassigned,
        staff_id=staff_id,
        staff_name=None,
        subtotal=calc["subtotal"],
        discount=calc["total_discount"],
        tax=0.0,
        total=server_total,
        paid_amount=0.0,
        change_amount=0.0,
        payment_method="transfer",
        payment_status="unpaid",
        note=data.delivery_notes,
    )
    db.add(new_order)
    db.flush()

    # Tạo OrderDeliveryProfile
    delivery_profile = OrderDeliveryProfile(
        order_id=order_id,
        delivery_address_id=addr.id,
        delivery_address_name=addr.name,
        delivery_receiver_name=addr.receiver_name,
        delivery_phone=addr.phone,
        delivery_address=addr.address,
        delivery_notes=data.delivery_notes,
    )
    db.add(delivery_profile)

    # Tạo OrderItem
    for itm in calc["items"]:
        order_item = OrderItem(
            order_id=order_id,
            product_id=itm["product_id"],
            sku=itm["sku"],
            name=itm["name"],
            price=itm["unit_price"],
            quantity=itm["quantity"],
            discount=itm["line_discount"],
            subtotal=itm["line_total"],
        )
        db.add(order_item)

    # 8. Tạo PortalIdempotencyRecord
    created_at_str = new_order.created_at.isoformat() if hasattr(new_order.created_at, "isoformat") else str(new_order.created_at)
    res_dict = {
        "id": new_order.id,
        "code": new_order.code,
        "customer_id": locked_customer.id,
        "customer_name": locked_customer.name,
        "source": new_order.source,
        "status": new_order.status,
        "subtotal": int(round(new_order.subtotal or 0)),
        "discount": int(round(new_order.discount or 0)),
        "tax": int(round(new_order.tax or 0)),
        "total": server_total,
        "paid_amount": 0,
        "delivery_receiver_name": addr.receiver_name,
        "delivery_phone": addr.phone,
        "delivery_address": addr.address,
        "delivery_notes": data.delivery_notes,
        "is_unassigned": is_unassigned,
        "created_at": created_at_str,
        "items_count": len(calc["items"]),
    }

    idem_record = PortalIdempotencyRecord(
        customer_id=locked_customer.id,
        idempotency_key=idempotency_key.strip(),
        request_hash=req_hash,
        order_id=order_id,
        response_payload=json.dumps(res_dict),
    )
    db.add(idem_record)

    # 9. Ghi AuditLog
    audit = AuditLog(
        entity_type="ORDER",
        entity_id=order_id,
        entity_name=f"Đơn hàng Portal {order_code}",
        action="PORTAL_ORDER_CREATED",
        change_summary=f"Đại lý '{locked_customer.name}' tự đặt đơn hàng {order_code} qua Cổng đại lý (Tổng tiền: {server_total:,} đ, Trạng thái: pending)",
        user_id=user_id,
        username=username or locked_customer.code or locked_customer.id,
        user_fullname=locked_customer.name,
        ip_address=client_ip,
        new_values={"total": server_total, "customer_id": locked_customer.id, "source": "portal"},
    )
    db.add(audit)

    db.commit()
    return res_dict
