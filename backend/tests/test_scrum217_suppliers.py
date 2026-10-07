"""
test_scrum217_suppliers.py — SCRUM-217 / SCRUM-413 Unit Tests
Kiểm thử quản lý danh mục nhà cung cấp và điều kiện không cho xóa.

Subtasks được kiểm thử:
  - SCRUM-409: CRUD cơ bản (tạo, cập nhật, lấy danh sách, chi tiết)
  - SCRUM-408: Endpoint DELETE trả về action + warning đúng
  - SCRUM-410: Validator mã NCC, mã số thuế, điều khoản thanh toán
  - SCRUM-412: NCC có phiếu nhập → deactivated, không bị xóa cứng
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

BASE = "/api/v1/suppliers"


# ─── Helper ────────────────────────────────────────────────────────────────────

def _unique_tax(length: int = 10) -> str:
    """Sinh mã số thuế ngẫu nhiên hợp lệ (10 hoặc 13 chữ số)."""
    import random
    return "".join([str(random.randint(0, 9)) for _ in range(length)])


def _create_supplier(**kwargs) -> dict:
    uid = uuid.uuid4().hex[:6]
    payload = {
        "name": f"NCC Test {uid}",
        "contact_person": "Nguyễn Test",
        "phone": "0243000000",
        "email": f"ncc_{uid}@test.local",
        "tax_code": _unique_tax(),
        "payment_terms": "NET30",
    }
    payload.update(kwargs)
    res = client.post(BASE, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


# ─── SCRUM-409: CRUD cơ bản ────────────────────────────────────────────────────

class TestSupplierCRUD:

    def test_list_suppliers_returns_data(self):
        res = client.get(BASE)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_list_suppliers_filter_by_status(self):
        res = client.get(BASE, params={"status": "active"})
        assert res.status_code == 200
        for sup in res.json():
            assert sup["status"] == "active"

    def test_list_suppliers_search(self):
        sup = _create_supplier(name="NCC Unique Tìm Kiếm 99")
        res = client.get(BASE, params={"search": "Unique Tìm Kiếm"})
        assert res.status_code == 200
        names = [s["name"] for s in res.json()]
        assert sup["name"] in names

    def test_create_supplier_with_all_fields(self):
        tax = _unique_tax()
        payload = {
            "name": "NCC Đầy Đủ Thông Tin",
            "tax_code": tax,
            "payment_terms": "NET60",
            "contact_person": "Trần Văn B",
            "phone": "0243111222",
            "email": "ncc_full@test.local",
            "address": "123 Đường Test, Hà Nội",
        }
        res = client.post(BASE, json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["tax_code"] == tax
        assert data["payment_terms"] == "NET60"
        assert data["status"] == "active"

    def test_create_supplier_auto_generates_code(self):
        sup = _create_supplier()
        assert sup["code"].startswith("NCC-")

    def test_get_supplier_detail(self):
        sup = _create_supplier()
        res = client.get(f"{BASE}/{sup['id']}")
        assert res.status_code == 200
        assert res.json()["id"] == sup["id"]

    def test_get_supplier_by_code(self):
        sup = _create_supplier()
        res = client.get(f"{BASE}/{sup['code']}")
        assert res.status_code == 200
        assert res.json()["code"] == sup["code"]

    def test_get_supplier_not_found(self):
        res = client.get(f"{BASE}/SUP-NOTEXIST-9999")
        assert res.status_code == 404

    def test_update_supplier_contact(self):
        sup = _create_supplier()
        res = client.put(f"{BASE}/{sup['id']}", json={"contact_person": "Lê Văn Mới"})
        assert res.status_code == 200
        assert res.json()["contact_person"] == "Lê Văn Mới"

    def test_update_supplier_payment_terms(self):
        sup = _create_supplier()
        res = client.put(f"{BASE}/{sup['id']}", json={"payment_terms": "COD"})
        assert res.status_code == 200
        assert res.json()["payment_terms"] == "COD"


# ─── SCRUM-410: Validator ──────────────────────────────────────────────────────

class TestSupplierValidation:

    def test_invalid_tax_code_letters(self):
        """Mã số thuế chứa chữ → 422."""
        res = client.post(BASE, json={"name": "NCC Test", "tax_code": "ABCDE12345"})
        assert res.status_code == 422

    def test_invalid_tax_code_wrong_length(self):
        """Mã số thuế 7 chữ số → 422."""
        res = client.post(BASE, json={"name": "NCC Test", "tax_code": "1234567"})
        assert res.status_code == 422

    def test_valid_tax_code_10_digits(self):
        """Mã số thuế 10 chữ số → hợp lệ."""
        tax10 = _unique_tax(10)
        sup = _create_supplier(tax_code=tax10)
        assert sup["tax_code"] == tax10

    def test_valid_tax_code_13_digits(self):
        """Mã số thuế 13 chữ số → hợp lệ."""
        tax13 = _unique_tax(13)
        sup = _create_supplier(tax_code=tax13)
        assert sup["tax_code"] == tax13

    def test_duplicate_tax_code_rejected(self):
        """Trùng mã số thuế → 409."""
        tax = _unique_tax()
        _create_supplier(tax_code=tax)
        res = client.post(BASE, json={"name": "NCC Trùng MST", "tax_code": tax})
        assert res.status_code == 409
        assert "Mã số thuế" in res.json()["detail"]

    def test_payment_terms_too_long(self):
        """Điều khoản > 100 ký tự → 422."""
        res = client.post(BASE, json={"name": "NCC Test", "payment_terms": "X" * 101})
        assert res.status_code == 422

    def test_invalid_status_value(self):
        """Status không hợp lệ → 422."""
        res = client.post(BASE, json={"name": "NCC Test", "status": "pending"})
        assert res.status_code == 422

    def test_name_too_short(self):
        """Tên quá ngắn → 422."""
        res = client.post(BASE, json={"name": "A"})
        assert res.status_code == 422

    def test_update_duplicate_tax_code_rejected(self):
        """Cập nhật trùng MST của NCC khác → 409."""
        tax = _unique_tax()
        _create_supplier(tax_code=tax)
        sup2 = _create_supplier()
        res = client.put(f"{BASE}/{sup2['id']}", json={"tax_code": tax})
        assert res.status_code == 409


# ─── SCRUM-408 + SCRUM-412: Xóa thông minh ────────────────────────────────────

class TestSupplierDeleteBehavior:

    def test_delete_supplier_without_receipts(self):
        """NCC chưa có phiếu nhập → xóa cứng, action='deleted'."""
        sup = _create_supplier()
        res = client.delete(f"{BASE}/{sup['id']}")
        assert res.status_code == 200
        data = res.json()
        assert data["action"] == "deleted"
        assert data["warning"] is None

        # Xác nhận đã bị xóa
        assert client.get(f"{BASE}/{sup['id']}").status_code == 404

    def test_delete_supplier_with_receipts_deactivates(self):
        """
        NCC seed (has_receipts=True) → không được xóa,
        action='deactivated' + warning có nội dung.
        SCRUM-408 + SCRUM-412
        """
        # SUP-004 (Sony) trong seed: has_receipts=False → dùng SUP-001 (Apple): has_receipts=True
        res = client.delete(f"{BASE}/SUP-001")
        assert res.status_code == 200
        data = res.json()
        assert data["action"] == "deactivated"
        assert data["warning"] is not None
        assert "phiếu nhập" in data["warning"]

        # Xác nhận NCC vẫn còn trong DB nhưng inactive
        detail = client.get(f"{BASE}/SUP-001").json()
        assert detail["status"] == "inactive"

    def test_delete_already_inactive_supplier_with_receipts(self):
        """Xóa NCC đã inactive mà có phiếu nhập → vẫn deactivated, không lỗi."""
        # Đảm bảo SUP-001 đã inactive từ test trước (hoặc gọi lại)
        client.delete(f"{BASE}/SUP-001")  # idempotent
        res = client.delete(f"{BASE}/SUP-001")
        assert res.status_code == 200
        assert res.json()["action"] == "deactivated"

    def test_delete_nonexistent_supplier(self):
        """Xóa NCC không tồn tại → 404."""
        res = client.delete(f"{BASE}/SUP-GHOST-0000")
        assert res.status_code == 404

    def test_deactivated_supplier_appears_in_inactive_filter(self):
        """Sau khi deactivate, NCC xuất hiện khi lọc status=inactive."""
        client.delete(f"{BASE}/SUP-002")  # Samsung có has_receipts=True
        res = client.get(BASE, params={"status": "inactive"})
        assert res.status_code == 200
        ids = [s["id"] for s in res.json()]
        assert "SUP-002" in ids
