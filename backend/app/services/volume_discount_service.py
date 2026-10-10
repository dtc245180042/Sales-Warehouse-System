from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.volume_discount import (
    VolumeDiscountPolicy,
    VolumeDiscountTier,
    VolumeDiscountScope,
    VolumeDiscountType,
)
from app.models.product import Product
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.auth import User, UserRole
from app.models.audit_log import AuditLog
from app.schemas.volume_discount import (
    VolumeDiscountPolicyCreate,
    VolumeDiscountPolicyUpdate,
    VolumeDiscountTierCreate,
    VolumeDiscountCalculateResponse,
)


def _validate_tiers(tiers_in: List[VolumeDiscountTierCreate]):
    """
    Ràng buộc nghiệp vụ cho các bậc chiết khấu (SCRUM-485):
    1. min_quantity > 0.
    2. Nếu có max_quantity thì max_quantity >= min_quantity.
    3. Các bậc không được giao nhau (anti-overlapping).
    4. Nếu là PERCENT thì <= 100%.
    """
    if not tiers_in:
        return

    # Sắp xếp theo min_quantity tăng dần
    sorted_tiers = sorted(tiers_in, key=lambda t: t.min_quantity)

    for i, tier in enumerate(sorted_tiers):
        if tier.min_quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số lượng tối thiểu của bậc chiết khấu phải lớn hơn 0 (Hiện tại: {tier.min_quantity})."
            )

        if tier.max_quantity is not None and tier.max_quantity < tier.min_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số lượng tối đa ({tier.max_quantity}) không được nhỏ hơn số lượng tối thiểu ({tier.min_quantity})."
            )

        if tier.discount_type == VolumeDiscountType.PERCENT:
            if tier.discount_value < Decimal("0.0") or tier.discount_value > Decimal("100.0"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tỷ lệ chiết khấu theo % phải nằm trong khoảng từ 0% đến 100% (Hiện tại: {tier.discount_value}%)."
                )
        elif tier.discount_type == VolumeDiscountType.FIXED_AMOUNT:
            if tier.discount_value <= Decimal("0"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Số tiền chiết khấu cố định phải lớn hơn 0 đồng."
                )

        # Kiểm tra giao nhau với bậc kế tiếp
        if i < len(sorted_tiers) - 1:
            next_tier = sorted_tiers[i + 1]
            if tier.max_quantity is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Bậc số lượng từ {tier.min_quantity} trở lên không có giới hạn trên, không thể khai báo thêm bậc từ {next_tier.min_quantity}."
                )
            if tier.max_quantity >= next_tier.min_quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Các bậc chiết khấu bị giao nhau: bậc [{tier.min_quantity} - {tier.max_quantity}] chồng lấn với bậc [{next_tier.min_quantity} - {next_tier.max_quantity or 'trở lên'}]."
                )


def _normalize_dt(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _check_policy_overlap(
    db: Session,
    code: str,
    applied_scope: str,
    target_id: Optional[str],
    customer_group: Optional[str],
    valid_from: datetime,
    valid_to: Optional[datetime],
    exclude_policy_id: Optional[int] = None
):
    """Chặn tạo hai chính sách chồng chéo cùng phạm vi + nhóm khách + khoảng thời gian."""
    query = db.query(VolumeDiscountPolicy).filter(
        VolumeDiscountPolicy.is_active == True,
        VolumeDiscountPolicy.applied_scope == applied_scope,
        VolumeDiscountPolicy.target_id == target_id,
        VolumeDiscountPolicy.customer_group == (customer_group or "ALL")
    )
    if exclude_policy_id:
        query = query.filter(VolumeDiscountPolicy.id != exclude_policy_id)

    v_from = _normalize_dt(valid_from)
    v_to = _normalize_dt(valid_to)

    existing_policies = query.all()
    for p in existing_policies:
        p_from = _normalize_dt(p.valid_from)
        p_to = _normalize_dt(p.valid_to)

        # Kiểm tra giao khoảng thời gian [v_from, v_to] và [p_from, p_to]
        overlap_start = (p_to is None) or (v_from <= p_to)
        overlap_end = (v_to is None) or (v_to >= p_from)
        if overlap_start and overlap_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Đã tồn tại chính sách chiết khấu '{p.name}' ({p.code}) có cùng phạm vi áp dụng và trùng khoảng thời gian hiệu lực."
            )


