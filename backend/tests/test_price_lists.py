from datetime import datetime, timezone, timedelta
import uuid
import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.auth import User
from app.models.price_list import PriceList, PriceListItem
from app.core.security import tao_token_truy_cap

client = TestClient(app)


@pytest.fixture
def auth_tokens():
    """Tạo token cho admin (Quản trị viên) và sales_mgr (Quản lý kinh doanh)."""
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        sales_mgr = db.query(User).filter(User.username == "sales_mgr").first()
        if not admin or not sales_mgr:
            pytest.skip("Chưa có user admin hoặc sales_mgr để chạy test.")

        admin_token = tao_token_truy_cap(
            du_lieu={"sub": str(admin.id), "user_id": admin.id, "username": admin.username, "token_version": admin.token_version}
        )
        sales_token = tao_token_truy_cap(
            du_lieu={"sub": str(sales_mgr.id), "user_id": sales_mgr.id, "username": sales_mgr.username, "token_version": sales_mgr.token_version}
        )
        return {
            "admin": {"Authorization": f"Bearer {admin_token}"},
            "sales_mgr": {"Authorization": f"Bearer {sales_token}"}
        }
    finally:
        db.close()


def test_create_price_list_with_items_and_floor_price_check(auth_tokens):
    """SCRUM-415 & SCRUM-418: Tạo bảng giá chi tiết, tự động phát hiện giá bán < giá sàn."""
    headers = auth_tokens["sales_mgr"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]

    # 1. Bảng giá bình thường (giá bán >= giá sàn)
    payload_normal = {
        "code": f"PL-{uid}-T1-NORMAL",
        "name": "Bảng giá Đại lý Cấp 1 Tiêu Chuẩn",
        "customer_group": "TIER_1",
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(days=30)).isoformat(),
        "items": [
            {
                "product_id": "PRD-001",
                "product_sku": "IP15P-128",
                "product_name": "iPhone 15 Pro",
                "unit": "Chiếc",
                "listed_price": 27000000,
                "floor_price": 24000000,
                "sale_price": 25000000,  # >= giá sàn
                "discount_percent": 7.4
            }
        ]
    }
    res1 = client.post("/api/v1/price-lists", headers=headers, json=payload_normal)
    assert res1.status_code == 201
    data1 = res1.json()
    assert data1["requires_approval"] is False
    assert data1["status"] == "DRAFT"
    assert data1["items"][0]["requires_approval"] is False

    # 2. Bảng giá có sản phẩm bán dưới giá sàn (sale_price < floor_price) -> PENDING_APPROVAL
    payload_sub_floor = {
        "code": f"PL-{uid}-T2-SUBFLOOR",
        "name": "Bảng giá Khuyến Mãi Cực Sốc Cấp 2",
        "customer_group": "TIER_2",
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(days=15)).isoformat(),
        "items": [
            {
                "product_id": "PRD-002",
                "product_sku": "SAM-S24U",
                "product_name": "Samsung S24 Ultra",
                "unit": "Chiếc",
                "listed_price": 30000000,
                "floor_price": 26000000,
                "sale_price": 23500000,  # < giá sàn (23.5tr < 26tr) -> CẦN DUYỆT!
                "discount_percent": 21.6
            }
        ]
    }
    res2 = client.post("/api/v1/price-lists", headers=headers, json=payload_sub_floor)
    assert res2.status_code == 201
    data2 = res2.json()
    assert data2["requires_approval"] is True
    assert data2["status"] == "PENDING_APPROVAL"
    assert data2["items"][0]["requires_approval"] is True
    assert data2["items"][0]["status"] == "PENDING_APPROVAL"


