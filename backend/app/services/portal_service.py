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
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.schemas.portal import (
    PortalProductResponse,
    PortalProductPaginationResponse,
    PortalCreditResponse,
    PortalCartItemIn,
    PortalCartCalculateResponse,
    PortalCartItemCalculated,
    PortalOrderCreateRequest,
    PortalOrderResponse,
    PortalOrderItemResponse,
    PortalOrderListItemResponse,
    PortalOrderListPaginationResponse,
    PortalOrderDetailResponse,
    PortalReorderItemPreview,
    PortalReorderDiscontinuedItem,
    PortalReorderPreviewResponse,
    PortalReorderItemIn,
    PortalReorderRequest,
    PortalReorderResponse,
    PortalDebtInvoiceItem,
    PortalDebtOverviewResponse,
    PortalInvoiceListResponse,
    PortalInvoiceItemDetail,
    PortalInvoiceDetailResponse,
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

    staff_name = None
    if assignment and assignment.staff:
        staff_name = assignment.staff.full_name or assignment.staff.username
    elif getattr(locked_customer, "assigned_sales_rep", None):
        staff_name = locked_customer.assigned_sales_rep
    else:
        staff_name = locked_customer.name

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
        staff_name=staff_name,
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


# ==============================================================================
# NGHIỆP VỤ THEO DÕI ĐƠN HÀNG DÀNH CHO ĐẠI LÝ (S5-01 / SC-243)
# ==============================================================================

def get_portal_orders(
    db: Session,
    customer: Customer,
    status_filter: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> PortalOrderListPaginationResponse:
    """
    Lấy danh sách đơn hàng chỉ thuộc về chính đại lý đăng nhập (S5-01 / SC-243).
    - Ràng buộc cứng theo customer_id (chống IDOR).
    - Trả về mã đơn, trạng thái, ngày giao dự kiến, tổng tiền, số lượng mặt hàng.
    - Hỗ trợ lọc theo trạng thái và phân trang.
    """
    query = db.query(Order).filter(Order.customer_id == customer.id)
    
    if status_filter and status_filter.strip():
        query = query.filter(Order.status == status_filter.strip())
    
    total = query.count()
    orders = query.order_by(Order.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    items: List[PortalOrderListItemResponse] = []
    for o in orders:
        # Lấy thông tin ngày giao dự kiến từ OrderDeliveryProfile
        delivery_prof = db.query(OrderDeliveryProfile).filter(
            OrderDeliveryProfile.order_id == o.id
        ).first()
        expected_delivery_date = delivery_prof.expected_delivery_date if delivery_prof else None

        # Kiểm tra xem có dòng hàng nào bị giao thiếu không
        has_short = False
        for it in (o.items or []):
            if it.delivered_quantity is not None and it.delivered_quantity < (it.quantity or 0):
                has_short = True
                break

        created_at_val = o.created_at.isoformat() if hasattr(o.created_at, "isoformat") else str(o.created_at or "")
        items.append(
            PortalOrderListItemResponse(
                id=o.id,
                code=o.code or o.id,
                customer_id=o.customer_id,
                status=o.status or "pending",
                total=float(o.total or 0.0),
                subtotal=float(o.subtotal or 0.0),
                discount=float(o.discount or 0.0),
                payment_status=o.payment_status or "unpaid",
                expected_delivery_date=expected_delivery_date,
                created_at=created_at_val,
                items_count=len(o.items) if o.items else 0,
                has_short_delivery=has_short,
            )
        )

    return PortalOrderListPaginationResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
    )


def get_portal_order_detail(
    db: Session,
    customer: Customer,
    order_id: str,
) -> PortalOrderDetailResponse:
    """
    Lấy chi tiết đơn hàng của đại lý kèm danh sách dòng hàng và số lượng thực giao (S5-01 / SC-243).
    - Ràng buộc tầng API: Nếu đơn không thuộc đại lý -> trả về 403 hoặc 404 (Không tìm thấy hoặc không có quyền).
    - Đối chiếu số lượng đặt vs số lượng thực giao để đại lý theo dõi trường hợp giao thiếu.
    """
    order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đơn hàng yêu cầu."
        )

    # Kiểm soát bảo mật chống IDOR: Chỉ cho phép đại lý sở hữu đơn hàng xem (Subtask 5)
    if order.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập thông tin đơn hàng của đại lý khác."
        )

    # Lấy thông tin giao hàng từ OrderDeliveryProfile
    delivery_prof = db.query(OrderDeliveryProfile).filter(
        OrderDeliveryProfile.order_id == order.id
    ).first()

    expected_delivery_date = delivery_prof.expected_delivery_date if delivery_prof else None
    receiver_name = delivery_prof.delivery_receiver_name if delivery_prof else order.customer_name
    receiver_phone = delivery_prof.delivery_phone if delivery_prof else order.customer_phone
    receiver_address = delivery_prof.delivery_address if delivery_prof else order.customer_address
    delivery_notes = delivery_prof.delivery_notes if delivery_prof else order.note

    item_responses: List[PortalOrderItemResponse] = []
    has_order_short_delivery = False

    for it in (order.items or []):
        qty = it.quantity or 0
        deliv_qty = it.delivered_quantity
        is_short = (deliv_qty is not None and deliv_qty < qty)
        short_qty = max(0, qty - deliv_qty) if is_short else 0
        if is_short:
            has_order_short_delivery = True

        item_responses.append(
            PortalOrderItemResponse(
                id=it.id,
                product_id=str(it.product_id),
                sku=it.sku,
                name=it.name,
                unit=it.unit or "cái",
                price=float(it.price or 0.0),
                quantity=qty,
                delivered_quantity=deliv_qty,
                is_short_delivered=is_short,
                short_delivered_quantity=short_qty,
                discount=float(it.discount or 0.0),
                subtotal=float(it.subtotal or 0.0),
            )
        )

    created_at_val = order.created_at.isoformat() if hasattr(order.created_at, "isoformat") else str(order.created_at or "")
    updated_at_val = order.updated_at.isoformat() if hasattr(order.updated_at, "isoformat") else str(order.updated_at or "")

    return PortalOrderDetailResponse(
        id=order.id,
        code=order.code or order.id,
        customer_id=order.customer_id,
        customer_name=order.customer_name,
        status=order.status or "pending",
        payment_method=order.payment_method or "transfer",
        payment_status=order.payment_status or "unpaid",
        subtotal=float(order.subtotal or 0.0),
        discount=float(order.discount or 0.0),
        tax=float(order.tax or 0.0),
        total=float(order.total or 0.0),
        paid_amount=float(order.paid_amount or 0.0),
        delivery_receiver_name=receiver_name,
        delivery_phone=receiver_phone,
        delivery_address=receiver_address,
        delivery_notes=delivery_notes,
        expected_delivery_date=expected_delivery_date,
        created_at=created_at_val,
        updated_at=updated_at_val,
        items=item_responses,
        has_short_delivery=has_order_short_delivery,
    )


