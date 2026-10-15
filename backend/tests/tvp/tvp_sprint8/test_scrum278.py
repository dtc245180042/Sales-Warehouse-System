# backend/tests/tvp/tvp_sprint8/test_scrum278.py
import pytest
import sys
import os

# Thêm đường dẫn backend vào sys.path để tránh lỗi ModuleNotFoundError/ImportError
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

from app.schemas.reports import InventoryReportFilter, SlowMovingThresholdConfig
from app.models.reports import InventoryReportConfig
from app.api.inventory_report import calculate_inventory_metrics, export_inventory_report_excel

def test_slow_moving_calculation_scrum_823():
    """SCRUM-823: Kiểm tra logic tính toán hàng chậm luân chuyển dựa theo ngưỡng cấu hình"""
    filters = InventoryReportFilter()
    config = SlowMovingThresholdConfig(min_days=30)
    
    results = calculate_inventory_metrics(filters, config)
    
    assert len(results) > 0
    sku1 = next(r for r in results if r.sku == "SKU001")
    assert sku1.avg_inventory_days == 60.0
    assert sku1.is_slow_moving is True

def test_inventory_filter_scrum_824():
    """SCRUM-824: Kiểm tra chức năng lọc danh sách theo tham số"""
    filters = InventoryReportFilter(is_slow_moving=True)
    config = SlowMovingThresholdConfig(min_days=30)
    
    results = calculate_inventory_metrics(filters, config)
    
    for item in results:
        assert item.is_slow_moving is True

def test_inventory_config_model_scrum_825():
    """SCRUM-825: Kiểm tra khởi tạo Model cấu hình ngưỡng chậm luân chuyển"""
    config_model = InventoryReportConfig(config_key="SLOW_MOVING", min_days=30)
    assert config_model.config_key == "SLOW_MOVING"
    assert config_model.min_days == 30

def test_export_excel_scrum_828():
    """SCRUM-828: Kiểm tra API xuất file Excel báo cáo tồn kho"""
    response = export_inventory_report_excel(warehouse_id="WH01", threshold_days=30)
    assert response.media_type == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    assert 'attachment; filename="Bao_Cao_Ton_Kho_Vong_Quay.xlsx"' in response.headers['Content-Disposition']