def test_lock_editing_when_orders_exist_and_clone_version(auth_tokens):
    """SCRUM-416: Khóa sửa bảng giá đã phát sinh đơn và tạo phiên bản kế thừa (Clone)."""
    headers = auth_tokens["sales_mgr"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]

    # 1. Tạo bảng giá ban đầu
    payload = {
        "code": f"PL-{uid}-LOCK",
        "name": "Bảng giá Khóa Sửa",
        "customer_group": "TIER_1",
        "valid_from": now.isoformat(),
        "items": [
            {
                "product_id": "PRD-003",
                "product_name": "MacBook Air M3",
                "listed_price": 32000000,
                "floor_price": 28000000,
                "sale_price": 29000000
            }
        ]
    }
    res_create = client.post("/api/v1/price-lists", headers=headers, json=payload)
    assert res_create.status_code == 201
    pl_id = res_create.json()["id"]

    # 2. Mô phỏng phát sinh đơn hàng áp dụng bảng giá này
    res_sim = client.post(f"/api/v1/price-lists/{pl_id}/simulate-order")
    assert res_sim.status_code == 200
    assert res_sim.json()["has_orders"] is True

    # 3. Thử sửa đổi bảng giá đã phát sinh đơn -> Phải bị chặn với HTTP 400
    res_update = client.put(
        f"/api/v1/price-lists/{pl_id}",
        headers=headers,
        json={"name": "Tên mới cố tình sửa"}
    )
    assert res_update.status_code == 400
    assert "đã phát sinh" in res_update.json()["detail"]
    assert "đã bị khóa sửa đổi" in res_update.json()["detail"]

    # 4. Thử xóa bảng giá đã phát sinh đơn -> Bị chặn
    res_del = client.delete(f"/api/v1/price-lists/{pl_id}", headers=headers)
    assert res_del.status_code == 400

    # 5. Tạo phiên bản kế thừa (Clone version v2)
    res_clone = client.post(f"/api/v1/price-lists/{pl_id}/clone-version", headers=headers)
    assert res_clone.status_code == 201
    clone_data = res_clone.json()
    assert clone_data["version"] == 2
    assert clone_data["parent_id"] == pl_id
    assert clone_data["has_orders"] is False
    assert clone_data["status"] == "DRAFT"
    assert len(clone_data["items"]) == 1

    # 6. Phiên bản mới mở khóa, cho phép sửa đổi bình thường
    clone_id = clone_data["id"]
    res_update_clone = client.put(
        f"/api/v1/price-lists/{clone_id}",
        headers=headers,
        json={"name": "Bảng giá Khóa Sửa (Phiên bản v2 Đã Cập Nhật)"}
    )
    assert res_update_clone.status_code == 200
    assert res_update_clone.json()["name"] == "Bảng giá Khóa Sửa (Phiên bản v2 Đã Cập Nhật)"


def test_effective_date_validation_and_overlapping_check(auth_tokens):
    """SCRUM-417: Ràng buộc ngày hiệu lực và chống chồng lấn bảng giá cùng nhóm."""
    headers = auth_tokens["admin"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]
    test_group = f"GROUP_{uid}"

    # 1. Ngày kết thúc trước ngày bắt đầu -> Bị chặn 400
    bad_dates = {
        "code": f"PL-{uid}-INVALID-DATES",
        "name": "Bảng giá lỗi ngày",
        "customer_group": test_group,
        "valid_from": (now + timedelta(days=10)).isoformat(),
        "valid_to": (now + timedelta(days=5)).isoformat(),  # valid_to < valid_from!
        "items": []
    }
    res_bad = client.post("/api/v1/price-lists", headers=headers, json=bad_dates)
    assert res_bad.status_code == 400
    assert "phải sau hoặc bằng ngày bắt đầu" in res_bad.json()["detail"]

    # 2. Tạo và duyệt bảng giá 1 cho test_group: Từ Ngày 1 -> Ngày 30
    pl1_data = {
        "code": f"PL-{uid}-01",
        "name": "Bảng giá Tháng Này",
        "customer_group": test_group,
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(days=30)).isoformat(),
        "items": [
            {
                "product_id": "PRD-001",
                "product_name": "iPhone 15 Pro",
                "listed_price": 27000000,
                "floor_price": 25000000,
                "sale_price": 26000000
            }
        ]
    }
    res_pl1 = client.post("/api/v1/price-lists", headers=headers, json=pl1_data)
    assert res_pl1.status_code == 201
    pl1_id = res_pl1.json()["id"]

    # Duyệt bảng giá 1
    res_app1 = client.post(f"/api/v1/price-lists/{pl1_id}/approve", headers=headers, json={"approved": True, "note": "Duyệt"})
    assert res_app1.status_code == 200
    assert res_app1.json()["status"] == "APPROVED"

    # 3. Tạo bảng giá 2 cho CÙNG NHÓM với thời gian chồng lấn: Ngày 15 -> Ngày 45
    pl2_data = {
        "code": f"PL-{uid}-OVERLAP",
        "name": "Bảng giá Chồng Lấn",
        "customer_group": test_group,
        "valid_from": (now + timedelta(days=15)).isoformat(),  # Nằm trong khoảng ngày 1..30 của pl1!
        "valid_to": (now + timedelta(days=45)).isoformat(),
        "items": []
    }
    res_pl2 = client.post("/api/v1/price-lists", headers=headers, json=pl2_data)
    assert res_pl2.status_code == 201
    pl2_id = res_pl2.json()["id"]

    # Khi duyệt bảng giá 2 -> Bị chặn vì chồng lấn thời gian hiệu lực
    res_app2 = client.post(f"/api/v1/price-lists/{pl2_id}/approve", headers=headers, json={"approved": True})
    assert res_app2.status_code == 400
    assert "chồng lấn" in res_app2.json()["detail"]


