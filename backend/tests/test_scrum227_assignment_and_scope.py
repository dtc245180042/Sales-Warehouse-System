import pytest
import threading
import time
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_assignment import CustomerAssignment, CustomerAssignmentHistory
from app.models.audit_log import AuditLog
from app.models.order import Order
from app.services.customer_assignment_service import (
    ensure_seed_assignments,
    bulk_transfer_assignments,
    assign_single_customer,
)

client = TestClient(app)


def _get_auth_headers(username: str = "admin"):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        if username == "sales_rep_b":
            user = User(
                username="sales_rep_b",
                email="sales_rep_b@warehouse.local",
                full_name="Nguyễn Văn Đại Lý B",
                hashed_password="hash",
                role=UserRole.SALES_REP.value,
                is_active=True,
                token_version=1
            )
            db.add(user)
            db.commit()
            db.refresh(user)
    assert user is not None, f"User {username} not found"
    user_id = user.id
    uname = user.username
    urole = user.role
    tver = user.token_version or 1
    db.close()

    token = tao_token_truy_cap({
        "sub": str(user_id),
        "user_id": user_id,
        "username": uname,
        "role": urole,
        "token_version": tver
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def setup_test_users_and_seed():
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    if not sra:
        sra = User(
            username="sales_rep",
            email="sales_rep@warehouse.local",
            full_name="Lê Thị Nhân Viên Kinh Doanh",
            hashed_password="hash",
            role=UserRole.SALES_REP.value,
            is_active=True,
            token_version=1
        )
        db.add(sra)
        db.commit()

    srb = db.query(User).filter(User.username == "sales_rep_b").first()
    if not srb:
        srb = User(
            username="sales_rep_b",
            email="sales_rep_b@warehouse.local",
            full_name="Trần Văn Kinh Doanh Hai",
            hashed_password="hash",
            role=UserRole.SALES_REP.value,
            is_active=True,
            token_version=1
        )
        db.add(srb)
        db.commit()

    ensure_seed_assignments(db)
    db.close()
    yield


# ==============================================================================
# TEST 1: Gán đơn lẻ thành công + có lịch sử
# ==============================================================================
def test_01_assign_single_customer_success():
    headers_mgr = _get_auth_headers("sales_mgr")
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    cus = db.query(Customer).filter(Customer.id == "CUS-001").first()
    sra_id = sra.id
    cus_id = cus.id
    db.close()

    payload = {
        "assigned_staff_id": str(sra_id),
        "reason": "Phân công định kỳ đầu quý cho địa bàn Quận 1"
    }
    res = client.post(f"/api/v1/customers/{cus_id}/assign", json=payload, headers=headers_mgr)
    assert res.status_code == 200, res.text
    data = res.json()
    assert str(data["assignedStaffId"]) == str(sra_id)
    assert data["customerId"] == cus_id

    # Kiểm tra lịch sử
    res_hist = client.get(f"/api/v1/customers/{cus_id}/assignment-history", headers=headers_mgr)
    assert res_hist.status_code == 200
    hist_data = res_hist.json()
    assert len(hist_data) >= 1
    latest = hist_data[0]
    assert latest["actionType"] in ["ASSIGN", "REASSIGN"]
    assert str(latest["toStaffId"]) == str(sra_id)
    assert latest["reason"] == "Phân công định kỳ đầu quý cho địa bàn Quận 1"


# ==============================================================================
# TEST 2: IDOR: Sales Rep A truy cập đại lý/đơn/công nợ của B -> 404; tạo đơn qua POS ngoài phạm vi -> 404
# ==============================================================================
def test_02_idor_sales_rep_cross_access_returns_404():
    headers_rep_a = _get_auth_headers("sales_rep")
    headers_mgr = _get_auth_headers("sales_mgr")
    db = SessionLocal()
    srb = db.query(User).filter(User.username == "sales_rep_b").first()
    cus_b = db.query(Customer).filter(Customer.id == "CUS-002").first()
    srb_id = srb.id
    cus_b_id = cus_b.id
    cus_b_name = cus_b.name
    db.close()

    # Gán CUS-002 cho sales_rep_b
    client.post(f"/api/v1/customers/{cus_b_id}/assign", json={
        "assigned_staff_id": str(srb_id),
        "reason": "Gán đại lý cho nhân viên B phụ trách"
    }, headers=headers_mgr)

    # 1. Sales Rep A xem chi tiết đại lý của B -> 404
    res_cus = client.get(f"/api/v1/customers/{cus_b_id}", headers=headers_rep_a)
    assert res_cus.status_code == 404, f"Mong đợi 404 chống IDOR, nhận được: {res_cus.status_code}"

    # 2. Sales Rep A xem hạn mức công nợ của đại lý B -> 404
    res_credit = client.get(f"/api/v1/customers/{cus_b_id}/credit-profile", headers=headers_rep_a)
    assert res_credit.status_code == 404

    # 3. Sales Rep A xem điểm giao hàng của đại lý B -> 404
    res_addr = client.get(f"/api/v1/customers/{cus_b_id}/delivery-addresses", headers=headers_rep_a)
    assert res_addr.status_code == 404

    # 4. Sales Rep A tạo đơn bán hàng (POS) cho đại lý B -> 404
    order_payload = {
        "customer_id": cus_b_id,
        "customer_name": cus_b_name,
        "payment_method": "cash",
        "items": [
            {
                "product_id": "PRD-001",
                "name": "iPhone 15 Pro",
                "quantity": 1,
                "price": 100000.0
            }
        ]
    }
    res_order = client.post("/api/v1/orders", json=order_payload, headers=headers_rep_a)
    assert res_order.status_code == 404, f"Mong đợi 404 chặn tạo đơn ngoài phạm vi, nhận: {res_order.status_code}"


# ==============================================================================
# TEST 3: Đại lý chưa gán: Sales Rep không thấy; Manager thấy
# ==============================================================================
def test_03_unassigned_customer_visibility():
    headers_mgr = _get_auth_headers("sales_mgr")
    headers_rep_a = _get_auth_headers("sales_rep")

    # Hủy gán CUS-003
    client.post("/api/v1/customers/CUS-003/unassign", json={
        "reason": "Hủy gán để kiểm tra đại lý chưa phân công"
    }, headers=headers_mgr)

    # Sales Rep không thấy CUS-003
    res_rep = client.get("/api/v1/customers", headers=headers_rep_a)
    assert res_rep.status_code == 200
    cus_ids_rep = [c["id"] for c in res_rep.json()]
    assert "CUS-003" not in cus_ids_rep

    res_rep_detail = client.get("/api/v1/customers/CUS-003", headers=headers_rep_a)
    assert res_rep_detail.status_code == 404

    # Manager thấy CUS-003
    res_mgr = client.get("/api/v1/customers", headers=headers_mgr)
    assert res_mgr.status_code == 200
    cus_ids_mgr = [c["id"] for c in res_mgr.json()]
    assert "CUS-003" in cus_ids_mgr


# ==============================================================================
# TEST 4: Sales Rep tạo đại lý -> tự gán cho mình (cùng transaction)
# ==============================================================================
def test_04_sales_rep_creates_customer_auto_assigns_same_transaction():
    headers_rep_a = _get_auth_headers("sales_rep")
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    sra_id = sra.id
    db.close()

    new_cus_id = f"CUS-TEST-{int(time.time())}"
    cus_payload = {
        "id": new_cus_id,
        "name": "Đại Lý Tự Tạo Bởi Sales Rep",
        "phone": "0988776655",
        "email": "auto.assign@test.local",
        "address": "99 Nguyễn Trãi, Thanh Xuân, Hà Nội",
        "customer_group": "RETAIL"
    }

    res = client.post("/api/v1/customers", json=cus_payload, headers=headers_rep_a)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["id"] == new_cus_id
    assert str(data["assignedStaffId"]) == str(sra_id)

    # Kiểm tra trong DB: assignment và history được tạo tự động
    db = SessionLocal()
    assign = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == new_cus_id).first()
    assert assign is not None
    assert assign.assigned_staff_id == sra_id

    hist = db.query(CustomerAssignmentHistory).filter(CustomerAssignmentHistory.customer_id == new_cus_id).first()
    assert hist is not None
    assert hist.to_staff_id == str(sra_id)
    assert hist.action_type == "ASSIGN"
    db.close()


# ==============================================================================
# TEST 5: Manager/Admin thấy 100% đại lý
# ==============================================================================
def test_05_manager_and_admin_see_all_customers():
    headers_admin = _get_auth_headers("admin")
    headers_mgr = _get_auth_headers("sales_mgr")

    db = SessionLocal()
    total_db_customers = db.query(Customer).count()
    db.close()

    res_admin = client.get("/api/v1/customers", headers=headers_admin)
    assert res_admin.status_code == 200
    assert len(res_admin.json()) == total_db_customers

    res_mgr = client.get("/api/v1/customers", headers=headers_mgr)
    assert res_mgr.status_code == 200
    assert len(res_mgr.json()) == total_db_customers


# ==============================================================================
# TEST 6: Bulk transfer thành công 5 đại lý: đủ 5 lịch sử, chung 1 batch_id, 1 AuditLog
# ==============================================================================
def test_06_bulk_transfer_five_customers_success():
    headers_mgr = _get_auth_headers("sales_mgr")
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    srb = db.query(User).filter(User.username == "sales_rep_b").first()
    sra_id = sra.id
    srb_id = srb.id

    # Chuẩn bị 5 đại lý test gán cho sra
    test_cus_ids = []
    for i in range(1, 6):
        cid = f"CUS-BULK-OK-{i}"
        test_cus_ids.append(cid)
        c = db.query(Customer).filter(Customer.id == cid).first()
        if not c:
            c = Customer(id=cid, code=f"KH-BOK-{i}", name=f"Đại Lý Bulk {i}", phone="0911002233", address="Hà Nội")
            db.add(c)
        assign = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cid).first()
        if not assign:
            assign = CustomerAssignment(customer_id=cid, assigned_staff_id=sra_id)
            db.add(assign)
        else:
            assign.assigned_staff_id = sra_id
    db.commit()
    db.close()

    transfer_payload = {
        "from_staff_id": str(sra_id),
        "to_staff_id": str(srb_id),
        "transfer_all": False,
        "customer_ids": test_cus_ids,
        "reason": "Điều chuyển địa bàn do nhân viên A nhận công tác mới"
    }

    res = client.post("/api/v1/customers/assignments/bulk-transfer", json=transfer_payload, headers=headers_mgr)
    assert res.status_code == 200, res.text
    res_data = res.json()
    batch_id = res_data["batch_id"]
    assert res_data["transferred_count"] == 5

    # Kiểm tra trong DB:
    db = SessionLocal()
    # 1. Đủ 5 lịch sử với cùng batch_id
    histories = db.query(CustomerAssignmentHistory).filter(CustomerAssignmentHistory.batch_id == batch_id).all()
    assert len(histories) == 5
    for h in histories:
        assert h.from_staff_id == str(sra_id)
        assert h.to_staff_id == str(srb_id)
        assert h.action_type == "BULK_TRANSFER"

    # 2. Sinh đúng 1 AuditLog cho cả đợt bulk transfer
    audit = db.query(AuditLog).filter(
        AuditLog.entity_type == "CUSTOMER_ASSIGNMENT_BULK",
        AuditLog.entity_id == batch_id
    ).all()
    assert len(audit) == 1
    assert audit[0].action == "BULK_TRANSFER"
    db.close()


