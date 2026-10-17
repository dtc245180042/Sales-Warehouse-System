# backend/tests/tvp/tvp_sprint8/test_scrum279.py
import pytest
from app.api.inventory_report_s8 import export_inventory_report_excel

def test_scrum_279_export_excel_success():
    """Kiểm tra xuất file Excel thành công trả về StreamingResponse"""
    res = export_inventory_report_excel(warehouse_id="WH01")
    assert res.media_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "Content-Disposition" in res.headers
    assert "Bao Cao Ton Kho WH01" in res.headers["Content-Disposition"]

def test_scrum_279_export_excel_all_warehouses():
    """Kiểm tra xuất file Excel khi không truyền mã kho (ALL)"""
    res = export_inventory_report_excel(warehouse_id=None)
    assert res.media_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "Bao Cao Ton Kho ALL" in res.headers["Content-Disposition"]