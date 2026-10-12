from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.stock_take import StockTake, StockTakeItem, StockTakeScope, StockTakeStatus
from app.models.product import Product
from app.models.category import Category
from app.models.product_stock_profile import ProductStockProfile
from app.models.inventory import InventoryHistory
from app.models.auth import User, UserRole
from app.schemas.stock_take import (
    StockTakeCreate,
    StockTakeCountUpdate,
    StockTakeConfirmRequest,
    StockTakeCancelRequest,
    StockTakePreviewItem,
)
from app.services.product_service import ensure_seed_products


def _get_product_stock_qty(db: Session, product: Product, warehouse: str) -> int:
    """Lấy số lượng tồn kho sổ sách của sản phẩm theo kho (hoặc tồn tổng)."""
    # 1. Thử lấy từ ProductStockProfile
    profile = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == product.id).first()
    if not profile and str(product.id).isdigit():
        profile = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == int(product.id)).first()
    if profile and profile.stock is not None:
        return profile.stock
    
    # 2. Lấy từ Product.stock
    if product.stock is not None:
        return product.stock
    return 0


def _get_or_create_stock_profile(db: Session, product: Product, default_stock: int, warehouse: str) -> ProductStockProfile:
    profile = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == product.id).first()
    if not profile and str(product.id).isdigit():
        profile = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == int(product.id)).first()
    if not profile:
        profile = ProductStockProfile(
            product_id=product.id,
            sku=product.sku,
            stock=default_stock,
            min_stock=product.min_stock or 10,
            warehouse=warehouse
        )
        db.add(profile)
        db.flush()
    return profile


def is_user_warehouse_manager(user: Optional[User]) -> bool:
    """
    Kiểm tra xem người dùng có vai trò Quản lý kho (WH Manager) hoặc Quản trị viên (Admin) không.
    (SCRUM-585: Phân quyền chỉ Quản lý kho được phép chốt phiếu kiểm kê).
    """
    if not user:
        return False
    
    role_str = (user.role or "").strip().lower()
    
    # Kiểm tra chuỗi role chính
    manager_roles = [
        UserRole.WH_MANAGER.value.lower(),
        UserRole.ADMIN.value.lower(),
        "wh manager",
        "wh_manager",
        "whmanager",
        "warehouse manager",
        "warehousemanager",
        "admin",
        "quản lý kho",
        "quản trị viên",
        "quản trị hệ thống",
    ]
    if any(m == role_str for m in manager_roles):
        return True
    
    # Kiểm tra danh sách User.roles (many-to-many)
    if hasattr(user, "roles") and user.roles:
        for r in user.roles:
            r_name = (r.name or "").upper()
            if r_name in ["WH_MANAGER", "MANAGER", "ADMIN"]:
                return True
                
    return False


def get_preview_products(
    db: Session,
    warehouse: str = "Kho Tổng Hà Nội",
    scope_type: str = StockTakeScope.WAREHOUSE,
    category_id: Optional[int] = None
) -> List[StockTakePreviewItem]:
    """Xem trước danh sách sản phẩm và tồn sổ tại thời điểm hiện tại."""
    ensure_seed_products(db)
    
    query = db.query(Product).filter(Product.is_active == True)
    
    if scope_type == StockTakeScope.CATEGORY and category_id:
        cat = db.query(Category).filter(Category.id == category_id).first()
        if cat:
            query = query.filter((Product.category_id == category_id) | (Product.category == cat.name))
        else:
            query = query.filter(Product.category_id == category_id)
            
    products = query.order_by(Product.name.asc()).all()
    results: List[StockTakePreviewItem] = []
    
    for prod in products:
        sys_qty = _get_product_stock_qty(db, prod, warehouse)
        results.append(StockTakePreviewItem(
            product_id=str(prod.id),
            sku=prod.sku,
            name=prod.name,
            category=prod.category or "Mặc định",
            category_id=prod.category_id,
            unit=prod.unit or "cái",
            system_quantity=sys_qty,
            cost_price=prod.cost_price or 0.0
        ))
    return results


