from datetime import datetime, timezone
from typing import Optional, Tuple, List
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException, status

from app.models.customer import Customer
from app.models.product import Product
from app.models.price_list import PriceList, PriceListItem
from app.models.volume_discount import (
    VolumeDiscountPolicy,
    VolumeDiscountTier,
    VolumeDiscountScope,
    VolumeDiscountType,
)
from app.services.volume_discount_service import calculate_volume_discount
from app.schemas.pricing import (
    LinePricingLookupResponse,
    OrderPricingValidateResponse,
    OrderPricingValidateItem,
)

GROUP_LABELS = {
    "TIER_1": "Đại lý Cấp 1",
    "TIER_2": "Đại lý Cấp 2",
    "WHOLESALE": "Khách Mua Sỉ / Phân Phối",
    "RETAIL": "Khách Bán Lẻ",
    "VIP": "Khách Hàng VIP",
}


def normalize_datetime(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_effective_price_list_for_customer(
    db: Session,
    customer_id: str,
    check_date: Optional[datetime] = None
) -> Tuple[Customer, Optional[PriceList]]:
    """Tra cứu khách hàng và bảng giá đang có hiệu lực theo nhóm khách hàng (SCRUM-489, SCRUM-492)."""
    cust = db.query(Customer).filter(
        or_(Customer.id == customer_id, Customer.code == customer_id)
    ).first()
    if not cust:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khách hàng hoặc đại lý với mã '{customer_id}'."
        )

    target_date = normalize_datetime(check_date or datetime.now(timezone.utc))
    customer_group = (cust.customer_group or "RETAIL").strip()

    # Tìm bảng giá ĐÃ DUYỆT (APPROVED), đang kích hoạt, khớp customer_group và trong thời hạn hiệu lực
    active_pl = db.query(PriceList).filter(
        PriceList.customer_group == customer_group,
        PriceList.status == "APPROVED",
        PriceList.is_active == True,
        PriceList.valid_from <= target_date,
        or_(PriceList.valid_to == None, PriceList.valid_to >= target_date)
    ).order_by(PriceList.version.desc(), PriceList.id.desc()).first()

    return cust, active_pl


def calculate_line_volume_discount(
    db: Session,
    product: Product,
    customer_group: str,
    quantity: int,
    base_unit_price: float,
    check_date: Optional[datetime] = None
) -> Tuple[float, float, float, Optional[int], Optional[str]]:
    """
    Tính lại chiết khấu theo sản lượng dựa trên số lượng và đơn giá áp dụng (SCRUM-491).
    Trả về: (discount_rate %, discount_amount_per_unit, total_discount, policy_id, policy_name).
    """
    target_date = normalize_datetime(check_date or datetime.now(timezone.utc))

    active_policies = db.query(VolumeDiscountPolicy).filter(
        VolumeDiscountPolicy.is_active == True,
        VolumeDiscountPolicy.valid_from <= target_date,
        or_(VolumeDiscountPolicy.valid_to == None, VolumeDiscountPolicy.valid_to >= target_date)
    ).all()

    if not active_policies:
        return 0.0, 0.0, 0.0, None, None

    matched_candidates = []
    prod_cat_id = str(product.category_id) if product.category_id else None

    for p in active_policies:
        scope_score = 0
        if p.applied_scope == VolumeDiscountScope.PRODUCT and p.target_id == str(product.id):
            scope_score = 3
        elif p.applied_scope == VolumeDiscountScope.CATEGORY and prod_cat_id and p.target_id == prod_cat_id:
            scope_score = 2
        elif p.applied_scope == VolumeDiscountScope.ALL_PRODUCTS:
            scope_score = 1
        else:
            continue

        group_score = 0
        if p.customer_group == customer_group:
            group_score = 2
        elif p.customer_group == "ALL" or not p.customer_group:
            group_score = 1
        else:
            continue

        matching_tier = None
        for tier in p.tiers:
            if tier.min_quantity <= quantity:
                if tier.max_quantity is None or quantity <= tier.max_quantity:
                    matching_tier = tier
                    break

        if not matching_tier:
            continue

        priority = (scope_score * 10) + group_score
        p_date = normalize_datetime(p.valid_from)
        matched_candidates.append((priority, p_date, p, matching_tier))

    if not matched_candidates:
        return 0.0, 0.0, 0.0, None, None

    # Ưu tiên theo điểm ưu tiên cao nhất, rồi valid_from mới nhất
    matched_candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    best_policy = matched_candidates[0][2]
    best_tier = matched_candidates[0][3]

    if best_tier.discount_type == VolumeDiscountType.PERCENT:
        discount_rate = float(best_tier.discount_value)
        discount_amount_per_unit = round(base_unit_price * (discount_rate / 100.0), 2)
    else:  # FIXED_AMOUNT
        raw_disc = float(best_tier.discount_value)
        discount_amount_per_unit = min(base_unit_price, raw_disc)
        discount_rate = round((discount_amount_per_unit / base_unit_price) * 100, 2) if base_unit_price > 0 else 0.0

    total_discount = round(discount_amount_per_unit * quantity, 2)
    return discount_rate, discount_amount_per_unit, total_discount, best_policy.id, best_policy.name


