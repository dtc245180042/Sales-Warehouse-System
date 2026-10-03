from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate

SEED_PRODUCTS = [
    {
        "id": "PRD-001",
        "sku": "IP15P-128-TI",
        "barcode": "893850123001",
        "name": "iPhone 15 Pro 128GB Titan Tự Nhiên",
        "category": "Điện Thoại & Tablet",
        "supplier_id": "SUP-001",
        "supplier_name": "Apple Distribution VN",
        "cost_price": 22500000.0,
        "sale_price": 26990000.0,
        "stock": 24,
        "min_stock": 5,
        "unit": "Chiếc",
        "image": "/images/products/PRD-001-iphone-15-pro.jpg",
        "description": "Chip A17 Pro mạnh mẽ, khung viền titan siêu nhẹ và bền bỉ.",
        "status": "active"
    },
    {
        "id": "PRD-002",
        "sku": "SAM-S24U-512",
        "barcode": "893850123002",
        "name": "Samsung Galaxy S24 Ultra 512GB Gray",
        "category": "Điện Thoại & Tablet",
        "supplier_id": "SUP-002",
        "supplier_name": "Samsung Electronics Vina",
        "cost_price": 25000000.0,
        "sale_price": 29990000.0,
        "stock": 15,
        "min_stock": 4,
        "unit": "Chiếc",
        "image": "/images/products/PRD-002-samsung-s24-ultra.jpg",
        "description": "Galaxy AI tích hợp sẵn, màn hình phẳng 6.8 inch Dynamic AMOLED 2X.",
        "status": "active"
    },
    {
        "id": "PRD-003",
        "sku": "MBA-M3-16-512",
        "barcode": "893850123003",
        "name": "MacBook Air 13 inch M3 16GB/512GB Midnight",
        "category": "Laptop & Máy Tính",
        "supplier_id": "SUP-001",
        "supplier_name": "Apple Distribution VN",
        "cost_price": 28000000.0,
        "sale_price": 32490000.0,
        "stock": 8,
        "min_stock": 3,
        "unit": "Chiếc",
        "image": "/images/products/PRD-003-macbook-air-m3.jpg",
        "description": "Chip Apple M3 8-core CPU, 10-core GPU, bộ nhớ RAM 16GB mượt mà.",
        "status": "active"
    },
    {
        "id": "PRD-004",
        "sku": "DELL-XPS13-PLUS",
        "barcode": "893850123004",
        "name": "Dell XPS 13 Plus 9320 i7-1360P 16GB/1TB OLED",
        "category": "Laptop & Máy Tính",
        "supplier_id": "SUP-003",
        "supplier_name": "Dell Global Solution VN",
        "cost_price": 34000000.0,
        "sale_price": 39990000.0,
        "stock": 5,
        "min_stock": 2,
        "unit": "Chiếc",
        "image": "/images/products/PRD-004-dell-xps-13.jpg",
        "description": "Màn hình cảm ứng OLED 3.5K sắc nét, bàn phím tràn viền hiện đại.",
        "status": "active"
    },
    {
        "id": "PRD-005",
        "sku": "SN-WH1000XM5-BK",
        "barcode": "893850123005",
        "name": "Tai nghe Sony WH-1000XM5 Black",
        "category": "Thiết Bị Âm Thanh",
        "supplier_id": "SUP-004",
        "supplier_name": "Sony Vietnam Audio",
        "cost_price": 6200000.0,
        "sale_price": 7990000.0,
        "stock": 18,
        "min_stock": 5,
        "unit": "Chiếc",
        "image": "/images/products/PRD-005-sony-wh1000xm5.jpg",
        "description": "Chống ồn chủ động đỉnh cao số 1 thế giới với 2 bộ xử lý và 8 micro.",
        "status": "active"
    },
    {
        "id": "PRD-006",
        "sku": "AP-PRO-2-USBC",
        "barcode": "893850123006",
        "name": "AirPods Pro 2 USB-C MagSafe Case",
        "category": "Thiết Bị Âm Thanh",
        "supplier_id": "SUP-001",
        "supplier_name": "Apple Distribution VN",
        "cost_price": 4600000.0,
        "sale_price": 5690000.0,
        "stock": 35,
        "min_stock": 10,
        "unit": "Chiếc",
        "image": "/images/products/PRD-006-airpods-pro-2.jpg",
        "description": "Cổng sạc Type-C tiêu chuẩn mới, chip H2 lọc tiếng ồn thích ứng.",
        "status": "active"
    },
    {
        "id": "PRD-007",
        "sku": "LOGI-MXM3S-GR",
        "barcode": "893850123007",
        "name": "Chuột không dây Logitech MX Master 3S Graphite",
        "category": "Phụ Kiện Công Nghệ",
        "supplier_id": "SUP-005",
        "supplier_name": "Logitech Official Partner",
        "cost_price": 1750000.0,
        "sale_price": 2290000.0,
        "stock": 42,
        "min_stock": 8,
        "unit": "Chiếc",
        "image": "/images/products/PRD-007-logitech-mx-master-3s.jpg",
        "description": "Cảm biến 8K DPI Darkfield lướt trên mọi bề mặt, nút bấm yên tĩnh 90%.",
        "status": "active"
    },
    {
        "id": "PRD-008",
        "sku": "KC-K2PRO-RGB",
        "barcode": "893850123008",
        "name": "Bàn phím cơ Keychron K2 Pro QMK/VIA RGB Brown Switch",
        "category": "Phụ Kiện Công Nghệ",
        "supplier_id": "SUP-005",
        "supplier_name": "Logitech Official Partner",
        "cost_price": 1900000.0,
        "sale_price": 2490000.0,
        "stock": 12,
        "min_stock": 4,
        "unit": "Chiếc",
        "image": "/images/products/PRD-008-keychron-k2-pro.jpg",
        "description": "Bàn phím cơ tùy biến không dây layout 75%, keycap PBT doubleshot.",
        "status": "active"
    },
    {
        "id": "PRD-009",
        "sku": "DELL-U2723QE-4K",
        "barcode": "893850123009",
        "name": "Màn hình Dell UltraSharp U2723QE 27 inch 4K IPS Black",
        "category": "Laptop & Máy Tính",
        "supplier_id": "SUP-003",
        "supplier_name": "Dell Global Solution VN",
        "cost_price": 10800000.0,
        "sale_price": 12890000.0,
        "stock": 7,
        "min_stock": 2,
        "unit": "Chiếc",
        "image": "/images/products/PRD-009-dell-u2723qe.jpg",
        "description": "Tấm nền IPS Black độ tương phản 2000:1, chuẩn màu đồ họa chuyên nghiệp.",
        "status": "active"
    },
    {
        "id": "PRD-010",
        "sku": "ROBO-S8-PRO-ULT",
        "barcode": "893850123010",
        "name": "Robot hút bụi lau nhà Roborock S8 Pro Ultra",
        "category": "Gia Dụng Thông Minh",
        "supplier_id": "SUP-006",
        "supplier_name": "Xiaomi SmartHome VN",
        "cost_price": 18500000.0,
        "sale_price": 22490000.0,
        "stock": 6,
        "min_stock": 2,
        "unit": "Chiếc",
        "image": "/images/products/PRD-010-roborock-s8-pro-ultra.jpg",
        "description": "Trạm sạc đa năng tự giặt sấy giẻ, lực hút siêu mạnh 6000Pa.",
        "status": "active"
    },
]


