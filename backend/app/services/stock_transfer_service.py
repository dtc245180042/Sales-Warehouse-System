from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone
from sqlalchemy import or_, and_, func, desc
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.stock_transfer import StockTransfer, StockTransferItem, WarehouseStock
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.inventory import InventoryHistory
from app.models.auth import User
from app.schemas.stock_transfer import (
    StockTransferCreate,
    StockTransferShipRequest,
    StockTransferReceiveRequest,
    StockTransferCancelRequest,
    InTransitSummaryItem,
)
from app.services.product_service import ensure_seed_products


def get_or_create_warehouse_stock(
    db: Session,
    warehouse: str,
    product_id: str,
    sku: Optional[str] = None
) -> WarehouseStock:
    """
    Lấy hoặc khởi tạo bản ghi tồn kho chi tiết theo kho hàng (WarehouseStock).
    Nếu chưa có, kế thừa số dư ban đầu hợp lý từ ProductStockProfile / Product.
    """
    wh_stock = db.query(WarehouseStock).filter(
        WarehouseStock.warehouse == warehouse,
        WarehouseStock.product_id == str(product_id)
    ).first()

    if wh_stock:
        return wh_stock

    # Tìm thông tin sản phẩm và profile
    prod = None
    str_pid = str(product_id).strip()
    if str_pid.isdigit():
        prod = db.query(Product).filter(Product.id == int(str_pid)).first()
    if not prod:
        prod = db.query(Product).filter(Product.id == str_pid).first()
    if not prod and sku:
        prod = db.query(Product).filter(Product.sku == sku).first()

    prof = None
    if prod:
        prof = db.query(ProductStockProfile).filter(
            ProductStockProfile.product_id == str(prod.id)
        ).first()

    resolved_sku = sku or (prod.sku if prod else "")

    # Xác định tồn ban đầu theo kho
    init_stock = 0
    if prof and prof.warehouse and prof.warehouse.strip().lower() == warehouse.strip().lower():
        init_stock = int(prof.stock if prof.stock is not None else 100)
    elif "hà nội" in warehouse.lower():
        init_stock = int(prof.stock if prof and prof.stock is not None else (prod.stock if prod and prod.stock is not None else 80))
    elif "đà nẵng" in warehouse.lower():
        init_stock = 45
    elif "hồ chí minh" in warehouse.lower() or "tp. hcm" in warehouse.lower():
        init_stock = 60
    elif "cần thơ" in warehouse.lower():
        init_stock = 25
    else:
        init_stock = int(prod.stock if prod and prod.stock is not None else 30)

    wh_stock = WarehouseStock(
        warehouse=warehouse,
        product_id=str(product_id),
        sku=resolved_sku,
        stock=init_stock,
        physical_stock=init_stock,
        in_transit_stock=0
    )
    db.add(wh_stock)
    db.flush()
    return wh_stock


def _generate_transfer_code(db: Session) -> Tuple[str, str]:
    """Tạo ID và mã phiếu chuyển kho chuẩn (PCK-2026-XXXX)."""
    current_year = datetime.now(timezone.utc).year
    count = db.query(StockTransfer).count() + 1
    code = f"PCK-{current_year}-{str(count).zfill(4)}"
    while db.query(StockTransfer).filter(or_(StockTransfer.id == code, StockTransfer.code == code)).first():
        count += 1
        code = f"PCK-{current_year}-{str(count).zfill(4)}"
    return code, code