def lookup_line_pricing(
    db: Session,
    customer_id: str,
    product_id: Optional[str] = None,
    sku: Optional[str] = None,
    quantity: int = 1,
    custom_price: Optional[float] = None,
    check_date: Optional[datetime] = None,
    strict_block: bool = True
) -> LinePricingLookupResponse:
    """
    Nghiệp vụ cốt lõi tra cứu giá áp dụng, giá sàn và chiết khấu cho một dòng hàng (SCRUM-488..SCRUM-492):
    1. Xác định sản phẩm (SKU).
    2. Xác định nhóm khách hàng và bảng giá đang hiệu lực.
    3. Chặn thêm dòng hàng nếu SKU không có bảng giá hiệu lực kèm thông báo rõ lý do (SCRUM-492).
    4. Xác định giá bán mặc định & giá sàn theo nhóm khách hàng (SCRUM-489).
    5. Kiểm tra giá sàn khi người dùng sửa giá thủ công và gắn cờ cần duyệt (SCRUM-490).
    6. Tính lại chiết khấu theo sản lượng theo số lượng mới (SCRUM-491).
    """
    # 1. Tra cứu sản phẩm
    prod = None
    if product_id is not None:
        str_pid = str(product_id).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        if not prod:
            prod = db.query(Product).filter(
                or_(Product.id == str_pid, Product.sku == str_pid)
            ).first()

    if not prod and sku:
        str_sku = str(sku).strip()
        prod = db.query(Product).filter(Product.sku == str_sku).first()

    if not prod:
        identifier = product_id or sku or "Không rõ"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm với thông tin '{identifier}'."
        )

    # 2. Tra cứu khách hàng và bảng giá hiệu lực
    cust, active_pl = get_effective_price_list_for_customer(db, customer_id, check_date)
    customer_group = (cust.customer_group or "RETAIL").strip()
    customer_group_label = GROUP_LABELS.get(customer_group, customer_group)

    # 3. SCRUM-492: Chặn khi không có bảng giá hiệu lực
    if not active_pl:
        err_msg = (
            f"Không có bảng giá nào đang có hiệu lực cho nhóm khách hàng '{customer_group_label}' "
            f"({customer_group}) mà đại lý '{cust.name}' thuộc về. "
            f"Vui lòng thiết lập bảng giá có hiệu lực trước khi tạo đơn hàng."
        )
        if strict_block:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg
            )
        # Tính chiết khấu sản lượng dựa trên giá catalog
        calc_res = calculate_volume_discount(
            db=db,
            product_id=str(prod.id),
            quantity=quantity,
            customer_id=cust.id
        )
        base_u_price = float(custom_price if custom_price is not None else (prod.price or 0.0))
        final_u_price = max(0.0, base_u_price - calc_res.discount_amount_per_unit)
        total_disc = calc_res.discount_amount_per_unit * quantity

        return LinePricingLookupResponse(
            success=False,
            has_effective_price_list=False,
            price_list_id=None,
            price_list_code=None,
            price_list_name=None,
            customer_id=cust.id,
            customer_group=customer_group,
            customer_group_label=customer_group_label,
            product_id=str(prod.id),
            sku=prod.sku,
            product_name=prod.name,
            unit=prod.unit or "cái",
            listed_price=float(prod.price or 0.0),
            default_price=float(prod.price or 0.0),
            floor_price=0.0,
            applied_unit_price=base_u_price,
            is_manual_price=bool(custom_price is not None),
            is_below_floor=False,
            requires_approval=True,
            approval_reason="Không có bảng giá hiệu lực cho nhóm khách hàng",
            quantity=quantity,
            discount_rate=calc_res.discount_rate,
            discount_amount_per_unit=calc_res.discount_amount_per_unit,
            total_discount=total_disc,
            final_unit_price=final_u_price,
            line_total=final_u_price * quantity,
            applied_discount_policy_id=calc_res.applied_policy_id,
            applied_discount_policy_name=getattr(calc_res, "applied_discount_policy_name", None),
            message=err_msg
        )

    # 4. Tìm dòng giá của sản phẩm trong bảng giá này
    item = db.query(PriceListItem).filter(
        PriceListItem.price_list_id == active_pl.id,
        or_(
            PriceListItem.product_id == str(prod.id),
            PriceListItem.product_sku == prod.sku,
            PriceListItem.product_id == prod.sku
        )
    ).first()

    if not item:
        err_msg = (
            f"Sản phẩm '{prod.name}' (SKU: {prod.sku}) chưa có trong bảng giá hiệu lực "
            f"'{active_pl.name}' ({active_pl.code}) của nhóm khách hàng '{customer_group_label}'. "
            f"Hệ thống chặn thêm dòng hàng này vào đơn."
        )
        if strict_block:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg
            )
        calc_res = calculate_volume_discount(
            db=db,
            product_id=str(prod.id),
            quantity=quantity,
            customer_id=cust.id
        )
        base_u_price = float(custom_price if custom_price is not None else (prod.price or 0.0))
        final_u_price = max(0.0, base_u_price - calc_res.discount_amount_per_unit)
        total_disc = calc_res.discount_amount_per_unit * quantity

        return LinePricingLookupResponse(
            success=False,
            has_effective_price_list=True,
            price_list_id=active_pl.id,
            price_list_code=active_pl.code,
            price_list_name=active_pl.name,
            customer_id=cust.id,
            customer_group=customer_group,
            customer_group_label=customer_group_label,
            product_id=str(prod.id),
            sku=prod.sku,
            product_name=prod.name,
            unit=prod.unit or "cái",
            listed_price=float(prod.price or 0.0),
            default_price=float(prod.price or 0.0),
            floor_price=0.0,
            applied_unit_price=base_u_price,
            is_manual_price=bool(custom_price is not None),
            is_below_floor=False,
            requires_approval=True,
            approval_reason="Sản phẩm chưa có trong bảng giá hiệu lực",
            quantity=quantity,
            discount_rate=calc_res.discount_rate,
            discount_amount_per_unit=calc_res.discount_amount_per_unit,
            total_discount=total_disc,
            final_unit_price=final_u_price,
            line_total=final_u_price * quantity,
            applied_discount_policy_id=calc_res.applied_policy_id,
            applied_discount_policy_name=getattr(calc_res, "applied_discount_policy_name", None),
            message=err_msg
        )

    # 5. SCRUM-489: Xác định giá bán mặc định và giá sàn
    listed_price = float(item.listed_price)
    default_price = float(item.sale_price)
    floor_price = float(item.floor_price)

    # 6. SCRUM-490: Kiểm tra sửa giá thủ công và giá sàn
    is_manual = False
    if custom_price is not None and custom_price >= 0:
        applied_unit_price = float(custom_price)
        is_manual = True
    else:
        applied_unit_price = default_price

    is_below_floor = bool(applied_unit_price < floor_price)
    requires_approval = is_below_floor
    approval_reason = None
    if is_below_floor:
        approval_reason = (
            f"Đơn giá bán '{applied_unit_price:,.0f} đ' của sản phẩm '{prod.name}' (SKU: {prod.sku}) "
            f"thấp hơn giá sàn quy định '{floor_price:,.0f} đ' trong bảng giá '{active_pl.name}'."
        )

    # 7. SCRUM-491: Tính lại chiết khấu theo sản lượng dựa trên số lượng
    qty = max(1, quantity)
    (
        discount_rate,
        discount_amount_per_unit,
        total_discount,
        policy_id,
        policy_name
    ) = calculate_line_volume_discount(
        db=db,
        product=prod,
        customer_group=customer_group,
        quantity=qty,
        base_unit_price=applied_unit_price,
        check_date=check_date
    )

    final_unit_price = max(0.0, applied_unit_price - discount_amount_per_unit)
    line_total = round(final_unit_price * qty, 2)

    return LinePricingLookupResponse(
        success=True,
        has_effective_price_list=True,
        price_list_id=active_pl.id,
        price_list_code=active_pl.code,
        price_list_name=active_pl.name,
        customer_id=cust.id,
        customer_group=customer_group,
        customer_group_label=customer_group_label,
        product_id=str(prod.id),
        sku=prod.sku,
        product_name=prod.name,
        unit=item.unit or prod.unit or "cái",
        listed_price=listed_price,
        default_price=default_price,
        floor_price=floor_price,
        applied_unit_price=applied_unit_price,
        is_manual_price=is_manual,
        is_below_floor=is_below_floor,
        requires_approval=requires_approval,
        approval_reason=approval_reason,
        quantity=qty,
        discount_rate=discount_rate,
        discount_amount_per_unit=discount_amount_per_unit,
        total_discount=total_discount,
        final_unit_price=final_unit_price,
        line_total=line_total,
        applied_discount_policy_id=policy_id,
        applied_discount_policy_name=policy_name,
        message=f"Đã áp dụng giá bảng giá '{active_pl.name}' ({customer_group_label})."
    )