def create_volume_discount_policy(
    db: Session,
    policy_in: VolumeDiscountPolicyCreate,
    current_user: User
) -> VolumeDiscountPolicy:
    """Tạo chính sách chiết khấu kèm các bậc trong 1 Atomic Transaction."""
    # Phân quyền: chỉ SALES_MANAGER và ADMIN
    if current_user.role not in (UserRole.ADMIN.value, UserRole.SALES_MANAGER.value, "Admin", "Sales Manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền khai báo chính sách chiết khấu theo sản lượng. Chỉ Quản lý kinh doanh hoặc Quản trị viên mới được thực hiện."
        )

    code = policy_in.code.strip().upper()
    existing_code = db.query(VolumeDiscountPolicy).filter(VolumeDiscountPolicy.code == code).first()
    if existing_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã chính sách chiết khấu '{code}' đã tồn tại trong hệ thống. Vui lòng sử dụng mã khác."
        )

    _validate_tiers(policy_in.tiers)

    _check_policy_overlap(
        db=db,
        code=code,
        applied_scope=policy_in.applied_scope,
        target_id=policy_in.target_id,
        customer_group=policy_in.customer_group,
        valid_from=policy_in.valid_from,
        valid_to=policy_in.valid_to
    )

    policy = VolumeDiscountPolicy(
        code=code,
        name=policy_in.name.strip(),
        description=policy_in.description,
        applied_scope=policy_in.applied_scope,
        target_id=policy_in.target_id,
        customer_group=policy_in.customer_group or "ALL",
        valid_from=policy_in.valid_from,
        valid_to=policy_in.valid_to,
        is_active=policy_in.is_active,
        created_by_id=current_user.id,
        created_by_name=current_user.full_name or current_user.username
    )
    db.add(policy)
    db.flush()

    for t in policy_in.tiers:
        tier = VolumeDiscountTier(
            policy_id=policy.id,
            min_quantity=t.min_quantity,
            max_quantity=t.max_quantity,
            discount_type=t.discount_type,
            discount_value=t.discount_value
        )
        db.add(tier)

    # Ghi AuditLog
    audit = AuditLog(
        entity_type="DISCOUNT",
        entity_id=str(policy.id),
        entity_name=policy.name,
        action="CREATE",
        new_values={"code": policy.code, "name": policy.name, "scope": policy.applied_scope},
        change_summary=f"Tạo chính sách chiết khấu sản lượng '{policy.name}' ({policy.code})",
        user_id=current_user.id,
        username=current_user.username,
        user_fullname=current_user.full_name,
        user_role=current_user.role,
        reason="Khai báo chính sách chiết khấu mới"
    )
    db.add(audit)

    db.commit()
    db.refresh(policy)
    return policy


def get_all_policies(
    db: Session,
    is_active: Optional[bool] = None,
    applied_scope: Optional[str] = None
) -> List[VolumeDiscountPolicy]:
    query = db.query(VolumeDiscountPolicy)
    if is_active is not None:
        query = query.filter(VolumeDiscountPolicy.is_active == is_active)
    if applied_scope:
        query = query.filter(VolumeDiscountPolicy.applied_scope == applied_scope.upper())
    return query.order_by(VolumeDiscountPolicy.created_at.desc()).all()


def get_policy_by_id(db: Session, policy_id: int) -> VolumeDiscountPolicy:
    policy = db.query(VolumeDiscountPolicy).filter(VolumeDiscountPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chính sách chiết khấu với ID '{policy_id}'."
        )
    return policy