# ==============================================================================
# TEST 7: Bulk transfer có 1 ID sai -> rollback toàn bộ
# ==============================================================================
def test_07_bulk_transfer_with_one_invalid_customer_rolls_back():
    headers_mgr = _get_auth_headers("sales_mgr")
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    srb = db.query(User).filter(User.username == "sales_rep_b").first()
    sra_id = sra.id
    srb_id = srb.id

    # Chuẩn bị 2 đại lý thuộc sra và 1 đại lý KHÔNG thuộc sra
    cid_valid_1 = "CUS-ROLL-1"
    cid_valid_2 = "CUS-ROLL-2"
    cid_invalid = "CUS-ROLL-NOT-MINE"

    for cid in [cid_valid_1, cid_valid_2]:
        if not db.query(Customer).filter(Customer.id == cid).first():
            db.add(Customer(id=cid, code=cid, name=cid, phone="0900000001", address="TP. HCM"))
        assign = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cid).first()
        if not assign:
            db.add(CustomerAssignment(customer_id=cid, assigned_staff_id=sra_id))
        else:
            assign.assigned_staff_id = sra_id

    # cid_invalid gán cho srb (không phải sra)
    if not db.query(Customer).filter(Customer.id == cid_invalid).first():
        db.add(Customer(id=cid_invalid, code=cid_invalid, name=cid_invalid, phone="0900000002", address="TP. HCM"))
    assign_inv = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cid_invalid).first()
    if not assign_inv:
        db.add(CustomerAssignment(customer_id=cid_invalid, assigned_staff_id=srb_id))
    else:
        assign_inv.assigned_staff_id = srb_id
    db.commit()
    db.close()

    # Gọi chuyển giao từ sra sang srb nhưng kèm cả cid_invalid
    transfer_payload = {
        "from_staff_id": str(sra_id),
        "to_staff_id": str(srb_id),
        "transfer_all": False,
        "customer_ids": [cid_valid_1, cid_valid_2, cid_invalid],
        "reason": "Thử nghiệm chuyển giao có ID sai để kiểm tra rollback"
    }
    res = client.post("/api/v1/customers/assignments/bulk-transfer", json=transfer_payload, headers=headers_mgr)
    assert res.status_code == 400

    # Kiểm tra tính toàn vẹn: 2 đại lý hợp lệ vẫn phải giữ nguyên cho sra (không bị thay đổi dở dang)
    db = SessionLocal()
    assign_1 = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cid_valid_1).first()
    assign_2 = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cid_valid_2).first()
    assert assign_1.assigned_staff_id == sra_id
    assert assign_2.assigned_staff_id == sra_id
    db.close()