def validate_order_cart(
    db: Session,
    customer_id: str,
    items: List[OrderPricingValidateItem],
    price_list_id: Optional[int] = None,
    check_date: Optional[datetime] = None
) -> OrderPricingValidateResponse:
    """Kiểm tra và tính toán bảng giá, giá sàn và chiết khấu cho toàn bộ danh sách dòng hàng."""
    cust, active_pl = get_effective_price_list_for_customer(db, customer_id, check_date)
    customer_group = (cust.customer_group or "RETAIL").strip()
    customer_group_label = GROUP_LABELS.get(customer_group, customer_group)

    item_results = []
    blocking_errors = []
    approval_reasons = []
    subtotal = 0.0
    total_discount = 0.0

    for itm in items:
        res = lookup_line_pricing(
            db=db,
            customer_id=customer_id,
            product_id=itm.product_id,
            sku=itm.sku,
            quantity=itm.quantity,
            custom_price=itm.price,
            check_date=check_date,
            strict_block=False
        )
        item_results.append(res)
        if not res.success:
            blocking_errors.append(res.message or "Sản phẩm không có bảng giá hiệu lực.")
        else:
            line_sub = res.applied_unit_price * res.quantity
            subtotal += line_sub
            total_discount += res.total_discount
            if res.is_below_floor and res.approval_reason:
                approval_reasons.append(res.approval_reason)

    final_total = max(0.0, subtotal - total_discount)
    is_valid = len(blocking_errors) == 0
    requires_approval = len(approval_reasons) > 0

    return OrderPricingValidateResponse(
        valid=is_valid,
        customer_id=cust.id,
        customer_group=customer_group,
        customer_group_label=customer_group_label,
        price_list_id=active_pl.id if active_pl else None,
        price_list_name=active_pl.name if active_pl else None,
        subtotal=subtotal,
        discount=total_discount,
        total=final_total,
        requires_approval=requires_approval,
        approval_reasons=approval_reasons,
        blocking_errors=blocking_errors,
        items=item_results
    )
