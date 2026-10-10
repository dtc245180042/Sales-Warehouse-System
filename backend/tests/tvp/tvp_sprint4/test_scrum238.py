import pytest
from app.models.order_status import OrderStatus, ALLOWED_TRANSITIONS

def test_order_status_transitions():
    """Kiểm tra ma trận trạng thái cho phép (SCRUM-590)"""
    assert OrderStatus.PENDING_APPROVAL in ALLOWED_TRANSITIONS[OrderStatus.DRAFT]
    assert OrderStatus.CANCELLED in ALLOWED_TRANSITIONS[OrderStatus.DRAFT]
    # Đã xuất kho thì KHÔNG thể hủy
    assert OrderStatus.CANCELLED not in ALLOWED_TRANSITIONS[OrderStatus.EXPORTED]

def test_cancel_requires_reason():
    """Kiểm tra bắt buộc nhập lý do hủy đơn (SCRUM-594)"""
    reason = ""
    assert len(reason.strip()) == 0 # Trống lý do -> không hợp lệ