import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

import pytest
from backend.app.api import stock_threshold_api, stock_warning_service, stock_dashboard_api

def test_scrum_602_set_threshold():
    # Test khai báo ngưỡng tồn tối thiểu
    data = stock_threshold_api.ThresholdConfig(sku="SKU_TEST", warehouse_id="WH_1", min_threshold=10)
    res = stock_threshold_api.set_min_threshold(data)
    assert res["data"]["min_threshold"] == 10

def test_scrum_603_check_low_stock_logic():
    # Test logic cảnh báo tồn thấp
    thresholds = {"SKU_TEST_WH_1": {"sku": "SKU_TEST", "warehouse_id": "WH_1", "min_threshold": 10}}
    inventory = [{"sku": "SKU_TEST", "warehouse_id": "WH_1", "quantity": 4}]
    
    warnings = stock_warning_service.check_low_stock(inventory, thresholds)
    assert len(warnings) == 1
    assert warnings[0]["shortage"] == 6

def test_scrum_600_dashboard_alerts_api():
    # Test API trả về danh sách tồn dưới ngưỡng
    stock_threshold_api.db_thresholds["SKU_001_WH_1"] = {
        "sku": "SKU_001", "warehouse_id": "WH_1", "min_threshold": 10
    }
    alerts = stock_dashboard_api.get_low_stock_alerts()
    assert len(alerts) >= 1
    assert alerts[0]["sku"] == "SKU_001"