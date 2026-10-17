"""Nghiệp vụ S6-03 độc lập; tồn vật lý chỉ giảm khi xuất kho S6-05."""

from collections import defaultdict
from datetime import timezone
from math import ceil
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.models.customer_warehouse_profile import CustomerWarehouseProfile
from app.models.order import Order, OrderItem
from app.models.order_status import OrderStatusHistory
from app.models.picking_list import (
    PickingItemHistory, PickingList, PickingListItem, PickingListOrder, PickingLocation, utc_now,
)
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.stock_dispatch import StockDispatch, StockDispatchItem
from app.models.stock_reservation import StockReservation
from app.models.warehouse_stock import WarehouseStock
from app.schemas.picking_list import PickingItemResponse
from app.services.stock_ledger import FALLBACK_WAREHOUSE_MAP, resolve_warehouse

ELIGIBLE_STATUSES = ("APPROVED", "PACKING", "approved", "packing", "confirmed", "preparing", "reserved")
MANAGER_ROLES = ("Admin", "WH Manager")


def as_utc(value):
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def normalized_unit(value):
    unit = (value or "").strip().casefold()
    return "piece" if unit in {"cái", "chiếc"} else unit


def check_warehouse(db, user, warehouse_id):
    """Chặn truy cập ngoài kho được gán, kể cả khi đoán được ID phiếu."""
    _, name = resolve_warehouse(db, warehouse_id)
    if user.role != "Admin":
        assigned = {part.strip() for part in (user.assigned_warehouse or "").split(",") if part.strip()}
        if name not in assigned:
            raise HTTPException(403, "Bạn không được phân công làm việc tại kho này.")
    return name


def list_warehouses(db, user):
    result = []
    for warehouse_id, value in FALLBACK_WAREHOUSE_MAP.items():
        if warehouse_id == 99:
            continue
        if user.role == "Admin" or value["name"] in {part.strip() for part in (user.assigned_warehouse or "").split(",")}:
            result.append({"id": warehouse_id, "name": value["name"]})
    return result


def get_locations(db, user, warehouse_id):
    check_warehouse(db, user, warehouse_id)
    rows = db.query(PickingLocation, Product.sku, Product.name).join(
        Product, Product.id == PickingLocation.product_id,
    ).filter(PickingLocation.warehouse_id == warehouse_id).order_by(
        PickingLocation.route_sequence, PickingLocation.location_code, Product.sku,
    ).limit(2000).all()
    return [{"id": row.id, "product_id": row.product_id, "sku": sku, "product_name": name,
             "location_code": row.location_code, "route_sequence": row.route_sequence}
            for row, sku, name in rows]


def save_location(db, user, warehouse_id, product_id, payload):
    check_warehouse(db, user, warehouse_id)
    if user.role not in MANAGER_ROLES:
        raise HTTPException(403, "Chỉ quản lý kho hoặc quản trị viên được cấu hình vị trí lấy hàng.")
    # Cho phép nhập SKU trong giao diện cấu hình; lưu ID chuẩn của sản phẩm.
    product = db.query(Product).filter((Product.id == product_id) | (Product.sku == product_id)).first()
    if not product:
        raise HTTPException(404, "Không tìm thấy sản phẩm hoặc SKU.")
    row = db.query(PickingLocation).filter_by(warehouse_id=warehouse_id, product_id=product.id).first()
    if row is None:
        row = PickingLocation(warehouse_id=warehouse_id, product_id=product.id)
        db.add(row)
    row.location_code = payload.location_code
    row.route_sequence = payload.route_sequence
    commit(db)
    return {"product_id": product.id, "location_code": row.location_code, "route_sequence": row.route_sequence}


def commit(db):
    try:
        db.commit()
    except (IntegrityError, OperationalError):
        db.rollback()
        raise HTTPException(409, "Dữ liệu vừa thay đổi hoặc đơn đã được nhận soạn. Vui lòng làm mới.")