def create_stock_take(
    db: Session,
    data: StockTakeCreate,
    current_user: Optional[User] = None
) -> StockTake:
    """
    Tạo phiếu kiểm kê kho và đóng băng (snapshot) tồn sổ tại thời điểm lập phiếu.
    (SCRUM-581 & SCRUM-582).
    """
    ensure_seed_products(db)
    
    # 1. Xác định phạm vi sản phẩm
    category_name = None
    query = db.query(Product).filter(Product.is_active == True)
    
    if data.scope_type == StockTakeScope.CATEGORY:
        if not data.category_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vui lòng chọn nhóm hàng khi lập phiếu kiểm kê theo nhóm."
            )
        cat = db.query(Category).filter(Category.id == data.category_id).first()
        if cat:
            category_name = cat.name
            query = query.filter((Product.category_id == data.category_id) | (Product.category == cat.name))
        else:
            query = query.filter(Product.category_id == data.category_id)
            
    elif data.scope_type == StockTakeScope.CUSTOM and data.product_ids:
        query = query.filter(Product.id.in_(data.product_ids))
        
    products = query.order_by(Product.name.asc()).all()
    if not products:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không tìm thấy sản phẩm nào trong phạm vi kiểm kê đã chọn."
        )
        
    # 2. Sinh mã phiếu kiểm kê duy nhất chuẩn xác
    existing_records = db.query(StockTake.id, StockTake.code).all()
    existing_ids = {r[0] for r in existing_records if r[0]}
    existing_codes = {r[1] for r in existing_records if r[1]}

    max_num = 0
    for r in existing_records:
        for val in [r[0], r[1]]:
            if val:
                digits = "".join(filter(str.isdigit, val))
                if digits:
                    num_val = int(digits[-3:]) if len(digits) >= 3 else int(digits)
                    if num_val > max_num:
                        max_num = num_val

    next_num = max_num + 1
    while f"STK-TAKE-{str(next_num).zfill(3)}" in existing_ids or f"PKK-2026-{str(next_num).zfill(3)}" in existing_codes:
        next_num += 1

    take_id = f"STK-TAKE-{str(next_num).zfill(3)}"
    code = f"PKK-2026-{str(next_num).zfill(3)}"
    
    # 3. Tạo header phiếu kiểm kê
    stock_take = StockTake(
        id=take_id,
        code=code,
        warehouse=data.warehouse or "Kho Tổng Hà Nội",
        scope_type=data.scope_type,
        category_id=data.category_id,
        category_name=category_name,
        status=StockTakeStatus.DRAFT,
        note=data.note,
        created_by_id=current_user.id if current_user else None,
        created_by_name=current_user.full_name or current_user.username if current_user else "Thủ kho"
    )
    
    total_system_qty = 0
    # 4. Snapshot tồn sổ từng sản phẩm (SCRUM-581)
    for prod in products:
        sys_qty = _get_product_stock_qty(db, prod, stock_take.warehouse)
        total_system_qty += sys_qty
        
        item = StockTakeItem(
            product_id=str(prod.id),
            sku=prod.sku,
            product_name=prod.name,
            category_name=prod.category,
            unit=prod.unit or "cái",
            system_quantity=sys_qty,
            actual_quantity=None,
            discrepancy_quantity=0,
            is_counted=False,
            cost_price=prod.cost_price or 0.0,
            note=None
        )
        stock_take.items.append(item)
        
    stock_take.total_items = len(products)
    stock_take.total_system_qty = total_system_qty
    stock_take.total_actual_qty = 0
    stock_take.total_discrepancy_qty = 0
    stock_take.has_discrepancy = False
    
    db.add(stock_take)
    db.commit()
    db.refresh(stock_take)
    return stock_take


def get_stock_takes(
    db: Session,
    status_filter: Optional[str] = None,
    warehouse: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
) -> List[StockTake]:
    """Lấy danh sách phiếu kiểm kê có lọc và phân trang chuẩn xác từ CSDL thực tế."""
    query = db.query(StockTake)

    # Lọc trạng thái thông minh: in_progress bao gồm cả draft (đang kiểm đếm chưa chốt)
    if status_filter and status_filter != "all":
        if status_filter == "in_progress":
            query = query.filter(StockTake.status.in_(["in_progress", "draft"]))
        else:
            query = query.filter(StockTake.status == status_filter)

    # Lọc kho linh hoạt theo từ khóa nhận diện (TP.HCM / Hà Nội / Đà Nẵng...)
    if warehouse and warehouse != "all":
        w_clean = warehouse.lower().replace("kho", "").strip()
        if "hcm" in w_clean or "hồ chí minh" in w_clean:
            query = query.filter(
                (StockTake.warehouse.ilike("%TP.HCM%")) |
                (StockTake.warehouse.ilike("%TP. HCM%")) |
                (StockTake.warehouse.ilike("%HCM%")) |
                (StockTake.warehouse.ilike("%Hồ Chí Minh%"))
            )
        elif "hà nội" in w_clean or "hn" in w_clean:
            query = query.filter(
                (StockTake.warehouse.ilike("%Hà Nội%")) |
                (StockTake.warehouse.ilike("%HN%"))
            )
        elif "đà nẵng" in w_clean:
            query = query.filter(StockTake.warehouse.ilike("%Đà Nẵng%"))
        elif "cần thơ" in w_clean:
            query = query.filter(StockTake.warehouse.ilike("%Cần Thơ%"))
        elif "hải phòng" in w_clean:
            query = query.filter(StockTake.warehouse.ilike("%Hải Phòng%"))
        else:
            query = query.filter(StockTake.warehouse.ilike(f"%{w_clean}%"))

    # Lọc tìm kiếm theo mã phiếu, ghi chú, kho, người tạo, nhóm hàng
    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            (StockTake.code.ilike(search_pattern)) |
            (StockTake.warehouse.ilike(search_pattern)) |
            (StockTake.note.ilike(search_pattern)) |
            (StockTake.created_by_name.ilike(search_pattern)) |
            (StockTake.category_name.ilike(search_pattern))
        )

    return query.order_by(StockTake.created_at.desc()).offset(skip).limit(limit).all()


