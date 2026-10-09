import math
import re
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from app.models.price_list import PriceList, PriceListItem
from app.models.auth import User, UserRole
from app.schemas.price_list import (
    PriceListCreate,
    PriceListUpdate,
    PriceListCloneRequest,
    PriceListItemCreate,
    PriceListItemUpdate,
    ConflictingPriceListBrief,
    PriceListOverlapCheckResponse,
)

# Danh sách vai trò có quyền duyệt giá bán thấp hơn giá sàn (SCRUM-418)
APPROVER_ROLES = [
    UserRole.ADMIN.value,
    UserRole.SALES_MANAGER.value,
    "Admin",
    "Sales Manager",
    "SalesManager",
    "Director",
    "DIRECTOR"
]


def normalize_datetime(dt: Optional[datetime]) -> Optional[datetime]:
    """Chuẩn hóa datetime về UTC timezone-aware để tránh lỗi so sánh offset-naive và offset-aware trong SQLite."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def validate_effective_dates(valid_from: datetime, valid_to: Optional[datetime]) -> None:
    """Kiểm tra tính hợp lệ của ngày hiệu lực (SCRUM-417)."""
    norm_from = normalize_datetime(valid_from)
    norm_to = normalize_datetime(valid_to)
    if norm_to and norm_to < norm_from:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ngày kết thúc hiệu lực (valid_to) phải sau hoặc bằng ngày bắt đầu hiệu lực (valid_from)."
        )


def find_overlapping_price_lists(
    db: Session,
    customer_group: str,
    valid_from: datetime,
    valid_to: Optional[datetime],
    exclude_id: Optional[int] = None
) -> List[PriceList]:
    """Tìm danh sách các bảng giá ĐÃ DUYỆT bị chồng lấn thời gian cho cùng nhóm khách hàng (SCRUM-417)."""
    query = db.query(PriceList).filter(
        PriceList.customer_group == customer_group,
        PriceList.status == "APPROVED",
        PriceList.is_active == True
    )
    if exclude_id:
        query = query.filter(PriceList.id != exclude_id)

    approved_lists = query.all()
    conflicts: List[PriceList] = []

    norm_from = normalize_datetime(valid_from)
    norm_to = normalize_datetime(valid_to)

    for pl in approved_lists:
        pl_from = normalize_datetime(pl.valid_from)
        pl_to = normalize_datetime(pl.valid_to)

        # Khoảng A: [norm_from, norm_to]
        # Khoảng B: [pl_from, pl_to]
        overlap_start = True if not pl_to else (norm_from <= pl_to)
        overlap_end = True if not norm_to else (norm_to >= pl_from)

        if overlap_start and overlap_end:
            conflicts.append(pl)

    return conflicts


def check_overlapping_price_lists(
    db: Session,
    customer_group: str,
    valid_from: datetime,
    valid_to: Optional[datetime],
    exclude_id: Optional[int] = None
) -> None:
    """Kiểm tra chống chồng lấn thời gian hiệu lực giữa các bảng giá ĐÃ DUYỆT cho cùng nhóm khách hàng (SCRUM-417)."""
    conflicts = find_overlapping_price_lists(
        db=db,
        customer_group=customer_group,
        valid_from=valid_from,
        valid_to=valid_to,
        exclude_id=exclude_id
    )

    if conflicts:
        pl = conflicts[0]
        pl_to_str = pl.valid_to.strftime("%d/%m/%Y") if pl.valid_to else "Vô thời hạn"
        pl_from_str = pl.valid_from.strftime("%d/%m/%Y")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Khoảng thời gian hiệu lực bị chồng lấn với bảng giá đang áp dụng: "
                f"'{pl.name}' ({pl.code}) có hiệu lực từ {pl_from_str} đến {pl_to_str} "
                f"cho nhóm khách hàng '{customer_group}'."
            )
        )


def check_price_list_overlap_api(
    db: Session,
    customer_group: str,
    valid_from: datetime,
    valid_to: Optional[datetime] = None,
    exclude_id: Optional[int] = None
) -> dict:
    """API kiểm tra trước (Pre-flight check) chống chồng lấn thời gian hiệu lực (SCRUM-417)."""
    validate_effective_dates(valid_from, valid_to)
    conflicts = find_overlapping_price_lists(
        db=db,
        customer_group=customer_group,
        valid_from=valid_from,
        valid_to=valid_to,
        exclude_id=exclude_id
    )

    has_overlap = len(conflicts) > 0
    conflict_briefs = []
    for c in conflicts:
        conflict_briefs.append({
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "version": c.version,
            "customer_group": c.customer_group,
            "status": c.status,
            "valid_from": c.valid_from,
            "valid_to": c.valid_to
        })

    if has_overlap:
        msg = f"Phát hiện {len(conflicts)} bảng giá đang áp dụng bị trùng lấn thời gian hiệu lực trong nhóm '{customer_group}'."
    else:
        msg = f"Khoảng thời gian hiệu lực hợp lệ, không bị chồng lấn với bảng giá nào trong nhóm '{customer_group}'."

    return {
        "has_overlap": has_overlap,
        "customer_group": customer_group,
        "valid_from": valid_from,
        "valid_to": valid_to,
        "message": msg,
        "conflicts": conflict_briefs
    }


def check_if_locked_for_edit(price_list: PriceList, db: Optional[Session] = None) -> None:
    """Kiểm tra nếu bảng giá đã phát sinh đơn hàng thì khóa sửa (SCRUM-416)."""
    # Đồng bộ số lượng đơn hàng thực tế từ bảng orders nếu có session db
    if db is not None:
        try:
            from app.models.order import Order
            actual_orders_count = db.query(Order).filter(Order.price_list_id == price_list.id).count()
            if actual_orders_count > 0:
                if not price_list.has_orders or price_list.orders_count < actual_orders_count:
                    price_list.has_orders = True
                    price_list.orders_count = actual_orders_count
                    db.flush()
        except Exception:
            pass

    if price_list.has_orders or (price_list.orders_count and price_list.orders_count > 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bảng giá '{price_list.code}' đã phát sinh {price_list.orders_count} đơn hàng, "
                f"đã bị khóa sửa đổi để bảo toàn lịch sử dữ liệu. "
                f"Vui lòng sử dụng tính năng 'Tạo phiên bản kế thừa' để cập nhật bảng giá mới."
            )
        )


def get_price_list_lock_status(db: Session, price_list_id: int) -> dict:
    """Kiểm tra chi tiết trạng thái khóa của bảng giá (SCRUM-416)."""
    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    try:
        from app.models.order import Order
        actual_orders = db.query(Order).filter(Order.price_list_id == price_list.id).count()
        if actual_orders > 0 and not price_list.has_orders:
            price_list.has_orders = True
            price_list.orders_count = max(price_list.orders_count, actual_orders)
            db.commit()
    except Exception:
        pass

    is_locked = bool(price_list.has_orders or (price_list.orders_count and price_list.orders_count > 0))
    lock_reason = None
    if is_locked:
        lock_reason = (
            f"Bảng giá đã phát sinh {price_list.orders_count} đơn hàng trong hệ thống. "
            f"Để đảm bảo toàn vẹn dữ liệu kế toán và lịch sử giao dịch, bảng giá này không thể chỉnh sửa hoặc xóa. "
            f"Vui lòng tạo phiên bản kế thừa để áp dụng mức giá mới."
        )

    return {
        "price_list_id": price_list.id,
        "code": price_list.code,
        "name": price_list.name,
        "version": price_list.version,
        "is_locked": is_locked,
        "orders_count": price_list.orders_count,
        "has_orders": price_list.has_orders,
        "can_edit": not is_locked,
        "can_delete": not is_locked,
        "lock_reason": lock_reason
    }


def process_price_items_data(items_in: List[PriceListItemCreate]) -> Tuple[List[PriceListItem], bool]:
    """Xử lý từng dòng giá, kiểm tra giá bán so với giá sàn (SCRUM-415, SCRUM-418).
    Trả về danh sách đối tượng PriceListItem và cờ requires_approval nếu có dòng bán dưới giá sàn.
    """
    processed_items: List[PriceListItem] = []
    has_sub_floor_price = False

    for item_data in items_in:
        # SCRUM-415 & SCRUM-418: So sánh giá bán và giá sàn
        is_below_floor = item_data.sale_price < item_data.floor_price
        if is_below_floor:
            has_sub_floor_price = True

        # Tự tính discount nếu có listed_price > 0
        discount = item_data.discount_percent
        if discount == 0 and item_data.listed_price > 0 and item_data.sale_price < item_data.listed_price:
            discount = round(((item_data.listed_price - item_data.sale_price) / item_data.listed_price) * 100, 2)

        item_status = "PENDING_APPROVAL" if is_below_floor else "DRAFT"

        item_obj = PriceListItem(
            product_id=item_data.product_id,
            product_sku=item_data.product_sku,
            product_name=item_data.product_name,
            unit=item_data.unit,
            listed_price=item_data.listed_price,
            floor_price=item_data.floor_price,
            sale_price=item_data.sale_price,
            discount_percent=discount or 0.0,
            requires_approval=is_below_floor,
            status=item_status,
            note=item_data.note
        )
        processed_items.append(item_obj)

    return processed_items, has_sub_floor_price


def create_price_list(db: Session, data: PriceListCreate, user: Optional[User] = None) -> PriceList:
    """Tạo bảng giá mới kèm chi tiết các dòng sản phẩm (SCRUM-415, SCRUM-419)."""
    # 1. Kiểm tra ngày hiệu lực
    validate_effective_dates(data.valid_from, data.valid_to)

    # 2. Kiểm tra trùng mã code
    existing = db.query(PriceList).filter(PriceList.code == data.code.strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã bảng giá '{data.code}' đã tồn tại trong hệ thống. Vui lòng chọn mã khác."
        )

    # 3. Xử lý các dòng giá chi tiết và kiểm tra giá sàn (SCRUM-415, SCRUM-418)
    processed_items, has_sub_floor = process_price_items_data(data.items)

    # Nếu có sản phẩm bán dưới giá sàn -> Chuyển ngay sang trạng thái PENDING_APPROVAL
    initial_status = "PENDING_APPROVAL" if has_sub_floor else "DRAFT"

    creator_id = user.id if user else None
    creator_name = (user.full_name or user.username) if user else "Hệ thống"

    price_list = PriceList(
        code=data.code.strip(),
        name=data.name.strip(),
        customer_group=data.customer_group.strip(),
        version=1,
        parent_id=None,
        status=initial_status,
        valid_from=data.valid_from,
        valid_to=data.valid_to,
        has_orders=False,
        orders_count=0,
        requires_approval=has_sub_floor,
        created_by_id=creator_id,
        created_by_name=creator_name,
        is_active=data.is_active if data.is_active is not None else True
    )

    db.add(price_list)
    db.flush()  # Sinh ID trước khi gán items

    for item in processed_items:
        item.price_list_id = price_list.id
        db.add(item)

    db.commit()
    db.refresh(price_list)
    return price_list


def update_price_list(db: Session, price_list_id: int, data: PriceListUpdate, user: Optional[User] = None) -> PriceList:
    """Cập nhật bảng giá (Kiểm tra khóa sửa đổi theo SCRUM-416)."""
    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    # SCRUM-416: Bắt buộc khóa sửa khi đã phát sinh đơn hàng
    check_if_locked_for_edit(price_list, db=db)

    # Kiểm tra ngày hiệu lực mới nếu có cập nhật
    new_from = data.valid_from or price_list.valid_from
    new_to = data.valid_to if data.valid_to is not None else price_list.valid_to
    validate_effective_dates(new_from, new_to)

    target_group = data.customer_group.strip() if data.customer_group else price_list.customer_group
    # Nếu bảng giá đang áp dụng (APPROVED), kiểm tra chống chồng lấn thời gian hiệu lực
    if price_list.status == "APPROVED" and (data.valid_from is not None or data.valid_to is not None or data.customer_group is not None):
        check_overlapping_price_lists(
            db=db,
            customer_group=target_group,
            valid_from=new_from,
            valid_to=new_to,
            exclude_id=price_list.id
        )

    if data.name:
        price_list.name = data.name.strip()
    if data.customer_group:
        price_list.customer_group = data.customer_group.strip()
    if data.valid_from:
        price_list.valid_from = data.valid_from
    if data.valid_to is not None:
        price_list.valid_to = data.valid_to
    if data.is_active is not None:
        price_list.is_active = data.is_active

    # Cập nhật danh sách dòng sản phẩm nếu có truyền lên
    if data.items is not None:
        # Xóa các dòng cũ
        db.query(PriceListItem).filter(PriceListItem.price_list_id == price_list_id).delete()
        processed_items, has_sub_floor = process_price_items_data(data.items)
        price_list.requires_approval = has_sub_floor
        if has_sub_floor:
            price_list.status = "PENDING_APPROVAL"
        for it in processed_items:
            it.price_list_id = price_list_id
            db.add(it)

    price_list.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(price_list)
    return price_list


def get_price_list_versions(db: Session, price_list_id: int) -> List[dict]:
    """Lấy danh sách các phiên bản trong chuỗi kế thừa của bảng giá (SCRUM-416)."""
    target = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    # Tìm bảng giá gốc (root)
    root = target
    visited = {root.id}
    while root.parent_id and root.parent_id not in visited:
        visited.add(root.parent_id)
        parent_candidate = db.query(PriceList).filter(PriceList.id == root.parent_id).first()
        if parent_candidate:
            root = parent_candidate
        else:
            break

    # Lấy toàn bộ cây gia phả của root
    family_members = [root.id]
    queue = [root.id]
    while queue:
        curr = queue.pop(0)
        children = db.query(PriceList.id).filter(PriceList.parent_id == curr).all()
        for ch in children:
            if ch[0] not in family_members:
                family_members.append(ch[0])
                queue.append(ch[0])

    # Lấy tất cả bảng giá thuộc family_members hoặc cùng customer_group và tiền tố mã
    base_prefix = re.sub(r'(-V\d+(\.\d+)?)$', '', root.code, flags=re.IGNORECASE)
    all_versions = db.query(PriceList).filter(
        or_(
            PriceList.id.in_(family_members),
            and_(
                PriceList.customer_group == root.customer_group,
                PriceList.code.ilike(f"{base_prefix}%")
            )
        )
    ).order_by(PriceList.version.asc(), PriceList.id.asc()).all()

    # Loại bỏ duplicate nếu có
    seen_ids = set()
    unique_lists = []
    for pl in all_versions:
        if pl.id not in seen_ids:
            seen_ids.add(pl.id)
            unique_lists.append(pl)

    results = []
    for pl in unique_lists:
        results.append({
            "id": pl.id,
            "code": pl.code,
            "name": pl.name,
            "version": pl.version,
            "parent_id": pl.parent_id,
            "customer_group": pl.customer_group,
            "status": pl.status,
            "valid_from": pl.valid_from,
            "valid_to": pl.valid_to,
            "has_orders": pl.has_orders,
            "orders_count": pl.orders_count,
            "is_locked": pl.is_locked,
            "requires_approval": pl.requires_approval,
            "items_count": len(pl.items),
            "created_at": pl.created_at
        })
    return results


def clone_inherited_version(
    db: Session,
    parent_id: int,
    user: Optional[User] = None,
    clone_data: Optional[PriceListCloneRequest] = None
) -> PriceList:
    """Cơ chế tạo phiên bản kế thừa (SCRUM-416):
    - Sao chép toàn bộ cấu trúc và dòng giá từ phiên bản cũ.
    - Tăng số phiên bản (version = max_version + 1).
    - Tạo mã bảng giá mới dạng {parent.code}-V{version} hoặc theo clone_data.new_code.
    - Hỗ trợ tùy chỉnh valid_from, valid_to, hoặc tự động ngắt valid_to của bảng giá cũ.
    - Hỗ trợ tăng/giảm giá bán đồng loạt theo % (price_adjustment_percent).
    - Trạng thái mặc định là DRAFT, has_orders = False (mở khóa hoàn toàn cho chỉnh sửa).
    """
    parent = db.query(PriceList).filter(PriceList.id == parent_id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá gốc để kế thừa.")

    # Ràng buộc trạng thái: Không kế thừa từ bảng giá đang bị từ chối
    if parent.status == "REJECTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể tạo phiên bản kế thừa từ bảng giá '{parent.code}' đang bị từ chối phê duyệt (REJECTED). Vui lòng cập nhật hoặc tạo mới."
        )

    # Tìm version cao nhất trong gia phả
    max_ver = db.query(func.max(PriceList.version)).filter(
        or_(
            PriceList.id == parent_id,
            PriceList.parent_id == parent_id,
            PriceList.parent_id == parent.parent_id
        )
    ).scalar()
    next_version = (max_ver or parent.version) + 1

    # Tạo mã mới
    base_code = re.sub(r'(-V\d+(\.\d+)?)$', '', parent.code, flags=re.IGNORECASE)
    if clone_data and clone_data.new_code and clone_data.new_code.strip():
        new_code = clone_data.new_code.strip()
        if db.query(PriceList).filter(PriceList.code == new_code).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã bảng giá '{new_code}' đã tồn tại trong hệ thống. Vui lòng chọn mã khác."
            )
    else:
        new_code = f"{base_code}-V{next_version}"
        counter = 1
        while db.query(PriceList).filter(PriceList.code == new_code).first():
            new_code = f"{base_code}-V{next_version}.{counter}"
            counter += 1

    # Tạo tên mới
    if clone_data and clone_data.new_name and clone_data.new_name.strip():
        new_name = clone_data.new_name.strip()
    else:
        base_name = re.sub(r'(\s*\(Phiên bản \d+\))+$', '', parent.name)
        new_name = f"{base_name} (Phiên bản {next_version})"

    # Ngày hiệu lực
    if clone_data and clone_data.valid_from:
        new_valid_from = clone_data.valid_from
    else:
        new_valid_from = parent.valid_to or datetime.now(timezone.utc)
    new_valid_to = clone_data.valid_to if (clone_data and clone_data.valid_to) else None
    validate_effective_dates(new_valid_from, new_valid_to)

    # Ràng buộc nghiệp vụ: Ngày bắt đầu hiệu lực phiên bản mới không được trước phiên bản gốc
    norm_new_from = normalize_datetime(new_valid_from)
    norm_parent_from = normalize_datetime(parent.valid_from)
    if norm_new_from < norm_parent_from:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Ngày bắt đầu hiệu lực của phiên bản mới ({new_valid_from.strftime('%d/%m/%Y')}) "
                f"không được trước ngày bắt đầu của phiên bản gốc ({parent.valid_from.strftime('%d/%m/%Y')})."
            )
        )

    # Tùy chọn tự đóng ngày kết thúc của bảng giá cha
    if clone_data and clone_data.auto_close_parent:
        parent.valid_to = new_valid_from
        parent.updated_at = datetime.now(timezone.utc)

    creator_id = user.id if user else None
    creator_name = (user.full_name or user.username) if user else "Hệ thống"

    new_price_list = PriceList(
        code=new_code,
        name=new_name,
        customer_group=parent.customer_group,
        version=next_version,
        parent_id=parent.id,
        status="DRAFT",
        valid_from=new_valid_from,
        valid_to=new_valid_to,
        has_orders=False,
        orders_count=0,
        requires_approval=False,
        created_by_id=creator_id,
        created_by_name=creator_name,
        is_active=True
    )

    db.add(new_price_list)
    db.flush()

    should_copy_items = clone_data.copy_items if clone_data else True
    has_sub_floor = False

    if should_copy_items:
        adj_percent = clone_data.price_adjustment_percent if clone_data else None
        for old_item in parent.items:
            sale_price = old_item.sale_price
            if adj_percent is not None:
                sale_price = round(sale_price * (1.0 + (adj_percent / 100.0)), 2)

            is_below_floor = sale_price < old_item.floor_price
            if is_below_floor:
                has_sub_floor = True

            discount = old_item.discount_percent
            if old_item.listed_price > 0 and sale_price < old_item.listed_price:
                discount = round(((old_item.listed_price - sale_price) / old_item.listed_price) * 100, 2)

            item_status = "PENDING_APPROVAL" if is_below_floor else "DRAFT"

            new_item = PriceListItem(
                price_list_id=new_price_list.id,
                product_id=old_item.product_id,
                product_sku=old_item.product_sku,
                product_name=old_item.product_name,
                unit=old_item.unit,
                listed_price=old_item.listed_price,
                floor_price=old_item.floor_price,
                sale_price=sale_price,
                discount_percent=discount or 0.0,
                requires_approval=is_below_floor,
                status=item_status,
                note=old_item.note
            )
            db.add(new_item)

    new_price_list.requires_approval = has_sub_floor
    if has_sub_floor:
        new_price_list.status = "PENDING_APPROVAL"

    db.commit()
    db.refresh(new_price_list)
    return new_price_list


def is_price_list_approver(user: User) -> bool:
    """Kiểm tra quyền duyệt bảng giá: Hỗ trợ linh hoạt cả trường role và quan hệ roles."""
    if not user:
        return False
    user_role_str = ""
    if hasattr(user, "role") and user.role:
        user_role_str = user.role if isinstance(user.role, str) else getattr(user.role, "value", str(user.role))

    user_roles_list = []
    if hasattr(user, "roles") and user.roles:
        user_roles_list = [r.name.upper() if hasattr(r, "name") else str(r).upper() for r in user.roles]

    allowed_normalized = {
        "ADMIN",
        "SALES_MANAGER",
        "SALES MANAGER",
        "SALESMANAGER",
        "DIRECTOR"
    }

    if user_role_str.strip().upper() in allowed_normalized:
        return True
    if any(r.strip().upper() in allowed_normalized for r in user_roles_list):
        return True
    return False


def approve_price_list(
    db: Session,
    price_list_id: int,
    user: User,
    note: Optional[str] = None,
    auto_resolve_overlap: bool = False
) -> PriceList:
    """Xây dựng luồng duyệt bảng giá (SCRUM-418):
    - Kiểm tra thẩm quyền người duyệt (Sales Manager, Admin, Director).
    - Kiểm tra chống chồng lấn thời gian hiệu lực (SCRUM-417).
    - Hỗ trợ auto_resolve_overlap để tự động ngắt bảng giá cũ bị chồng lấn.
    - Tự động đóng phiên bản cha (parent_id) nếu phiên bản mới được duyệt kế thừa.
    - Cập nhật trạng thái sang APPROVED, ghi nhận người duyệt và thời gian.
    """
    if not is_price_list_approver(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ có Quản lý kinh doanh (Sales Manager), Ban giám đốc hoặc Quản trị viên mới có quyền duyệt bảng giá."
        )

    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    now_utc = datetime.now(timezone.utc)

    # Nếu có auto_resolve_overlap, tự động ngắt/hết hạn các bảng giá cũ cùng nhóm bị chồng lấn
    if auto_resolve_overlap:
        conflicts = find_overlapping_price_lists(
            db=db,
            customer_group=price_list.customer_group,
            valid_from=price_list.valid_from,
            valid_to=price_list.valid_to,
            exclude_id=price_list.id
        )
        for c in conflicts:
            norm_c_from = normalize_datetime(c.valid_from)
            norm_pl_from = normalize_datetime(price_list.valid_from)
            if norm_c_from < norm_pl_from:
                c.valid_to = price_list.valid_from
                c.updated_at = now_utc
            else:
                c.status = "EXPIRED"
                c.is_active = False
                c.updated_at = now_utc
    else:
        # Kiểm tra chống chồng lấn ngày hiệu lực trước khi phê duyệt áp dụng (SCRUM-417)
        check_overlapping_price_lists(
            db=db,
            customer_group=price_list.customer_group,
            valid_from=price_list.valid_from,
            valid_to=price_list.valid_to,
            exclude_id=price_list.id
        )

    # Tự động đóng ngày hiệu lực của phiên bản cha nếu là phiên bản kế thừa
    if price_list.parent_id:
        parent = db.query(PriceList).filter(PriceList.id == price_list.parent_id).first()
        if parent and parent.status == "APPROVED":
            norm_parent_to = normalize_datetime(parent.valid_to)
            norm_pl_from = normalize_datetime(price_list.valid_from)
            if norm_parent_to is None or norm_parent_to > norm_pl_from:
                parent.valid_to = price_list.valid_from
                parent.updated_at = now_utc

    price_list.status = "APPROVED"
    price_list.approved_by_id = user.id
    price_list.approved_by_name = user.full_name or user.username
    price_list.approved_at = now_utc
    price_list.approval_note = note or "Đã phê duyệt áp dụng bảng giá."
    price_list.updated_at = now_utc

    # Đánh dấu toàn bộ các dòng giá con là APPROVED
    for item in price_list.items:
        item.status = "APPROVED"
        item.updated_at = now_utc

    db.commit()
    db.refresh(price_list)
    return price_list


def reject_price_list(db: Session, price_list_id: int, user: User, note: Optional[str] = None) -> PriceList:
    """Từ chối duyệt bảng giá (SCRUM-418)."""
    if not is_price_list_approver(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ có Quản lý kinh doanh (Sales Manager), Ban giám đốc hoặc Quản trị viên mới có quyền từ chối bảng giá."
        )

    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    now_utc = datetime.now(timezone.utc)
    price_list.status = "REJECTED"
    price_list.approved_by_id = user.id
    price_list.approved_by_name = user.full_name or user.username
    price_list.approved_at = now_utc
    price_list.approval_note = note or "Từ chối phê duyệt do không đạt yêu cầu biên lợi nhuận / giá sàn."
    price_list.updated_at = now_utc

    for item in price_list.items:
        item.status = "REJECTED"
        item.updated_at = now_utc

    db.commit()
    db.refresh(price_list)
    return price_list


def lookup_effective_price(
    db: Session,
    customer_group: str,
    product_id: str,
    check_date: Optional[datetime] = None
) -> dict:
    """Tra cứu giá bán hiệu lực tự động cho nhóm khách hàng (SCRUM-419).
    Ví dụ: Đại lý cấp 1 và cấp 2 tự động nhận đúng giá của mình.
    """
    target_date = check_date or datetime.now(timezone.utc)

    # Tìm bảng giá đang APPROVED, is_active=True, khớp customer_group và thời hạn hiệu lực
    query = db.query(PriceList).filter(
        PriceList.customer_group == customer_group,
        PriceList.status == "APPROVED",
        PriceList.is_active == True,
        PriceList.valid_from <= target_date,
        or_(PriceList.valid_to == None, PriceList.valid_to >= target_date)
    ).order_by(PriceList.version.desc())

    active_price_list = query.first()

    if not active_price_list:
        return {
            "found": False,
            "customer_group": customer_group,
            "product_id": product_id,
            "message": f"Không có bảng giá nào đang có hiệu lực cho nhóm khách hàng '{customer_group}'."
        }

    # Tìm sản phẩm trong bảng giá này
    item = db.query(PriceListItem).filter(
        PriceListItem.price_list_id == active_price_list.id,
        PriceListItem.product_id == product_id
    ).first()

    if not item:
        return {
            "found": False,
            "customer_group": customer_group,
            "product_id": product_id,
            "price_list_id": active_price_list.id,
            "price_list_name": active_price_list.name,
            "message": f"Sản phẩm '{product_id}' không có trong bảng giá '{active_price_list.name}'."
        }

    return {
        "found": True,
        "customer_group": customer_group,
        "product_id": product_id,
        "price_list_id": active_price_list.id,
        "price_list_name": active_price_list.name,
        "price_list_code": active_price_list.code,
        "version": active_price_list.version,
        "sale_price": item.sale_price,
        "floor_price": item.floor_price,
        "listed_price": item.listed_price,
        "discount_percent": item.discount_percent,
        "status": item.status,
        "message": f"Áp dụng thành công giá cho nhóm '{customer_group}'."
    }


GROUP_LABELS = {
    "TIER_1": "Đại lý Cấp 1",
    "TIER_2": "Đại lý Cấp 2",
    "RETAIL": "Khách Bán Lẻ",
    "VIP": "Khách Hàng VIP",
    "WHOLESALE": "Bán Buôn / Phân Phối"
}


def get_active_price_list_by_group(
    db: Session,
    customer_group: str,
    check_date: Optional[datetime] = None
) -> PriceList:
    """Lấy chi tiết bảng giá đang có hiệu lực tại thời điểm chỉ định của một nhóm khách hàng (SCRUM-417, SCRUM-419)."""
    target_date = check_date or datetime.now(timezone.utc)
    norm_target = normalize_datetime(target_date)

    query = db.query(PriceList).filter(
        PriceList.customer_group == customer_group.strip(),
        PriceList.status == "APPROVED",
        PriceList.is_active == True,
        PriceList.valid_from <= norm_target,
        or_(PriceList.valid_to == None, PriceList.valid_to >= norm_target)
    ).order_by(PriceList.version.desc())

    active_pl = query.first()
    if not active_pl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy bảng giá nào đang có hiệu lực cho nhóm khách hàng '{customer_group}' tại thời điểm đã chọn."
        )
    return active_pl


def get_customer_groups_summary(db: Session) -> dict:
    """Tổng quan quản lý bảng giá cho tất cả các nhóm khách hàng trong hệ thống (SCRUM-417, SCRUM-419)."""
    now_utc = datetime.now(timezone.utc)

    # Lấy các nhóm khách hàng hiện có từ database kết hợp các nhóm chuẩn
    existing_groups = [g[0] for g in db.query(PriceList.customer_group).distinct().all() if g[0]]
    all_groups = list(dict.fromkeys(list(GROUP_LABELS.keys()) + existing_groups))

    items = []
    for grp in all_groups:
        label = GROUP_LABELS.get(grp, f"Nhóm {grp}")

        total_lists = db.query(PriceList).filter(PriceList.customer_group == grp).count()
        pending_count = db.query(PriceList).filter(
            PriceList.customer_group == grp,
            PriceList.status == "PENDING_APPROVAL"
        ).count()
        draft_count = db.query(PriceList).filter(
            PriceList.customer_group == grp,
            PriceList.status == "DRAFT"
        ).count()

        active_pl = db.query(PriceList).filter(
            PriceList.customer_group == grp,
            PriceList.status == "APPROVED",
            PriceList.is_active == True,
            PriceList.valid_from <= now_utc,
            or_(PriceList.valid_to == None, PriceList.valid_to >= now_utc)
        ).order_by(PriceList.version.desc()).first()

        expired_count = db.query(PriceList).filter(
            PriceList.customer_group == grp,
            PriceList.valid_to != None,
            PriceList.valid_to < now_utc
        ).count()

        active_brief = None
        if active_pl:
            active_brief = {
                "id": active_pl.id,
                "code": active_pl.code,
                "name": active_pl.name,
                "version": active_pl.version,
                "valid_from": active_pl.valid_from,
                "valid_to": active_pl.valid_to,
                "items_count": len(active_pl.items),
                "requires_approval": active_pl.requires_approval
            }

        items.append({
            "customer_group": grp,
            "group_label": label,
            "has_active_price_list": active_pl is not None,
            "active_price_list": active_brief,
            "total_price_lists": total_lists,
            "pending_approval_count": pending_count,
            "expired_count": expired_count,
            "draft_count": draft_count
        })

    return {
        "items": items,
        "total_groups": len(items)
    }


def bulk_lookup_prices(
    db: Session,
    customer_group: str,
    product_ids: List[str],
    check_date: Optional[datetime] = None
) -> dict:
    """Tra cứu giá bán hiệu lực hàng loạt cho danh sách sản phẩm theo nhóm khách hàng (SCRUM-419)."""
    target_date = check_date or datetime.now(timezone.utc)
    norm_target = normalize_datetime(target_date)

    active_pl = db.query(PriceList).filter(
        PriceList.customer_group == customer_group.strip(),
        PriceList.status == "APPROVED",
        PriceList.is_active == True,
        PriceList.valid_from <= norm_target,
        or_(PriceList.valid_to == None, PriceList.valid_to >= norm_target)
    ).order_by(PriceList.version.desc()).first()

    clean_ids = [pid.strip() for pid in product_ids if pid and pid.strip()]

    if not active_pl:
        empty_results = [
            {
                "product_id": pid,
                "product_sku": None,
                "product_name": None,
                "unit": "Chiếc",
                "found": False,
                "listed_price": None,
                "floor_price": None,
                "sale_price": None,
                "discount_percent": None,
                "note": f"Không có bảng giá nào đang có hiệu lực cho nhóm '{customer_group}'."
            }
            for pid in clean_ids
        ]
        return {
            "customer_group": customer_group,
            "price_list_id": None,
            "price_list_code": None,
            "price_list_name": None,
            "version": None,
            "valid_from": None,
            "valid_to": None,
            "message": f"Không tìm thấy bảng giá nào đang áp dụng cho nhóm khách hàng '{customer_group}'.",
            "items": empty_results
        }

    items_in_pl = db.query(PriceListItem).filter(
        PriceListItem.price_list_id == active_pl.id,
        PriceListItem.product_id.in_(clean_ids)
    ).all()

    item_map = {item.product_id: item for item in items_in_pl}
    results = []
    for pid in clean_ids:
        it = item_map.get(pid)
        if it:
            results.append({
                "product_id": it.product_id,
                "product_sku": it.product_sku,
                "product_name": it.product_name,
                "unit": it.unit,
                "found": True,
                "listed_price": it.listed_price,
                "floor_price": it.floor_price,
                "sale_price": it.sale_price,
                "discount_percent": it.discount_percent,
                "note": it.note
            })
        else:
            results.append({
                "product_id": pid,
                "product_sku": None,
                "product_name": None,
                "unit": "Chiếc",
                "found": False,
                "listed_price": None,
                "floor_price": None,
                "sale_price": None,
                "discount_percent": None,
                "note": f"Sản phẩm '{pid}' không nằm trong bảng giá '{active_pl.code}'."
            })

    found_count = sum(1 for r in results if r["found"])
    return {
        "customer_group": customer_group,
        "price_list_id": active_pl.id,
        "price_list_code": active_pl.code,
        "price_list_name": active_pl.name,
        "version": active_pl.version,
        "valid_from": active_pl.valid_from,
        "valid_to": active_pl.valid_to,
        "message": f"Đã tra cứu thành công {found_count}/{len(clean_ids)} sản phẩm từ bảng giá '{active_pl.code}'.",
        "items": results
    }


def get_price_list_items(
    db: Session,
    price_list_id: int,
    status_filter: Optional[str] = None,
    requires_approval: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[PriceListItem], int, int]:
    """Lấy danh sách các dòng giá của một bảng giá cụ thể có bộ lọc và phân trang (SCRUM-415)."""
    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    query = db.query(PriceListItem).filter(PriceListItem.price_list_id == price_list_id)

    if status_filter:
        query = query.filter(PriceListItem.status == status_filter.strip().upper())
    if requires_approval is not None:
        query = query.filter(PriceListItem.requires_approval == requires_approval)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(or_(
            PriceListItem.product_name.ilike(s),
            PriceListItem.product_sku.ilike(s),
            PriceListItem.product_id.ilike(s)
        ))

    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 1
    offset = (page - 1) * page_size
    items = query.order_by(PriceListItem.id.asc()).offset(offset).limit(page_size).all()
    return items, total, total_pages


def get_price_list_item_by_id(db: Session, price_list_id: int, item_id: int) -> PriceListItem:
    """Lấy chi tiết một dòng giá trong bảng giá (SCRUM-415)."""
    item = db.query(PriceListItem).filter(
        PriceListItem.id == item_id,
        PriceListItem.price_list_id == price_list_id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy dòng giá sản phẩm.")
    return item


def add_price_list_item(
    db: Session,
    price_list_id: int,
    data: PriceListItemCreate,
    user: Optional[User] = None
) -> PriceListItem:
    """Thêm một dòng giá mới vào bảng giá (SCRUM-415, SCRUM-418):
    - Kiểm tra bảng giá không bị khóa sửa (chưa phát sinh đơn).
    - Kiểm tra chống trùng sản phẩm trong cùng một bảng giá.
    - So sánh giá bán và giá sàn -> Tự động gắn requires_approval và cập nhật bảng giá cha.
    """
    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    # Kiểm tra khóa sửa đổi
    check_if_locked_for_edit(price_list, db=db)

    # Chống trùng sản phẩm trong cùng một bảng giá
    existing = db.query(PriceListItem).filter(
        PriceListItem.price_list_id == price_list_id,
        PriceListItem.product_id == data.product_id.strip()
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sản phẩm '{data.product_name}' ({data.product_id}) đã có trong bảng giá này. Vui lòng cập nhật dòng giá thay vì thêm mới."
        )

    # So sánh giá bán và giá sàn (SCRUM-415 & SCRUM-418)
    is_below_floor = data.sale_price < data.floor_price
    discount = data.discount_percent
    if (not discount or discount == 0) and data.listed_price > 0 and data.sale_price < data.listed_price:
        discount = round(((data.listed_price - data.sale_price) / data.listed_price) * 100, 2)

    item_status = "PENDING_APPROVAL" if is_below_floor else "DRAFT"

    new_item = PriceListItem(
        price_list_id=price_list_id,
        product_id=data.product_id.strip(),
        product_sku=data.product_sku.strip() if data.product_sku else None,
        product_name=data.product_name.strip(),
        unit=data.unit.strip() if data.unit else "Chiếc",
        listed_price=data.listed_price,
        floor_price=data.floor_price,
        sale_price=data.sale_price,
        discount_percent=discount or 0.0,
        requires_approval=is_below_floor,
        status=item_status,
        note=data.note
    )
    db.add(new_item)

    # Nếu dòng giá dưới sàn -> Kích hoạt duyệt cho toàn bảng giá
    if is_below_floor:
        price_list.requires_approval = True
        if price_list.status == "APPROVED":
            price_list.status = "PENDING_APPROVAL"

    price_list.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(new_item)
    return new_item


def update_price_list_item(
    db: Session,
    price_list_id: int,
    item_id: int,
    data: PriceListItemUpdate,
    user: Optional[User] = None
) -> PriceListItem:
    """Cập nhật thông tin dòng giá: giá bán, giá sàn, giá niêm yết (SCRUM-415, SCRUM-418).
    - Tự động đánh giá lại trạng thái duyệt theo giá sàn mới.
    - Cập nhật cờ requires_approval cho bảng giá cha.
    """
    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    check_if_locked_for_edit(price_list, db=db)

    item = db.query(PriceListItem).filter(
        PriceListItem.id == item_id,
        PriceListItem.price_list_id == price_list_id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy dòng giá sản phẩm.")

    if data.product_name:
        item.product_name = data.product_name.strip()
    if data.product_sku is not None:
        item.product_sku = data.product_sku.strip() if data.product_sku else None
    if data.unit:
        item.unit = data.unit.strip()
    if data.listed_price is not None:
        item.listed_price = data.listed_price
    if data.floor_price is not None:
        item.floor_price = data.floor_price
    if data.sale_price is not None:
        new_sale = data.sale_price
        if int(item.sale_price) != int(new_sale):
            from app.services.price_history_service import record_price_change
            from app.models.product_price_history import PriceTypeEnum
            reason = getattr(data, "reason", None) or getattr(data, "note", None) or f"Cập nhật giá bán theo bảng giá '{price_list.name}'"
            record_price_change(
                db=db,
                product_id=str(item.product_id),
                product_sku=item.product_sku,
                product_name=item.product_name,
                price_type=PriceTypeEnum.SALE_PRICE,
                old_price=int(item.sale_price),
                new_price=int(new_sale),
                reason=reason,
                effective_from=price_list.valid_from or datetime.now(timezone.utc),
                changed_by=current_user,
                price_list_id=price_list.id,
                price_list_name=price_list.name,
                customer_group=price_list.customer_group
            )
        item.sale_price = new_sale
    if data.note is not None:
        item.note = data.note

    # Tự động tính lại discount nếu có
    if data.discount_percent is not None:
        item.discount_percent = data.discount_percent
    elif item.listed_price > 0 and item.sale_price < item.listed_price:
        item.discount_percent = round(((item.listed_price - item.sale_price) / item.listed_price) * 100, 2)

    # Đánh giá lại giá bán so với giá sàn
    is_below_floor = item.sale_price < item.floor_price
    item.requires_approval = is_below_floor
    if is_below_floor:
        item.status = "PENDING_APPROVAL"
    elif item.status == "PENDING_APPROVAL":
        item.status = "DRAFT"

    # Kiểm tra xem toàn bộ bảng giá có còn dòng nào dưới sàn không
    db.flush()
    has_any_sub_floor = db.query(PriceListItem).filter(
        PriceListItem.price_list_id == price_list_id,
        PriceListItem.requires_approval == True
    ).count() > 0

    price_list.requires_approval = has_any_sub_floor
    if has_any_sub_floor and price_list.status == "APPROVED":
        price_list.status = "PENDING_APPROVAL"

    now_utc = datetime.now(timezone.utc)
    item.updated_at = now_utc
    price_list.updated_at = now_utc
    db.commit()
    db.refresh(item)
    return item


def delete_price_list_item(
    db: Session,
    price_list_id: int,
    item_id: int,
    user: Optional[User] = None
) -> dict:
    """Xóa một dòng giá khỏi bảng giá (SCRUM-415):
    - Khóa không cho xóa nếu bảng giá đã phát sinh đơn.
    - Cập nhật lại cờ requires_approval cho bảng giá cha nếu dòng bị xóa là dòng duy nhất dưới sàn.
    """
    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    check_if_locked_for_edit(price_list, db=db)

    item = db.query(PriceListItem).filter(
        PriceListItem.id == item_id,
        PriceListItem.price_list_id == price_list_id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy dòng giá sản phẩm.")

    db.delete(item)
    db.flush()

    # Cập nhật lại cờ requires_approval cho bảng giá cha
    has_any_sub_floor = db.query(PriceListItem).filter(
        PriceListItem.price_list_id == price_list_id,
        PriceListItem.requires_approval == True
    ).count() > 0

    price_list.requires_approval = has_any_sub_floor
    price_list.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"detail": "Đã xóa dòng giá sản phẩm thành công."}


def approve_price_list_item(
    db: Session,
    price_list_id: int,
    item_id: int,
    user: User,
    approved: bool,
    note: Optional[str] = None
) -> PriceListItem:
    """Phê duyệt hoặc từ chối riêng lẻ một dòng giá bán dưới sàn (SCRUM-418):
    - Kiểm tra thẩm quyền người duyệt.
    - Cập nhật trạng thái dòng giá sang APPROVED hoặc REJECTED.
    """
    if not is_price_list_approver(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ có Quản lý kinh doanh (Sales Manager), Ban giám đốc hoặc Quản trị viên mới có quyền duyệt dòng giá."
        )

    price_list = db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    item = db.query(PriceListItem).filter(
        PriceListItem.id == item_id,
        PriceListItem.price_list_id == price_list_id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy dòng giá sản phẩm.")

    now_utc = datetime.now(timezone.utc)
    item.status = "APPROVED" if approved else "REJECTED"
    item.approved_by_id = user.id
    item.approved_by_name = user.full_name or user.username
    item.approved_at = now_utc
    item.approval_note = note or ("Đã phê duyệt dòng giá bán dưới sàn." if approved else "Từ chối dòng giá dưới sàn.")
    item.updated_at = now_utc

    db.commit()
    db.refresh(item)
    return item