def eligible_orders(db, user, warehouse_id, search, page, page_size):
    warehouse_name = check_warehouse(db, user, warehouse_id)
    claimed = db.query(PickingListOrder.active_order_key).filter(PickingListOrder.active_order_key.isnot(None))
    wrong_warehouse = db.query(StockReservation.order_id).filter(
        StockReservation.status == "active", StockReservation.warehouse != warehouse_name,
    )
    wrong_customer = db.query(CustomerWarehouseProfile.customer_id).filter(
        CustomerWarehouseProfile.warehouse_name != warehouse_name,
    )
    dispatched = db.query(func.coalesce(func.sum(StockDispatchItem.dispatched_quantity), 0)).join(
        StockDispatch, StockDispatch.id == StockDispatchItem.dispatch_id,
    ).filter(StockDispatch.order_id == Order.id).correlate(Order).scalar_subquery()
    ordered = db.query(func.coalesce(func.sum(OrderItem.quantity), 0)).filter(
        OrderItem.order_id == Order.id,
    ).correlate(Order).scalar_subquery()
    query = db.query(Order).filter(
        Order.status.in_(ELIGIBLE_STATUSES), Order.id.notin_(claimed),
        Order.id.notin_(wrong_warehouse), Order.customer_id.notin_(wrong_customer), ordered > dispatched,
    )
    if search:
        query = query.filter((Order.code.contains(search)) | (Order.customer_name.contains(search)))
    total = query.count()
    rows = query.order_by(Order.created_at, Order.id).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"id": o.id, "code": o.code, "customer_name": o.customer_name,
                       "status": o.status, "total_lines": len(o.items),
                       "total_quantity": sum(i.quantity for i in o.items)} for o in rows],
            "total": total, "page": page, "page_size": page_size, "total_pages": ceil(total / page_size)}