def get_stock_take_by_id(db: Session, take_id: str) -> StockTake:
    """Lấy chi tiết một phiếu kiểm kê theo ID hoặc Code."""
    take = db.query(StockTake).filter(
        (StockTake.id == take_id) | (StockTake.code == take_id)
    ).first()
    if not take:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu kiểm kê có mã '{take_id}'."
        )
    return take


def update_counted_items(
    db: Session,
    take_id: str,
    count_data: StockTakeCountUpdate,
    current_user: Optional[User] = None
) -> StockTake:
    """
    Xử lý nhập số đếm thực tế và tính chênh lệch từng dòng kiểm kê.
    (SCRUM-580).
    """
    take = get_stock_take_by_id(db, take_id)
    
    if take.status == StockTakeStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu kiểm kê đã chốt hoàn tất, không thể chỉnh sửa số đếm."
        )
    if take.status == StockTakeStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu kiểm kê đã bị hủy, không thể chỉnh sửa."
        )
        
    # Tạo map tra cứu dòng hàng
    items_by_id = {item.id: item for item in take.items}
    items_by_product_id = {item.product_id: item for item in take.items}
    
    for input_row in count_data.items:
        target_item = None
        if input_row.id is not None and input_row.id in items_by_id:
            target_item = items_by_id[input_row.id]
        elif input_row.product_id and input_row.product_id in items_by_product_id:
            target_item = items_by_product_id[input_row.product_id]
            
        if target_item:
            target_item.actual_quantity = input_row.actual_quantity
            # Tính chênh lệch từng dòng (SCRUM-580)
            target_item.discrepancy_quantity = input_row.actual_quantity - target_item.system_quantity
            target_item.is_counted = True
            if input_row.note is not None:
                target_item.note = input_row.note
                
    # Tính lại tổng hợp số đếm của toàn phiếu
    counted_items = [it for it in take.items if it.is_counted and it.actual_quantity is not None]
    take.total_actual_qty = sum(it.actual_quantity for it in counted_items)
    take.total_discrepancy_qty = sum(it.discrepancy_quantity for it in counted_items)
    take.has_discrepancy = any(it.discrepancy_quantity != 0 for it in counted_items)
    
    if take.status == StockTakeStatus.DRAFT:
        take.status = StockTakeStatus.IN_PROGRESS
        
    db.commit()
    db.refresh(take)
    return take


