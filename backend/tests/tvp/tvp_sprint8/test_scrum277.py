# backend/tests/tvp/tvp_sprint8/test_scrum277.py
import pytest
from app.api.multi_dimension_sales import get_multi_dimension_sales_report, export_multi_dimension_sales_excel

def test_scrum_814_multi_dimension_grouping():
    """Kiểm tra báo cáo theo chiều nhân viên"""
    res = get_multi_dimension_sales_report(dimension="employee", user_role="STAFF")
    assert len(res) > 0
    assert res[0].dimension_type == "employee"

def test_scrum_816_period_comparison():
    """Kiểm tra so sánh cùng kỳ trước và tăng trưởng"""
    res = get_multi_dimension_sales_report(dimension="region", user_role="STAFF")
    assert res[0].revenue_growth_amount == 20000000.0  # 100m - 80m
    assert res[0].revenue_growth_pct == 25.0  # 25%

def test_scrum_818_gross_margin_permission():
    """Chỉ Quản lý (MANAGER) mới thấy thông tin Biên lợi nhuận gộp"""
    res_staff = get_multi_dimension_sales_report(dimension="employee", user_role="STAFF")
    assert res_staff[0].gross_profit is None

    res_manager = get_multi_dimension_sales_report(dimension="employee", user_role="MANAGER")
    assert res_manager[0].gross_profit == 30000000.0  # 100m - 70m
    assert res_manager[0].gross_margin_pct == 30.0

def test_scrum_817_export_excel():
    """Kiểm tra xuất file Excel báo cáo đa chiều"""
    res = export_multi_dimension_sales_excel(dimension="category", user_role="MANAGER")
    assert res.media_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "filename=\"Bao_Cao_Doanh_So_category.xlsx\"" in res.headers["Content-Disposition"]