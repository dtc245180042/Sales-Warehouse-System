# backend/tests/tvp/tvp_sprint8/test_scrum274.py
import pytest
from app.api.inventory_adjustment import create_adjustment, approve_adjustment, list_adjustments
from app.schemas.inventory_adjustment import AdjustmentCreate, AdjustmentApprove

def test_scrum_791_validation_reason_and_loss_value():
    # Kiểm tra thiếu lý do hợp lệ
    with pytest.raises(Exception):
        create_adjustment(AdjustmentCreate(
            warehouse_id="WH01", product_id="SKU001", adjustment_type="DAMAGED",
            quantity_adjusted=-5, loss_value=100000.0, reason="Sửa"
        ))

def test_scrum_792_793_create_and_approve_workflow():
    payload = AdjustmentCreate(
        warehouse_id="WH01", product_id="SKU001", adjustment_type="DAMAGED",
        quantity_adjusted=-5, loss_value=500000.0, reason="Hàng bị hỏng hóc trong quá trình vận chuyển"
    )
    res_create = create_adjustment(payload, user_id="EMP001", user_role="STAFF")
    assert res_create["status"] == "PENDING"
    
    # SCRUM-793: Chặn tự duyệt
    with pytest.raises(Exception):
        approve_adjustment(res_create["id"], AdjustmentApprove(status="APPROVED"), user_id="EMP001", user_role="MANAGER")
        
    # Quản lý khác duyệt thành công -> Gọi ghi_phat_sinh_kho (SCRUM-789)
    res_approve = approve_adjustment(res_create["id"], AdjustmentApprove(status="APPROVED"), user_id="MGR001", user_role="MANAGER")
    assert res_approve["status"] == "APPROVED"
    assert res_approve["approved_by"] == "MGR001"

def test_scrum_795_filter_adjustments():
    res = list_adjustments(status="APPROVED")
    assert isinstance(res, list)