# ==============================================================================
# TEST 8: Validation: [] không cờ -> 400; transfer_all kèm ids -> 400; to_staff trùng/vô hiệu hóa/không phải sales_rep -> 400; reason < 5 ký tự -> 400/422
# ==============================================================================
def test_08_validations_bulk_transfer():
    headers_mgr = _get_auth_headers("sales_mgr")
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    srb = db.query(User).filter(User.username == "sales_rep_b").first()
    wh_user = db.query(User).filter(User.username == "warehouse").first()

    # Tạo user bị vô hiệu hóa
    inactive_user = db.query(User).filter(User.username == "inactive_rep").first()
    if not inactive_user:
        inactive_user = User(
            username="inactive_rep",
            email="inactive_rep@warehouse.local",
            hashed_password="hash",
            role=UserRole.SALES_REP.value,
            is_active=False
        )
        db.add(inactive_user)
        db.commit()

    sra_id = sra.id
    srb_id = srb.id
    wh_user_id = wh_user.id
    inactive_user_id = inactive_user.id
    db.close()

    # 1. Danh sách customer_ids rỗng và không bật transfer_all -> 400
    res1 = client.post("/api/v1/customers/assignments/bulk-transfer", json={
        "from_staff_id": str(sra_id),
        "to_staff_id": str(srb_id),
        "transfer_all": False,
        "customer_ids": [],
        "reason": "Lý do hợp lệ đủ dài"
    }, headers=headers_mgr)
    assert res1.status_code == 400

    # 2. transfer_all: True nhưng kèm danh sách ids -> 400
    res2 = client.post("/api/v1/customers/assignments/bulk-transfer", json={
        "from_staff_id": str(sra_id),
        "to_staff_id": str(srb_id),
        "transfer_all": True,
        "customer_ids": ["CUS-001"],
        "reason": "Lý do hợp lệ đủ dài"
    }, headers=headers_mgr)
    assert res2.status_code == 400

    # 3. to_staff trùng from_staff -> 400
    res3 = client.post("/api/v1/customers/assignments/bulk-transfer", json={
        "from_staff_id": str(sra_id),
        "to_staff_id": str(sra_id),
        "transfer_all": True,
        "customer_ids": [],
        "reason": "Lý do hợp lệ đủ dài"
    }, headers=headers_mgr)
    assert res3.status_code == 400

    # 4. to_staff bị vô hiệu hóa -> 400
    res4 = client.post("/api/v1/customers/assignments/bulk-transfer", json={
        "from_staff_id": str(sra_id),
        "to_staff_id": str(inactive_user_id),
        "transfer_all": True,
        "customer_ids": [],
        "reason": "Lý do hợp lệ đủ dài"
    }, headers=headers_mgr)
    assert res4.status_code == 400

    # 5. to_staff không phải Sales Rep (ví dụ là Warehouse) -> 400
    res5 = client.post("/api/v1/customers/assignments/bulk-transfer", json={
        "from_staff_id": str(sra_id),
        "to_staff_id": str(wh_user_id),
        "transfer_all": True,
        "customer_ids": [],
        "reason": "Lý do hợp lệ đủ dài"
    }, headers=headers_mgr)
    assert res5.status_code == 400

    # 6. Reason < 5 ký tự hoặc toàn khoảng trắng -> 400 hoặc 422
    res6a = client.post("/api/v1/customers/assignments/bulk-transfer", json={
        "from_staff_id": str(sra_id),
        "to_staff_id": str(srb_id),
        "transfer_all": True,
        "customer_ids": [],
        "reason": "abc"
    }, headers=headers_mgr)
    assert res6a.status_code in [400, 422]

    res6b = client.post("/api/v1/customers/assignments/bulk-transfer", json={
        "from_staff_id": str(sra_id),
        "to_staff_id": str(srb_id),
        "transfer_all": True,
        "customer_ids": [],
        "reason": "         "
    }, headers=headers_mgr)
    assert res6b.status_code in [400, 422]


