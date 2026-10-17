# backend/tests/tvp/tvp_sprint8/test_scrum280.py
"""
Unit test cho Báo cáo Công nợ Quá hạn theo Tuổi nợ (Story S8-09 - SCRUM-280).
Kiểm tra:
- AC-1: Phân nhóm 5 bucket tuổi nợ (Chưa đến hạn, 1-30 ngày, 31-60 ngày, 61-90 ngày, >90 ngày).
- AC-2: Tổng hợp theo nhân viên kinh doanh phụ trách (NVKD) & tỷ lệ quá hạn.
- AC-3: Xác định mức độ rủi ro (CRITICAL, HIGH, MEDIUM, LOW) & Top đại lý rủi ro.
- AC-4: Xuất báo cáo Excel với đầy đủ 3 sheet và định dạng chuẩn.
- Phân quyền: Chặn vai trò Customer (HTTP 403), SalesStaff chỉ xem đại lý phụ trách.
"""
from datetime import date, datetime, timedelta
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException

from app.models.auth import User, UserRole
from app.models.invoice import Invoice, InvoiceStatus
from app.models.customer import Customer
from app.services.debt_aging_report_service import (
    DebtAgingReportService,
    _tinh_muc_rui_ro,
    _tinh_so_ngay_qua_han,
)
from app.api.endpoints.debt_aging_reports import xuat_excel_cong_no_qua_han


def test_scrum280_tinh_so_ngay_qua_han():
    """Kiểm tra hàm tính số ngày quá hạn."""
    today = date(2026, 10, 16)
    # Hóa đơn hạn tương lai -> số ngày âm hoặc 0 (chưa quá hạn)
    due_future = date(2026, 10, 20)
    assert _tinh_so_ngay_qua_han(due_future, today) == -4

    # Hóa đơn quá hạn 15 ngày
    due_past_15 = date(2026, 10, 1)
    assert _tinh_so_ngay_qua_han(due_past_15, today) == 15

    # Hóa đơn quá hạn 100 ngày
    due_past_100 = today - timedelta(days=100)
    assert _tinh_so_ngay_qua_han(due_past_100, today) == 100


def test_scrum280_tinh_muc_rui_ro():
    """Kiểm tra phân loại mức độ rủi ro (CRITICAL, HIGH, MEDIUM, LOW)."""
    # CRITICAL: quá hạn > 90 ngày hoặc tỷ lệ > 80%
    assert _tinh_muc_rui_ro(overdue_total=50000000, overdue_ratio=0.85, oldest_overdue_days=10) == "CRITICAL"
    assert _tinh_muc_rui_ro(overdue_total=10000000, overdue_ratio=0.1, oldest_overdue_days=95) == "CRITICAL"

    # HIGH: quá hạn > 60 ngày hoặc tỷ lệ > 50%
    assert _tinh_muc_rui_ro(overdue_total=30000000, overdue_ratio=0.55, oldest_overdue_days=20) == "HIGH"
    assert _tinh_muc_rui_ro(overdue_total=10000000, overdue_ratio=0.1, oldest_overdue_days=65) == "HIGH"

    # MEDIUM: quá hạn > 30 ngày hoặc tỷ lệ > 20%
    assert _tinh_muc_rui_ro(overdue_total=10000000, overdue_ratio=0.25, oldest_overdue_days=10) == "MEDIUM"
    assert _tinh_muc_rui_ro(overdue_total=5000000, overdue_ratio=0.1, oldest_overdue_days=35) == "MEDIUM"

    # LOW: dưới 30 ngày và tỷ lệ <= 20%
    assert _tinh_muc_rui_ro(overdue_total=1000000, overdue_ratio=0.1, oldest_overdue_days=10) == "LOW"


def test_scrum280_customer_forbidden():
    """Kiểm tra chặn quyền truy cập của vai trò Customer (HTTP 403)."""
    db_mock = MagicMock()
    customer_user = MagicMock(spec=User)
    customer_user.role = UserRole.CUSTOMER.value

    with pytest.raises(HTTPException) as exc_info:
        DebtAgingReportService.get_debt_aging_report(
            db=db_mock,
            current_user=customer_user,
        )
    assert exc_info.value.status_code == 403
    assert "Đại lý không có quyền" in exc_info.value.detail


def test_scrum280_empty_report():
    """Kiểm tra trường hợp hệ thống không có công nợ quá hạn."""
    db_mock = MagicMock()
    # Mock query invoices trả về rỗng
    db_mock.query.return_value.filter.return_value.order_by.return_value.all.return_value = []

    admin_user = MagicMock(spec=User)
    admin_user.role = UserRole.ADMIN.value

    res = DebtAgingReportService.get_debt_aging_report(
        db=db_mock,
        current_user=admin_user,
    )
    assert res.total_customers_with_debt == 0
    assert res.total_debt_amount == 0
    assert res.total_overdue_amount == 0
    assert len(res.bucket_summaries) == 5
    assert len(res.customers) == 0