def update_volume_discount_policy(
    db: Session,
    policy_id: int,
    policy_in: VolumeDiscountPolicyUpdate,
    current_user: User
) -> VolumeDiscountPolicy:
    """Cập nhật chính sách chiết khấu và danh sách bậc chiết khấu."""
    if current_user.role not in (UserRole.ADMIN.value, UserRole.SALES_MANAGER.value, "Admin", "Sales Manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền chỉnh sửa chính sách chiết khấu theo sản lượng."
        )

    policy = get_policy_by_id(db, policy_id)

    if policy_in.tiers is not None:
        _validate_tiers(policy_in.tiers)

    scope = policy_in.applied_scope or policy.applied_scope
    target = policy_in.target_id if policy_in.target_id is not None else policy.target_id
    grp = policy_in.customer_group if policy_in.customer_group is not None else policy.customer_group
    v_from = policy_in.valid_from or policy.valid_from
    v_to = policy_in.valid_to if policy_in.valid_to is not None else policy.valid_to

    _check_policy_overlap(
        db=db,
        code=policy.code,
        applied_scope=scope,
        target_id=target,
        customer_group=grp,
        valid_from=v_from,
        valid_to=v_to,
        exclude_policy_id=policy.id
    )

    update_dict = policy_in.model_dump(exclude={"tiers"}, exclude_unset=True)
    for k, v in update_dict.items():
        setattr(policy, k, v)

    if policy_in.tiers is not None:
        # Xóa các bậc cũ và thay thế bằng danh sách bậc mới
        db.query(VolumeDiscountTier).filter(VolumeDiscountTier.policy_id == policy.id).delete()
        for t in policy_in.tiers:
            tier = VolumeDiscountTier(
                policy_id=policy.id,
                min_quantity=t.min_quantity,
                max_quantity=t.max_quantity,
                discount_type=t.discount_type,
                discount_value=t.discount_value
            )
            db.add(tier)

    # Ghi AuditLog
    audit = AuditLog(
        entity_type="DISCOUNT",
        entity_id=str(policy.id),
        entity_name=policy.name,
        action="UPDATE",
        new_values=update_dict,
        change_summary=f"Cập nhật chính sách chiết khấu '{policy.name}'",
        user_id=current_user.id,
        username=current_user.username,
        user_fullname=current_user.full_name,
        user_role=current_user.role,
        reason="Điều chỉnh thông tin chính sách chiết khấu"
    )
    db.add(audit)

    db.commit()
    db.refresh(policy)
    return policy


def delete_volume_discount_policy(
    db: Session,
    policy_id: int,
    current_user: User
) -> bool:
    """
    Xóa chính sách chiết khấu:
    Cấm xóa cứng nếu đã từng được áp dụng vào đơn hàng thật (applied_count > 0 hoặc có OrderItem liên kết).
    """
    if current_user.role not in (UserRole.ADMIN.value, UserRole.SALES_MANAGER.value, "Admin", "Sales Manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xóa chính sách chiết khấu theo sản lượng."
        )

    policy = get_policy_by_id(db, policy_id)

    # 1. Kiểm tra cờ applied_count
    if policy.applied_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chính sách chiết khấu '{policy.name}' đã từng được áp dụng vào {policy.applied_count} giao dịch nên không thể xóa. Bạn chỉ có thể chuyển trạng thái sang ngưng kích hoạt."
        )

    # 2. Kiểm tra trực tiếp bảng order_items
    order_items_count = db.query(OrderItem).filter(OrderItem.applied_discount_policy_id == policy.id).count()
    if order_items_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chính sách chiết khấu '{policy.name}' đã được lưu trong {order_items_count} dòng đơn hàng nên không thể xóa. Bạn chỉ có thể tắt kích hoạt."
        )

    policy_name = policy.name
    policy_code = policy.code
    db.delete(policy)

    audit = AuditLog(
        entity_type="DISCOUNT",
        entity_id=str(policy_id),
        entity_name=policy_name,
        action="DELETE",
        change_summary=f"Xóa chính sách chiết khấu '{policy_name}' ({policy_code})",
        user_id=current_user.id,
        username=current_user.username,
        user_fullname=current_user.full_name,
        user_role=current_user.role,
        reason="Xóa chính sách chiết khấu chưa áp dụng"
    )
    db.add(audit)

    db.commit()
    return True