# ==============================================================================
# TEST 9: Sales Rep gọi gán/chuyển giao -> bị từ chối (403)
# ==============================================================================
def test_09_sales_rep_cannot_assign_or_bulk_transfer():
    headers_rep = _get_auth_headers("sales_rep")
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    srb = db.query(User).filter(User.username == "sales_rep_b").first()
    sra_id = sra.id
    srb_id = srb.id
    db.close()

    # 1. Gọi gán đơn lẻ -> 403
    res_assign = client.post("/api/v1/customers/CUS-001/assign", json={
        "assigned_staff_id": str(srb_id),
        "reason": "Sales rep tự ý đổi người phụ trách"
    }, headers=headers_rep)
    assert res_assign.status_code == 403

    # 2. Gọi hủy phân công -> 403
    res_unassign = client.post("/api/v1/customers/CUS-001/unassign", json={
        "reason": "Sales rep tự ý hủy phân công"
    }, headers=headers_rep)
    assert res_unassign.status_code == 403

    # 3. Gọi chuyển giao hàng loạt -> 403
    res_bulk = client.post("/api/v1/customers/assignments/bulk-transfer", json={
        "from_staff_id": str(sra_id),
        "to_staff_id": str(srb_id),
        "transfer_all": True,
        "customer_ids": [],
        "reason": "Sales rep tự ý chuyển giao"
    }, headers=headers_rep)
    assert res_bulk.status_code == 403


