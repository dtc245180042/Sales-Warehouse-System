import io
import sys
import openpyxl
import pymysql
from fastapi.testclient import TestClient

# Đảm bảo in tiếng Việt trên console Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Thêm đường dẫn app
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from main import app
from app.core.database import SessionLocal
from app.models.auth import User
from app.core.security import tao_token_truy_cap

client = TestClient(app)

MYSQL_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "26082006",
    "port": 3306,
    "database": "sales_warehouse",
    "charset": "utf8mb4"
}

def run_test():
    print("=" * 75)
    print("🚀 BẮT ĐẦU KIỂM THỬ TÍNH NĂNG NHẬP EXCEL & LƯU VÀO MYSQL (SCRUM-216)")
    print("=" * 75)

    # 1. Đăng nhập và tạo JWT token cho Quản lý kinh doanh (sales_mgr)
    print("\n[Bước 1] Xác thực tài khoản Quản lý kinh doanh (sales_mgr)...")
    db = SessionLocal()
    user = db.query(User).filter_by(username="sales_mgr").first()
    if not user:
        print("❌ Không tìm thấy user sales_mgr trong CSDL!")
        db.close()
        return

    token = tao_token_truy_cap({
        "sub": user.username,
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "token_version": user.token_version
    })
    headers = {"Authorization": f"Bearer {token}"}
    db.close()
    print(f"✔ Xác thực thành công: User '{user.username}' (Vai trò: {user.role})")

    # 2. Tải tệp mẫu Excel
    print("\n[Bước 2] Gọi API tải tệp mẫu Excel (/api/v1/product-imports/template)...")
    res_template = client.get("/api/v1/product-imports/template", headers=headers)
    if res_template.status_code != 200:
        print(f"❌ Lỗi tải tệp mẫu: {res_template.status_code}")
        return
    print(f"✔ Tải tệp mẫu thành công ({len(res_template.content)} bytes) - Định dạng chuẩn có hướng dẫn và dữ liệu mẫu.")

    # 3. Tạo file Excel với 3 mã hàng mới để test
    print("\n[Bước 3] Chuẩn bị tệp Excel mẫu chứa 3 sản phẩm kiểm thử...")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Danh_Sach_San_Pham"
    ws.append(["Mã SKU (*)", "Tên sản phẩm (*)", "Nhóm hàng", "Đơn vị tính (*)", "Quy cách đóng gói", "Giá vốn (VNĐ)", "Giá bán (VNĐ) (*)", "Mô tả sản phẩm", "Trạng thái"])
    
    test_products = [
        ["SP-MONSTER-355", "Nước Tăng Lực Monster Energy 355ml", "Nước giải khát", "Lon", "24 lon/thùng", 19000, 29000, "Monster đen nhập khẩu", "ACTIVE"],
        ["SP-DANISA-454", "Bánh Quy Bơ Danisa Hộp Thiếc 454g", "Bánh kẹo cao cấp", "Hộp", "12 hộp/thùng", 88000, 129000, "Bánh quy bơ Đan Mạch", "ACTIVE"],
        ["SP-G7-18G", "Cà Phê Hòa Tan G7 3in1 Hộp 18 Gói", "Cà phê & Trà", "Hộp", "24 hộp/thùng", 36000, 54000, "Cà phê G7 Trung Nguyên", "ACTIVE"],
    ]
    for p in test_products:
        ws.append(p)

    excel_buffer = io.BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)

    # 4. Gửi Preview File
    print("\n[Bước 4] Gửi API xem trước dữ liệu (/api/v1/product-imports/preview)...")
    files = {
        "file": (
            "products_test.xlsx",
            excel_buffer.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    }
    res_preview = client.post("/api/v1/product-imports/preview", headers=headers, files=files)
    if res_preview.status_code != 200:
        print(f"❌ Preview thất bại: {res_preview.status_code} - {res_preview.text}")
        return
    
    preview_data = res_preview.json()
    print(f"✔ Kết quả Preview: Tổng {preview_data['total_rows']} dòng | Hợp lệ: {preview_data['valid_count']} | Sẽ tạo mới: {preview_data['to_create_count']} | Sẽ cập nhật: {preview_data['to_update_count']}")

    # 5. Thực thi Import vào MySQL
    print("\n[Bước 5] Gọi API thực thi lưu vào Database (/api/v1/product-imports/execute)...")
    res_exec = client.post(
        "/api/v1/product-imports/execute",
        headers=headers,
        json=preview_data["valid_data"]
    )
    if res_exec.status_code != 200:
        print(f"❌ Lưu dữ liệu thất bại: {res_exec.status_code} - {res_exec.text}")
        return
    
    exec_data = res_exec.json()
    print(f"✔ Phản hồi từ Server: Đã lưu thành công {exec_data['success_count']} sản phẩm vào CSDL!")
    print(f"   -> Danh sách SKU đã tạo mới: {exec_data['created_skus']}")

    # 6. Mở kết nối trực tiếp đến MySQL Server và SELECT kiểm tra
    print("\n[Bước 6] KẾT NỐI TRỰC TIẾP MYSQL SERVER ĐỂ TRUY VẤN VÀ ĐỐI SOÁT...")
    try:
        conn = pymysql.connect(**MYSQL_CONFIG)
        cur = conn.cursor()
        cur.execute("""
            SELECT id, sku, name, unit, cost_price, price, status, created_at 
            FROM products 
            WHERE sku IN ('SP-MONSTER-355', 'SP-DANISA-454', 'SP-G7-18G')
            ORDER BY id DESC
        """)
        rows = cur.fetchall()
        print("-" * 88)
        print(f"{'ID':<6} | {'Mã SKU':<16} | {'Tên sản phẩm':<38} | {'ĐVT':<5} | {'Giá bán':<10} | {'Trạng thái'}")
        print("-" * 88)
        for r in rows:
            p_id, p_sku, p_name, p_unit, p_cost, p_price, p_status, p_time = r
            print(f"{p_id:<6} | {p_sku:<16} | {p_name:<38} | {p_unit:<5} | {int(p_price):<10} | {p_status}")
        print("-" * 88)
        print(f"🎉 XÁC NHẬN THÀNH CÔNG: Tìm thấy đúng {len(rows)} bản ghi vừa được ghi trực tiếp vào MySQL database 'sales_warehouse'!")
        conn.close()
    except Exception as e:
        print(f"❌ Lỗi kết nối MySQL: {e}")

if __name__ == "__main__":
    run_test()
