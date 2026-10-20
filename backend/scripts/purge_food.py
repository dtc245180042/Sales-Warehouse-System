import sqlite3
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

conn = sqlite3.connect('sales_warehouse.db')
cur = conn.cursor()
cur.execute('PRAGMA foreign_keys = OFF;')

# Xóa các bản ghi liên quan đến sản phẩm không phải điện tử
bad_sku_condition = "sku NOT LIKE 'IP%' AND sku NOT LIKE 'SS%' AND sku NOT LIKE 'MB%' AND sku NOT LIKE 'ASUS%' AND sku NOT LIKE 'DELL%' AND sku NOT LIKE 'SN%' AND sku NOT LIKE 'APP%' AND sku NOT LIKE 'MARSHALL%' AND sku NOT LIKE 'LOGI%' AND sku NOT LIKE 'KEY%'"

cur.execute(f"DELETE FROM product_lots WHERE product_id IN (SELECT id FROM products WHERE {bad_sku_condition});")
cur.execute(f"DELETE FROM warehouse_stocks WHERE product_id IN (SELECT id FROM products WHERE {bad_sku_condition});")
cur.execute(f"DELETE FROM product_stock_profiles WHERE product_id IN (SELECT id FROM products WHERE {bad_sku_condition});")
cur.execute(f"DELETE FROM order_items WHERE product_id IN (SELECT id FROM products WHERE {bad_sku_condition});")
cur.execute(f"DELETE FROM stock_dispatch_items WHERE product_id IN (SELECT id FROM products WHERE {bad_sku_condition});")
cur.execute(f"DELETE FROM picking_list_items WHERE product_id IN (SELECT id FROM products WHERE {bad_sku_condition});")
cur.execute(f"DELETE FROM stock_ledger_entries WHERE product_id IN (SELECT id FROM products WHERE {bad_sku_condition});")
cur.execute(f"DELETE FROM invoice_items WHERE product_id IN (SELECT id FROM products WHERE {bad_sku_condition});")
cur.execute(f"DELETE FROM products WHERE {bad_sku_condition};")

# Dọn dẹp danh mục không phải điện tử
cur.execute("DELETE FROM categories WHERE name LIKE '%bánh%' OR name LIKE '%kẹo%' OR name LIKE '%nước%' OR name LIKE '%bia%' OR name LIKE '%sữa%' OR name LIKE '%thực phẩm%' OR name LIKE '%FMCG%';")

cur.execute('PRAGMA foreign_keys = ON;')
conn.commit()

cur.execute('SELECT sku, name, category, price, stock FROM products;')
rows = cur.fetchall()
print(f"Tổng số sản phẩm ĐIỆN TỬ trong CSDL: {len(rows)}")
for r in rows:
    print(f"- [{r[0]}] {r[1]} | {r[2]} | {r[3]:,.0f} đ | Tồn: {r[4]}")

conn.close()
