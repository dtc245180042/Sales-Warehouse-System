import math
from typing import Optional, Dict, Any, Tuple, List
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from fastapi import HTTPException, status

from app.models.audit_log import AuditLog
from app.models.customer_debt_profile import CustomerDebtProfile
from app.models.product_stock_profile import ProductStockProfile
from app.models.product import Product
from app.models.customer import Customer
from app.models.order import Order
from app.models.inventory import InventoryHistory


def log_activity(
    db: Session,
    entity_type: str,
    entity_id: str,
    action: str,
    old_values: Optional[Dict[str, Any]] = None,
    new_values: Optional[Dict[str, Any]] = None,
    entity_name: Optional[str] = None,
    change_summary: Optional[str] = None,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    user_fullname: Optional[str] = None,
    user_role: Optional[str] = None,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    """Hàm lõi ghi nhận sự kiện vào sổ nhật ký kiểm toán hệ thống."""
    if not change_summary:
        change_summary = f"{action} trên {entity_type} [{entity_id}]"

    log_entry = AuditLog(
        entity_type=entity_type.upper(),
        entity_id=str(entity_id),
        entity_name=entity_name,
        action=action.upper(),
        old_values=old_values,
        new_values=new_values,
        change_summary=change_summary,
        user_id=user_id,
        username=username,
        user_fullname=user_fullname,
        user_role=user_role,
        reason=reason,
        ip_address=ip_address,
        created_at=datetime.now(timezone.utc),
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry


def get_audit_logs(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    entity_type: Optional[str] = None,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    action: Optional[str] = None,
    entity_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
) -> Tuple[List[AuditLog], int, int]:
    """
    Truy vấn danh sách nhật ký thao tác có hỗ trợ bộ lọc đa năng và phân trang.
    Trả về: (items, total_count, total_pages)
    """
    query = db.query(AuditLog)

    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type.upper().strip())

    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)

    if username:
        query = query.filter(AuditLog.username.ilike(f"%{username.strip()}%"))

    if action:
        query = query.filter(AuditLog.action == action.upper().strip())

    if entity_id:
        query = query.filter(AuditLog.entity_id.ilike(f"%{entity_id.strip()}%"))

    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)

    if end_date:
        query = query.filter(AuditLog.created_at <= end_date)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AuditLog.entity_name.ilike(search_pattern),
                AuditLog.change_summary.ilike(search_pattern),
                AuditLog.reason.ilike(search_pattern),
                AuditLog.username.ilike(search_pattern),
                AuditLog.entity_id.ilike(search_pattern),
            )
        )

    total_count = query.count()
    total_pages = max(1, math.ceil(total_count / page_size)) if page_size > 0 else 1

    items = (
        query.order_by(desc(AuditLog.created_at), desc(AuditLog.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return items, total_count, total_pages


def get_audit_log_by_id(db: Session, log_id: int) -> Optional[AuditLog]:
    """Lấy chi tiết một bản ghi nhật ký."""
    return db.query(AuditLog).filter(AuditLog.id == log_id).first()


def adjust_inventory_stock(
    db: Session,
    product_id: str,
    actual_stock: int,
    reason: str,
    warehouse: str = "Kho Tổng Hà Nội",
    user_id: Optional[int] = None,
    username: Optional[str] = "admin",
    user_fullname: Optional[str] = "Quản trị hệ thống",
    user_role: Optional[str] = "Admin",
    ip_address: Optional[str] = None,
) -> Tuple[Product, AuditLog]:
    """
    Xử lý nghiệp vụ điều chỉnh tồn kho khi phát hiện kiểm kê bị lệch cuối tháng.
    Cập nhật tồn kho sản phẩm (qua ProductStockProfile), tạo thẻ kho điều chỉnh và tự động ghi vết Audit Log.
    """
    product = None
    str_pid = str(product_id).strip()
    if str_pid.isdigit():
        product = db.query(Product).filter(Product.id == int(str_pid)).first()
    if not product:
        product = db.query(Product).filter(Product.sku == str_pid).first()

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm có mã '{product_id}'.",
        )

    stock_profile = db.query(ProductStockProfile).filter(
        ProductStockProfile.product_id == product.id
    ).first()

    if not stock_profile:
        old_stock = 0
        stock_profile = ProductStockProfile(
            product_id=product.id,
            sku=product.sku,
            stock=actual_stock,
            min_stock=0,
            warehouse=warehouse,
        )
        db.add(stock_profile)
    else:
        old_stock = stock_profile.stock
        stock_profile.stock = actual_stock
        stock_profile.warehouse = warehouse

    delta = actual_stock - old_stock
    now = datetime.now(timezone.utc)

    # Ghi nhận vào thẻ kho (InventoryHistory)
    hist_id = f"HIST-ADJ-{int(now.timestamp() * 1000)}-{product.id}"
    history_entry = InventoryHistory(
        id=hist_id,
        code=f"PKK-{now.strftime('%Y%m%d%H%M%S')}",
        type="adjustment",
        product_id=str(product.id),
        product_name=product.name,
        sku=product.sku,
        quantity=delta,
        balance_after=actual_stock,
        warehouse=warehouse,
        performer=user_fullname or username,
        note=f"Kiểm kê kho: {reason}",
        created_at=now,
    )
    db.add(history_entry)

    # Tạo tóm tắt thay đổi chuẩn hóa
    delta_str = f"+{delta}" if delta > 0 else str(delta)
    summary = (
        f"Điều chỉnh tồn kho sản phẩm [{product.sku} - {product.name}] "
        f"từ {old_stock} sang {actual_stock} ({delta_str}) do: {reason}"
    )

    # Tự động ghi nhật ký Audit Log
    audit_entry = log_activity(
        db=db,
        entity_type="INVENTORY",
        entity_id=str(product.id),
        entity_name=f"{product.name} ({product.sku})",
        action="ADJUST_STOCK",
        old_values={"stock": old_stock, "warehouse": warehouse},
        new_values={"stock": actual_stock, "delta": delta, "warehouse": warehouse},
        change_summary=summary,
        user_id=user_id,
        username=username,
        user_fullname=user_fullname,
        user_role=user_role,
        reason=reason,
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(stock_profile)
    return product, audit_entry


def adjust_customer_debt_limit(
    db: Session,
    customer_id: str,
    new_credit_limit: float,
    reason: str,
    user_id: Optional[int] = None,
    username: Optional[str] = "admin",
    user_fullname: Optional[str] = "Quản trị hệ thống",
    user_role: Optional[str] = "Admin",
    ip_address: Optional[str] = None,
) -> Tuple[CustomerDebtProfile, AuditLog]:
    """
    Xử lý nghiệp vụ điều chỉnh hạn mức công nợ khách hàng/đại lý.
    Cập nhật Profile công nợ và tự động ghi vết Audit Log.
    """
    customer = db.query(Customer).filter(
        or_(Customer.id == str(customer_id), Customer.code == str(customer_id))
    ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khách hàng có mã '{customer_id}'.",
        )

    debt_profile = db.query(CustomerDebtProfile).filter(
        CustomerDebtProfile.customer_id == customer.id
    ).first()

    old_limit = 0.0
    current_debt = 0.0

    if not debt_profile:
        debt_profile = CustomerDebtProfile(
            customer_id=customer.id,
            credit_limit=new_credit_limit,
            current_debt=0.0,
            notes=reason,
            updated_by=username,
        )
        db.add(debt_profile)
    else:
        old_limit = debt_profile.credit_limit
        current_debt = debt_profile.current_debt
        debt_profile.credit_limit = new_credit_limit
        debt_profile.notes = reason
        debt_profile.updated_by = username

    summary = (
        f"Điều chỉnh hạn mức công nợ khách hàng [{customer.code} - {customer.name}] "
        f"từ {old_limit:,.0f}đ lên {new_credit_limit:,.0f}đ do: {reason}"
    )

    audit_entry = log_activity(
        db=db,
        entity_type="DEBT",
        entity_id=customer.id,
        entity_name=f"{customer.name} ({customer.code})",
        action="ADJUST_DEBT_LIMIT",
        old_values={"credit_limit": old_limit, "current_debt": current_debt},
        new_values={"credit_limit": new_credit_limit, "current_debt": current_debt},
        change_summary=summary,
        user_id=user_id,
        username=username,
        user_fullname=user_fullname,
        user_role=user_role,
        reason=reason,
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(debt_profile)
    return debt_profile, audit_entry


def adjust_price(
    db: Session,
    entity_id: str,
    entity_name: Optional[str],
    old_price: float,
    new_price: float,
    reason: str,
    user_id: Optional[int] = None,
    username: Optional[str] = "admin",
    user_fullname: Optional[str] = "Quản trị hệ thống",
    user_role: Optional[str] = "Admin",
    ip_address: Optional[str] = None,
) -> AuditLog:
    """Ghi nhận sự kiện điều chỉnh giá bán / giá sàn."""
    summary = (
        f"Điều chỉnh giá của [{entity_name or entity_id}] "
        f"từ {old_price:,.0f}đ thành {new_price:,.0f}đ do: {reason}"
    )

    return log_activity(
        db=db,
        entity_type="PRICE",
        entity_id=entity_id,
        entity_name=entity_name,
        action="UPDATE_PRICE",
        old_values={"price": old_price},
        new_values={"price": new_price},
        change_summary=summary,
        user_id=user_id,
        username=username,
        user_fullname=user_fullname,
        user_role=user_role,
        reason=reason,
        ip_address=ip_address,
    )


def adjust_invoice_status(
    db: Session,
    order_id: str,
    old_status: str,
    new_status: str,
    reason: str,
    user_id: Optional[int] = None,
    username: Optional[str] = "admin",
    user_fullname: Optional[str] = "Quản trị hệ thống",
    user_role: Optional[str] = "Admin",
    ip_address: Optional[str] = None,
) -> AuditLog:
    """Ghi nhận sự kiện thay đổi trạng thái hoá đơn / đơn hàng."""
    order = db.query(Order).filter(or_(Order.id == order_id, Order.code == order_id)).first()
    entity_name = f"Đơn hàng #{order.code}" if order else f"Đơn hàng #{order_id}"

    if order:
        order.status = new_status

    summary = (
        f"Điều chỉnh trạng thái hoá đơn [{entity_name}] "
        f"từ '{old_status}' sang '{new_status}' do: {reason}"
    )

    audit_entry = log_activity(
        db=db,
        entity_type="INVOICE",
        entity_id=order.id if order else order_id,
        entity_name=entity_name,
        action="STATUS_CHANGE",
        old_values={"status": old_status},
        new_values={"status": new_status},
        change_summary=summary,
        user_id=user_id,
        username=username,
        user_fullname=user_fullname,
        user_role=user_role,
        reason=reason,
        ip_address=ip_address,
    )

    if order:
        db.commit()

    return audit_entry
