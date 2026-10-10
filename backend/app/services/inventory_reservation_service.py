from typing import List, Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.product import Product
from app.models.customer import Customer
from app.models.order import Order
from app.models.product_stock_profile import ProductStockProfile
from app.models.stock_reservation import StockReservation
from app.models.customer_warehouse_profile import CustomerWarehouseProfile
from app.schemas.inventory_reservation import (
    SkuAvailabilityResponse,
    CheckOrderAvailabilityRequest,
    CheckOrderAvailabilityResponse,
    LineItemAvailabilityResult,
    CustomerWarehouseProfileCreate,
)

DEFAULT_WAREHOUSE_NAME = "Kho Tổng Hà Nội"
DEFAULT_WAREHOUSE_CODE = "WH-HANOI"


def get_customer_servicing_warehouse(db: Session, customer_id: str) -> Tuple[str, str]:
    """
    Tra cứu kho phục vụ của đại lý (SCRUM-505).
    1. Ưu tiên tra cứu cấu hình riêng trong bảng CustomerWarehouseProfile.
    2. Nếu chưa gán, suy luận theo khu vực (region) của khách hàng.
    3. Mặc định fallback về Kho Tổng Hà Nội.
    """
    if not customer_id:
        return DEFAULT_WAREHOUSE_NAME, DEFAULT_WAREHOUSE_CODE

    prof = db.query(CustomerWarehouseProfile).filter(
        CustomerWarehouseProfile.customer_id == customer_id
    ).first()
    if prof:
        return prof.warehouse_name, prof.warehouse_code

    cust = db.query(Customer).filter(
        or_(Customer.id == customer_id, Customer.code == customer_id)
    ).first()
    if cust and cust.region:
        region_clean = cust.region.strip().lower()
        if "trung" in region_clean or "đà nẵng" in region_clean:
            return "Kho Đà Nẵng", "WH-DANANG"
        elif "nam" in region_clean or "hồ chí minh" in region_clean or "sg" in region_clean:
            return "Kho Tổng TP.HCM", "WH-HCM"

    return DEFAULT_WAREHOUSE_NAME, DEFAULT_WAREHOUSE_CODE


def assign_customer_servicing_warehouse(
    db: Session,
    data: CustomerWarehouseProfileCreate
) -> CustomerWarehouseProfile:
    """Gán hoặc cập nhật kho phục vụ mặc định cho đại lý (SCRUM-505)."""
    prof = db.query(CustomerWarehouseProfile).filter(
        CustomerWarehouseProfile.customer_id == data.customer_id
    ).first()

    if prof:
        prof.warehouse_name = data.warehouse_name
        prof.warehouse_code = data.warehouse_code
        prof.is_default = data.is_default
        prof.notes = data.notes
        prof.updated_at = datetime.now(timezone.utc)
    else:
        prof = CustomerWarehouseProfile(
            customer_id=data.customer_id,
            warehouse_name=data.warehouse_name,
            warehouse_code=data.warehouse_code,
            is_default=data.is_default,
            notes=data.notes,
        )
        db.add(prof)

    db.commit()
    db.refresh(prof)
    return prof


def get_or_create_product_stock_profile(
    db: Session,
    product: Product,
    warehouse_name: str = DEFAULT_WAREHOUSE_NAME,
    for_update: bool = False
) -> ProductStockProfile:
    """Lấy hoặc khởi tạo ProductStockProfile cho sản phẩm, hỗ trợ Pessimistic Lock."""
    query = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == product.id)
    if for_update:
        # Khóa dòng bi quan (Pessimistic Lock) chống Race Condition khi nhiều người cùng chốt đơn
        query = query.with_for_update()

    profile = query.first()
    if not profile:
        initial_physical = int(product.stock if product.stock is not None else 100)
        profile = ProductStockProfile(
            product_id=product.id,
            sku=product.sku,
            stock=initial_physical,
            physical_stock=initial_physical,
            reserved_stock=0,
            min_stock=int(product.min_stock if product.min_stock is not None else 10),
            warehouse=warehouse_name,
        )
        db.add(profile)
        db.flush()
    else:
        # Đồng bộ physical_stock nếu đang null hoặc nếu stock bị gán cao hơn physical_stock (do cập nhật stock ngoài luồng)
        current_reserved = int(profile.reserved_stock or 0)
        current_stock = int(profile.stock or 0)
        if profile.physical_stock is None or profile.physical_stock < (current_stock + current_reserved):
            profile.physical_stock = current_stock + current_reserved

    return profile


def calculate_sku_availability(
    db: Session,
    customer_id: Optional[str] = None,
    product_id: Optional[str] = None,
    sku: Optional[str] = None,
    warehouse_name: Optional[str] = None,
    for_update: bool = False,
) -> SkuAvailabilityResponse:
    """
    Tính toán tồn khả dụng theo kho phục vụ cho từng SKU (SCRUM-505, SCRUM-507).
    Công thức: Tồn khả dụng = Tồn thực tế - Tồn đang giữ chỗ (Available = Physical - Reserved)
    """
    if warehouse_name:
        wh_name = warehouse_name
        wh_code = "WH-HANOI" if "Hà Nội" in wh_name else ("WH-DANANG" if "Đà Nẵng" in wh_name else "WH-DEFAULT")
    elif customer_id:
        wh_name, wh_code = get_customer_servicing_warehouse(db, customer_id)
    else:
        wh_name, wh_code = DEFAULT_WAREHOUSE_NAME, DEFAULT_WAREHOUSE_CODE

    # Tìm sản phẩm
    prod = None
    if product_id:
        str_pid = str(product_id).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        else:
            prod = db.query(Product).filter(Product.id == str_pid).first()
    if not prod and sku:
        prod = db.query(Product).filter(Product.sku == sku.strip()).first()

    if not prod:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm với id='{product_id}' hoặc sku='{sku}'."
        )

    # Lấy hồ sơ tồn kho
    profile = get_or_create_product_stock_profile(db, prod, warehouse_name=wh_name, for_update=for_update)

    # Tính tồn giữ chỗ từ bảng stock_reservations
    active_reserved_sum = db.query(func.coalesce(func.sum(StockReservation.reserved_quantity), 0)).filter(
        StockReservation.status == "active",
        StockReservation.warehouse == wh_name,
        or_(StockReservation.product_id == str(prod.id), StockReservation.sku == prod.sku)
    ).scalar() or 0

    physical = int(profile.physical_stock if profile.physical_stock is not None else profile.stock)
    reserved = int(active_reserved_sum)
    available = max(0, physical - reserved)

    # Cập nhật ngược lại profile để đảm bảo nhất quán
    profile.reserved_stock = reserved
    profile.stock = available

    min_stock = int(profile.min_stock or 0)
    is_out_of_stock = (available == 0)
    is_low_stock = (available <= min_stock and not is_out_of_stock)

    return SkuAvailabilityResponse(
        product_id=str(prod.id),
        sku=prod.sku or "",
        product_name=prod.name or "",
        unit=prod.unit or "cái",
        warehouse_name=wh_name,
        warehouse_code=wh_code,
        physical_stock=physical,
        reserved_stock=reserved,
        available_stock=available,
        min_stock=min_stock,
        max_orderable_quantity=available,
        is_low_stock=is_low_stock,
        is_out_of_stock=is_out_of_stock,
    )


def check_order_items_availability(
    db: Session,
    req: CheckOrderAvailabilityRequest
) -> CheckOrderAvailabilityResponse:
    """
    Kiểm tra tồn khả dụng cho danh sách các dòng mặt hàng trong đơn (SCRUM-506, SCRUM-507).
    Chặn khi số lượng vượt tồn khả dụng và trả về số lượng tối đa còn đặt được.
    """
    if req.warehouse_name:
        wh_name = req.warehouse_name
        wh_code = "WH-HANOI" if "Hà Nội" in wh_name else ("WH-DANANG" if "Đà Nẵng" in wh_name else "WH-DEFAULT")
    else:
        wh_name, wh_code = get_customer_servicing_warehouse(db, req.customer_id)

    item_results: List[LineItemAvailabilityResult] = []
    all_available = True
    exceeded_messages = []

    for item in req.items:
        try:
            avail = calculate_sku_availability(
                db=db,
                customer_id=req.customer_id,
                product_id=item.product_id,
                sku=item.sku,
                warehouse_name=wh_name,
                for_update=False
            )
            is_item_ok = (item.quantity <= avail.available_stock)
            warn_msg = None

            if not is_item_ok:
                all_available = False
                warn_msg = (
                    f"Sản phẩm '{avail.product_name}' (SKU: {avail.sku}) tại '{wh_name}' "
                    f"chỉ còn tồn khả dụng {avail.available_stock} {avail.unit} "
                    f"(bạn đang đặt {item.quantity} {avail.unit}). "
                    f"Gợi ý số lượng tối đa còn đặt được: {avail.max_orderable_quantity} {avail.unit}."
                )
                exceeded_messages.append(warn_msg)

            item_results.append(LineItemAvailabilityResult(
                product_id=avail.product_id,
                sku=avail.sku,
                product_name=avail.product_name,
                unit=avail.unit,
                requested_quantity=item.quantity,
                physical_stock=avail.physical_stock,
                reserved_stock=avail.reserved_stock,
                available_stock=avail.available_stock,
                max_orderable_quantity=avail.max_orderable_quantity,
                warehouse_name=wh_name,
                warehouse_code=wh_code,
                is_available=is_item_ok,
                warning_message=warn_msg
            ))
        except HTTPException as e:
            all_available = False
            item_results.append(LineItemAvailabilityResult(
                product_id=str(item.product_id or ""),
                sku=item.sku or "",
                product_name="Không tìm thấy",
                unit="cái",
                requested_quantity=item.quantity,
                physical_stock=0,
                reserved_stock=0,
                available_stock=0,
                max_orderable_quantity=0,
                warehouse_name=wh_name,
                warehouse_code=wh_code,
                is_available=False,
                warning_message=e.detail
            ))

    summary = "; ".join(exceeded_messages) if exceeded_messages else None

    return CheckOrderAvailabilityResponse(
        customer_id=req.customer_id,
        warehouse_name=wh_name,
        warehouse_code=wh_code,
        all_items_available=all_available,
        items=item_results,
        summary_message=summary
    )


def reserve_stock_for_order(
    db: Session,
    order: Order,
    warehouse_name: Optional[str] = None
) -> List[StockReservation]:
    """
    Cơ chế giữ chỗ và cập nhật tồn an toàn khi chốt đơn (SCRUM-504, SCRUM-506).
    - Sử dụng Pessimistic Locking (with_for_update) trên từng dòng sản phẩm.
    - Chống Race Condition khi nhiều nhân viên cùng chốt đơn đồng thời trên SKU sắp hết.
    - Chặn ngay tại chỗ (raise HTTPException 400) nếu vượt tồn khả dụng, trả về số lượng tối đa còn đặt được.
    """
    if warehouse_name:
        wh_name = warehouse_name
    elif order.customer_id:
        wh_name, _ = get_customer_servicing_warehouse(db, order.customer_id)
    else:
        wh_name = DEFAULT_WAREHOUSE_NAME

    reservations: List[StockReservation] = []

    for item in order.items:
        prod = None
        str_pid = str(item.product_id).strip()
        if str_pid.isdigit():
            prod = db.query(Product).filter(Product.id == int(str_pid)).first()
        else:
            prod = db.query(Product).filter(Product.id == str_pid).first()
        if not prod and item.sku:
            prod = db.query(Product).filter(Product.sku == item.sku).first()

        if not prod:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy sản phẩm '{item.name}' (SKU: {item.sku}) để giữ chỗ tồn kho."
            )

        # 1. Khóa bi quan (with_for_update) dòng ProductStockProfile
        profile = get_or_create_product_stock_profile(db, prod, warehouse_name=wh_name, for_update=True)

        # 2. Tính lại tồn giữ chỗ đang có thực tế ngay dưới dòng khóa
        active_reserved_sum = db.query(func.coalesce(func.sum(StockReservation.reserved_quantity), 0)).filter(
            StockReservation.status == "active",
            StockReservation.warehouse == wh_name,
            or_(StockReservation.product_id == str(prod.id), StockReservation.sku == prod.sku)
        ).scalar() or 0

        # Nếu physical_stock chưa đồng bộ khi stock bị sửa trực tiếp bởi module/test khác
        current_reserved = int(active_reserved_sum)
        current_stock = int(profile.stock or 0)
        if profile.physical_stock is None or profile.physical_stock < (current_stock + current_reserved):
            profile.physical_stock = current_stock + current_reserved

        physical = int(profile.physical_stock)
        available = max(0, physical - current_reserved)

        # 3. SCRUM-506: Chặn chốt đơn nếu số lượng vượt tồn khả dụng
        if item.quantity > available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Sản phẩm '{prod.name}' (SKU: {prod.sku}) tại '{wh_name}' không đủ tồn khả dụng "
                    f"(Còn {available} {prod.unit or 'cái'}, bạn yêu cầu {item.quantity}). "
                    f"Số lượng tối đa còn có thể đặt: {available}."
                )
            )

        # 4. Ghi nhận giữ chỗ vào bảng stock_reservations
        res = StockReservation(
            order_id=order.id,
            order_code=order.code,
            product_id=str(prod.id),
            sku=prod.sku,
            warehouse=wh_name,
            reserved_quantity=item.quantity,
            status="active",
            note=f"Giữ chỗ cho đơn hàng {order.code} ({order.customer_name})"
        )
        db.add(res)
        reservations.append(res)

        # 5. Cập nhật tồn giữ chỗ và tồn khả dụng trên profile
        new_reserved = int(active_reserved_sum) + item.quantity
        profile.reserved_stock = new_reserved
        profile.stock = max(0, physical - new_reserved)

        if profile.stock == 0:
            prod.status = "out_of_stock"
        elif profile.stock <= profile.min_stock:
            prod.status = "low_stock"

    db.flush()
    return reservations


def release_stock_reservations_for_order(
    db: Session,
    order_id: str
):
    """
    Hủy giữ chỗ khi đơn hàng bị hủy (SCRUM-504, S4-06).
    Chuyển trạng thái reservation từ 'active' -> 'released' và nhả lại tồn khả dụng.
    """
    active_res = db.query(StockReservation).filter(
        StockReservation.order_id == order_id,
        StockReservation.status == "active"
    ).all()

    if active_res:
        for res in active_res:
            res.status = "released"
            res.updated_at = datetime.now(timezone.utc)

            # Khóa profile và nhả tồn giữ chỗ
            prod = db.query(Product).filter(
                or_(Product.id == res.product_id, Product.sku == res.sku)
            ).first()
            if prod:
                profile = get_or_create_product_stock_profile(db, prod, warehouse_name=res.warehouse, for_update=True)
                physical = int(profile.physical_stock if profile.physical_stock is not None else profile.stock)
                new_reserved = max(0, int(profile.reserved_stock or 0) - res.reserved_quantity)
                profile.reserved_stock = new_reserved
                profile.stock = max(0, physical - new_reserved)

                if profile.stock > profile.min_stock:
                    prod.status = "active"
                elif profile.stock > 0:
                    prod.status = "low_stock"
    else:
        # Fallback cho đơn hàng tạo từ trước khi có bản ghi giữ chỗ
        order = db.query(Order).filter((Order.id == order_id) | (Order.code == order_id)).first()
        if order and order.items:
            for itm in order.items:
                prod = db.query(Product).filter(or_(Product.id == itm.product_id, Product.sku == itm.sku)).first()
                if prod:
                    profile = get_or_create_product_stock_profile(db, prod, for_update=True)
                    profile.stock += itm.quantity
                    if profile.physical_stock is not None:
                        profile.physical_stock += itm.quantity
                    if profile.stock > profile.min_stock:
                        prod.status = "active"
                    elif profile.stock > 0:
                        prod.status = "low_stock"

    db.flush()


def fulfill_stock_reservations_for_order(
    db: Session,
    order_id: str
):
    """
    Hoàn tất giữ chỗ khi đơn hàng xuất kho giao hàng (status -> shipping / completed).
    Chuyển trạng thái reservation từ 'active' -> 'fulfilled', đồng thời trừ tồn vật lý (physical_stock).
    """
    active_res = db.query(StockReservation).filter(
        StockReservation.order_id == order_id,
        StockReservation.status == "active"
    ).all()

    for res in active_res:
        res.status = "fulfilled"
        res.updated_at = datetime.now(timezone.utc)

        prod = db.query(Product).filter(
            or_(Product.id == res.product_id, Product.sku == res.sku)
        ).first()
        if prod:
            profile = get_or_create_product_stock_profile(db, prod, warehouse_name=res.warehouse, for_update=True)
            # Trừ tồn vật lý
            current_physical = int(profile.physical_stock if profile.physical_stock is not None else profile.stock)
            profile.physical_stock = max(0, current_physical - res.reserved_quantity)
            profile.reserved_stock = max(0, int(profile.reserved_stock or 0) - res.reserved_quantity)
            profile.stock = max(0, profile.physical_stock - profile.reserved_stock)

    db.flush()