# ==============================================================================
# QUẢN LÝ ĐẶT LẠI ĐƠN HÀNG ĐÃ MUA ĐỊNH KỲ (S5-02 / SC-244)
# ==============================================================================

def _get_customer_price_map(db: Session, customer: Customer) -> Dict[str, float]:
    """Lấy bản đồ giá hiện hành theo bảng giá nhóm của đại lý."""
    price_list = _get_active_price_list_for_customer(db, customer)
    price_map: Dict[str, float] = {}
    if price_list and price_list.items:
        for pli in price_list.items:
            # Ưu tiên sale_price (chuẩn PriceListItem), rồi custom_price, rồi price
            pval = getattr(pli, "sale_price", None)
            if pval is None:
                pval = getattr(pli, "custom_price", None)
            if pval is None:
                pval = getattr(pli, "price", None)
            pval_float = float(pval or 0.0)
            pid_str = str(pli.product_id)
            price_map[pid_str] = pval_float
            if getattr(pli, "product_sku", None):
                price_map[str(pli.product_sku).strip()] = pval_float
    return price_map


def _find_product_in_db(db: Session, product_id_or_sku: str) -> Optional[Product]:
    """Tìm sản phẩm theo id (int/str) hoặc sku."""
    query = db.query(Product).filter(
        (Product.id == product_id_or_sku) | (Product.sku == product_id_or_sku)
    )
    prod = query.first()
    if not prod and str(product_id_or_sku).isdigit():
        prod = db.query(Product).filter(Product.id == int(product_id_or_sku)).first()
    return prod


def _is_product_discontinued(product: Optional[Product]) -> tuple[bool, str]:
    """Kiểm tra sản phẩm có bị ngừng kinh doanh hay không."""
    if not product:
        return True, "Sản phẩm không còn tồn tại trong hệ thống danh mục"
    st = str(product.status or "").strip().lower()
    if st in ["discontinued", "inactive", "suspended", "locked", "deleted", "ngung_kinh_doanh"]:
        return True, f"Mặt hàng đã ngừng kinh doanh (Trạng thái: {product.status})"
    if st and st != "active":
        return True, f"Mặt hàng tạm ngưng giao dịch (Trạng thái: {product.status})"
    return False, ""


def get_portal_reorder_preview(
    db: Session,
    customer: Customer,
    order_id: str,
) -> PortalReorderPreviewResponse:
    """
    Lấy chi tiết đơn cũ để chọn lại, bao gồm danh sách dòng hàng, số lượng và trạng thái mặt hàng (S5-02 / SC-244).
    - Bảo mật: Đại lý chỉ được xem trước đơn của chính mình (chống IDOR).
    - Tách biệt rõ mặt hàng ngừng kinh doanh (bị loại) và mặt hàng khả dụng.
    - Áp lại giá theo bảng giá hiện hành và tính chênh lệch giá.
    """
    order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đơn hàng yêu cầu để đặt lại."
        )

    # Chống IDOR: Chỉ cho phép đại lý sở hữu đơn hàng (Subtask 1)
    if order.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền đặt lại đơn hàng của đại lý khác."
        )

    price_map = _get_customer_price_map(db, customer)

    available_items: List[PortalReorderItemPreview] = []
    discontinued_items: List[PortalReorderDiscontinuedItem] = []

    for it in (order.items or []):
        prod = _find_product_in_db(db, str(it.product_id)) or _find_product_in_db(db, str(it.sku or ""))
        is_disc, disc_reason = _is_product_discontinued(prod)

        old_qty = it.quantity or 1
        old_price = float(it.price or 0.0)

        if is_disc:
            discontinued_items.append(
                PortalReorderDiscontinuedItem(
                    product_id=str(it.product_id),
                    sku=prod.sku if prod else getattr(it, "sku", None),
                    name=prod.name if prod else it.name,
                    old_quantity=old_qty,
                    old_price=old_price,
                    reason=disc_reason,
                )
            )
        else:
            # Tra cứu giá hiện hành
            p_id_str = str(prod.id)
            p_sku_str = str(prod.sku or "").strip()
            current_price = price_map.get(p_id_str) or price_map.get(p_sku_str)
            if current_price is None:
                current_price = float(prod.price or 0.0)
            if current_price <= 0 and old_price > 0:
                current_price = old_price

            price_diff = current_price - old_price
            is_changed = abs(price_diff) > 0.001
            est_subtotal = old_qty * current_price

            available_items.append(
                PortalReorderItemPreview(
                    item_id=it.id,
                    product_id=str(prod.id),
                    sku=prod.sku or it.sku,
                    name=prod.name or it.name,
                    unit=prod.unit or it.unit or "cái",
                    old_quantity=old_qty,
                    default_quantity=old_qty,
                    old_price=old_price,
                    current_price=current_price,
                    is_price_changed=is_changed,
                    price_difference=price_diff,
                    estimated_subtotal=est_subtotal,
                )
            )

    has_disc = len(discontinued_items) > 0
    has_price_changes = any(i.is_price_changed for i in available_items)
    estimated_total = sum(i.estimated_subtotal for i in available_items)

    created_at_val = order.created_at.isoformat() if hasattr(order.created_at, "isoformat") else str(order.created_at or "")

    notices = []
    if has_disc:
        notices.append(f"Có {len(discontinued_items)} mặt hàng đã ngừng kinh doanh được tự động loại khỏi đơn mới.")
    if has_price_changes:
        notices.append("Các mặt hàng được áp dụng lại theo bảng giá hiện hành của đại lý.")

    return PortalReorderPreviewResponse(
        original_order_id=order.id,
        original_order_code=order.code or order.id,
        original_order_created_at=created_at_val,
        available_items=available_items,
        discontinued_items=discontinued_items,
        has_discontinued_items=has_disc,
        has_price_changes=has_price_changes,
        estimated_total=estimated_total,
        notice=" ".join(notices) if notices else None,
    )