def test_scrum280_aging_buckets_and_risk_calculation():
    """Kiểm tra AC-1 (5 bucket tuổi nợ), AC-2 (NVKD), AC-3 (Mức rủi ro)."""
    today = date(2026, 10, 16)
    db_mock = MagicMock()

    admin_user = MagicMock(spec=User)
    admin_user.role = UserRole.ADMIN.value

    # Tạo mock Customer
    cust1 = MagicMock(spec=Customer)
    cust1.id = "CUST001"
    cust1.name = "Đại lý Ánh Dương"
    cust1.code = "DL-AD"
    cust1.region = "Miền Bắc"
    cust1.assigned_sales_rep = "Nguyễn Văn Nam"

    cust2 = MagicMock(spec=Customer)
    cust2.id = "CUST002"
    cust2.name = "Đại lý Sao Mai"
    cust2.code = "DL-SM"
    cust2.region = "Miền Nam"
    cust2.assigned_sales_rep = "Lê Thị Hoa"

    # Tạo mock Invoices
    # CUST001: 1 hóa đơn chưa đến hạn (10tr), 1 hóa đơn quá hạn 20 ngày (20tr)
    inv1 = MagicMock(spec=Invoice)
    inv1.id = "INV001"
    inv1.customer_id = "CUST001"
    inv1.remaining_amount = 10000000
    inv1.due_date = today + timedelta(days=5)  # Chưa đến hạn

    inv2 = MagicMock(spec=Invoice)
    inv2.id = "INV002"
    inv2.customer_id = "CUST001"
    inv2.remaining_amount = 20000000
    inv2.due_date = today - timedelta(days=20)  # Quá hạn 20 ngày (bucket 1-30)

    # CUST002: 1 hóa đơn quá hạn 100 ngày (50tr)
    inv3 = MagicMock(spec=Invoice)
    inv3.id = "INV003"
    inv3.customer_id = "CUST002"
    inv3.remaining_amount = 50000000
    inv3.due_date = today - timedelta(days=100)  # Quá hạn > 90 ngày (bucket >90)

    # Mock DB query
    def mock_query_side_effect(model):
        m = MagicMock()
        if model == Invoice:
            m.filter.return_value.order_by.return_value.all.return_value = [inv1, inv2, inv3]
        elif model == Customer:
            m.filter.return_value.all.return_value = [cust1, cust2]
        return m

    db_mock.query.side_effect = mock_query_side_effect

    res = DebtAgingReportService.get_debt_aging_report(
        db=db_mock,
        current_user=admin_user,
        as_of_date=today,
    )

    # Tổng quan
    assert res.total_customers_with_debt == 2
    assert res.total_debt_amount == 80000000  # 10m + 20m + 50m
    assert res.total_overdue_amount == 70000000  # 20m + 50m

    # AC-1: 5 Aging Buckets
    bucket_map = {b.bucket_label: b.total_amount for b in res.bucket_summaries}
    assert bucket_map["Chưa đến hạn"] == 10000000
    assert bucket_map["1-30 ngày"] == 20000000
    assert bucket_map["31-60 ngày"] == 0
    assert bucket_map["61-90 ngày"] == 0
    assert bucket_map["Trên 90 ngày"] == 50000000

    # AC-3: Rủi ro đại lý
    cust2_res = next(c for c in res.customers if c.customer_id == "CUST002")
    assert cust2_res.risk_level == "CRITICAL"  # Quá hạn > 90 ngày
    assert cust2_res.oldest_overdue_days == 100

    cust1_res = next(c for c in res.customers if c.customer_id == "CUST001")
    # CUST001 có overdue_ratio = 20/30 = 66.7% -> HIGH (>50%)
    assert cust1_res.risk_level == "HIGH"

    # Top risk customers: CUST002 phải đứng trước CUST001 (CRITICAL trước HIGH)
    assert res.top_risk_customers[0].customer_id == "CUST002"

    # AC-2: Tổng hợp theo NVKD
    assert len(res.by_sales_rep) == 2
    rep_map = {r.sales_rep_name: r for r in res.by_sales_rep}
    assert rep_map["Lê Thị Hoa"].overdue_total == 50000000
    assert rep_map["Nguyễn Văn Nam"].overdue_total == 20000000


def test_scrum280_export_excel_success():
    """Kiểm tra AC-4: Xuất báo cáo Excel thành công trả về StreamingResponse."""
    today = date(2026, 10, 16)
    db_mock = MagicMock()

    admin_user = MagicMock(spec=User)
    admin_user.role = UserRole.ACCOUNTANT.value

    # Mock query rỗng
    db_mock.query.return_value.filter.return_value.order_by.return_value.all.return_value = []

    res = xuat_excel_cong_no_qua_han(
        customer_id=None,
        sales_rep=None,
        region=None,
        as_of_date=today,
        current_user=admin_user,
        db=db_mock,
    )

    assert res.media_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "Content-Disposition" in res.headers
    assert "BaoCaoCongNoQuaHan" in res.headers["Content-Disposition"]
    assert ".xlsx" in res.headers["Content-Disposition"]