def create_stock_transfer(
    db: Session,
    data: StockTransferCreate,
    current_user: Optional[User] = None
) -> StockTransfer:
    """
    Lập phiếu chuyển kho nội bộ mới (SCRUM-574 & SCRUM-572).
    Ràng buộc nghiệp vụ:
    - Kho xuất và kho nhập không được trùng nhau.
    - Danh sách hàng không được rỗng.
    - Số lượng chuyển phải > 0.
    - Kiểm tra tồn kho tại kho xuất đủ số lượng.
    """
    ensure_seed_products(db)

    # 1. Ràng buộc kho đi != kho đến
    src_wh = data.source_warehouse.strip()
    dest_wh = data.destination_warehouse.strip()
    if src_wh.lower() == dest_wh.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kho xuất và kho nhập không được trùng nhau. Vui lòng chọn hai kho hàng khác nhau."
        )

    # 2. Ràng buộc danh sách hàng
    if not data.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Danh sách hàng chuyển kho không được để trống."
        )

    # 3. Kiểm tra số lượng và tồn kho khả dụng tại kho đi
    seen_products = set()
    total_items = 0

    for itm in data.items:
        if itm.transfer_quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số lượng chuyển của sản phẩm '{itm.product_name}' phải lớn hơn 0."
            )
        
        pid_str = str(itm.product_id).strip()
        if pid_str in seen_products:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sản phẩm '{itm.product_name}' bị trùng lặp trong phiếu. Vui lòng gộp số lượng vào 1 dòng."
            )
        seen_products.add(pid_str)

        # Kiểm tra tồn kho nguồn
        source_stock = get_or_create_warehouse_stock(db, src_wh, pid_str, itm.sku)
        if source_stock.stock < itm.transfer_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Sản phẩm '{itm.product_name}' (SKU: {itm.sku or 'N/A'}) tại '{src_wh}' không đủ tồn kho để chuyển. "
                    f"Tồn khả dụng hiện có: {source_stock.stock}, số lượng yêu cầu chuyển: {itm.transfer_quantity}."
                )
            )
        total_items += itm.transfer_quantity

    transfer_id, code = _generate_transfer_code(db)
    creator_name = (current_user.full_name or current_user.username) if current_user else "Thủ kho"
    creator_id = current_user.id if current_user else None

    transfer = StockTransfer(
        id=transfer_id,
        code=code,
        source_warehouse=src_wh,
        destination_warehouse=dest_wh,
        status="draft",
        transfer_date=datetime.now(timezone.utc),
        total_items=total_items,
        total_received_items=0,
        has_discrepancy=False,
        note=data.note,
        created_by=creator_name,
        created_by_id=creator_id,
    )

    for itm in data.items:
        # Tự động bù giá vốn thực tế của sản phẩm nếu client gửi lên giá 0
        cost_val = itm.cost_price
        if not cost_val or cost_val <= 0:
            prod_lookup = db.query(Product).filter(
                or_(Product.id == str(itm.product_id), Product.sku == itm.sku)
            ).first()
            if prod_lookup and getattr(prod_lookup, "cost_price", None) and prod_lookup.cost_price > 0:
                cost_val = float(prod_lookup.cost_price)
            elif prod_lookup and getattr(prod_lookup, "sale_price", None) and prod_lookup.sale_price > 0:
                cost_val = round(float(prod_lookup.sale_price) * 0.8, -3)
            else:
                name_low = (itm.product_name or "").lower()
                if any(k in name_low for k in ["laptop", "dell", "macbook", "máy tính"]):
                    cost_val = 20000000.0
                elif any(k in name_low for k in ["iphone", "samsung", "điện thoại"]):
                    cost_val = 18000000.0
                elif any(k in name_low for k in ["màn hình", "ultrasharp", "monitor"]):
                    cost_val = 9000000.0
                elif any(k in name_low for k in ["tai nghe", "airpods"]):
                    cost_val = 3500000.0
                elif any(k in name_low for k in ["chuột", "phím", "mouse", "keyboard"]):
                    cost_val = 1500000.0
                else:
                    cost_val = 1000000.0

        transfer_item = StockTransferItem(
            product_id=str(itm.product_id),
            sku=itm.sku,
            product_name=itm.product_name,
            unit=itm.unit or "Chiếc",
            transfer_quantity=itm.transfer_quantity,
            received_quantity=None,
            discrepancy_quantity=0,
            cost_price=cost_val or 0.0,
        )
        transfer.items.append(transfer_item)

    db.add(transfer)
    db.commit()
    db.refresh(transfer)

    # Nếu người dùng chọn xuất chuyển ngay lập tức
    if data.ship_immediately:
        return ship_stock_transfer(db, transfer.id, StockTransferShipRequest(shipped_by=creator_name), current_user)

    return transfer