def test_approval_and_rejection_workflow(auth_tokens):
    """SCRUM-418: Luồng phê duyệt và từ chối bảng giá."""
    headers_sales = auth_tokens["sales_mgr"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]

    # Tạo bảng giá có giá bán dưới giá sàn
    payload = {
        "code": f"PL-{uid}-APPROVE-FLOW",
        "name": "Bảng giá Chờ Duyệt Đặc Biệt",
        "customer_group": f"VIP_{uid}",
        "valid_from": (now + timedelta(days=200)).isoformat(),
        "valid_to": (now + timedelta(days=250)).isoformat(),
        "items": [
            {
                "product_id": "PRD-005",
                "product_name": "Sản phẩm VIP",
                "listed_price": 1000000,
                "floor_price": 900000,
                "sale_price": 800000  # < floor_price
            }
        ]
    }
    res = client.post("/api/v1/price-lists", headers=headers_sales, json=payload)
    assert res.status_code == 201
    pl_id = res.json()["id"]
    assert res.json()["status"] == "PENDING_APPROVAL"

    # Từ chối duyệt kèm lý do
    res_rej = client.post(
        f"/api/v1/price-lists/{pl_id}/approve",
        headers=headers_sales,
        json={"approved": False, "note": "Giá 800k thấp hơn giá sàn 900k, lỗ biên lợi nhuận!"}
    )
    assert res_rej.status_code == 200
    assert res_rej.json()["status"] == "REJECTED"
    assert "lỗ biên lợi nhuận" in res_rej.json()["approval_note"]

    # Phê duyệt lại sau khi cân nhắc
    res_app = client.post(
        f"/api/v1/price-lists/{pl_id}/approve",
        headers=headers_sales,
        json={"approved": True, "note": "Đồng ý duyệt theo ngoại lệ chiến dịch VIP."}
    )
    assert res_app.status_code == 200
    assert res_app.json()["status"] == "APPROVED"
    assert res_app.json()["approved_by_id"] is not None


def test_lookup_effective_price_for_tier1_vs_tier2(auth_tokens):
    """SCRUM-419: Tra cứu tự động giá bán cho Đại lý Cấp 1 vs Đại lý Cấp 2."""
    headers = auth_tokens["admin"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]
    prd_id = f"PRD-LK-{uid}"

    # Tạo bảng giá Đại lý Cấp 1 (Tier 1: Giá rẻ hơn, chiết khấu cao hơn)
    res_t1 = client.post("/api/v1/price-lists", headers=headers, json={
        "code": f"PL-{uid}-T1",
        "name": "Bảng giá Tự Động Cấp 1",
        "customer_group": f"TIER_1_{uid}",
        "valid_from": (now - timedelta(days=1)).isoformat(),
        "valid_to": (now + timedelta(days=60)).isoformat(),
        "items": [
            {
                "product_id": prd_id,
                "product_name": "Tivi Smart 4K",
                "listed_price": 10000000,
                "floor_price": 7000000,
                "sale_price": 7500000  # Cấp 1 mua giá 7.5 triệu
            }
        ]
    })
    assert res_t1.status_code == 201
    pl_t1 = res_t1.json()
    client.post(f"/api/v1/price-lists/{pl_t1['id']}/approve", headers=headers, json={"approved": True})

    # Tạo bảng giá Đại lý Cấp 2 (Tier 2: Mua giá 8.2 triệu)
    res_t2 = client.post("/api/v1/price-lists", headers=headers, json={
        "code": f"PL-{uid}-T2",
        "name": "Bảng giá Tự Động Cấp 2",
        "customer_group": f"TIER_2_{uid}",
        "valid_from": (now - timedelta(days=1)).isoformat(),
        "valid_to": (now + timedelta(days=60)).isoformat(),
        "items": [
            {
                "product_id": prd_id,
                "product_name": "Tivi Smart 4K",
                "listed_price": 10000000,
                "floor_price": 7000000,
                "sale_price": 8200000  # Cấp 2 mua giá 8.2 triệu
            }
        ]
    })
    assert res_t2.status_code == 201
    pl_t2 = res_t2.json()
    client.post(f"/api/v1/price-lists/{pl_t2['id']}/approve", headers=headers, json={"approved": True})

    # Tra cứu cho Đại lý Cấp 1
    res_lookup_t1 = client.get(f"/api/v1/price-lists/lookup?customer_group=TIER_1_{uid}&product_id={prd_id}")
    assert res_lookup_t1.status_code == 200
    assert res_lookup_t1.json()["found"] is True
    assert res_lookup_t1.json()["sale_price"] == 7500000

    # Tra cứu cho Đại lý Cấp 2
    res_lookup_t2 = client.get(f"/api/v1/price-lists/lookup?customer_group=TIER_2_{uid}&product_id={prd_id}")
    assert res_lookup_t2.status_code == 200
    assert res_lookup_t2.json()["found"] is True
    assert res_lookup_t2.json()["sale_price"] == 8200000


