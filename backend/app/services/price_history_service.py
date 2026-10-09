import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from fastapi import HTTPException, status

from app.models.product_price_history import ProductPriceHistory, PriceTypeEnum
from app.models.product import Product
from app.models.price_list import PriceList, PriceListItem
from app.models.auth import User, UserRole
from app.models.audit_log import AuditLog
from app.schemas.product_price_history import (
    ProductPriceHistoryResponse,
    ProductPriceHistoryListResponse,
)


def record_price_change(
    db: Session,
    product_id: str,
    product_sku: Optional[str],
    product_name: str,
    price_type: str,
    old_price: int,
    new_price: int,
    reason: str,
    effective_from: datetime,
    changed_by: Optional[User] = None,
    price_list_id: Optional[int] = None,
    price_list_name: Optional[str] = None,
    customer_group: Optional[str] = None,
    batch_id: Optional[str] = None
) -> Optional[ProductPriceHistory]:
    """
    Ghi nhận lịch sử thay đổi giá bất biến (Append-Only) trong CÙNG TRANSACTION với lệnh đổi giá.
    Quy tắc:
    - Bắt buộc có lý do thay đổi giá (reason).
    - CHỈ ghi khi old_price != new_price.
    - Tiền VND nguyên đồng, % làm tròn 2 chữ số thập phân.
    - Dùng flush(), không commit() độc lập để đảm bảo tính nguyên tử (Atomic).
    """
    # 1. Bắt buộc lý do thay đổi giá
    if not reason or not str(reason).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lý do thay đổi giá là bắt buộc để giải thích minh bạch với đại lý."
        )

    int_old = int(old_price)
    int_new = int(new_price)

    # 2. CHỈ ghi khi giá thực sự thay đổi
    if int_old == int_new:
        return None

    change_diff = int_new - int_old
    if int_old > 0:
        change_percent = Decimal(round((Decimal(change_diff) / Decimal(int_old)) * Decimal("100.0"), 2))
    else:
        change_percent = Decimal("100.00") if int_new > 0 else Decimal("0.00")

    changed_by_id = changed_by.id if changed_by else None
    changed_by_name = (changed_by.full_name or changed_by.username) if changed_by else "Hệ thống"
    changed_by_role = changed_by.role if changed_by else "System"

    history = ProductPriceHistory(
        batch_id=batch_id,
        product_id=str(product_id),
        product_sku=product_sku,
        product_name=product_name,
        price_list_id=price_list_id,
        price_list_name=price_list_name,
        customer_group=customer_group,
        price_type=price_type,
        old_price=int_old,
        new_price=int_new,
        change_diff=change_diff,
        change_percent=change_percent,
        reason=reason.strip(),
        effective_from=effective_from,
        changed_by_id=changed_by_id,
        changed_by_name=changed_by_name,
        changed_by_role=changed_by_role,
        created_at=datetime.now(timezone.utc)
    )
    db.add(history)
    db.flush()

    # Ghi AuditLog
    if changed_by:
        audit = AuditLog(
            entity_type="PRICE",
            entity_id=str(product_id),
            entity_name=product_name,
            action="UPDATE_PRICE",
            old_values={"price": int_old, "type": price_type},
            new_values={"price": int_new, "type": price_type},
            change_summary=f"Đổi {price_type} của '{product_name}': {int_old:,} đ -> {int_new:,} đ",
            user_id=changed_by.id,
            username=changed_by.username,
            user_fullname=changed_by.full_name,
            user_role=changed_by.role,
            reason=reason.strip()
        )
        db.add(audit)
        db.flush()

    return history


