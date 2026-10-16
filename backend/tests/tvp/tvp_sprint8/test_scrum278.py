# backend/tests/tvp/tvp_sprint8/test_scrum278.py
import pytest
from app.api.inventory_turnover import get_inventory_turnover_report

def test_scrum_278_turnover_calculation_accuracy():
    """Kiểm tra độ chính xác của công thức tính tồn trung bình & hệ số vòng quay"""
    res = get_inventory_turnover_report(product_id="SKU001")
    assert len(res) == 1
    item = res[0]
    assert item.beginning_qty == 100
    assert item.ending_qty == 60
    assert item.avg_inventory_qty == 80.0  # (100 + 60)/2
    # Giá trị tồn TB = 80 * 50,000 = 4,000,000
    # Vòng quay = 20,000,000 / 4,000,000 = 5.0
    assert item.turnover_ratio == 5.0
    assert item.turnover_days == 73.0      # 365 / 5

def test_scrum_278_filter_by_warehouse():
    """Kiểm tra bộ lọc theo kho"""
    res = get_inventory_turnover_report(warehouse_id="WH01")
    assert len(res) == 2
    assert all(item.warehouse_id == "WH01" for item in res)

def test_scrum_278_zero_inventory_edge_case():
    """Kiểm tra trường hợp tồn kho bằng 0 (không bị crash chia cho 0)"""
    res = get_inventory_turnover_report(product_id="SKU003")
    assert len(res) == 1
    assert res[0].avg_inventory_qty == 0.0
    assert res[0].turnover_ratio == 0.0
    assert res[0].turnover_days == 0.0