import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.services.conversion_service import ConversionService  # Dòng cũ của mày từ dòng này trở đi...
import pytest
from datetime import datetime, timedelta
from app.services.conversion_service import ConversionService

def test_full_warehouse_workflow():
    # 1. Giả lập dữ liệu SKU với Versioning (SCRUM-394 & SCRUM-393)
    time_v1 = datetime.utcnow() - timedelta(days=10)
    time_v2 = datetime.utcnow() - timedelta(days=2)
    
    sku_data = {
        "sku": "SKU_STING_RED",
        "current_version": 2,
        "versions": [
            {
                "version": 1,
                "base_unit": "Lon",
                "units": {"Thùng": 24.0, "Lốc": 6.0, "Lon": 1.0}, # Phiên bản cũ: 1 Thùng = 24 lon
                "created_at": time_v1
            },
            {
                "version": 2,
                "base_unit": "Lon",
                "units": {"Thùng": 30.0, "Lốc": 6.0, "Lon": 1.0}, # Phiên bản mới: 1 Thùng = 30 lon (đã sửa)
                "created_at": time_v2
            }
        ]
    }

    # 2. TEST CASE 1: Kiểm tra tính toán giao dịch HIỆN TẠI dùng Version 2 (SCRUM-391 & SCRUM-392)
    # Nhập 10 Thùng ở thời điểm hiện tại -> Phải ra 300 Lon
    res_current = ConversionService.convert_to_base_quantity(
        sku_data=sku_data, quantity=10, unit_name="Thùng"
    )
    assert res_current["base_quantity"] == 300.0
    assert res_current["applied_version"] == 2
    print("\n✅ PASS Test Case 1: Quy đổi giao dịch hiện tại chuẩn xác.")

    # 3. TEST CASE 2: Kiểm tra khóa lịch sử QUÁ KHỨ dùng Version 1 (SCRUM-393)
    # Giao dịch tạo cách đây 5 ngày (sau v1 nhưng trước v2) -> Phải giữ nguyên 1 Thùng = 24 lon (Tổng 240 lon)
    past_transaction_time = datetime.utcnow() - timedelta(days=5)
    res_past = ConversionService.convert_to_base_quantity(
        sku_data=sku_data, quantity=10, unit_name="Thùng", transaction_time=past_transaction_time
    )
    assert res_past["base_quantity"] == 240.0
    assert res_past["applied_version"] == 1
    print("✅ PASS Test Case 2: Khóa lịch sử quy đổi không bị hỏng dữ liệu cũ.")

    # 4. TEST CASE 3: Kiểm tra lỗi khi nhập Đơn vị tính không tồn tại
    try:
        ConversionService.convert_to_base_quantity(sku_data=sku_data, quantity=5, unit_name="Chai")
        assert False, "Chưa bắt được lỗi đơn vị không hợp lệ"
    except ValueError as e:
        assert "không tồn tại" in str(e)
        print("✅ PASS Test Case 3: Bắt lỗi validation đơn vị tính thành công.")

if __name__ == "__main__":
    test_full_warehouse_workflow()
    print("\n🎉 TẤT CẢ TEST CASES ĐÃ ĐẠT (PASSED) 100%!")