import io
import openpyxl
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.auth import User
from app.models.product import Product
from app.core.security import tao_token_truy_cap
from app.services.product_import_service import ProductImportService

client = TestClient(app)

def _get_token_for(username: str, role: str):
    db = SessionLocal()
    user = db.query(User).filter_by(username=username).first()
    tv = user.token_version if user else 1
    uid = user.id if user else 1
    db.close()
    token = tao_token_truy_cap({
        "sub": username,
        "user_id": uid,
        "username": username,
        "role": role,
        "token_version": tv
    })
    return {"Authorization": f"Bearer {token}"}


def test_scrum216_all_subtasks():
    # Dọn dẹp dữ liệu cũ nếu còn sót lại từ lần chạy trước
    db_clean = SessionLocal()
    db_clean.query(Product).filter(Product.sku.in_(["TEST-NEW-01", "TEST-ERR-02", "TEST-ERR-03"])).delete()
    db_clean.commit()
    db_clean.close()

    headers_sales = _get_token_for("sales_mgr", "Sales Manager")
    headers_warehouse = _get_token_for("warehouse", "Warehouse")

    # 1. AC-1: Tải tệp mẫu Excel
    res_template = client.get("/api/v1/product-imports/template", headers=headers_sales)
    assert res_template.status_code == 200, res_template.text
    assert "application/vnd.openxmlformats" in res_template.headers["content-type"]
    wb = openpyxl.load_workbook(io.BytesIO(res_template.content))
    assert "Danh_Sach_San_Pham" in wb.sheetnames
    print("✔ PASS AC-1 (Subtask 1): Tải tệp mẫu Excel chuẩn tiếng Việt thành công.")

    # 2. Phân quyền: Nhân viên kho không được phép tải template / import
    res_forbidden = client.get("/api/v1/product-imports/template", headers=headers_warehouse)
    assert res_forbidden.status_code == 403
    print("✔ PASS RBAC: Chặn nhân viên không phải QLKD / Admin truy cập.")

    # 3. Tạo file Excel test có cả dòng hợp lệ, dòng lỗi và dòng trùng SKU để test UPDATE
    wb_test = openpyxl.Workbook()
    ws = wb_test.active
    ws.append(["Mã SKU", "Tên sản phẩm", "Nhóm hàng", "Đơn vị tính", "Quy cách đóng gói", "Giá vốn", "Giá bán", "Mô tả", "Trạng thái"])
    
    # Dòng 1: Tạo mới hợp lệ
    ws.append(["TEST-NEW-01", "Sản phẩm Mới 01", "Gia dụng", "Cái", "1 cái/hộp", 50000, 80000, "Mô tả 1", "ACTIVE"])
    # Dòng 2: Thiếu tên -> Lỗi
    ws.append(["TEST-ERR-02", "", "Gia dụng", "Cái", "", 10000, 20000, "", "ACTIVE"])
    # Dòng 3: Giá bán âm -> Lỗi
    ws.append(["TEST-ERR-03", "Sản phẩm Lỗi Giá", "Gia dụng", "Cái", "", 10000, -500, "", "ACTIVE"])
    
    test_excel_bytes = io.BytesIO()
    wb_test.save(test_excel_bytes)
    test_excel_bytes.seek(0)

    # 4. AC-1: Preview và báo lỗi từng dòng
    files = {"file": ("test_products.xlsx", test_excel_bytes.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    res_preview = client.post("/api/v1/product-imports/preview", headers=headers_sales, files=files)
    assert res_preview.status_code == 200, res_preview.text
    preview_data = res_preview.json()

    assert preview_data["total_rows"] == 3
    assert preview_data["valid_count"] == 1
    assert preview_data["invalid_rows_count"] == 2
    assert preview_data["to_create_count"] == 1
    assert len(preview_data["errors"]) == 2
    print("✔ PASS AC-1 (Subtask 2): Xem trước và phát hiện chính xác dòng lỗi / dòng hợp lệ.")

    # 5. AC-2: Execute Import - Dòng hợp lệ được nhập, dòng lỗi bị bỏ qua
    res_execute = client.post("/api/v1/product-imports/execute", headers=headers_sales, json=preview_data["valid_data"])
    assert res_execute.status_code == 200, res_execute.text
    exec_result = res_execute.json()
    assert exec_result["success_count"] == 1
    assert "TEST-NEW-01" in exec_result["created_skus"]

    # Kiểm tra trong DB đã có sản phẩm TEST-NEW-01
    db = SessionLocal()
    p = db.query(Product).filter_by(sku="TEST-NEW-01").first()
    assert p is not None
    assert p.name == "Sản phẩm Mới 01"
    assert p.price == 80000.0

    # 6. AC-2: SKU đã tồn tại thì cập nhật (UPDATE) thay vì tạo mới
    update_data = [{
        "sku": "TEST-NEW-01",
        "name": "Sản phẩm Mới 01 Đã Cập Nhật",
        "category": "Gia dụng cao cấp",
        "unit": "Hộp",
        "packaging_spec": "10 hộp/thùng",
        "cost_price": 55000.0,
        "price": 95000.0,
        "status": "ACTIVE",
        "action": "UPDATE"
    }]
    res_update = client.post("/api/v1/product-imports/execute", headers=headers_sales, json=update_data)
    assert res_update.status_code == 200
    update_res = res_update.json()
    assert "TEST-NEW-01" in update_res["updated_skus"]

    db.close()
    db2 = SessionLocal()
    p2 = db2.query(Product).filter_by(sku="TEST-NEW-01").first()
    assert p2 is not None
    assert p2.name == "Sản phẩm Mới 01 Đã Cập Nhật"
    assert p2.price == 95000.0
    assert p2.unit == "Hộp"

    # Dọn dẹp dữ liệu test
    db2.delete(p2)
    db2.commit()
    db2.close()
    print("✔ PASS AC-2 (Subtask 3): SKU tồn tại được cập nhật chính xác, không tạo bản ghi trùng lặp.")


if __name__ == "__main__":
    test_scrum216_all_subtasks()
    print("\n🎉 TẤT CẢ TEST CASES DÀNH CHO SCRUM-216 ĐÃ ĐẠT (PASSED) 100%!")