def ship_stock_transfer(
    db: Session,
    transfer_id_or_code: str,
    req: Optional[StockTransferShipRequest] = None,
    current_user: Optional[User] = None
) -> StockTransfer:
    """
    Xử lý xuất kho chuyển đi (SCRUM-570).
    - Trừ tồn kho tại kho đi (source_warehouse).
    - Ghi nhận hàng đang trên đường (in-transit) tới kho đến (destination_warehouse).
    - Hàng CHƯA ĐƯỢC CỘNG vào kho đến!
    - Ghi thẻ kho (InventoryHistory) xuất chuyển kho tại kho đi.
    - Cập nhật trạng thái phiếu -> 'in_transit'.
    """
    transfer = db.query(StockTransfer).filter(
        or_(StockTransfer.id == transfer_id_or_code, StockTransfer.code == transfer_id_or_code)
    ).first()

    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu chuyển kho với mã '{transfer_id_or_code}'."
        )

    if transfer.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Phiếu chuyển kho đang ở trạng thái '{transfer.status}', không thể xuất kho (chỉ áp dụng cho phiếu 'draft')."
        )

    now = datetime.now(timezone.utc)
    shipper = (
        (req.shipped_by if req and req.shipped_by else None)
        or ((current_user.full_name or current_user.username) if current_user else None)
        or transfer.created_by
        or "Thủ kho xuất"
    )

    # Kiểm tra lại tồn kho nguồn và trừ tồn
    for item in transfer.items:
        src_stock = get_or_create_warehouse_stock(db, transfer.source_warehouse, item.product_id, item.sku)
        if src_stock.stock < item.transfer_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Sản phẩm '{item.product_name}' tại '{transfer.source_warehouse}' không đủ tồn kho để xuất. "
                    f"Tồn hiện có: {src_stock.stock}, yêu cầu: {item.transfer_quantity}."
                )
            )

        # Trừ tồn kho đi
        src_stock.stock = max(0, src_stock.stock - item.transfer_quantity)
        src_stock.physical_stock = max(0, src_stock.physical_stock - item.transfer_quantity)

        # Ghi nhận hàng đang trên đường (in-transit) tại kho đến (CHƯA cộng vào stock)
        dest_stock = get_or_create_warehouse_stock(db, transfer.destination_warehouse, item.product_id, item.sku)
        dest_stock.in_transit_stock += item.transfer_quantity

        # Ghi thẻ kho (InventoryHistory) cho kho đi
        hist_id = f"HIST-TRF-OUT-{int(now.timestamp() * 1000)}-{item.product_id}"
        history_record = InventoryHistory(
            id=hist_id,
            code=transfer.code,
            type="transfer",
            product_id=item.product_id,
            product_name=item.product_name,
            sku=item.sku,
            quantity=-item.transfer_quantity,
            balance_after=src_stock.stock,
            warehouse=transfer.source_warehouse,
            performer=shipper,
            note=f"Xuất chuyển kho đến {transfer.destination_warehouse} theo phiếu {transfer.code}"
        )
        db.add(history_record)

    transfer.status = "in_transit"
    transfer.shipped_by = shipper
    transfer.shipped_at = now
    if req and req.note:
        transfer.note = (transfer.note + f" | Xuất: {req.note}") if transfer.note else req.note

    db.commit()
    db.refresh(transfer)
    return transfer


