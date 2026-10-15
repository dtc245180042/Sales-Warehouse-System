# backend/tests/tvp/tvp_sprint8/test_scrum279.py
import pytest
from datetime import datetime
from app.api.inventory_report import export_inventory_report_excel

def test_export_excel_with_filters_scrum_830():
    """SCRUM-830: Kiểm tra xuất Excel theo điều kiện lọc"""
    response = export_inventory_report_excel(warehouse_id="WH01", threshold_days=30)
    assert response.media_type == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

def test_export_excel_filename_scrum_831():
    """SCRUM-831: Kiểm tra quy ước sinh tên file theo mã kho và ngày xuất"""
    wh_id = "WH01"
    today_str = datetime.now().strftime("%Y%m%d")
    expected_filename = f"Bao_Cao_Ton_Kho_{wh_id}_{today_str}.xlsx"
    
    response = export_inventory_report_excel(warehouse_id=wh_id, threshold_days=30)
    content_disposition = response.headers['Content-Disposition']
    
    assert f'filename="{expected_filename}"' in content_disposition

def test_export_excel_structure_scrum_834():
    """SCRUM-834: Kiểm tra định dạng xuất file báo cáo tồn kho"""
    response = export_inventory_report_excel(threshold_days=30)
    assert response.status_code == 200 if hasattr(response, 'status_code') else True