def create_portal_reorder(
    db: Session,
    customer: Customer,
    order_id: str,
    data: PortalReorderRequest,
    idempotency_key: str,
    client_ip: str,
    user_id: int,
    username: str,
) -> PortalReorderResponse:
    """
    Tạo đơn đặt lại từ đơn cũ, hỗ trợ đặt lại toàn bộ hoặc một phần dòng hàng (S5-02 / SC-244).
    - Bắt buộc Header X-Idempotency-Key chống gửi trùng đơn.
    - Loại bỏ mặt hàng ngừng kinh doanh khỏi đơn mới kèm cảnh báo.
    - Áp lại giá theo bảng giá hiện hành (không dùng giá cũ).
    - Đánh dấu copied_from_order_id để truy vết nguồn gốc.
    """
    order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đơn hàng gốc để đặt lại."
        )

    # Chống IDOR: Chỉ cho phép đại lý sở hữu đơn hàng đặt lại
    if order.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền đặt lại đơn hàng của đại lý khác."
        )

    # 1. Kiểm tra Idempotency chống gửi trùng lặp
    req_body_dict = data.model_dump()
    req_hash = hashlib.sha256(json.dumps(req_body_dict, sort_keys=True).encode()).hexdigest()

    existing_record = db.query(PortalIdempotencyRecord).filter(
        PortalIdempotencyRecord.customer_id == customer.id,
        PortalIdempotencyRecord.idempotency_key == idempotency_key
    ).first()

    if existing_record:
        if existing_record.request_hash == req_hash:
            cached_resp = json.loads(existing_record.response_payload or "{}")
            return PortalReorderResponse(**cached_resp)
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Khóa Idempotency đã được sử dụng với nội dung khác. Vui lòng thử lại."
            )

    price_map = _get_customer_price_map(db, customer)

    # 2. Xây dựng danh sách dòng hàng hợp lệ và loại bỏ mặt hàng ngừng kinh doanh
    valid_items_to_create: List[Dict[str, Any]] = []
    removed_discontinued: List[PortalReorderDiscontinuedItem] = []
    price_change_warnings: List[str] = []

    # Map các item trong đơn cũ để đối chiếu giá cũ
    old_items_map: Dict[str, OrderItem] = {}
    for oit in (order.items or []):
        old_items_map[str(oit.product_id)] = oit
        if oit.sku:
            old_items_map[str(oit.sku).strip()] = oit

    for sel in data.selected_items:
        prod = _find_product_in_db(db, str(sel.product_id))
        is_disc, disc_reason = _is_product_discontinued(prod)

        old_it = old_items_map.get(str(sel.product_id))
        old_p = float(old_it.price if old_it else (prod.price if prod else 0.0))

        if is_disc:
            removed_discontinued.append(
                PortalReorderDiscontinuedItem(
                    product_id=str(sel.product_id),
                    sku=prod.sku if prod else (old_it.sku if old_it else None),
                    name=prod.name if prod else (old_it.name if old_it else str(sel.product_id)),
                    old_quantity=sel.quantity,
                    old_price=old_p,
                    reason=disc_reason,
                )
            )
            continue

        # Định giá lại theo bảng giá hiện hành
        p_id_str = str(prod.id)
        p_sku_str = str(prod.sku or "").strip()
        current_price = price_map.get(p_id_str) or price_map.get(p_sku_str)
        if current_price is None:
            current_price = float(prod.price or 0.0)
        if current_price <= 0 and old_p > 0:
            current_price = old_p

        # Cảnh báo nếu giá bị thay đổi
        if abs(current_price - old_p) > 0.001:
            diff_text = f"+{current_price - old_p:,.0f} đ" if current_price > old_p else f"{current_price - old_p:,.0f} đ"
            price_change_warnings.append(
                f"Sản phẩm '{prod.name}' ({prod.sku}): Giá cũ {old_p:,.0f} đ -> Áp giá hiện hành {current_price:,.0f} đ ({diff_text})"
            )

        line_subtotal = float(sel.quantity * current_price)

        valid_items_to_create.append({
            "product_id": str(prod.id),
            "sku": prod.sku,
            "name": prod.name,
            "unit": prod.unit or "cái",
            "price": current_price,
            "quantity": sel.quantity,
            "subtotal": line_subtotal,
        })

    # Nếu tất cả các mặt hàng được chọn đều bị ngừng kinh doanh
    if not valid_items_to_create:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tất cả mặt hàng bạn chọn đều đã ngừng kinh doanh hoặc không còn phân phối. Không thể tạo đơn mới."
        )

    # 3. Tính toán tổng tiền theo giá hiện hành
    total_subtotal = sum(i["subtotal"] for i in valid_items_to_create)
    total_amount = total_subtotal

    # 4. Kiểm tra hạn mức công nợ
    credit_res = check_portal_order_credit_limit(db, customer.id, int(round(total_amount)))
    if not credit_res.get("allowed", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=credit_res.get("error_message") or "Đơn hàng vượt quá hạn mức công nợ khả dụng của đại lý."
        )

    # 5. Phân công NVKD phụ trách (nếu có)
    assignment = db.query(CustomerAssignment).filter(
        CustomerAssignment.customer_id == customer.id
    ).first()
    staff_id = str(assignment.assigned_staff_id) if (assignment and assignment.assigned_staff_id) else None
    staff_name = (assignment.staff.full_name or assignment.staff.username) if (assignment and assignment.staff) else None
    is_unassigned = staff_id is None

    # 6. Tạo đơn hàng mới
    now_utc = datetime.now(timezone.utc)
    new_order_id = f"ORD-{uuid.uuid4().hex[:12].upper()}"
    new_order_code = f"DH-{now_utc.strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"

    new_order = Order(
        id=new_order_id,
        code=new_order_code,
        customer_id=customer.id,
        customer_name=customer.name,
        customer_phone=customer.phone,
        subtotal=total_subtotal,
        discount=0.0,
        tax=0.0,
        total=total_amount,
        paid_amount=0.0,
        change_amount=0.0,
        payment_method="transfer",
        payment_status="unpaid",
        status="pending",
        requires_approval=False,
        staff_id=staff_id,
        staff_name=staff_name,
        source="portal",
        is_unassigned=is_unassigned,
        copied_from_order_id=order.id,  # Lưu vết nguồn gốc đơn cũ S5-02
        note=f"Đặt lại từ đơn cũ #{order.code or order.id}. {data.delivery_notes or ''}".strip(),
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(new_order)
    db.flush()

    # 7. Thêm các dòng hàng với đơn giá hiện hành
    for vitem in valid_items_to_create:
        new_item = OrderItem(
            order_id=new_order.id,
            product_id=vitem["product_id"],
            sku=vitem["sku"],
            name=vitem["name"],
            price=vitem["price"],
            quantity=vitem["quantity"],
            discount=0.0,
            subtotal=vitem["subtotal"],
            unit=vitem["unit"],
            delivered_quantity=None,
        )
        db.add(new_item)

    # 8. Sao chép OrderDeliveryProfile từ đơn cũ nếu có
    old_profile = db.query(OrderDeliveryProfile).filter(
        OrderDeliveryProfile.order_id == order.id
    ).first()

    expected_date = data.expected_delivery_date
    if not expected_date and old_profile and old_profile.expected_delivery_date:
        expected_date = old_profile.expected_delivery_date

    rec_name = old_profile.delivery_receiver_name if old_profile else customer.name
    rec_phone = old_profile.delivery_phone if old_profile else customer.phone
    rec_addr = old_profile.delivery_address if old_profile else customer.address
    addr_id = old_profile.delivery_address_id if old_profile else None
    addr_name = old_profile.delivery_address_name if old_profile else None

    new_delivery_profile = OrderDeliveryProfile(
        order_id=new_order.id,
        delivery_address_id=addr_id,
        delivery_address_name=addr_name,
        delivery_receiver_name=rec_name,
        delivery_phone=rec_phone,
        delivery_address=rec_addr,
        delivery_notes=data.delivery_notes or (old_profile.delivery_notes if old_profile else None),
        expected_delivery_date=expected_date,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(new_delivery_profile)

    # 9. Ghi Audit Log
    audit = AuditLog(
        entity_type="ORDER",
        entity_id=new_order.id,
        entity_name=f"Đơn hàng Portal {new_order.code}",
        action="PORTAL_REORDER_CREATED",
        change_summary=f"Đại lý '{customer.name}' đặt lại từ đơn #{order.code or order.id} (Tổng tiền: {total_amount:,.0f} đ, {len(valid_items_to_create)} mặt hàng)",
        user_id=user_id,
        username=username or customer.code or customer.id,
        user_fullname=customer.name,
        ip_address=client_ip,
        new_values={
            "copied_from_order_id": order.id,
            "copied_from_order_code": order.code,
            "total_items": len(valid_items_to_create),
            "total_amount": total_amount,
            "removed_discontinued_count": len(removed_discontinued),
            "price_changed_count": len(price_change_warnings),
        },
        created_at=now_utc,
    )
    db.add(audit)

    # 10. Lưu kết quả Idempotency
    resp_obj = PortalReorderResponse(
        order_id=new_order.id,
        order_code=new_order.code,
        customer_id=customer.id,
        status=new_order.status,
        subtotal=total_subtotal,
        total=total_amount,
        items_count=len(valid_items_to_create),
        copied_from_order_id=order.id,
        removed_discontinued_items=removed_discontinued,
        price_change_warnings=price_change_warnings,
        created_at=now_utc.isoformat(),
    )

    idemp_rec = PortalIdempotencyRecord(
        customer_id=customer.id,
        idempotency_key=idempotency_key,
        request_hash=req_hash,
        order_id=new_order.id,
        response_payload=json.dumps(resp_obj.model_dump()),
        created_at=now_utc,
    )
    db.add(idemp_rec)

    db.commit()
    return resp_obj


# ==============================================================================
# HÀM HỖ TRỢ VÀ NGHIỆP VỤ CÔNG NỢ & HOÁ ĐƠN ĐẠI LÝ (S7-07, SCRUM-753, 754, 756)
# ==============================================================================

def doc_so_tien_tieng_viet(so_tien: int) -> str:
    """Đọc số tiền VNĐ nguyên dương thành chuỗi chữ tiếng Việt chuẩn kế toán."""
    if so_tien <= 0:
        return "Không đồng"

    chu_so = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
    don_vi = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"]

    def doc_ba_so(n: int, day_du: bool = False) -> str:
        tram = n // 100
        chuc = (n % 100) // 10
        dv = n % 10
        res = []
        if tram > 0 or day_du:
            res.append(f"{chu_so[tram]} trăm")
        if chuc > 1:
            res.append(f"{chu_so[chuc]} mươi")
            if dv == 1:
                res.append("mốt")
            elif dv == 5:
                res.append("lăm")
            elif dv > 0:
                res.append(chu_so[dv])
        elif chuc == 1:
            res.append("mười")
            if dv == 5:
                res.append("lăm")
            elif dv > 0:
                res.append(chu_so[dv])
        elif chuc == 0 and (tram > 0 or day_du) and dv > 0:
            res.append(f"lẻ {chu_so[dv]}")
        elif chuc == 0 and dv > 0:
            res.append(chu_so[dv])
        return " ".join(res)

    chunks = []
    temp = so_tien
    while temp > 0:
        chunks.append(temp % 1000)
        temp //= 1000

    parts = []
    for i in range(len(chunks) - 1, -1, -1):
        c = chunks[i]
        if c > 0:
            day_du = (i < len(chunks) - 1)
            t = doc_ba_so(c, day_du)
            if don_vi[i]:
                t += f" {don_vi[i]}"
            parts.append(t)

    chuoi = " ".join(parts).strip()
    return chuoi.capitalize() + " đồng chẵn"


def _build_portal_invoice_query(
    db: Session,
    customer_id: str,
    status_filter: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    now_utc: Optional[datetime] = None,
):
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)

    query = db.query(Invoice).filter(Invoice.customer_id == customer_id)
    if status_filter:
        s_upper = status_filter.strip().upper()
        if s_upper == "OVERDUE":
            query = query.filter(
                Invoice.remaining_amount > 0,
                Invoice.due_date < now_utc
            )
        elif s_upper in [
            InvoiceStatus.UNPAID.value,
            InvoiceStatus.PARTIALLY_PAID.value,
            InvoiceStatus.PAID.value,
        ]:
            query = query.filter(Invoice.status == s_upper)

    if from_date:
        query = query.filter(Invoice.issued_at >= from_date)
    if to_date:
        query = query.filter(Invoice.issued_at <= to_date)

    return query


def get_portal_debt_overview(
    db: Session,
    customer: Customer,
    status_filter: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    page: int = 1,
    limit: int = 20,
) -> PortalDebtOverviewResponse:
    """
    Xem công nợ tổng quan và danh sách hoá đơn của chính đại lý (SCRUM-753, SCRUM-754).
    Chỉ số gồm:
    - credit_limit: Hạn mức công nợ được cấp
    - total_debt: Tổng nợ còn phải trả (tính từ hóa đơn chưa thanh toán hoặc đơn đã xuất)
    - available_credit: Hạn mức còn lại để được lấy thêm hàng
    - max_debt_days: Số ngày nợ tối đa
    - overdue_debt: Tổng nợ đã quá hạn
    - has_overdue: Đánh dấu có nợ quá hạn
    - Danh sách hóa đơn kèm phân trang và lọc theo trạng thái
    """
    profile = db.query(CustomerCreditProfile).filter(
        CustomerCreditProfile.customer_id == customer.id
    ).first()
    credit_limit = profile.credit_limit if profile else 0
    max_debt_days = profile.max_debt_days if profile else 0

    now_utc = datetime.now(timezone.utc)

    # 1. Tổng hợp toàn bộ hóa đơn của đại lý để tính chỉ tiêu tài chính
    all_invoices = db.query(Invoice).filter(Invoice.customer_id == customer.id).all()
    total_invoices_count = len(all_invoices)
    unpaid_invoices_count = sum(1 for inv in all_invoices if inv.remaining_amount > 0)

    invoice_remaining_sum = 0
    overdue_debt = 0
    overdue_invoices_count = 0

    for inv in all_invoices:
        if inv.remaining_amount > 0:
            invoice_remaining_sum += inv.remaining_amount
            d_due = inv.due_date
            if d_due:
                if d_due.tzinfo is None:
                    d_due = d_due.replace(tzinfo=timezone.utc)
                if d_due < now_utc:
                    overdue_debt += inv.remaining_amount
                    overdue_invoices_count += 1

    # Tính thêm nợ thực xuất từ các đơn chưa thanh toán (chống sót đơn chưa kịp xuất hóa đơn)
    order_debt_raw = db.query(
        func.coalesce(func.sum(Order.total - Order.paid_amount), 0.0)
    ).filter(
        Order.customer_id == customer.id,
        Order.status.in_(["shipping", "completed"])
    ).scalar() or 0.0
    order_debt = int(round(order_debt_raw))

    total_debt = max(invoice_remaining_sum, order_debt)
    available_credit = max(0, credit_limit - total_debt)
    has_overdue = (overdue_debt > 0 or overdue_invoices_count > 0)

    # 2. Truy vấn danh sách hoá đơn theo bộ lọc và phân trang
    query = _build_portal_invoice_query(
        db=db,
        customer_id=customer.id,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
        now_utc=now_utc,
    )
    total_filtered = query.count()
    page = max(1, page)
    limit = max(1, min(limit, 100))
    offset = (page - 1) * limit
    invoices_page = query.order_by(Invoice.issued_at.desc()).offset(offset).limit(limit).all()

    items = []
    for inv in invoices_page:
        d_due = inv.due_date
        if d_due and d_due.tzinfo is None:
            d_due = d_due.replace(tzinfo=timezone.utc)
        is_ov = bool(inv.remaining_amount > 0 and d_due and d_due < now_utc)
        days_ov = max(0, (now_utc.date() - d_due.date()).days) if (is_ov and d_due) else 0

        items.append(PortalDebtInvoiceItem(
            id=inv.id,
            subtotal_amount=inv.subtotal_amount,
            discount_amount=inv.discount_amount,
            vat_amount=inv.vat_amount,
            total_amount=inv.total_amount,
            paid_amount=inv.paid_amount,
            remaining_amount=inv.remaining_amount,
            status=inv.status,
            issued_at=inv.issued_at,
            due_date=inv.due_date,
            is_overdue=is_ov,
            days_overdue=days_ov,
            items_count=len(inv.items) if inv.items else 0,
            notes=inv.notes,
        ))

    total_pages = (total_filtered + limit - 1) // limit if total_filtered > 0 else 1

    return PortalDebtOverviewResponse(
        customer_id=customer.id,
        customer_name=customer.name,
        credit_limit=credit_limit,
        total_debt=total_debt,
        available_credit=available_credit,
        max_debt_days=max_debt_days,
        overdue_debt=overdue_debt,
        has_overdue=has_overdue,
        total_invoices_count=total_invoices_count,
        unpaid_invoices_count=unpaid_invoices_count,
        overdue_invoices_count=overdue_invoices_count,
        invoices=items,
        total=total_filtered,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


def get_portal_invoices(
    db: Session,
    customer: Customer,
    status_filter: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    page: int = 1,
    limit: int = 20,
) -> PortalInvoiceListResponse:
    """Danh sách hoá đơn bán hàng của đại lý kèm phân trang (SCRUM-753, SCRUM-754)."""
    now_utc = datetime.now(timezone.utc)
    query = _build_portal_invoice_query(
        db=db,
        customer_id=customer.id,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
        now_utc=now_utc,
    )
    total_filtered = query.count()
    page = max(1, page)
    limit = max(1, min(limit, 100))
    offset = (page - 1) * limit
    invoices_page = query.order_by(Invoice.issued_at.desc()).offset(offset).limit(limit).all()

    items = []
    for inv in invoices_page:
        d_due = inv.due_date
        if d_due and d_due.tzinfo is None:
            d_due = d_due.replace(tzinfo=timezone.utc)
        is_ov = bool(inv.remaining_amount > 0 and d_due and d_due < now_utc)
        days_ov = max(0, (now_utc.date() - d_due.date()).days) if (is_ov and d_due) else 0

        items.append(PortalDebtInvoiceItem(
            id=inv.id,
            subtotal_amount=inv.subtotal_amount,
            discount_amount=inv.discount_amount,
            vat_amount=inv.vat_amount,
            total_amount=inv.total_amount,
            paid_amount=inv.paid_amount,
            remaining_amount=inv.remaining_amount,
            status=inv.status,
            issued_at=inv.issued_at,
            due_date=inv.due_date,
            is_overdue=is_ov,
            days_overdue=days_ov,
            items_count=len(inv.items) if inv.items else 0,
            notes=inv.notes,
        ))

    total_pages = (total_filtered + limit - 1) // limit if total_filtered > 0 else 1
    return PortalInvoiceListResponse(
        items=items,
        total=total_filtered,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


def get_portal_invoice_detail(
    db: Session,
    customer: Customer,
    invoice_id: str,
) -> PortalInvoiceDetailResponse:
    """
    Tra cứu chi tiết hoá đơn đã phát hành kèm kiểm soát truy cập (SCRUM-756, SCRUM-754).
    Chặn 403 nếu truy cập hóa đơn của đại lý khác (chống IDOR).
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy hoá đơn '{invoice_id}'.",
        )
    if invoice.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập vào hoá đơn của đại lý khác.",
        )

    now_utc = datetime.now(timezone.utc)
    d_due = invoice.due_date
    if d_due and d_due.tzinfo is None:
        d_due = d_due.replace(tzinfo=timezone.utc)
    is_ov = bool(invoice.remaining_amount > 0 and d_due and d_due < now_utc)
    days_ov = max(0, (now_utc.date() - d_due.date()).days) if (is_ov and d_due) else 0

    items_resp = [
        PortalInvoiceItemDetail(
            id=it.id,
            dispatch_id=it.dispatch_id,
            order_id=it.order_id,
            product_id=it.product_id,
            sku=it.sku,
            product_name=it.product_name,
            unit=it.unit or "cái",
            quantity=it.quantity,
            unit_price=it.unit_price,
            discount_amount=it.discount_amount,
            vat_amount=it.vat_amount,
            subtotal=it.subtotal,
        )
        for it in (invoice.items or [])
    ]

    return PortalInvoiceDetailResponse(
        id=invoice.id,
        customer_id=invoice.customer_id,
        customer_name=invoice.customer_name,
        customer_address=invoice.customer_address,
        customer_tax_code=invoice.customer_tax_code,
        subtotal_amount=invoice.subtotal_amount,
        discount_amount=invoice.discount_amount,
        vat_amount=invoice.vat_amount,
        total_amount=invoice.total_amount,
        paid_amount=invoice.paid_amount,
        remaining_amount=invoice.remaining_amount,
        status=invoice.status,
        issued_at=invoice.issued_at,
        due_date=invoice.due_date,
        is_overdue=is_ov,
        days_overdue=days_ov,
        notes=invoice.notes,
        items=items_resp,
    )


def render_invoice_html(
    db: Session,
    customer: Customer,
    invoice_id: str,
) -> str:
    """
    Sinh tài liệu HTML hoá đơn chuẩn in ấn khổ A4 phục vụ xem trước và tải lại (SCRUM-756, SCRUM-754).
    Kiểm soát quyền truy cập chặt chẽ: chỉ đại lý sở hữu mới được tải.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy hoá đơn '{invoice_id}'.",
        )
    if invoice.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền tải hoá đơn của đại lý khác.",
        )

    # Định dạng ngày giờ
    issued_str = invoice.issued_at.strftime("%d/%m/%Y %H:%M") if invoice.issued_at else ""
    due_str = invoice.due_date.strftime("%d/%m/%Y") if invoice.due_date else ""

    # Trạng thái và watermark
    st = (invoice.status or "").upper()
    if st == "PAID":
        watermark_text = "ĐÃ THANH TOÁN"
        watermark_class = "watermark-paid"
        status_label = "Đã thanh toán đủ"
        badge_class = "badge-paid"
    elif st == "PARTIALLY_PAID":
        watermark_text = "THANH TOÁN MỘT PHẦN"
        watermark_class = "watermark-partially_paid"
        status_label = "Thanh toán một phần"
        badge_class = "badge-partially_paid"
    else:
        watermark_text = "CHƯA THANH TOÁN"
        watermark_class = "watermark-unpaid"
        status_label = "Chưa thanh toán"
        badge_class = "badge-unpaid"

    words = doc_so_tien_tieng_viet(invoice.total_amount)

    # Render danh sách dòng hàng
    rows_html = []
    for idx, it in enumerate(invoice.items or [], start=1):
        rows_html.append(f"""
            <tr>
                <td class="text-center">{idx}</td>
                <td><strong>{it.sku}</strong></td>
                <td>{it.product_name or 'Sản phẩm'}</td>
                <td class="text-center">{it.unit or 'cái'}</td>
                <td class="text-center">{it.quantity}</td>
                <td class="text-right">{it.unit_price:,.0f} đ</td>
                <td class="text-right">{it.discount_amount:,.0f} đ</td>
                <td class="text-right">{it.vat_amount:,.0f} đ</td>
                <td class="text-right"><strong>{it.subtotal:,.0f} đ</strong></td>
            </tr>
        """)
    items_tbody = "".join(rows_html)

    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hóa đơn bán hàng - {invoice.id}</title>
<style>
    @page {{
        size: A4 portrait;
        margin: 15mm;
    }}
    * {{
        box-sizing: border-box;
    }}
    body {{
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #1e293b;
        background-color: #f1f5f9;
        margin: 0;
        padding: 24px;
    }}
    .invoice-card {{
        max-width: 820px;
        margin: 0 auto;
        position: relative;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
        padding: 32px 36px;
        overflow: hidden;
    }}
    .watermark {{
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-30deg);
        font-size: 46px;
        font-weight: 800;
        letter-spacing: 3px;
        opacity: 0.12;
        pointer-events: none;
        white-space: nowrap;
        text-transform: uppercase;
        border: 4px solid currentColor;
        padding: 12px 28px;
        border-radius: 8px;
    }}
    .watermark-paid {{ color: #16a34a; }}
    .watermark-unpaid {{ color: #dc2626; }}
    .watermark-partially_paid {{ color: #d97706; }}
    .header-table {{
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
    }}
    .header-company {{
        width: 60%;
        vertical-align: top;
    }}
    .company-name {{
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 4px;
        text-transform: uppercase;
    }}
    .company-info {{
        font-size: 12.5px;
        color: #475569;
        line-height: 1.5;
    }}
    .header-meta {{
        width: 40%;
        text-align: right;
        vertical-align: top;
        font-size: 12.5px;
        color: #475569;
        line-height: 1.6;
    }}
    .invoice-title {{
        text-align: center;
        margin: 20px 0 10px 0;
    }}
    .invoice-title h1 {{
        font-size: 22px;
        font-weight: 800;
        color: #1e3a8a;
        margin: 0;
        letter-spacing: 1px;
    }}
    .invoice-subtitle {{
        font-size: 12.5px;
        color: #64748b;
        font-style: italic;
        margin-top: 4px;
    }}
    .info-box {{
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 14px 18px;
        margin: 16px 0;
        font-size: 13px;
    }}
    .info-grid {{
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 24px;
    }}
    .info-item {{
        display: flex;
    }}
    .info-label {{
        width: 130px;
        color: #64748b;
        font-weight: 600;
    }}
    .info-value {{
        flex: 1;
        color: #0f172a;
        font-weight: 500;
    }}
    .badge {{
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
    }}
    .badge-paid {{ background: #dcfce7; color: #15803d; }}
    .badge-unpaid {{ background: #fee2e2; color: #b91c1c; }}
    .badge-partially_paid {{ background: #fef3c7; color: #b45309; }}
    .items-table {{
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0 12px 0;
        font-size: 12.5px;
    }}
    .items-table th {{
        background: #f1f5f9;
        color: #334155;
        font-weight: 700;
        text-align: left;
        padding: 9px 8px;
        border: 1px solid #cbd5e1;
    }}
    .items-table td {{
        padding: 8px 8px;
        border: 1px solid #e2e8f0;
        vertical-align: middle;
    }}
    .items-table tr:nth-child(even) {{
        background-color: #fafbfc;
    }}
    .text-center {{ text-align: center; }}
    .text-right {{ text-align: right; }}
    .summary-table {{
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        font-size: 13px;
    }}
    .summary-table td {{
        padding: 6px 8px;
    }}
    .summary-label {{
        width: 70%;
        text-align: right;
        color: #475569;
    }}
    .summary-val {{
        width: 30%;
        text-align: right;
        font-weight: 600;
        color: #0f172a;
    }}
    .summary-total {{
        font-size: 15px;
        font-weight: 800;
        color: #1e3a8a;
        border-top: 2px solid #cbd5e1;
        border-bottom: 2px solid #cbd5e1;
        padding: 8px 8px;
    }}
    .words-box {{
        font-style: italic;
        color: #334155;
        margin-top: 12px;
        padding: 8px 12px;
        background: #f8fafc;
        border: 1px dashed #cbd5e1;
        border-radius: 4px;
        font-size: 13px;
    }}
    .signatures {{
        margin-top: 36px;
        display: flex;
        justify-content: space-between;
        text-align: center;
        page-break-inside: avoid;
    }}
    .sign-col {{
        width: 30%;
    }}
    .sign-title {{
        font-weight: 700;
        font-size: 13px;
        color: #0f172a;
    }}
    .sign-note {{
        font-size: 11px;
        color: #64748b;
        font-style: italic;
        margin-top: 2px;
    }}
    .sign-space {{
        height: 65px;
    }}
    .sign-name {{
        font-size: 12.5px;
        font-weight: 600;
        color: #0f172a;
    }}
    @media print {{
        body {{
            padding: 0;
            background: none;
        }}
        .invoice-card {{
            box-shadow: none;
            border-radius: 0;
            padding: 0;
            max-width: 100%;
        }}
    }}
</style>
</head>
<body>
<div class="invoice-card">
    <div class="watermark {watermark_class}">{watermark_text}</div>

    <!-- Header thông tin công ty -->
    <table class="header-table">
        <tr>
            <td class="header-company">
                <div class="company-name">Hệ Thống Phân Phối Bán Hàng & Kho Vận Sales-Warehouse</div>
                <div class="company-info">
                    Mã số thuế: <strong>0101234567</strong><br>
                    Địa chỉ: Tòa nhà Công nghệ ICT, Cầu Giấy, Hà Nội<br>
                    Hotline: 1900 6868 | Email: billing@saleswarehouse.vn
                </div>
            </td>
            <td class="header-meta">
                Mẫu số: <strong>01GTKT0/001</strong><br>
                Ký hiệu: <strong>HD/{invoice.id[:10]}</strong><br>
                Số hoá đơn: <strong>{invoice.id}</strong><br>
                Ngày phát hành: {issued_str}
            </td>
        </tr>
    </table>

    <!-- Tiêu đề hóa đơn -->
    <div class="invoice-title">
        <h1>HÓA ĐƠN BÁN HÀNG</h1>
        <div class="invoice-subtitle">Liên 2: Giao cho người mua (Đại lý)</div>
    </div>

    <!-- Thông tin khách hàng / đại lý -->
    <div class="info-box">
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Đơn vị mua hàng:</div>
                <div class="info-value"><strong>{invoice.customer_name or customer.name}</strong></div>
            </div>
            <div class="info-item">
                <div class="info-label">Mã đại lý:</div>
                <div class="info-value">{invoice.customer_id}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Mã số thuế:</div>
                <div class="info-value">{invoice.customer_tax_code or '---'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Hạn thanh toán:</div>
                <div class="info-value"><strong>{due_str}</strong></div>
            </div>
            <div class="info-item" style="grid-column: span 2;">
                <div class="info-label">Địa chỉ trụ sở:</div>
                <div class="info-value">{invoice.customer_address or customer.address or '---'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Trạng thái:</div>
                <div class="info-value"><span class="badge {badge_class}">{status_label}</span></div>
            </div>
            <div class="info-item">
                <div class="info-label">Ghi chú:</div>
                <div class="info-value">{invoice.notes or 'Hóa đơn xuất tự động theo phiếu xuất kho'}</div>
            </div>
        </div>
    </div>

    <!-- Bảng danh sách dòng hàng -->
    <table class="items-table">
        <thead>
            <tr>
                <th class="text-center" style="width: 40px;">STT</th>
                <th style="width: 100px;">Mã SKU</th>
                <th>Tên hàng hóa, dịch vụ</th>
                <th class="text-center" style="width: 50px;">ĐVT</th>
                <th class="text-center" style="width: 60px;">SL</th>
                <th class="text-right" style="width: 95px;">Đơn giá</th>
                <th class="text-right" style="width: 85px;">Chiết khấu</th>
                <th class="text-right" style="width: 80px;">VAT</th>
                <th class="text-right" style="width: 105px;">Thành tiền</th>
            </tr>
        </thead>
        <tbody>
            {items_tbody}
        </tbody>
    </table>

    <!-- Bảng tổng hợp thanh toán -->
    <table class="summary-table">
        <tr>
            <td class="summary-label">Cộng tiền hàng (chưa bao gồm VAT):</td>
            <td class="summary-val">{invoice.subtotal_amount:,.0f} đ</td>
        </tr>
        <tr>
            <td class="summary-label">Tổng tiền chiết khấu thương mại:</td>
            <td class="summary-val">-{invoice.discount_amount:,.0f} đ</td>
        </tr>
        <tr>
            <td class="summary-label">Thuế giá trị gia tăng (VAT):</td>
            <td class="summary-val">+{invoice.vat_amount:,.0f} đ</td>
        </tr>
        <tr>
            <td class="summary-label summary-total">TỔNG CỘNG TIỀN THANH TOÁN:</td>
            <td class="summary-val summary-total">{invoice.total_amount:,.0f} đ</td>
        </tr>
        <tr>
            <td class="summary-label">Số tiền đã thanh toán:</td>
            <td class="summary-val" style="color: #15803d;">{invoice.paid_amount:,.0f} đ</td>
        </tr>
        <tr>
            <td class="summary-label">Số tiền còn nợ phải thu:</td>
            <td class="summary-val" style="color: #b91c1c;">{invoice.remaining_amount:,.0f} đ</td>
        </tr>
    </table>

    <div class="words-box">
        <strong>Số tiền viết bằng chữ:</strong> {words}
    </div>

    <!-- Khối chữ ký -->
    <div class="signatures">
        <div class="sign-col">
            <div class="sign-title">NGƯỜI MUA HÀNG</div>
            <div class="sign-note">(Ký, ghi rõ họ tên)</div>
            <div class="sign-space"></div>
            <div class="sign-name">{customer.name}</div>
        </div>
        <div class="sign-col">
            <div class="sign-title">NGƯỜI LẬP HÓA ĐƠN</div>
            <div class="sign-note">(Ký, ghi rõ họ tên)</div>
            <div class="sign-space"></div>
            <div class="sign-name">Bộ phận Kế toán</div>
        </div>
        <div class="sign-col">
            <div class="sign-title">THỦ TRƯỞNG ĐƠN VỊ</div>
            <div class="sign-note">(Ký, đóng dấu, ghi rõ họ tên)</div>
            <div class="sign-space"></div>
            <div class="sign-name">Giám Đốc Bán Hàng</div>
        </div>
    </div>
</div>
</body>
</html>"""
    return html_content