def build_preview(db, user, warehouse_id, order_ids, lock=False):
    warehouse_name = check_warehouse(db, user, warehouse_id)
    if len(set(order_ids)) != len(order_ids) or any(not value.strip() for value in order_ids):
        raise HTTPException(400, "Danh sách đơn không được trùng lặp hoặc để trống.")
    query = db.query(Order).filter(Order.id.in_(order_ids)).order_by(Order.id)
    if lock:
        query = query.with_for_update(of=Order)
    orders = query.all()
    if len(orders) != len(order_ids):
        raise HTTPException(404, "Một hoặc nhiều đơn hàng không tồn tại.")
    if any(o.status not in ELIGIBLE_STATUSES for o in orders):
        raise HTTPException(400, "Chỉ được tạo phiếu soạn từ đơn đã duyệt và chưa xuất kho.")
    if db.query(PickingListOrder.id).filter(PickingListOrder.active_order_key.in_(order_ids)).first():
        raise HTTPException(409, "Một hoặc nhiều đơn đã có phiếu soạn chưa hủy.")
    wrong_customer = db.query(CustomerWarehouseProfile.id).filter(
        CustomerWarehouseProfile.customer_id.in_([o.customer_id for o in orders]),
        CustomerWarehouseProfile.warehouse_name != warehouse_name,
    ).first()
    if wrong_customer:
        raise HTTPException(400, "Các đơn phải cùng kho phục vụ để gộp soạn.")
    source_items = db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).order_by(OrderItem.id).all()
    source_product_ids = {str(i.product_id) for i in source_items}
    source_skus = {i.sku for i in source_items if i.sku}
    products = {str(p.id): p for p in db.query(Product).filter(or_(
        Product.id.in_(source_product_ids), Product.sku.in_(source_skus),
    )).all()}
    products_by_sku = {p.sku: p for p in products.values()}
    product_ids = set(products)
    locations = {l.product_id: l for l in db.query(PickingLocation).filter(
        PickingLocation.warehouse_id == warehouse_id, PickingLocation.product_id.in_(product_ids),
    ).all()}
    dispatched = defaultdict(int)
    for order_id, product_id, sku, qty in db.query(
        StockDispatch.order_id, StockDispatchItem.product_id, StockDispatchItem.sku,
        func.sum(StockDispatchItem.dispatched_quantity),
    ).join(StockDispatchItem, StockDispatchItem.dispatch_id == StockDispatch.id).filter(
        StockDispatch.order_id.in_(order_ids),
    ).group_by(StockDispatch.order_id, StockDispatchItem.product_id, StockDispatchItem.sku).all():
        product = products.get(str(product_id)) or products_by_sku.get(sku)
        canonical_id = str(product.id) if product else str(product_id)
        dispatched[(order_id, canonical_id)] += int(qty)
    lines, warnings = [], []
    for item in source_items:
        # Đơn cũ có thể giữ ID số, còn danh mục dùng PRD-…; SKU là khóa tra cứu dự phòng.
        product = products.get(str(item.product_id)) or products_by_sku.get(item.sku)
        if not product or not product.is_active:
            raise HTTPException(400, f"Sản phẩm {item.sku or item.product_id} không tồn tại hoặc đã ngừng hoạt động.")
        product_id = str(product.id)
        key = (item.order_id, product_id)
        already = min(item.quantity, dispatched[key])
        dispatched[key] -= already
        required = item.quantity - already
        if required <= 0:
            continue
        location = locations.get(product_id)
        if location is None:
            warnings.append(f"SKU {product.sku} chưa có vị trí lấy hàng tại kho này.")
        if item.unit and normalized_unit(item.unit) != normalized_unit(product.unit):
            warnings.append(f"SKU {product.sku}: đơn vị đơn hàng khác đơn vị cơ sở; cần xác nhận quy đổi trước khi soạn.")
        lines.append({"order_id": item.order_id, "order_item_id": item.id, "product_id": product_id,
                      "sku": product.sku, "product_name": product.name, "unit": product.unit,
                      "requested_quantity": required, "location_code": location.location_code if location else "",
                      "route_sequence": location.route_sequence if location else 1000001})
    if not lines:
        raise HTTPException(400, "Các đơn đã được xuất đủ hoặc không có dòng hàng cần soạn.")
    reservations = db.query(StockReservation).filter(
        StockReservation.status == "active", StockReservation.order_id.in_(order_ids),
    ).all()
    if any(r.warehouse != warehouse_name for r in reservations):
        raise HTTPException(400, "Đơn đang giữ chỗ tại kho khác, không thể gộp vào kho đã chọn.")
    reserved_by_order = defaultdict(int)
    for row in reservations:
        reserved_by_order[(row.order_id, row.product_id)] += row.reserved_quantity
    needed = defaultdict(int)
    for line in lines:
        needed[(line["order_id"], line["product_id"])] += line["requested_quantity"]
    deficits = {key: max(0, qty - reserved_by_order[key]) for key, qty in needed.items()}
    stock_query = db.query(WarehouseStock).filter(
        WarehouseStock.warehouse_id == warehouse_id, WarehouseStock.product_id.in_(product_ids),
    ).order_by(WarehouseStock.product_id)
    if lock:
        stock_query = stock_query.with_for_update()
    stocks = {s.product_id: s for s in stock_query.all()}
    # Chỉ backfill profile cũ vào đúng kho sở hữu; không sao chép cùng tồn sang kho khác.
    missing_ids = product_ids - stocks.keys()
    if missing_ids:
        profiles = db.query(ProductStockProfile).filter(
            ProductStockProfile.product_id.in_(missing_ids), ProductStockProfile.warehouse == warehouse_name,
        ).all()
        for profile in profiles:
            physical = int(profile.physical_stock if profile.physical_stock is not None else (profile.stock or 0))
            row = WarehouseStock(product_id=profile.product_id, sku=profile.sku, warehouse_id=warehouse_id,
                                 warehouse=warehouse_name, physical_stock=physical, stock=profile.stock)
            stocks[profile.product_id] = row
            if lock:
                db.add(row)
        if lock and profiles:
            db.flush()
    active_reserved = dict(db.query(StockReservation.product_id, func.sum(StockReservation.reserved_quantity)).filter(
        StockReservation.status == "active", StockReservation.warehouse == warehouse_name,
        StockReservation.product_id.in_(product_ids),
    ).group_by(StockReservation.product_id).all())
    deficit_by_product = defaultdict(int)
    for (_, product_id), qty in deficits.items():
        deficit_by_product[product_id] += qty
    for product_id, qty in deficit_by_product.items():
        stock = stocks.get(product_id)
        physical = int(stock.physical_stock or 0) if stock else 0
        reserved = int(active_reserved.get(product_id, 0))
        if physical < reserved + qty:
            warnings.append(f"SKU {products[product_id].sku}: tồn thực tế {physical}, đang giữ chỗ {reserved}, cần giữ thêm {qty}.")
    lines.sort(key=lambda line: (line["route_sequence"], line["location_code"], line["sku"], line["order_id"], line["order_item_id"]))
    result = {"warehouse_id": warehouse_id, "warehouse_name": warehouse_name,
              "orders": [{"id": o.id, "code": o.code, "status": o.status} for o in orders], "items": lines,
              "total_lines": len(lines), "total_quantity": sum(l["requested_quantity"] for l in lines),
              "warnings": list(dict.fromkeys(warnings)), "can_create": not warnings}
    return result, deficits