def confirm_stock_take(
    db: Session,
    take_id: str,
    confirm_data: StockTakeConfirmRequest,
    current_user: Optional[User] = None
) -> StockTake:
    """
    Chốt kiểm kê và cân bằng tồn kho theo số thực đếm.
    - SCRUM-585: Phân quyền chỉ Quản lý kho (WH Manager / Admin) mới được phép chốt.
    - SCRUM-584: Bắt buộc nhập lý do điều chỉnh khi có chênh lệch tồn.
    - SCRUM-583: Cập nhật tồn kho theo số thực đếm và ghi thẻ kho (InventoryHistory).
    """
    take = get_stock_take_by_id(db, take_id)
    
    # 1. Phân quyền: Chỉ Quản lý kho / Admin mới được chốt (SCRUM-585)
    if not is_user_warehouse_manager(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kho (WH Manager) hoặc Quản trị viên mới có quyền chốt phiếu kiểm kê."
        )
        
    # 2. Kiểm tra trạng thái phiếu
    if take.status == StockTakeStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu kiểm kê này đã được chốt trước đó."
        )
    if take.status == StockTakeStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu kiểm kê đã bị hủy, không thể chốt."
        )
        
    # 3. Đảm bảo tất cả các dòng đều đã có số đếm (nếu chưa đếm, mặc định số đếm = tồn sổ)
    for itm in take.items:
        if not itm.is_counted or itm.actual_quantity is None:
            itm.actual_quantity = itm.system_quantity
            itm.discrepancy_quantity = 0
            itm.is_counted = True
            
    # Tính lại chênh lệch chính xác
    counted_items = [it for it in take.items if it.is_counted and it.actual_quantity is not None]
    take.total_actual_qty = sum(it.actual_quantity for it in counted_items)
    take.total_discrepancy_qty = sum(it.discrepancy_quantity for it in counted_items)
    take.has_discrepancy = any(it.discrepancy_quantity != 0 for it in counted_items)
    
    # 4. Ràng buộc lý do khi có chênh lệch (SCRUM-584)
    reason = (confirm_data.adjustment_reason or "").strip()
    if take.has_discrepancy:
        if not reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bắt buộc phải nhập lý do điều chỉnh khi có chênh lệch tồn kho."
            )
        take.adjustment_reason = reason
    else:
        take.adjustment_reason = reason or "Kiểm kê khớp hoàn toàn với sổ sách."
        
    # 5. Cập nhật tồn kho theo số thực đếm & ghi thẻ kho (SCRUM-583)
    now = datetime.now(timezone.utc)
    performer_name = current_user.full_name or current_user.username if current_user else "Quản lý kho"
    
    for itm in take.items:
        if itm.discrepancy_quantity != 0:
            # Tìm sản phẩm
            prod = None
            str_pid = str(itm.product_id).strip()
            if str_pid.isdigit():
                prod = db.query(Product).filter(Product.id == int(str_pid)).first()
            if not prod and itm.sku:
                prod = db.query(Product).filter(Product.sku == itm.sku).first()
            if not prod:
                prod = db.query(Product).filter(Product.id == str_pid).first()
                
            if prod:
                # 5.1. Cập nhật Product.stock
                prod.stock = itm.actual_quantity
                if itm.actual_quantity == 0:
                    prod.status = "out_of_stock"
                elif itm.actual_quantity <= (prod.min_stock or 0):
                    prod.status = "low_stock"
                else:
                    prod.status = "active"
                    
                # 5.2. Cập nhật ProductStockProfile
                stock_profile = _get_or_create_stock_profile(db, prod, itm.system_quantity, take.warehouse)
                stock_profile.stock = itm.actual_quantity
                if hasattr(stock_profile, "physical_stock") and stock_profile.physical_stock is not None:
                    stock_profile.physical_stock = itm.actual_quantity
                    
                # 5.3. Ghi thẻ kho InventoryHistory
                hist_id = f"HIST-AUDIT-{int(now.timestamp() * 1000)}-{itm.product_id}"
                history_record = InventoryHistory(
                    id=hist_id,
                    code=take.code,
                    type="adjust",
                    product_id=str(prod.id),
                    product_name=prod.name,
                    sku=prod.sku,
                    quantity=itm.discrepancy_quantity,
                    balance_after=itm.actual_quantity,
                    warehouse=take.warehouse,
                    performer=performer_name,
                    note=f"Điều chỉnh kiểm kê theo phiếu {take.code}: {take.adjustment_reason}"
                )
                db.add(history_record)
                
    # 6. Đánh dấu hoàn tất phiếu kiểm kê
    take.status = StockTakeStatus.COMPLETED
    take.confirmed_by_id = current_user.id if current_user else None
    take.confirmed_by_name = performer_name
    take.confirmed_at = now
    
    db.commit()
    db.refresh(take)
    return take


def cancel_stock_take(
    db: Session,
    take_id: str,
    cancel_data: StockTakeCancelRequest,
    current_user: Optional[User] = None
) -> StockTake:
    """Hủy phiếu kiểm kê (chỉ cho phép khi chưa hoàn tất)."""
    take = get_stock_take_by_id(db, take_id)
    if take.status == StockTakeStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu kiểm kê đã chốt hoàn tất, không thể hủy bỏ."
        )
    if take.status == StockTakeStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu kiểm kê đã ở trạng thái hủy trước đó."
        )
        
    take.status = StockTakeStatus.CANCELLED
    take.cancel_reason = cancel_data.cancel_reason or "Người dùng hủy phiếu"
    take.cancelled_by_name = current_user.full_name or current_user.username if current_user else "Người dùng"
    take.cancelled_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(take)
    return take