# ==============================================================================
# TEST 10: Rollback khi AuditLog lỗi: dữ liệu phân công không đổi
# ==============================================================================
def test_10_rollback_when_audit_log_fails():
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    srb = db.query(User).filter(User.username == "sales_rep_b").first()
    admin_user = db.query(User).filter(User.username == "admin").first()

    sra_id = sra.id
    srb_id = srb.id

    cid = "CUS-TEST-AUDIT-FAIL"
    if not db.query(Customer).filter(Customer.id == cid).first():
        db.add(Customer(id=cid, code=cid, name=cid, phone="0933333333", address="Hà Nội"))
    assign = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cid).first()
    if not assign:
        db.add(CustomerAssignment(customer_id=cid, assigned_staff_id=sra_id))
    else:
        assign.assigned_staff_id = sra_id
    db.commit()

    # Mock log_activity gây lỗi Exception trong transaction
    with patch("app.services.customer_assignment_service.log_activity", side_effect=RuntimeError("Lỗi hệ thống AuditLog giả lập")):
        with pytest.raises(RuntimeError):
            bulk_transfer_assignments(
                db=db,
                from_staff_id=sra_id,
                to_staff_id=srb_id,
                transfer_all=False,
                customer_ids=[cid],
                reason="Kiểm tra rollback khi AuditLog gặp sự cố",
                performed_by_user=admin_user,
            )

    # Rollback transaction phiên hiện tại
    db.rollback()

    # Kiểm tra trong DB: phân công CUS-TEST-AUDIT-FAIL vẫn thuộc sra
    assign_check = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cid).first()
    assert assign_check.assigned_staff_id == sra_id
    db.close()


