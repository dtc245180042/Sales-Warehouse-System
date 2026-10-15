# backend/tests/tvp/tvp_sprint8/test_scrum278.py
import pytest
from app.schemas.reports import InventoryReportFilter, SlowMovingThresholdConfig
from app.api.inventory_report import calculate_inventory_metrics

def test_slow_moving_calculation_scrum_823():
    """Kiểm tra logic tính toán hàng chậm luân chuyển dựa theo ngưỡng cấu hình"""
    filters = InventoryReportFilter()
    config = SlowMovingThresholdConfig(min_days=30)
    
    results = calculate_inventory_metrics(filters, config)
    
    assert len(results) > 0
    sku1 = next(r for r in results if r.sku == "SKU001")
    assert sku1.avg_inventory_days == 60.0
    assert sku1.is_slow_moving is True

def test_inventory_filter_scrum_824():
    """Kiểm tra chức năng lọc danh sách theo tham số"""
    filters = InventoryReportFilter(is_slow_moving=True)
    config = SlowMovingThresholdConfig(min_days=30)
    
    results = calculate_inventory_metrics(filters, config)
    
    for item in results:
        assert item.is_slow_moving is True