def calculate_volume_discount(
    db: Session,
    product_id: str,
    quantity: int,
    customer_id: Optional[str] = None,
    current_user: Optional[User] = None
) -> VolumeDiscountCalculateResponse:
    """
    Nghiệp vụ áp dụng chính sách chiết khấu theo sản lượng vào tính giá bán (SCRUM-483).
    Thứ tự ưu tiên:
      1. Phạm vi: PRODUCT > CATEGORY > ALL_PRODUCTS
      2. Nhóm khách hàng: Nhóm cụ thể > ALL
      3. Cùng cấp: valid_from mới nhất
      KHÔNG cộng dồn.
      Chặn giá âm: discount_amount <= đơn giá sản phẩm.
    """
    # 1. Tra cứu thông tin sản phẩm
    prod = None
    str_pid = str(product_id).strip()
    if str_pid.isdigit():
        prod = db.query(Product).filter(Product.id == int(str_pid)).first()
    if not prod:
        prod = db.query(Product).filter(
            or_(Product.id == str_pid, Product.sku == str_pid)
        ).first()
    if not prod:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm với mã '{product_id}'."
        )

    original_unit_price = int(prod.price or 0)

    # 2. Tra cứu nhóm khách hàng của đại lý
    target_customer_group = "RETAIL"
    if customer_id:
        cust = db.query(Customer).filter(
            or_(Customer.id == customer_id, Customer.code == customer_id)
        ).first()
        if cust:
            # Scope check cho Sales Rep
            if current_user and current_user.role == UserRole.SALES_REP.value:
                from app.services.customer_service import check_sales_rep_scope
                check_sales_rep_scope(db, cust.id, current_user)
            target_customer_group = cust.customer_group or "RETAIL"

    now_utc = _normalize_dt(datetime.now(timezone.utc))

    # 3. Tìm các chính sách đang hiệu lực
    active_policies = db.query(VolumeDiscountPolicy).filter(
        VolumeDiscountPolicy.is_active == True,
        VolumeDiscountPolicy.valid_from <= now_utc,
        or_(VolumeDiscountPolicy.valid_to == None, VolumeDiscountPolicy.valid_to >= now_utc)
    ).all()

    # 4. Lọc và tính điểm ưu tiên cho từng chính sách phù hợp
    matched_candidates = []
    prod_cat_id = str(prod.category_id) if prod.category_id else None

    for p in active_policies:
        # Kiểm tra phạm vi sản phẩm
        scope_score = 0
        if p.applied_scope == VolumeDiscountScope.PRODUCT and p.target_id == str(prod.id):
            scope_score = 3
        elif p.applied_scope == VolumeDiscountScope.CATEGORY and prod_cat_id and p.target_id == prod_cat_id:
            scope_score = 2
        elif p.applied_scope == VolumeDiscountScope.ALL_PRODUCTS:
            scope_score = 1
        else:
            continue  # Không khớp sản phẩm này

        # Kiểm tra nhóm khách hàng
        group_score = 0
        if p.customer_group == target_customer_group:
            group_score = 2
        elif p.customer_group == "ALL" or not p.customer_group:
            group_score = 1
        else:
            continue  # Không khớp nhóm khách hàng này

        # 3. Kiểm tra xem chính sách có bậc phù hợp với số lượng (quantity) không
        matching_tier = None
        for tier in p.tiers:
            if tier.min_quantity <= quantity:
                if tier.max_quantity is None or quantity <= tier.max_quantity:
                    matching_tier = tier
                    break
        if not matching_tier:
            continue  # Không đạt số lượng tối thiểu của chính sách này

        priority = (scope_score * 10) + group_score
        matched_candidates.append((priority, _normalize_dt(p.valid_from), p, matching_tier))

    # Nếu không có chính sách nào khớp
    if not matched_candidates:
        return VolumeDiscountCalculateResponse(
            product_id=str(prod.id),
            product_name=prod.name,
            quantity=quantity,
            original_unit_price=original_unit_price,
            discount_rate=Decimal("0.00"),
            discount_amount_per_unit=0,
            total_discount=0,
            final_unit_price=original_unit_price,
            total_amount=original_unit_price * quantity,
            applied_policy_id=None,
            applied_discount_policy_name=None,
            applied_tier_min=None
        )

    # Sắp xếp theo: priority giảm dần, sau đó valid_from giảm dần (mới nhất)
    matched_candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    best_policy = matched_candidates[0][2]
    best_tier = matched_candidates[0][3]

    # 6. Tính số tiền chiết khấu và chặn giá âm
    if best_tier.discount_type == VolumeDiscountType.PERCENT:
        discount_rate = best_tier.discount_value
        discount_amount_per_unit = int(round(Decimal(original_unit_price) * (discount_rate / Decimal("100.0"))))
    else:  # FIXED_AMOUNT
        # FIXED_AMOUNT: discount_amount <= đơn giá (không giá âm)
        raw_disc = int(best_tier.discount_value)
        discount_amount_per_unit = min(original_unit_price, raw_disc)
        discount_rate = Decimal(round((discount_amount_per_unit / original_unit_price) * 100, 2)) if original_unit_price > 0 else Decimal("0.00")

    final_unit_price = max(0, original_unit_price - discount_amount_per_unit)
    total_discount = discount_amount_per_unit * quantity
    total_amount = final_unit_price * quantity

    return VolumeDiscountCalculateResponse(
        product_id=str(prod.id),
        product_name=prod.name,
        quantity=quantity,
        original_unit_price=original_unit_price,
        discount_rate=discount_rate,
        discount_amount_per_unit=discount_amount_per_unit,
        total_discount=total_discount,
        final_unit_price=final_unit_price,
        total_amount=total_amount,
        applied_policy_id=best_policy.id,
        applied_discount_policy_name=best_policy.name,
        applied_tier_min=best_tier.min_quantity
    )