def ensure_seed_products(db: Session):
    """Tự động chèn danh mục sản phẩm mẫu nếu bảng products chưa có dữ liệu."""
    if db.query(Product).count() == 0:
        for p_data in SEED_PRODUCTS:
            db.add(Product(**p_data))
        db.commit()


def get_all_products(
    db: Session,
    search: Optional[str] = None,
    category: Optional[str] = None,
    stock_status: Optional[str] = None,
) -> List[Product]:
    ensure_seed_products(db)
    query = db.query(Product)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Product.name.ilike(s)) | (Product.sku.ilike(s)) | (Product.barcode.ilike(s))
        )
    if category and category != "Tất cả danh mục":
        query = query.filter(Product.category == category)
    if stock_status and stock_status != "all":
        query = query.filter(Product.status == stock_status)
    return query.order_by(Product.id.asc()).all()


def get_product_by_id(db: Session, product_id: str) -> Product:
    ensure_seed_products(db)
    prod = db.query(Product).filter(
        (Product.id == product_id) | (Product.sku == product_id) | (Product.barcode == product_id)
    ).first()
    if not prod:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm với mã '{product_id}'."
        )
    return prod


def create_product(db: Session, product_in: ProductCreate) -> Product:
    ensure_seed_products(db)
    # Kiểm tra trùng SKU
    if db.query(Product).filter(Product.sku == product_in.sku).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã SKU '{product_in.sku}' đã tồn tại trong hệ thống."
        )
    prod_id = product_in.id
    if not prod_id:
        count = db.query(Product).count() + 1
        prod_id = f"PRD-{str(count).zfill(3)}"
    
    prod_data = product_in.model_dump(exclude_unset=True)
    prod_data["id"] = prod_id
    
    # Tính toán trạng thái tồn kho
    stk = prod_data.get("stock", 0)
    min_stk = prod_data.get("min_stock", 5)
    if stk == 0:
        prod_data["status"] = "out_of_stock"
    elif stk <= min_stk:
        prod_data["status"] = "low_stock"
    else:
        prod_data["status"] = "active"
        
    product = Product(**prod_data)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(db: Session, product_id: str, product_in: ProductUpdate) -> Product:
    product = get_product_by_id(db, product_id)
    update_data = product_in.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(product, key, value)
        
    # Cập nhật lại status dựa trên stock
    if product.stock == 0:
        product.status = "out_of_stock"
    elif product.stock <= product.min_stock:
        product.status = "low_stock"
    else:
        product.status = "active"

    db.commit()
    db.refresh(product)
    return product


def delete_product(db: Session, product_id: str) -> bool:
    product = get_product_by_id(db, product_id)
    db.delete(product)
    db.commit()
    return True


def update_product_stock(db: Session, product_id: str, delta: int) -> Product:
    product = get_product_by_id(db, product_id)
    new_stock = max(0, product.stock + delta)
    product.stock = new_stock
    
    if new_stock == 0:
        product.status = "out_of_stock"
    elif new_stock <= product.min_stock:
        product.status = "low_stock"
    else:
        product.status = "active"
        
    db.commit()
    db.refresh(product)
    return product