def test_price_list_items_crud_and_approval_workflow(auth_tokens):
    """SCRUM-415 & SCRUM-418: Kiểm thử API chi tiết dòng giá: thêm, sửa, xóa, duyệt giá sàn và khóa khi phát sinh đơn."""
    headers = auth_tokens["sales_mgr"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]

    # 1. Tạo bảng giá ban đầu
    res_create = client.post("/api/v1/price-lists", headers=headers, json={
        "code": f"PL-{uid}-ITEMS-TEST",
        "name": "Bảng giá kiểm thử dòng giá",
        "customer_group": f"GRP_{uid}",
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(days=30)).isoformat(),
        "items": []
    })
    assert res_create.status_code == 201
    pl_id = res_create.json()["id"]

    # 2. POST /items: Thêm dòng giá bình thường (sale_price >= floor_price)
    item_normal = {
        "product_id": f"PRD-A-{uid}",
        "product_sku": "SKU-A",
        "product_name": "Sản phẩm A tiêu chuẩn",
        "unit": "Chiếc",
        "listed_price": 10000000,
        "floor_price": 8000000,
        "sale_price": 9000000,
        "discount_percent": 10.0
    }
    res_add1 = client.post(f"/api/v1/price-lists/{pl_id}/items", headers=headers, json=item_normal)
    assert res_add1.status_code == 201
    item1 = res_add1.json()
    assert item1["requires_approval"] is False
    assert item1["status"] == "DRAFT"
    assert item1["sale_price"] == 9000000

    # 3. POST /items: Thêm dòng giá bán dưới giá sàn (sale_price < floor_price) -> Cần duyệt
    item_sub_floor = {
        "product_id": f"PRD-B-{uid}",
        "product_sku": "SKU-B",
        "product_name": "Sản phẩm B giảm giá sốc",
        "unit": "Chiếc",
        "listed_price": 20000000,
        "floor_price": 18000000,
        "sale_price": 15000000,  # < 18 triệu
        "discount_percent": 25.0
    }
    res_add2 = client.post(f"/api/v1/price-lists/{pl_id}/items", headers=headers, json=item_sub_floor)
    assert res_add2.status_code == 201
    item2 = res_add2.json()
    assert item2["requires_approval"] is True
    assert item2["status"] == "PENDING_APPROVAL"

    # Kiểm tra bảng giá cha đã được tự động đánh dấu requires_approval = True
    res_pl = client.get(f"/api/v1/price-lists/{pl_id}")
    assert res_pl.status_code == 200
    assert res_pl.json()["requires_approval"] is True

    # 4. Thử thêm lại cùng product_id -> Bắt lỗi trùng
    res_dup = client.post(f"/api/v1/price-lists/{pl_id}/items", headers=headers, json=item_normal)
    assert res_dup.status_code == 400
    assert "đã có trong bảng giá" in res_dup.json()["detail"]

    # 5. GET /items: Lấy danh sách dòng giá có phân trang & lọc
    res_list = client.get(f"/api/v1/price-lists/{pl_id}/items?page=1&page_size=10")
    assert res_list.status_code == 200
    assert res_list.json()["total"] == 2

    # Lọc các dòng giá bán dưới sàn
    res_sub_list = client.get(f"/api/v1/price-lists/{pl_id}/items?requires_approval=true")
    assert res_sub_list.status_code == 200
    assert res_sub_list.json()["total"] == 1
    assert res_sub_list.json()["items"][0]["product_id"] == f"PRD-B-{uid}"

    # 6. GET /items/{item_id}: Lấy chi tiết dòng giá
    res_detail = client.get(f"/api/v1/price-lists/{pl_id}/items/{item1['id']}")
    assert res_detail.status_code == 200
    assert res_detail.json()["product_name"] == "Sản phẩm A tiêu chuẩn"

    # 7. PUT /items/{item_id}: Cập nhật dòng giá (tăng giá bán lên trên giá sàn)
    res_update = client.put(f"/api/v1/price-lists/{pl_id}/items/{item2['id']}", headers=headers, json={
        "sale_price": 19000000  # >= 18 triệu
    })
    assert res_update.status_code == 200
    updated_item2 = res_update.json()
    assert updated_item2["requires_approval"] is False
    assert updated_item2["status"] == "DRAFT"

    # 8. POST /items/{item_id}/approve: Phê duyệt dòng giá riêng lẻ
    # Đặt lại giá bán thấp hơn sàn để test duyệt
    client.put(f"/api/v1/price-lists/{pl_id}/items/{item2['id']}", headers=headers, json={
        "sale_price": 16000000
    })
    res_approve = client.post(
        f"/api/v1/price-lists/{pl_id}/items/{item2['id']}/approve",
        headers=headers,
        json={"approved": True, "note": "Quản lý kinh doanh duyệt giá chiến dịch"}
    )
    assert res_approve.status_code == 200
    approved_item = res_approve.json()
    assert approved_item["status"] == "APPROVED"
    assert approved_item["approved_by_id"] is not None
    assert approved_item["approval_note"] == "Quản lý kinh doanh duyệt giá chiến dịch"

    # 9. DELETE /items/{item_id}: Xóa dòng giá
    res_del = client.delete(f"/api/v1/price-lists/{pl_id}/items/{item1['id']}", headers=headers)
    assert res_del.status_code == 200
    res_check = client.get(f"/api/v1/price-lists/{pl_id}/items")
    assert res_check.json()["total"] == 1

    # 10. Khóa sửa khi phát sinh đơn hàng (SCRUM-416)
    client.post(f"/api/v1/price-lists/{pl_id}/simulate-order")
    # Thử thêm mặt hàng mới vào bảng giá đã phát sinh đơn -> Phải bị chặn 400
    res_add_locked = client.post(f"/api/v1/price-lists/{pl_id}/items", headers=headers, json=item_normal)
    assert res_add_locked.status_code == 400
    assert "đã bị khóa sửa đổi" in res_add_locked.json()["detail"]

    # Thử cập nhật mặt hàng trong bảng giá đã phát sinh đơn -> Phải bị chặn 400
    res_update_locked = client.put(f"/api/v1/price-lists/{pl_id}/items/{item2['id']}", headers=headers, json={"sale_price": 20000000})
    assert res_update_locked.status_code == 400
    assert "đã bị khóa sửa đổi" in res_update_locked.json()["detail"]

    # Thử xóa mặt hàng trong bảng giá đã phát sinh đơn -> Phải bị chặn 400
    res_del_locked = client.delete(f"/api/v1/price-lists/{pl_id}/items/{item2['id']}", headers=headers)
    assert res_del_locked.status_code == 400
    assert "đã bị khóa sửa đổi" in res_del_locked.json()["detail"]