def receive_stock_transfer(
    db: Session,
    transfer_id_or_code: str,
    req: StockTransferReceiveRequest,
    current_user: Optional[User] = None
) -> StockTransfer:
    """
    Xác nhận nhận hàng tại kho đến để cộng tồn và khóa phiếu (SCRUM-571 & SCRUM-573).
    - Chỉ nhận khi phiếu đang ở trạng thái 'in_transit'.
    - Kiểm tra số lượng thực nhận:
      - Nếu thực nhận != chuyển đi: BẮT BUỘC phải nhập lý do chênh lệch!
    - Cộng tồn thực tế vào kho đến (destination_warehouse).
    - Giảm số lượng hàng đang trên đường (in_transit_stock).
    - Ghi thẻ kho (InventoryHistory) nhập chuyển kho tại kho đến.
    - Khóa phiếu thành 'completed'.
    """
    transfer = db.query(StockTransfer).filter(
        or_(StockTransfer.id == transfer_id_or_code, StockTransfer.code == transfer_id_or_code)
    ).first()

    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu chuyển kho với mã '{transfer_id_or_code}'."
        )

    if transfer.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu chuyển kho này đã hoàn thành nhận hàng trước đó và đã được khóa."
        )

    if transfer.status != "in_transit":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Phiếu chuyển kho đang ở trạng thái '{transfer.status}', không thể nhận hàng (bắt buộc phải đang 'in_transit')."
        )

    now = datetime.now(timezone.utc)
    receiver = (
        req.received_by
        or ((current_user.full_name or current_user.username) if current_user else None)
        or "Thủ kho nhận"
    )

    # Ánh xạ danh sách món hàng trong phiếu
    items_by_pid = {item.product_id: item for item in transfer.items}
    receive_map = {str(r_itm.product_id): r_itm for r_itm in req.items}

    # SCRUM-573: Kiểm tra chênh lệch và bắt buộc nhập lý do
    has_any_discrepancy = False
    for item in transfer.items:
        r_info = receive_map.get(item.product_id)
        if not r_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Thiếu thông tin nhận hàng cho sản phẩm '{item.product_name}' (ID: {item.product_id})."
            )
        
        if r_info.received_quantity != item.transfer_quantity:
            has_any_discrepancy = True
            item_reason = (r_info.discrepancy_reason or "").strip()
            general_reason = (req.discrepancy_reason or "").strip()
            if not item_reason and not general_reason:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Phát hiện chênh lệch số lượng tại sản phẩm '{item.product_name}' "
                        f"(Xuất: {item.transfer_quantity}, Thực nhận: {r_info.received_quantity}). "
                        f"Bắt buộc phải nhập lý do giải trình chênh lệch!"
                    )
                )

    total_received = 0

    # Thực hiện cộng tồn và trừ in-transit
    for item in transfer.items:
        r_info = receive_map[item.product_id]
        item.received_quantity = r_info.received_quantity
        discrepancy = r_info.received_quantity - item.transfer_quantity
        item.discrepancy_quantity = discrepancy
        item.discrepancy_reason = (r_info.discrepancy_reason or req.discrepancy_reason or "").strip() or None

        total_received += r_info.received_quantity

        # 1. Trừ hàng đang trên đường (in-transit) tại kho đến
        dest_stock = get_or_create_warehouse_stock(db, transfer.destination_warehouse, item.product_id, item.sku)
        dest_stock.in_transit_stock = max(0, dest_stock.in_transit_stock - item.transfer_quantity)

        # 2. Cộng tồn kho thực nhận vào kho đến
        dest_stock.stock += r_info.received_quantity
        dest_stock.physical_stock += r_info.received_quantity

        # 3. Ghi thẻ kho (InventoryHistory) cho kho đến
        disc_text = f" (Chênh lệch: {discrepancy:+d}, Lý do: {item.discrepancy_reason})" if discrepancy != 0 else ""
        hist_id = f"HIST-TRF-IN-{int(now.timestamp() * 1000)}-{item.product_id}"
        history_record = InventoryHistory(
            id=hist_id,
            code=transfer.code,
            type="transfer",
            product_id=item.product_id,
            product_name=item.product_name,
            sku=item.sku,
            quantity=r_info.received_quantity,
            balance_after=dest_stock.stock,
            warehouse=transfer.destination_warehouse,
            performer=receiver,
            note=f"Nhập chuyển kho từ {transfer.source_warehouse} theo phiếu {transfer.code}{disc_text}"
        )
        db.add(history_record)

        # 4. Nếu có thiếu hụt mất mát (discrepancy < 0), giảm tồn kho toàn công ty trong ProductStockProfile
        if discrepancy < 0:
            profile = db.query(ProductStockProfile).filter(
                ProductStockProfile.product_id == item.product_id
            ).first()
            if profile:
                profile.stock = max(0, profile.stock + discrepancy)
                if profile.physical_stock is not None:
                    profile.physical_stock = max(0, profile.physical_stock + discrepancy)

    transfer.status = "completed"
    transfer.total_received_items = total_received
    transfer.has_discrepancy = has_any_discrepancy
    transfer.discrepancy_reason = req.discrepancy_reason or (
        next((it.discrepancy_reason for it in transfer.items if it.discrepancy_reason), None)
    )
    transfer.received_by = receiver
    transfer.received_at = now
    if req.note:
        transfer.note = (transfer.note + f" | Nhập kho: {req.note}") if transfer.note else req.note

    db.commit()
    db.refresh(transfer)
    return transfer


