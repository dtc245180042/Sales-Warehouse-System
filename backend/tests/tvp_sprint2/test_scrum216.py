import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import pandas as pd
import io
from app.services.product_import_service import ProductImportService

def test_scrum216_all_subtasks():
    print("\n--- ĐANG CHẠY KIỂM THỬ EPIC SCRUM-216 ---")

    # 1. SCRUM-402: Test tải mẫu Excel
    template_bytes = ProductImportService.generate_template_excel()
    assert len(template_bytes) > 0
    print("✅ PASS SCRUM-402: Tạo file mẫu Excel thành công.")

    # 2. Tạo dữ liệu giả lập Excel chuẩn (5 dòng: 2 hợp lệ, 3 lỗi)
    data = {
        "SKU": ["SKU001", "SKU002", "SKU002", "", "SKU003"],
        "Tên sản phẩm": ["Sản phẩm A", "Sản phẩm B", "Sản phẩm B2", "Sản phẩm C", "Sản phẩm D"],
        "Nhóm hàng": ["Đồ uống", "Đồ uống", "Đồ uống", "Thực phẩm", "Thực phẩm"],
        "Đơn vị tính": ["Lon", "Chai", "Chai", "Gói", "Hộp"],
        "Giá vốn": [12000, 15000, 15000, 20000, -500]  # Dòng 5 (SKU003) bị lỗi giá vốn âm (-500)
    }
    df = pd.DataFrame(data)
    excel_io = io.BytesIO()
    with pd.ExcelWriter(excel_io, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    excel_bytes = excel_io.getvalue()

    # 3. SCRUM-399, SCRUM-400, SCRUM-401, SCRUM-403: Parse & Preview
    preview = ProductImportService.parse_and_validate_excel(excel_bytes)
    
    assert preview["total_rows"] == 5
    assert preview["valid_rows_count"] == 2
    assert preview["invalid_rows_count"] == 3
    assert preview["to_update_count"] == 1
    assert preview["to_create_count"] == 1
    print("✅ PASS SCRUM-399, 400, 401, 403: Validate Excel, phát hiện trùng lặp & phân loại Create/Update thành công.")

    # 4. SCRUM-404: Partial Import
    execute_res = ProductImportService.execute_import(preview["valid_data"])
    assert execute_res["success_count"] == 2
    assert "SKU002" in execute_res["created_skus"]
    assert "SKU001" in execute_res["updated_skus"]
    print("✅ PASS SCRUM-404: Import một phần thành công, bỏ qua các dòng lỗi.")

if __name__ == "__main__":
    test_scrum216_all_subtasks()
    print("\n🎉 TẤT CẢ TEST CASES DÀNH CHO SCRUM-216 ĐÃ ĐẠT (PASSED) 100%!")