def ensure_price_history_baseline(db: Session):
    """
    Tạo bản ghi khởi tạo (Baseline) cho các sản phẩm hiện có chưa có lịch sử giá.
    Đảm bảo tính Idempotent: chạy nhiều lần không tạo trùng lặp.
    """
    products = db.query(Product).all()
    created_any = False

    for prod in products:
        has_history = db.query(ProductPriceHistory).filter(
            ProductPriceHistory.product_id == str(prod.id),
            ProductPriceHistory.price_type == PriceTypeEnum.LISTED_PRICE
        ).first()

        if not has_history and prod.price is not None:
            price_val = int(prod.price)
            eff_date = prod.created_at if prod.created_at else datetime.now(timezone.utc)
            if eff_date.tzinfo is None:
                eff_date = eff_date.replace(tzinfo=timezone.utc)

            base_rec = ProductPriceHistory(
                batch_id="BASELINE-INIT",
                product_id=str(prod.id),
                product_sku=prod.sku,
                product_name=prod.name,
                price_type=PriceTypeEnum.LISTED_PRICE,
                old_price=price_val,
                new_price=price_val,
                change_diff=0,
                change_percent=Decimal("0.00"),
                reason="Giá khởi tạo hệ thống ban đầu (Baseline)",
                effective_from=eff_date,
                changed_by_id=None,
                changed_by_name="Hệ thống",
                changed_by_role="System",
                created_at=eff_date
            )
            db.add(base_rec)
            created_any = True

    # Baseline cho các bảng giá đã có
    price_items = db.query(PriceListItem).all()
    for item in price_items:
        pl = item.price_list
        has_pl_hist = db.query(ProductPriceHistory).filter(
            ProductPriceHistory.product_id == str(item.product_id),
            ProductPriceHistory.price_list_id == item.price_list_id,
            ProductPriceHistory.price_type == PriceTypeEnum.SALE_PRICE
        ).first()

        if not has_pl_hist:
            sale_val = int(item.sale_price)
            eff_date = pl.valid_from if pl and pl.valid_from else datetime.now(timezone.utc)
            if eff_date.tzinfo is None:
                eff_date = eff_date.replace(tzinfo=timezone.utc)

            base_pl_rec = ProductPriceHistory(
                batch_id="BASELINE-PRICELIST-INIT",
                product_id=str(item.product_id),
                product_sku=item.product_sku,
                product_name=item.product_name,
                price_list_id=item.price_list_id,
                price_list_name=pl.name if pl else None,
                customer_group=pl.customer_group if pl else None,
                price_type=PriceTypeEnum.SALE_PRICE,
                old_price=sale_val,
                new_price=sale_val,
                change_diff=0,
                change_percent=Decimal("0.00"),
                reason="Giá khởi tạo theo Bảng giá phân phối (Baseline)",
                effective_from=eff_date,
                changed_by_id=None,
                changed_by_name="Hệ thống",
                changed_by_role="System",
                created_at=eff_date
            )
            db.add(base_pl_rec)
            created_any = True

    if created_any:
        db.commit()


def get_product_price_history(
    db: Session,
    product_id: str,
    customer_group: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    page: int = 1,
    limit: int = 20,
    current_user: Optional[User] = None
) -> ProductPriceHistoryListResponse:
    """
    Tra cứu lịch sử thay đổi giá theo sản phẩm hiệu năng cao kèm phân trang (SCRUM-424, SCRUM-428).
    Phân quyền: ADMIN, SALES_MANAGER, SALES_REP, ACCOUNTANT.
    """
    # 1. Kiểm tra quyền truy cập (SCRUM-425)
    allowed_roles = (
        UserRole.ADMIN.value,
        UserRole.SALES_MANAGER.value,
        UserRole.SALES_REP.value,
        UserRole.ACCOUNTANT.value,
        "Admin",
        "Sales Manager",
        "Sales Rep",
        "Accountant"
    )
    if not current_user or current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem lịch sử thay đổi giá sản phẩm."
        )

    # 2. Kiểm tra tồn tại sản phẩm
    prod = None
    str_pid = str(product_id).strip()
    if str_pid.isdigit():
        prod = db.query(Product).filter(Product.id == int(str_pid)).first()
    if not prod:
        prod = db.query(Product).filter(Product.sku == str_pid).first()
    if not prod:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm với mã '{product_id}'."
        )

    ensure_price_history_baseline(db)

    # 3. Query lịch sử giá theo index (product_id, created_at)
    query = db.query(ProductPriceHistory).filter(
        or_(
            ProductPriceHistory.product_id == str(prod.id),
            ProductPriceHistory.product_sku == prod.sku
        )
    )

    if customer_group and customer_group.upper() != "ALL":
        query = query.filter(
            or_(
                ProductPriceHistory.customer_group == customer_group.upper(),
                ProductPriceHistory.customer_group == None
            )
        )

    if from_date:
        query = query.filter(ProductPriceHistory.effective_from >= from_date)
    if to_date:
        query = query.filter(ProductPriceHistory.effective_from <= to_date)

    total = query.count()
    offset = (page - 1) * limit
    items = query.order_by(ProductPriceHistory.created_at.desc(), ProductPriceHistory.id.desc()).offset(offset).limit(limit).all()

    total_pages = (total + limit - 1) // limit if limit > 0 else 1

    return ProductPriceHistoryListResponse(
        items=[ProductPriceHistoryResponse.model_validate(it) for it in items],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )
