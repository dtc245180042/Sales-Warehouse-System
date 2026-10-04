from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.customer import Customer
from app.models.price_list import PriceList
from app.schemas.order import OrderCreate, OrderStatusUpdate
from app.services.product_service import ensure_seed_products
from app.services.customer_service import ensure_seed_customers

SEED_ORDERS = [
    {
        "id": "ORD-001",
        "code": "DH-2026-001",
        "customer_id": "CUS-001",
        "customer_name": "Nguyễn Quốc Cường",
        "customer_phone": "0903112233",
        "customer_address": "128 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. HCM",
        "subtotal": 32680000.0,
        "discount": 500000.0,
        "tax": 0.0,
        "total": 32180000.0,
        "paid_amount": 32180000.0,
        "change_amount": 0.0,
        "payment_method": "transfer",
        "payment_status": "paid",
        "status": "completed",
        "staff_id": "USR-003",
        "staff_name": "Lê Thị Nhân Viên Kinh Doanh",
        "note": "Giao giờ hành chính, gọi trước 15 phút.",
        "created_at": datetime(2026, 10, 1, 10, 15, tzinfo=timezone.utc),
        "items": [
            {
                "product_id": "PRD-001",
                "sku": "IP15P-128-TI",
                "name": "iPhone 15 Pro 128GB Titan Tự Nhiên",
                "price": 26990000.0,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": 26990000.0
            },
            {
                "product_id": "PRD-006",
                "sku": "AP-PRO-2-USBC",
                "name": "AirPods Pro 2 USB-C MagSafe Case",
                "price": 5690000.0,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": 5690000.0
            }
        ]
    },
    {
        "id": "ORD-002",
        "code": "DH-2026-002",
        "customer_id": "CUS-002",
        "customer_name": "Trần Mai Phương",
        "customer_phone": "0918223344",
        "customer_address": "45 Phố Tràng Tiền, Hoàn Kiếm, Hà Nội",
        "subtotal": 34780000.0,
        "discount": 500000.0,
        "tax": 0.0,
        "total": 34280000.0,
        "paid_amount": 34280000.0,
        "change_amount": 0.0,
        "payment_method": "card",
        "payment_status": "paid",
        "status": "shipping",
        "staff_id": "USR-003",
        "staff_name": "Lê Thị Nhân Viên Kinh Doanh",
        "note": "Đóng gói bọc bóng khí cẩn thận.",
        "created_at": datetime(2026, 10, 1, 9, 40, tzinfo=timezone.utc),
        "items": [
            {
                "product_id": "PRD-003",
                "sku": "MBA-M3-16-512",
                "name": "MacBook Air 13 inch M3 Midnight",
                "price": 32490000.0,
                "quantity": 1,
                "discount": 500000.0,
                "subtotal": 31990000.0
            },
            {
                "product_id": "PRD-007",
                "sku": "LOGI-MXM3S-GR",
                "name": "Chuột Logitech MX Master 3S",
                "price": 2290000.0,
                "quantity": 1,
                "discount": 0.0,
                "subtotal": 2290000.0
            }
        ]
    }
]


def ensure_seed_orders(db: Session):
    ensure_seed_products(db)
    ensure_seed_customers(db)
    if db.query(Order).count() == 0:
        for o_data in SEED_ORDERS:
            items_data = o_data.pop("items")
            order = Order(**o_data)
            for itm in items_data:
                order.items.append(OrderItem(**itm))
            db.add(order)
        db.commit()


def get_all_orders(
    db: Session,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> List[Order]:
    ensure_seed_orders(db)
    query = db.query(Order)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Order.code.ilike(s)) | (Order.customer_name.ilike(s)) | (Order.customer_phone.ilike(s))
        )
    if status_filter and status_filter != "all":
        query = query.filter(Order.status == status_filter)
    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
    return query.order_by(Order.created_at.desc()).all()


def get_order_by_id(db: Session, order_id: str) -> Order:
    ensure_seed_orders(db)
    order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng '{order_id}'."
        )
    return order


def create_order(db: Session, order_in: OrderCreate) -> Order:
    ensure_seed_orders(db)
    count = db.query(Order).count() + 1
    order_id = f"ORD-{str(count).zfill(3)}"
    order_code = f"DH-2026-{str(count).zfill(3)}"

    # 1. Trừ tồn kho và kiểm tra tính hợp lệ
    for item in order_in.items:
        prod = db.query(Product).filter(Product.id == item.product_id).first()
        if prod:
            if prod.stock < item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sản phẩm '{prod.name}' không đủ tồn kho (Còn {prod.stock}, yêu cầu {item.quantity})."
                )
            prod.stock = max(0, prod.stock - item.quantity)
            if prod.stock == 0:
                prod.status = "out_of_stock"
            elif prod.stock <= prod.min_stock:
                prod.status = "low_stock"

    # 2. Tạo đơn hàng
    order_data = order_in.model_dump(exclude={"items"})
    order_data["id"] = order_id
    order_data["code"] = order_code

    new_order = Order(**order_data)
    for itm in order_in.items:
        new_order.items.append(OrderItem(**itm.model_dump()))

    db.add(new_order)

    # 3. Khóa bảng giá nếu có liên kết (SCRUM-416)
    if order_in.price_list_id:
        pl = db.query(PriceList).filter(PriceList.id == order_in.price_list_id).first()
        if pl:
            pl.has_orders = True
            pl.orders_count += 1

    # 4. Cập nhật chi tiêu của khách hàng
    cus = db.query(Customer).filter(Customer.id == order_in.customer_id).first()
    if cus:
        cus.total_orders += 1
        cus.total_spent += order_in.total
        cus.last_order_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    db.commit()
    db.refresh(new_order)
    return new_order


def update_order_status(db: Session, order_id: str, new_status: str) -> Order:
    order = get_order_by_id(db, order_id)
    old_status = order.status

    # Nếu chuyển sang hủy từ trạng thái chưa hủy, hoàn lại tồn kho
    if new_status == "cancelled" and old_status != "cancelled":
        for itm in order.items:
            prod = db.query(Product).filter(Product.id == itm.product_id).first()
            if prod:
                prod.stock += itm.quantity
                if prod.stock > prod.min_stock:
                    prod.status = "active"
                elif prod.stock > 0:
                    prod.status = "low_stock"

    order.status = new_status
    db.commit()
    db.refresh(order)
    return order


def cancel_order(db: Session, order_id: str) -> Order:
    return update_order_status(db, order_id, "cancelled")