def preview(db, user, payload):
    return build_preview(db, user, payload.warehouse_id, payload.order_ids)[0]


def create_list(db: Session, user, payload):
    existing = db.query(PickingList).filter_by(client_request_id=payload.client_request_id).first()
    if existing:
        check_warehouse(db, user, existing.warehouse_id)
        source_ids = {row.order_id for row in db.query(PickingListOrder).filter_by(picking_list_id=existing.id).all()}
        if existing.warehouse_id != payload.warehouse_id or source_ids != set(payload.order_ids) or existing.created_by != user.id:
            raise HTTPException(409, "Mã yêu cầu đã được sử dụng cho nội dung khác.")
        return detail(db, user, existing.id)
    try:
        data, deficits = build_preview(db, user, payload.warehouse_id, payload.order_ids, lock=True)
        if not data["can_create"]:
            raise HTTPException(400, " ".join(data["warnings"]))
        sheet = PickingList(id=f"PSH-{uuid4().hex[:16].upper()}", client_request_id=payload.client_request_id,
                            warehouse_id=payload.warehouse_id, warehouse_name=data["warehouse_name"],
                            created_by=user.id, notes=payload.notes)
        db.add(sheet)
        db.flush()
        codes = {o["id"]: o["code"] for o in data["orders"]}
        original_statuses = {o["id"]: o["status"] for o in data["orders"]}
        for order_id in payload.order_ids:
            db.add(PickingListOrder(picking_list_id=sheet.id, order_id=order_id,
                                    order_code=codes[order_id], original_status=original_statuses[order_id],
                                    active_order_key=order_id))
            db.add(OrderStatusHistory(order_id=order_id, from_status=original_statuses[order_id],
                                      to_status="PACKING", changed_by=str(user.id),
                                      note=f"Bắt đầu soạn theo phiếu {sheet.id}"))
        db.query(Order).filter(Order.id.in_(payload.order_ids)).update(
            {"status": "PACKING", "updated_at": utc_now()}, synchronize_session=False,
        )
        for line in data["items"]:
            db.add(PickingListItem(picking_list_id=sheet.id, **line))
        for (order_id, product_id), quantity in deficits.items():
            if quantity:
                sku = next(l["sku"] for l in data["items"] if l["product_id"] == product_id)
                db.add(StockReservation(order_id=order_id, order_code=codes[order_id], product_id=product_id,
                                        sku=sku, warehouse=sheet.warehouse_name, reserved_quantity=quantity,
                                        status="active", note=f"Giữ chỗ khi lập phiếu soạn {sheet.id}"))
        db.flush()
        sync_reservations(db, {l["product_id"] for l in data["items"]}, sheet.warehouse_id, sheet.warehouse_name)
        commit(db)
    except (IntegrityError, OperationalError):
        db.rollback()
        raise HTTPException(409, "Dữ liệu vừa thay đổi hoặc đơn đã được nhận soạn. Vui lòng làm mới.")
    except Exception:
        db.rollback()
        raise
    return detail(db, user, sheet.id)