def cancel_stock_transfer(
    db: Session,
    transfer_id_or_code: str,
    req: Optional[StockTransferCancelRequest] = None,
    current_user: Optional[User] = None
) -> StockTransfer:
    """
    Hủy phiếu chuyển kho nội bộ.
    - Nếu là 'draft': Hủy bình thường.
    - Nếu là 'in_transit': Hoàn trả lại tồn kho cho kho xuất và hủy in-transit tại kho nhập.
    - Nếu là 'completed': CẤM hủy.
    """
    transfer = db.query(StockTransfer).filter(
        or_(StockTransfer.id == transfer_id_or_code, StockTransfer.code == transfer_id_or_code)
    ).first()

    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu chuyển kho với mã '{transfer_id_or_code}'."
        )

    if transfer.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể hủy phiếu chuyển kho đã hoàn thành nhập kho."
        )

    if transfer.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu chuyển kho này đã được hủy trước đó."
        )

    now = datetime.now(timezone.utc)
    canceller = (current_user.full_name or current_user.username) if current_user else "Quản lý kho"

    # Nếu đang in_transit thì hoàn lại số lượng về kho xuất
    if transfer.status == "in_transit":
        for item in transfer.items:
            src_stock = get_or_create_warehouse_stock(db, transfer.source_warehouse, item.product_id, item.sku)
            src_stock.stock += item.transfer_quantity
            src_stock.physical_stock += item.transfer_quantity

            dest_stock = get_or_create_warehouse_stock(db, transfer.destination_warehouse, item.product_id, item.sku)
            dest_stock.in_transit_stock = max(0, dest_stock.in_transit_stock - item.transfer_quantity)

            # Ghi thẻ kho hoàn trả
            hist_id = f"HIST-TRF-CNL-{int(now.timestamp() * 1000)}-{item.product_id}"
            history_record = InventoryHistory(
                id=hist_id,
                code=transfer.code,
                type="transfer",
                product_id=item.product_id,
                product_name=item.product_name,
                sku=item.sku,
                quantity=item.transfer_quantity,
                balance_after=src_stock.stock,
                warehouse=transfer.source_warehouse,
                performer=canceller,
                note=f"Hoàn trả tồn do hủy phiếu chuyển kho {transfer.code}"
            )
            db.add(history_record)

    transfer.status = "cancelled"
    transfer.cancelled_by = canceller
    transfer.cancelled_at = now
    transfer.cancel_reason = req.cancel_reason if req else "Người dùng hủy phiếu"

    db.commit()
    db.refresh(transfer)
    return transfer


def get_stock_transfers(
    db: Session,
    source_warehouse: Optional[str] = None,
    destination_warehouse: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[StockTransfer]:
    """Lấy danh sách phiếu chuyển kho kèm bộ lọc (SCRUM-574)."""
    query = db.query(StockTransfer)

    if source_warehouse and source_warehouse not in ("all", "Tất cả kho", "Tất cả"):
        query = query.filter(StockTransfer.source_warehouse == source_warehouse)

    if destination_warehouse and destination_warehouse not in ("all", "Tất cả kho", "Tất cả"):
        query = query.filter(StockTransfer.destination_warehouse == destination_warehouse)

    if status_filter and status_filter not in ("all", "Tất cả"):
        query = query.filter(StockTransfer.status == status_filter)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                StockTransfer.code.ilike(term),
                StockTransfer.source_warehouse.ilike(term),
                StockTransfer.destination_warehouse.ilike(term),
                StockTransfer.note.ilike(term),
                StockTransfer.created_by.ilike(term),
            )
        )

    return query.order_by(desc(StockTransfer.created_at)).offset(skip).limit(limit).all()


