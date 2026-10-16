# backend/tests/tvp/tvp_sprint8/test_scrum275.py
import pytest
from app.api.sales_target import create_sales_target, update_sales_target, get_sales_progress, db_targets
from app.schemas.sales_target import SalesTargetCreate, SalesTargetUpdate

def test_scrum_797_create_sales_target():
    payload = SalesTargetCreate(
        employee_id="EMP001", region_code="NORTH", month_year="2026-10", target_amount=50000000.0
    )
    res = create_sales_target(payload, user_role="MANAGER")
    assert res["target_amount"] == 50000000.0

def test_scrum_798_lock_and_audit():
    db_targets[1]["is_locked"] = True
    payload_no_reason = SalesTargetUpdate(target_amount=60000000.0)
    
    with pytest.raises(Exception):
        update_sales_target(1, payload_no_reason, user_role="MANAGER")

def test_scrum_800_progress_calculation():
    res = get_sales_progress(month_year="2026-10", user_role="MANAGER")
    assert len(res) > 0
    assert res[0].completion_rate == 85.0

def test_scrum_801_permission():
    payload = SalesTargetCreate(
        employee_id="EMP002", region_code="SOUTH", month_year="2026-10", target_amount=30000000.0
    )
    with pytest.raises(Exception):
        create_sales_target(payload, user_role="STAFF")