# ==============================================================================
# TEST 11: Concurrency: 2 bulk transfer đồng thời trên MySQL với with_for_update()
# ==============================================================================
def test_11_concurrency_bulk_transfers_with_lock():
    headers_mgr = _get_auth_headers("sales_mgr")
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    srb = db.query(User).filter(User.username == "sales_rep_b").first()
    sra_id = sra.id
    srb_id = srb.id

    cid = "CUS-CONCURRENCY-1"
    if not db.query(Customer).filter(Customer.id == cid).first():
        db.add(Customer(id=cid, code=cid, name=cid, phone="0944444444", address="Hà Nội"))
    assign = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cid).first()
    if not assign:
        db.add(CustomerAssignment(customer_id=cid, assigned_staff_id=sra_id))
    else:
        assign.assigned_staff_id = sra_id
    db.commit()
    db.close()

    results = []

    def run_transfer(target_staff_id):
        r = client.post("/api/v1/customers/assignments/bulk-transfer", json={
            "from_staff_id": str(sra_id),
            "to_staff_id": str(target_staff_id),
            "transfer_all": False,
            "customer_ids": [cid],
            "reason": f"Chuyển giao đồng thời sang nhân viên {target_staff_id}"
        }, headers=headers_mgr)
        results.append(r.status_code)

    t1 = threading.Thread(target=run_transfer, args=(srb_id,))
    t2 = threading.Thread(target=run_transfer, args=(srb_id,))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Nhờ with_for_update(): một request xử lý trước và thành công (200), request kia nhận lỗi do trạng thái đã đổi
    assert 200 in results
    assert 400 in results or results.count(200) == 1


# ==============================================================================
# TEST 12: Seed chạy 2 lần không trùng bản ghi
# ==============================================================================
def test_12_seed_idempotency_running_twice():
    db = SessionLocal()
    ensure_seed_assignments(db)
    count_1 = db.query(CustomerAssignment).count()

    # Chạy lần 2
    ensure_seed_assignments(db)
    count_2 = db.query(CustomerAssignment).count()

    assert count_1 == count_2, "Seed chạy lần 2 không được làm tăng hoặc trùng lặp số bản ghi"
    db.close()


# ==============================================================================
# TEST 13: Vô hiệu hóa Sales Rep còn đại lý -> có cảnh báo kèm số lượng đại lý
# ==============================================================================
def test_13_lock_sales_rep_with_assigned_customers_returns_warning():
    headers_admin = _get_auth_headers("admin")
    db = SessionLocal()
    sra = db.query(User).filter(User.username == "sales_rep").first()
    sra_id = sra.id

    # Đảm bảo sra có ít nhất 1 đại lý
    assign = db.query(CustomerAssignment).filter(CustomerAssignment.assigned_staff_id == sra_id).first()
    if not assign:
        cus = db.query(Customer).first()
        assign = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cus.id).first()
        assign.assigned_staff_id = sra_id
        db.commit()
    db.close()

    res = client.post(f"/api/v1/users/{sra_id}/lock", json={
        "reason": "Nhân viên tạm nghỉ thai sản"
    }, headers=headers_admin)
    assert res.status_code == 200
    data = res.json()
    assert "handover_warning" in data
    assert data["handover_warning"] is not None
    assert "phụ trách" in data["handover_warning"]
    assert data.get("assigned_customer_count", 0) > 0

    # Mở khóa lại cho các test tiếp theo
    client.post(f"/api/v1/users/{sra_id}/unlock", headers=headers_admin)