def sync_reservations(db, product_ids, warehouse_id, warehouse_name):
    """Đồng bộ chỉ số khả dụng; không ghi OUT_SALE trong lúc hàng còn ở kho."""
    totals = dict(db.query(StockReservation.product_id, func.sum(StockReservation.reserved_quantity)).filter(
        StockReservation.status == "active", StockReservation.product_id.in_(product_ids),
    ).group_by(StockReservation.product_id).all())
    local = dict(db.query(StockReservation.product_id, func.sum(StockReservation.reserved_quantity)).filter(
        StockReservation.status == "active", StockReservation.product_id.in_(product_ids),
        StockReservation.warehouse == warehouse_name,
    ).group_by(StockReservation.product_id).all())
    stocks = db.query(WarehouseStock).filter(WarehouseStock.product_id.in_(product_ids)).all()
    physical = defaultdict(int)
    for stock in stocks:
        if stock.warehouse_id != 99:
            physical[stock.product_id] += int(stock.physical_stock or 0)
        if stock.warehouse_id == warehouse_id:
            stock.stock = max(0, int(stock.physical_stock or 0) - int(local.get(stock.product_id, 0)))
    for profile in db.query(ProductStockProfile).filter(ProductStockProfile.product_id.in_(product_ids)).all():
        profile.physical_stock = physical[profile.product_id]
        profile.reserved_stock = int(totals.get(profile.product_id, 0))
        profile.stock = max(0, profile.physical_stock - profile.reserved_stock)
    for product in db.query(Product).filter(Product.id.in_(product_ids)).all():
        product.stock = max(0, physical[product.id] - int(totals.get(product.id, 0)))


def get_sheet(db, user, sheet_id, lock=False):
    sheet = db.query(PickingList).filter_by(id=sheet_id).first()
    if sheet is None:
        raise HTTPException(404, "Không tìm thấy phiếu soạn hàng.")
    check_warehouse(db, user, sheet.warehouse_id)
    if lock:
        # Ghi trước để SQLite cũng tuần tự hóa cập nhật/hủy cùng một phiếu.
        count = db.query(PickingList).filter_by(id=sheet_id, status=sheet.status).update(
            {"updated_at": utc_now()}, synchronize_session=False,
        )
        if not count:
            raise HTTPException(409, "Phiếu vừa được cập nhật. Vui lòng làm mới.")
        db.refresh(sheet)
    return sheet


def summary(sheet, lines, sources):
    return {"id": sheet.id, "warehouse_id": sheet.warehouse_id, "warehouse_name": sheet.warehouse_name,
            "status": sheet.status, "notes": sheet.notes, "created_by": sheet.created_by,
            "created_at": as_utc(sheet.created_at), "updated_at": as_utc(sheet.updated_at),
            "orders": [{"id": o.order_id, "code": o.order_code} for o in sources],
            "total_lines": len(lines), "completed_lines": sum(l.status in ("picked", "short") for l in lines),
            "total_quantity": sum(l.requested_quantity for l in lines),
            "picked_quantity": sum(l.picked_quantity for l in lines),
            "shortfall_quantity": sum(l.shortfall_quantity for l in lines)}


def detail(db, user, sheet_id):
    sheet = get_sheet(db, user, sheet_id)
    lines = db.query(PickingListItem).filter_by(picking_list_id=sheet_id).order_by(
        PickingListItem.route_sequence, PickingListItem.location_code, PickingListItem.sku,
        PickingListItem.order_id, PickingListItem.order_item_id,
    ).all()
    sources = db.query(PickingListOrder).filter_by(picking_list_id=sheet_id).order_by(PickingListOrder.order_id).all()
    items = [PickingItemResponse.model_validate(l).model_dump() for l in lines]
    for item in items:
        item["updated_at"] = as_utc(item["updated_at"])
    return {**summary(sheet, lines, sources), "items": items}


def list_sheets(db, user, warehouse_id, status, search, page, page_size):
    check_warehouse(db, user, warehouse_id)
    query = db.query(PickingList).filter_by(warehouse_id=warehouse_id)
    if status:
        query = query.filter(PickingList.status == status)
    if search:
        query = query.filter(PickingList.id.contains(search))
    total = query.count()
    sheets = query.order_by(PickingList.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    ids = [s.id for s in sheets]
    lines, sources = defaultdict(list), defaultdict(list)
    for line in db.query(PickingListItem).filter(PickingListItem.picking_list_id.in_(ids)).all():
        lines[line.picking_list_id].append(line)
    for source in db.query(PickingListOrder).filter(PickingListOrder.picking_list_id.in_(ids)).all():
        sources[source.picking_list_id].append(source)
    return {"items": [summary(s, lines[s.id], sources[s.id]) for s in sheets], "total": total,
            "page": page, "page_size": page_size, "total_pages": ceil(total / page_size)}


def write_history(db, sheet_id, item, quantity, shortfall, status, reason, user_id):
    db.add(PickingItemHistory(picking_list_id=sheet_id, item_id=item.id, old_quantity=item.picked_quantity,
                             new_quantity=quantity, old_shortfall=item.shortfall_quantity, new_shortfall=shortfall,
                             old_status=item.status, new_status=status, old_reason=item.shortfall_reason,
                             new_reason=reason, changed_by=user_id))


def update_item(db, user, sheet_id, item_id, payload):
    try:
        sheet = get_sheet(db, user, sheet_id, lock=True)
        if sheet.status == "cancelled":
            raise HTTPException(409, "Phiếu đã hủy, không thể cập nhật.")
        item = db.query(PickingListItem).filter_by(id=item_id, picking_list_id=sheet_id).first()
        if item is None:
            raise HTTPException(404, "Dòng hàng không thuộc phiếu soạn này.")
        source = db.query(Order).filter_by(id=item.order_id).with_for_update(of=Order).first()
        if source is None or source.status not in ELIGIBLE_STATUSES:
            raise HTTPException(409, "Đơn nguồn đã hủy hoặc chuyển sang xuất/giao hàng. Vui lòng kiểm tra lại.")
        required = db.query(func.sum(PickingListItem.requested_quantity)).filter_by(
            picking_list_id=sheet_id, order_id=item.order_id, product_id=item.product_id,
        ).scalar() or 0
        reserved = db.query(func.coalesce(func.sum(StockReservation.reserved_quantity), 0)).filter_by(
            order_id=item.order_id, product_id=item.product_id, warehouse=sheet.warehouse_name, status="active",
        ).scalar() or 0
        if reserved < required:
            raise HTTPException(409, "Giữ chỗ của đơn đã thay đổi, cần kiểm tra lại tồn kho trước khi soạn.")
        if payload.picked_quantity > item.requested_quantity:
            raise HTTPException(400, "Số lượng thực soạn không được vượt số lượng yêu cầu.")
        shortfall = item.requested_quantity - payload.picked_quantity
        reason = (payload.shortfall_reason or "").strip() or None
        if shortfall and not reason:
            raise HTTPException(400, "Bắt buộc nhập lý do khi soạn thiếu, kể cả không soạn được hàng.")
        if not shortfall:
            reason = None
        new_status = "short" if shortfall else "picked"
        # Cập nhật có điều kiện bảo vệ cả SQLite không hỗ trợ SELECT FOR UPDATE.
        updated = db.query(PickingListItem).filter_by(
            id=item_id, picking_list_id=sheet_id, version=payload.expected_version,
        ).update({"picked_quantity": payload.picked_quantity, "shortfall_quantity": shortfall,
                  "shortfall_reason": reason, "status": new_status, "version": payload.expected_version + 1,
                  "updated_by": user.id, "updated_at": utc_now()}, synchronize_session=False)
        if not updated:
            raise HTTPException(409, "Dòng hàng vừa được người khác cập nhật. Vui lòng làm mới.")
        write_history(db, sheet_id, item, payload.picked_quantity, shortfall, new_status, reason, user.id)
        pending = db.query(PickingListItem.id).filter_by(picking_list_id=sheet_id, status="pending").first()
        sheet.status = "in_progress" if pending else "completed"
        sheet.updated_at = utc_now()
        sync_reservations(db, {item.product_id}, sheet.warehouse_id, sheet.warehouse_name)
        commit(db)
        db.expire_all()
    except (IntegrityError, OperationalError):
        db.rollback()
        raise HTTPException(409, "Dòng hàng vừa được cập nhật. Vui lòng làm mới.")
    except Exception:
        db.rollback()
        raise
    return detail(db, user, sheet_id)


def history(db, user, sheet_id, page, page_size):
    get_sheet(db, user, sheet_id)
    query = db.query(PickingItemHistory).filter_by(picking_list_id=sheet_id)
    total = query.count()
    rows = query.order_by(PickingItemHistory.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{**{column.name: getattr(row, column.name) for column in PickingItemHistory.__table__.columns},
                       "changed_at": as_utc(row.changed_at)}
                      for row in rows], "total": total, "page": page, "page_size": page_size,
            "total_pages": ceil(total / page_size)}


