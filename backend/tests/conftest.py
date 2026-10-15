import sys
from pathlib import Path
import pytest
from sqlalchemy import text

# Thêm thư mục backend vào sys.path để pytest tự nhận diện module app
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import app.models
from app.core.database import Base, engine, SessionLocal
from app.models.product import Product
from app.models.customer import Customer
from app.models.order import Order

Base.metadata.create_all(bind=engine)


@pytest.fixture(autouse=True)
def cleanup_test_artifacts():
    """
    Tự động ghi nhận và dọn dẹp các sản phẩm, khách hàng, đơn hàng được sinh ra trong quá trình chạy test,
    đảm bảo CSDL chuẩn không bị ô nhiễm bởi các bản ghi test rác.
    """
    db = SessionLocal()
    try:
        init_prod_ids = set(r[0] for r in db.query(Product.id).all())
        init_cus_ids = set(r[0] for r in db.query(Customer.id).all())
        init_order_ids = set(r[0] for r in db.query(Order.id).all())
    except Exception:
        init_prod_ids, init_cus_ids, init_order_ids = set(), set(), set()
    finally:
        db.close()

    yield

    cleanup_db = SessionLocal()
    try:
        # 1. Dọn dẹp đơn hàng mới sinh trong test
        if init_order_ids:
            new_orders = cleanup_db.query(Order).filter(~Order.id.in_(init_order_ids)).all()
        else:
            new_orders = []
        for o in new_orders:
            oid = str(o.id)
            cleanup_db.execute(text("DELETE FROM order_approval_requests WHERE order_id = :oid"), {"oid": oid})
            cleanup_db.execute(text("DELETE FROM order_delivery_profiles WHERE order_id = :oid"), {"oid": oid})
            cleanup_db.execute(text("DELETE FROM order_items WHERE order_id = :oid"), {"oid": oid})
            cleanup_db.execute(text("DELETE FROM orders WHERE id = :oid"), {"oid": oid})

        # 2. Dọn dẹp sản phẩm mới sinh trong test
        if init_prod_ids:
            new_prods = cleanup_db.query(Product).filter(~Product.id.in_(init_prod_ids)).all()
        else:
            new_prods = []
        for p in new_prods:
            pid = str(p.id)
            cleanup_db.execute(text("DELETE FROM product_lots WHERE product_id = :pid"), {"pid": pid})
            cleanup_db.execute(text("DELETE FROM order_items WHERE product_id = :pid"), {"pid": pid})
            cleanup_db.execute(text("DELETE FROM warehouse_stocks WHERE product_id = :pid"), {"pid": pid})
            cleanup_db.execute(text("DELETE FROM product_stock_profiles WHERE product_id = :pid"), {"pid": pid})
            cleanup_db.execute(text("DELETE FROM price_list_items WHERE product_id = :pid"), {"pid": pid})
            cleanup_db.execute(text("DELETE FROM stock_transfer_items WHERE product_id = :pid"), {"pid": pid})
            cleanup_db.execute(text("DELETE FROM products WHERE id = :pid"), {"pid": pid})

        # 3. Dọn dẹp khách hàng mới sinh trong test
        if init_cus_ids:
            new_custs = cleanup_db.query(Customer).filter(~Customer.id.in_(init_cus_ids)).all()
        else:
            new_custs = []
        for c in new_custs:
            cid = str(c.id)
            cleanup_db.execute(text("DELETE FROM customer_assignments WHERE customer_id = :cid"), {"cid": cid})
            cleanup_db.execute(text("DELETE FROM customer_credit_profiles WHERE customer_id = :cid"), {"cid": cid})
            cleanup_db.execute(text("DELETE FROM customer_delivery_addresses WHERE customer_id = :cid"), {"cid": cid})
            cleanup_db.execute(text("DELETE FROM customers WHERE id = :cid"), {"cid": cid})

        cleanup_db.commit()
    except Exception:
        cleanup_db.rollback()
    finally:
        cleanup_db.close()