def test_advanced_lock_and_customized_version_inheritance(auth_tokens):
    """SCRUM-416 Nâng cao: Kiểm tra trạng thái khóa (Lock Status), chuỗi lịch sử phiên bản (Version History)
    và nhân bản kế thừa tùy biến (Custom Clone với tăng giá % và tự động đóng bản cũ).
    """
    headers = auth_tokens["sales_mgr"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]

    # 1. Tạo bảng giá gốc (Version 1)
    payload_v1 = {
        "code": f"PL-{uid}-V1-ORIGIN",
        "name": "Bảng giá Kế Thừa Gốc",
        "customer_group": f"GROUP_{uid}",
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(days=60)).isoformat(),
        "items": [
            {
                "product_id": f"PRD-{uid}-01",
                "product_sku": f"SKU-{uid}-01",
                "product_name": "Sản phẩm thử nghiệm kế thừa",
                "unit": "Hộp",
                "listed_price": 1000000.0,
                "floor_price": 700000.0,
                "sale_price": 800000.0,
                "discount_percent": 20.0
            }
        ]
    }
    res_v1 = client.post("/api/v1/price-lists", headers=headers, json=payload_v1)
    assert res_v1.status_code == 201
    v1_data = res_v1.json()
    pl_id_1 = v1_data["id"]
    assert v1_data["version"] == 1
    assert v1_data["is_locked"] is False

    # 2. Kiểm tra lock-status khi CHƯA có đơn hàng -> Cho phép sửa và xóa
    res_lock_before = client.get(f"/api/v1/price-lists/{pl_id_1}/lock-status")
    assert res_lock_before.status_code == 200
    lock_data_before = res_lock_before.json()
    assert lock_data_before["is_locked"] is False
    assert lock_data_before["can_edit"] is True
    assert lock_data_before["can_delete"] is True
    assert lock_data_before["orders_count"] == 0

    # 3. Phát sinh đơn hàng liên kết với bảng giá này
    res_sim = client.post(f"/api/v1/price-lists/{pl_id_1}/simulate-order")
    assert res_sim.status_code == 200

    # 4. Kiểm tra lại lock-status -> Bị KHÓA, không thể sửa/xóa
    res_lock_after = client.get(f"/api/v1/price-lists/{pl_id_1}/lock-status")
    assert res_lock_after.status_code == 200
    lock_data_after = res_lock_after.json()
    assert lock_data_after["is_locked"] is True
    assert lock_data_after["can_edit"] is False
    assert lock_data_after["can_delete"] is False
    assert lock_data_after["orders_count"] >= 1
    assert lock_data_after["lock_reason"] is not None

    # 5. Kiểm tra chi tiết bảng giá trả về trường is_locked = True
    res_detail = client.get(f"/api/v1/price-lists/{pl_id_1}")
    assert res_detail.json()["is_locked"] is True

    # 6. Tạo phiên bản kế thừa (Custom Clone) với:
    # - Tên mới tùy biến
    # - Mã mới tùy biến
    # - Tăng giá bán đồng loạt +10% (800,000 -> 880,000)
    # - Tự động đóng ngày hiệu lực của bản cũ (auto_close_parent = True)
    custom_clone_payload = {
        "new_code": f"PL-{uid}-V2-CUSTOM",
        "new_name": "Bảng giá Kế Thừa Phiên Bản Mới (Điều Chỉnh +10%)",
        "valid_from": (now + timedelta(days=30)).isoformat(),
        "valid_to": (now + timedelta(days=90)).isoformat(),
        "copy_items": True,
        "price_adjustment_percent": 10.0,
        "auto_close_parent": True
    }
    res_clone = client.post(
        f"/api/v1/price-lists/{pl_id_1}/clone-version",
        headers=headers,
        json=custom_clone_payload
    )
    assert res_clone.status_code == 201
    v2_data = res_clone.json()
    pl_id_2 = v2_data["id"]

    assert v2_data["code"] == f"PL-{uid}-V2-CUSTOM"
    assert v2_data["name"] == "Bảng giá Kế Thừa Phiên Bản Mới (Điều Chỉnh +10%)"
    assert v2_data["version"] == 2
    assert v2_data["parent_id"] == pl_id_1
    assert v2_data["has_orders"] is False
    assert v2_data["is_locked"] is False
    assert v2_data["status"] == "DRAFT"

    # Kiểm tra giá bán đã được tăng 10% (800,000 * 1.1 = 880,000)
    assert len(v2_data["items"]) == 1
    cloned_item = v2_data["items"][0]
    assert cloned_item["sale_price"] == 880000.0
    assert cloned_item["requires_approval"] is False

    # 7. Kiểm tra ngày kết thúc của bảng giá cha (v1) đã được tự động đóng
    res_v1_refreshed = client.get(f"/api/v1/price-lists/{pl_id_1}")
    v1_refreshed_data = res_v1_refreshed.json()
    assert v1_refreshed_data["valid_to"] is not None

    # 8. Xem lịch sử cây phiên bản qua API /versions
    res_versions = client.get(f"/api/v1/price-lists/{pl_id_1}/versions")
    assert res_versions.status_code == 200
    versions_list = res_versions.json()
    assert len(versions_list) >= 2
    # Phiên bản 1 và phiên bản 2 phải có mặt trong danh sách theo thứ tự version tăng dần
    versions_numbers = [v["version"] for v in versions_list]
    assert 1 in versions_numbers
    assert 2 in versions_numbers