def cancel_list(db, user, sheet_id, payload):
    try:
        sheet = get_sheet(db, user, sheet_id, lock=True)
        if not payload.reason.strip():
            raise HTTPException(400, "Bắt buộc nhập lý do hủy phiếu.")
        if sheet.status == "cancelled":
            return detail(db, user, sheet_id)
        if sheet.status == "completed":
            raise HTTPException(409, "Không thể hủy phiếu đã hoàn tất.")
        links = db.query(PickingListOrder).filter_by(picking_list_id=sheet_id).all()
        sources = {o.id: o for o in db.query(Order).filter(
            Order.id.in_([link.order_id for link in links]),
        ).with_for_update(of=Order).all()}
        if any(source.status not in ELIGIBLE_STATUSES for source in sources.values()):
            raise HTTPException(409, "Đơn nguồn đã thay đổi trạng thái, không thể hủy lượt soạn.")
        for item in db.query(PickingListItem).filter_by(picking_list_id=sheet_id).all():
            write_history(db, sheet_id, item, 0, 0, "cancelled", payload.reason.strip(), user.id)
            item.status = "cancelled"
            item.picked_quantity = item.shortfall_quantity = 0
            item.shortfall_reason = payload.reason.strip()
            item.version += 1
            item.updated_by = user.id
            item.updated_at = utc_now()
        for link in links:
            source = sources.get(link.order_id)
            if source and source.status == "PACKING":
                source.status = link.original_status
                db.add(OrderStatusHistory(order_id=link.order_id, from_status="PACKING",
                                          to_status=link.original_status, changed_by=str(user.id),
                                          note=f"Hủy phiếu soạn {sheet.id}: {payload.reason.strip()}"))
            link.active_order_key = None
        sheet.status = "cancelled"
        sheet.updated_at = utc_now()
        commit(db)
    except (IntegrityError, OperationalError):
        db.rollback()
        raise HTTPException(409, "Phiếu vừa được cập nhật. Vui lòng làm mới.")
    except Exception:
        db.rollback()
        raise
    return detail(db, user, sheet_id)