def get_stock_transfer_by_id_or_code(db: Session, id_or_code: str) -> StockTransfer:
    """Lấy chi tiết 1 phiếu chuyển kho."""
    transfer = db.query(StockTransfer).filter(
        or_(StockTransfer.id == id_or_code, StockTransfer.code == id_or_code)
    ).first()

    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu chuyển kho '{id_or_code}'."
        )
    return transfer


def get_in_transit_summary(
    db: Session,
    warehouse: Optional[str] = None
) -> List[InTransitSummaryItem]:
    """
    Thống kê tổng hợp các mặt hàng đang trên đường vận chuyển (SCRUM-575).
    """
    query = db.query(StockTransfer).filter(StockTransfer.status == "in_transit")
    if warehouse and warehouse != "all":
        query = query.filter(
            or_(
                StockTransfer.source_warehouse == warehouse,
                StockTransfer.destination_warehouse == warehouse
            )
        )

    transfers = query.order_by(desc(StockTransfer.shipped_at)).all()
    results: List[InTransitSummaryItem] = []

    for trf in transfers:
        for itm in trf.items:
            results.append(
                InTransitSummaryItem(
                    transfer_id=trf.id,
                    transfer_code=trf.code,
                    source_warehouse=trf.source_warehouse,
                    destination_warehouse=trf.destination_warehouse,
                    product_id=itm.product_id,
                    sku=itm.sku,
                    product_name=itm.product_name,
                    unit=itm.unit,
                    in_transit_quantity=itm.transfer_quantity,
                    shipped_at=trf.shipped_at,
                    created_by=trf.created_by
                )
            )

    return results


def get_all_warehouse_stocks(
    db: Session,
    warehouse: Optional[str] = None
) -> List[Any]:
    """Lấy tồn kho chi tiết theo từng kho hàng, kèm thông tin tên sản phẩm, giá vốn thực tế."""
    query = db.query(WarehouseStock)
    if warehouse and warehouse != "all":
        query = query.filter(WarehouseStock.warehouse == warehouse)
    stocks = query.order_by(WarehouseStock.warehouse, WarehouseStock.sku).all()

    # Tạo bản đồ thông tin sản phẩm từ Product
    prod_ids = [s.product_id for s in stocks]
    products = db.query(Product).filter(Product.id.in_(prod_ids)).all()
    prod_map = {str(p.id): p for p in products}

    results = []
    for s in stocks:
        p = prod_map.get(str(s.product_id))
        cost = float(p.cost_price) if p and getattr(p, "cost_price", None) else (
            round(float(p.sale_price) * 0.8, -3) if p and getattr(p, "sale_price", None) else 0.0
        )
        if not cost or cost <= 0:
            name_check = (p.name if p and getattr(p, "name", None) else (s.sku or "")).lower()
            if any(k in name_check for k in ["laptop", "dell", "macbook", "máy tính"]):
                cost = 20000000.0
            elif any(k in name_check for k in ["iphone", "samsung", "điện thoại"]):
                cost = 18000000.0
            elif any(k in name_check for k in ["màn hình", "ultrasharp", "monitor"]):
                cost = 9000000.0
            elif any(k in name_check for k in ["tai nghe", "airpods"]):
                cost = 3500000.0
            elif any(k in name_check for k in ["chuột", "phím", "mouse", "keyboard"]):
                cost = 1500000.0
            else:
                cost = 1000000.0
        unit_val = p.unit if p and getattr(p, "unit", None) else "Chiếc"
        name_val = p.name if p and getattr(p, "name", None) else f"Sản phẩm {s.sku or s.product_id}"

        item_dict = {
            "id": s.id,
            "warehouse": s.warehouse,
            "product_id": s.product_id,
            "sku": s.sku or (p.sku if p else ""),
            "product_name": name_val,
            "unit": unit_val,
            "cost_price": cost,
            "stock": s.stock,
            "physical_stock": s.physical_stock,
            "in_transit_stock": s.in_transit_stock,
            "updated_at": s.updated_at,
        }
        results.append(item_dict)

    return results