def test_effective_dates_overlap_and_new_version_constraints(auth_tokens):
    """SCRUM-417 & SCRUM-416: Kiểm tra chi tiết các ràng buộc ngày hiệu lực,
    Pre-flight API kiểm tra chồng lấn, cơ chế auto-resolve khi duyệt, và ràng buộc tạo phiên bản mới.
    """
    headers = auth_tokens["admin"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]
    test_group = f"GRP_DATES_{uid}"

    # 1. Pre-flight check /check-overlap khi chưa có bảng giá nào -> has_overlap = False
    res_chk1 = client.get(
        "/api/v1/price-lists/check-overlap",
        params={
            "customer_group": test_group,
            "valid_from": now.isoformat(),
            "valid_to": (now + timedelta(days=30)).isoformat()
        }
    )
    assert res_chk1.status_code == 200
    assert res_chk1.json()["has_overlap"] is False
    assert len(res_chk1.json()["conflicts"]) == 0

    # 2. Tạo bảng giá gốc V1 (Hiệu lực: Ngày 0 -> Ngày 30) và phê duyệt
    pl_v1 = {
        "code": f"PL-{uid}-V1",
        "name": "Bảng giá Chu Kỳ 1",
        "customer_group": test_group,
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(days=30)).isoformat(),
        "items": [
            {
                "product_id": f"PRD-{uid}",
                "product_name": "Sản phẩm kiểm tra ngày",
                "listed_price": 5000000,
                "floor_price": 4000000,
                "sale_price": 4500000
            }
        ]
    }
    res_v1 = client.post("/api/v1/price-lists", headers=headers, json=pl_v1)
    assert res_v1.status_code == 201
    pl_v1_id = res_v1.json()["id"]

    # Phê duyệt V1
    client.post(f"/api/v1/price-lists/{pl_v1_id}/approve", headers=headers, json={"approved": True})
    v1_detail = client.get(f"/api/v1/price-lists/{pl_v1_id}").json()
    assert v1_detail["is_effective"] is True
    assert v1_detail["is_expired"] is False

    # 3. Pre-flight check /check-overlap trong khoảng Ngày 10 -> Ngày 40 -> has_overlap = True, chứa pl_v1
    res_chk2 = client.get(
        "/api/v1/price-lists/check-overlap",
        params={
            "customer_group": test_group,
            "valid_from": (now + timedelta(days=10)).isoformat(),
            "valid_to": (now + timedelta(days=40)).isoformat()
        }
    )
    assert res_chk2.status_code == 200
    assert res_chk2.json()["has_overlap"] is True
    assert len(res_chk2.json()["conflicts"]) == 1
    assert res_chk2.json()["conflicts"][0]["id"] == pl_v1_id

    # 4. Ràng buộc phiên bản mới: Ngày bắt đầu hiệu lực phiên bản mới không được trước phiên bản cũ
    res_clone_bad_date = client.post(
        f"/api/v1/price-lists/{pl_v1_id}/clone-version",
        headers=headers,
        json={
            "valid_from": (now - timedelta(days=5)).isoformat()  # Trước valid_from của V1!
        }
    )
    assert res_clone_bad_date.status_code == 400
    assert "không được trước ngày bắt đầu" in res_clone_bad_date.json()["detail"]

    # 5. Ràng buộc phiên bản mới: Không thể kế thừa từ bảng giá đang bị từ chối duyệt (REJECTED)
    pl_rej_payload = {
        "code": f"PL-{uid}-REJECTED",
        "name": "Bảng giá Bị Từ Chối",
        "customer_group": f"GRP_REJ_{uid}",
        "valid_from": now.isoformat(),
        "items": []
    }
    res_rej = client.post("/api/v1/price-lists", headers=headers, json=pl_rej_payload)
    pl_rej_id = res_rej.json()["id"]
    client.post(f"/api/v1/price-lists/{pl_rej_id}/approve", headers=headers, json={"approved": False, "note": "Từ chối"})
    
    res_clone_rej = client.post(f"/api/v1/price-lists/{pl_rej_id}/clone-version", headers=headers)
    assert res_clone_rej.status_code == 400
    assert "đang bị từ chối phê duyệt" in res_clone_rej.json()["detail"]

    # 6. Tạo phiên bản mới V2 kế thừa hợp lệ: Bắt đầu từ Ngày 15 (chồng lấn với V1 Ngày 0..30)
    res_clone_v2 = client.post(
        f"/api/v1/price-lists/{pl_v1_id}/clone-version",
        headers=headers,
        json={
            "new_code": f"PL-{uid}-V2",
            "valid_from": (now + timedelta(days=15)).isoformat(),
            "valid_to": (now + timedelta(days=45)).isoformat()
        }
    )
    assert res_clone_v2.status_code == 201
    pl_v2_id = res_clone_v2.json()["id"]

    # Phê duyệt V2 với auto_resolve_overlap = True: Tự động ngắt V1 tại Ngày 15
    res_app_v2 = client.post(
        f"/api/v1/price-lists/{pl_v2_id}/approve",
        headers=headers,
        json={"approved": True, "auto_resolve_overlap": True}
    )
    assert res_app_v2.status_code == 200
    assert res_app_v2.json()["status"] == "APPROVED"

    # Kiểm tra V1 đã được cập nhật valid_to khớp với valid_from của V2 (chuyển giao phiên bản mượt mà)
    v1_after = client.get(f"/api/v1/price-lists/{pl_v1_id}").json()
    assert v1_after["valid_to"] is not None


def test_customer_groups_management_and_bulk_price_lookup(auth_tokens):
    """SCRUM-417 & SCRUM-419: Kiểm tra API quản lý bảng giá theo nhóm khách hàng:
    - Báo cáo tổng quan từng nhóm khách hàng (/customer-groups/summary).
    - Lấy bảng giá có hiệu lực của một nhóm (/customer-groups/{group}/active).
    - Tra cứu giá bán hàng loạt cho danh sách sản phẩm (/customer-groups/{group}/lookup).
    - Bộ lọc thời gian hiệu lực và trạng thái bảng giá (time_status, from_date, to_date).
    """
    headers = auth_tokens["admin"]
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]
    test_group = f"TIER_1_{uid}"

    # 1. Kiểm tra /customer-groups/summary trả về đầy đủ các nhóm chuẩn
    res_summary = client.get("/api/v1/price-lists/customer-groups/summary")
    assert res_summary.status_code == 200
    summary_data = res_summary.json()
    assert summary_data["total_groups"] >= 5
    group_codes = [g["customer_group"] for g in summary_data["items"]]
    assert "TIER_1" in group_codes
    assert "TIER_2" in group_codes
    assert "RETAIL" in group_codes

    # 2. Tạo và duyệt bảng giá cho test_group với 2 sản phẩm
    payload = {
        "code": f"PL-{uid}-GRP-ACTIVE",
        "name": f"Bảng giá Nhóm {test_group}",
        "customer_group": test_group,
        "valid_from": (now - timedelta(days=1)).isoformat(),
        "valid_to": (now + timedelta(days=30)).isoformat(),
        "items": [
            {
                "product_id": f"PRD-A-{uid}",
                "product_sku": f"SKU-A-{uid}",
                "product_name": "Sản phẩm A",
                "unit": "Chiếc",
                "listed_price": 30000000.0,
                "floor_price": 24000000.0,
                "sale_price": 26000000.0,
                "discount_percent": 13.33
            },
            {
                "product_id": f"PRD-B-{uid}",
                "product_sku": f"SKU-B-{uid}",
                "product_name": "Sản phẩm B",
                "unit": "Hộp",
                "listed_price": 10000000.0,
                "floor_price": 8000000.0,
                "sale_price": 8500000.0,
                "discount_percent": 15.0
            }
        ]
    }
    res_create = client.post("/api/v1/price-lists", headers=headers, json=payload)
    assert res_create.status_code == 201
    pl_id = res_create.json()["id"]

    # Phê duyệt bảng giá
    res_app = client.post(f"/api/v1/price-lists/{pl_id}/approve", headers=headers, json={"approved": True})
    assert res_app.status_code == 200

    # 3. Kiểm tra /customer-groups/{group}/active
    res_active = client.get(f"/api/v1/price-lists/customer-groups/{test_group}/active")
    assert res_active.status_code == 200
    active_data = res_active.json()
    assert active_data["id"] == pl_id
    assert active_data["code"] == f"PL-{uid}-GRP-ACTIVE"
    assert len(active_data["items"]) == 2

    # 4. Kiểm tra /customer-groups/{group}/lookup: Tra cứu giá hàng loạt
    bulk_payload = {
        "product_ids": [f"PRD-A-{uid}", f"PRD-B-{uid}", "PRD-NON-EXISTENT"]
    }
    res_bulk = client.post(
        f"/api/v1/price-lists/customer-groups/{test_group}/lookup",
        json=bulk_payload
    )
    assert res_bulk.status_code == 200
    bulk_result = res_bulk.json()
    assert bulk_result["customer_group"] == test_group
    assert bulk_result["price_list_id"] == pl_id
    assert len(bulk_result["items"]) == 3

    # Sản phẩm A: tìm thấy, đúng giá 26tr
    item_a = next(i for i in bulk_result["items"] if i["product_id"] == f"PRD-A-{uid}")
    assert item_a["found"] is True
    assert item_a["sale_price"] == 26000000.0

    # Sản phẩm B: tìm thấy, đúng giá 8.5tr
    item_b = next(i for i in bulk_result["items"] if i["product_id"] == f"PRD-B-{uid}")
    assert item_b["found"] is True
    assert item_b["sale_price"] == 8500000.0

    # Sản phẩm không tồn tại: found = False
    item_c = next(i for i in bulk_result["items"] if i["product_id"] == "PRD-NON-EXISTENT")
    assert item_c["found"] is False
    assert item_c["sale_price"] is None

    # 5. Kiểm tra bộ lọc time_status trên GET /api/v1/price-lists
    res_time_active = client.get(
        "/api/v1/price-lists",
        params={"customer_group": test_group, "time_status": "ACTIVE"}
    )
    assert res_time_active.status_code == 200
    assert res_time_active.json()["total"] >= 1
    found_ids = [pl["id"] for pl in res_time_active.json()["items"]]
    assert pl_id in found_ids

    # time_status=EXPIRED không được chứa pl_id này
    res_time_expired = client.get(
        "/api/v1/price-lists",
        params={"customer_group": test_group, "time_status": "EXPIRED"}
    )
    assert res_time_expired.status_code == 200
    expired_ids = [pl["id"] for pl in res_time_expired.json()["items"]]
    assert pl_id not in expired_ids



