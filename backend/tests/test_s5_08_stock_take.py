import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from main import app
from app.core.security import tao_token_truy_cap
from app.core.database import SessionLocal
from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.category import Category
from app.models.product_stock_profile import ProductStockProfile
from app.models.inventory import InventoryHistory
from app.models.stock_take import StockTake, StockTakeItem, StockTakeStatus

client = TestClient(app)


def _get_headers_for_role(username: str, role_value: str) -> dict:
    """Tạo Authorization Bearer header cho test user theo vai trò."""
    db = SessionLocal()
    user = db.query(User).filter_by(username=username).first()
    tv = user.token_version if user else 1
    uid = user.id if user else 999
    db.close()
    token = tao_token_truy_cap({
        "sub": username,
        "user_id": uid,
        "username": username,
        "role": role_value,
        "token_version": tv
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def setup_test_data():
    """Chuẩn bị dữ liệu mẫu sản phẩm, nhóm hàng và người dùng cho mỗi test."""
    db = SessionLocal()
    try:
        # 1. Đảm bảo nhóm hàng mẫu
        cat = db.query(Category).filter_by(code="DM-TEST-01").first()
        if not cat:
            cat = Category(
                code="DM-TEST-01",
                name="Điện Thoại & Phụ Kiện",
                description="Nhóm sản phẩm điện tử test",
                level=1,
                is_active=True
            )
            db.add(cat)
            db.commit()
            db.refresh(cat)

        # 2. Đảm bảo sản phẩm mẫu
        prod1 = db.query(Product).filter_by(sku="SP-TEST-KK-01").first()
        if not prod1:
            prod1 = Product(
                id="PRD-KK-001",
                sku="SP-TEST-KK-01",
                name="Điện thoại iPhone 15 Pro",
                category="Điện Thoại & Phụ Kiện",
                category_id=cat.id,
                unit="cái",
                cost_price=20000000.0,
                price=25000000.0,
                sale_price=25000000.0,
                stock=50,
                min_stock=10,
                status="active",
                is_active=True
            )
            db.add(prod1)
        else:
            prod1.stock = 50
            prod1.category_id = cat.id

        prod2 = db.query(Product).filter_by(sku="SP-TEST-KK-02").first()
        if not prod2:
            prod2 = Product(
                id="PRD-KK-002",
                sku="SP-TEST-KK-02",
                name="Củ sạc nhanh Anker 65W",
                category="Điện Thoại & Phụ Kiện",
                category_id=cat.id,
                unit="cái",
                cost_price=400000.0,
                price=650000.0,
                sale_price=650000.0,
                stock=100,
                min_stock=15,
                status="active",
                is_active=True
            )
            db.add(prod2)
        else:
            prod2.stock = 100
            prod2.category_id = cat.id

        db.commit()

        # Đồng bộ ProductStockProfile
        prof1 = db.query(ProductStockProfile).filter_by(product_id=prod1.id).first()
        if not prof1:
            prof1 = ProductStockProfile(
                product_id=prod1.id,
                sku=prod1.sku,
                stock=50,
                min_stock=10,
                warehouse="Kho Tổng Hà Nội"
            )
            db.add(prof1)
        else:
            prof1.stock = 50

        prof2 = db.query(ProductStockProfile).filter_by(product_id=prod2.id).first()
        if not prof2:
            prof2 = ProductStockProfile(
                product_id=prod2.id,
                sku=prod2.sku,
                stock=100,
                min_stock=15,
                warehouse="Kho Tổng Hà Nội"
            )
            db.add(prof2)
        else:
            prof2.stock = 100

        db.commit()
    finally:
        db.close()


def test_scrum_582_create_stock_take_and_get_detail():
    """
    SCRUM-582: Thiết kế mô hình dữ liệu và API phiếu kiểm kê kho,
    gồm phạm vi kiểm kê theo kho hoặc nhóm hàng, danh sách dòng hàng.
    """
    wh_headers = _get_headers_for_role("wh_mgr", UserRole.WH_MANAGER.value)
    
    # 1. Tạo phiếu kiểm kê toàn kho
    payload = {
        "warehouse": "Kho Tổng Hà Nội",
        "scope_type": "WAREHOUSE",
        "note": "Kiểm kê định kỳ tháng 10/2026"
    }
    res = client.post("/api/v1/stock-takes", json=payload, headers=wh_headers)
    assert res.status_code == 201
    data = res.json()
    assert data["id"].startswith("STK-TAKE-")
    assert data["code"].startswith("PKK-2026-")
    assert data["status"] == "draft"
    assert data["warehouse"] == "Kho Tổng Hà Nội"
    assert len(data["items"]) >= 2

    take_id = data["id"]

    # 2. Lấy chi tiết phiếu kiểm kê
    detail_res = client.get(f"/api/v1/stock-takes/{take_id}", headers=wh_headers)
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["id"] == take_id
    assert len(detail_data["items"]) == len(data["items"])


def test_scrum_581_snapshot_system_quantity_at_creation():
    """
    SCRUM-581: Bổ sung logic tạo snapshot tồn sổ tại thời điểm lập phiếu kiểm kê.
    Tồn sổ sách trong phiếu phải phản ánh chính xác tồn kho lúc lập, không bị đổi nếu DB đổi sau đó.
    """
    wh_headers = _get_headers_for_role("wh_mgr", UserRole.WH_MANAGER.value)

    # Lập phiếu kiểm kê
    payload = {
        "warehouse": "Kho Tổng Hà Nội",
        "scope_type": "WAREHOUSE",
        "note": "Kiểm tra snapshot tồn sổ"
    }
    res = client.post("/api/v1/stock-takes", json=payload, headers=wh_headers)
    assert res.status_code == 201
    take = res.json()

    # Tìm dòng sản phẩm iPhone 15 Pro (tồn ban đầu là 50)
    item_iphone = next((it for it in take["items"] if it["sku"] == "SP-TEST-KK-01"), None)
    assert item_iphone is not None
    assert item_iphone["system_quantity"] == 50
    assert item_iphone["actual_quantity"] is None
    assert item_iphone["discrepancy_quantity"] == 0
    assert item_iphone["is_counted"] is False

    # Giả lập thay đổi tồn kho sản phẩm trong CSDL sau khi đã lập phiếu
    db = SessionLocal()
    prod = db.query(Product).filter_by(sku="SP-TEST-KK-01").first()
    prod.stock = 999
    db.commit()
    db.close()

    # Lấy lại phiếu kiểm kê: system_quantity snapshot trên phiếu vẫn phải giữ nguyên là 50
    detail_res = client.get(f"/api/v1/stock-takes/{take['id']}", headers=wh_headers)
    assert detail_res.status_code == 200
    reloaded_item = next((it for it in detail_res.json()["items"] if it["sku"] == "SP-TEST-KK-01"), None)
    assert reloaded_item["system_quantity"] == 50, "Snapshot tồn sổ phải giữ nguyên giá trị tại thời điểm tạo"


def test_scrum_580_update_actual_count_and_discrepancy():
    """
    SCRUM-580: Xử lý nhập số đếm thực tế và tính chênh lệch từng dòng kiểm kê.
    discrepancy_quantity = actual_quantity - system_quantity.
    """
    wh_headers = _get_headers_for_role("warehouse", UserRole.WAREHOUSE.value)

    # 1. Tạo phiếu
    res = client.post("/api/v1/stock-takes", json={
        "warehouse": "Kho Tổng Hà Nội",
        "scope_type": "WAREHOUSE"
    }, headers=wh_headers)
    take = res.json()
    take_id = take["id"]

    item1 = next(it for it in take["items"] if it["sku"] == "SP-TEST-KK-01")
    item2 = next(it for it in take["items"] if it["sku"] == "SP-TEST-KK-02")

    # 2. Thủ kho nhập số đếm:
    # SP-TEST-KK-01: tồn sổ 50, thực đếm 48 (lệch -2)
    # SP-TEST-KK-02: tồn sổ 100, thực đếm 105 (lệch +5)
    count_payload = {
        "items": [
            {"id": item1["id"], "actual_quantity": 48, "note": "Hao hụt 2 máy"},
            {"id": item2["id"], "actual_quantity": 105, "note": "Thừa 5 củ sạc do đối tác khuyến mại"}
        ]
    }
    update_res = client.put(f"/api/v1/stock-takes/{take_id}/items", json=count_payload, headers=wh_headers)
    assert update_res.status_code == 200
    updated_take = update_res.json()
    assert updated_take["status"] == "in_progress"
    assert updated_take["has_discrepancy"] is True

    updated_it1 = next(it for it in updated_take["items"] if it["id"] == item1["id"])
    assert updated_it1["actual_quantity"] == 48
    assert updated_it1["discrepancy_quantity"] == -2
    assert updated_it1["is_counted"] is True

    updated_it2 = next(it for it in updated_take["items"] if it["id"] == item2["id"])
    assert updated_it2["actual_quantity"] == 105
    assert updated_it2["discrepancy_quantity"] == 5
    assert updated_it2["is_counted"] is True


def test_scrum_584_require_reason_when_discrepancy_exists():
    """
    SCRUM-584: Bắt buộc nhập lý do khi chốt kiểm kê có chênh lệch tồn.
    Nếu có lệch mà không nhập lý do -> HTTP 400 Bad Request.
    """
    wh_mgr_headers = _get_headers_for_role("wh_mgr", UserRole.WH_MANAGER.value)

    # 1. Tạo phiếu và nhập số đếm có chênh lệch
    create_res = client.post("/api/v1/stock-takes", json={"warehouse": "Kho Tổng Hà Nội"}, headers=wh_mgr_headers)
    take = create_res.json()
    item1 = take["items"][0]

    # Nhập số đếm lệch so với tồn sổ
    diff_qty = item1["system_quantity"] + 10
    client.put(f"/api/v1/stock-takes/{take['id']}/items", json={
        "items": [{"id": item1["id"], "actual_quantity": diff_qty}]
    }, headers=wh_mgr_headers)

    # 2. Chốt phiếu không gửi lý do hoặc lý do rỗng -> Bị từ chối HTTP 400
    confirm_res_empty = client.post(
        f"/api/v1/stock-takes/{take['id']}/confirm",
        json={"adjustment_reason": ""},
        headers=wh_mgr_headers
    )
    assert confirm_res_empty.status_code == 400
    assert "Bắt buộc phải nhập lý do điều chỉnh khi có chênh lệch" in confirm_res_empty.json()["detail"]

    # 3. Chốt phiếu gửi lý do hợp lệ -> Thành công HTTP 200
    confirm_res_valid = client.post(
        f"/api/v1/stock-takes/{take['id']}/confirm",
        json={"adjustment_reason": "Điều chỉnh theo biên bản kiểm kê số 15/BB-KK"},
        headers=wh_mgr_headers
    )
    assert confirm_res_valid.status_code == 200
    assert confirm_res_valid.json()["status"] == "completed"
    assert confirm_res_valid.json()["adjustment_reason"] == "Điều chỉnh theo biên bản kiểm kê số 15/BB-KK"


def test_scrum_585_only_warehouse_manager_can_confirm():
    """
    SCRUM-585: Phân quyền chỉ Quản lý kho (WH Manager / Admin) được phép chốt phiếu kiểm kê.
    Thủ kho (Warehouse) hay Sales Rep gọi API chốt sẽ nhận HTTP 403 Forbidden.
    """
    wh_staff_headers = _get_headers_for_role("warehouse", UserRole.WAREHOUSE.value)
    sales_rep_headers = _get_headers_for_role("sales_rep", UserRole.SALES_REP.value)
    wh_mgr_headers = _get_headers_for_role("wh_mgr", UserRole.WH_MANAGER.value)

    # 1. Thủ kho lập phiếu
    res = client.post("/api/v1/stock-takes", json={"warehouse": "Kho Tổng Hà Nội"}, headers=wh_staff_headers)
    take = res.json()
    take_id = take["id"]

    # 2. Thủ kho cố gắng chốt phiếu -> 403 Forbidden
    res_staff = client.post(
        f"/api/v1/stock-takes/{take_id}/confirm",
        json={"adjustment_reason": "Thủ kho tự chốt"},
        headers=wh_staff_headers
    )
    assert res_staff.status_code == 403
    assert "Chỉ Quản lý kho (WH Manager) hoặc Quản trị viên" in res_staff.json()["detail"]

    # 3. Nhân viên kinh doanh cố gắng chốt -> 403 Forbidden
    res_sales = client.post(
        f"/api/v1/stock-takes/{take_id}/confirm",
        json={"adjustment_reason": "Sales chốt"},
        headers=sales_rep_headers
    )
    assert res_sales.status_code == 403

    # 4. Quản lý kho chốt -> 200 OK
    res_mgr = client.post(
        f"/api/v1/stock-takes/{take_id}/confirm",
        json={"adjustment_reason": "Quản lý kho duyệt chốt"},
        headers=wh_mgr_headers
    )
    assert res_mgr.status_code == 200
    assert res_mgr.json()["status"] == "completed"
    assert res_mgr.json()["confirmed_by_name"] is not None


def test_scrum_583_confirm_adjusts_stock_and_creates_inventory_history():
    """
    SCRUM-583: Bổ sung nghiệp vụ chốt kiểm kê và cập nhật tồn kho theo số thực đếm.
    Sau khi chốt:
    - Product.stock và ProductStockProfile.stock được cập nhật về số thực đếm.
    - Sinh bản ghi lịch sử thẻ kho (InventoryHistory) loại 'adjust'.
    """
    wh_mgr_headers = _get_headers_for_role("wh_mgr", UserRole.WH_MANAGER.value)

    # 1. Tạo phiếu
    create_res = client.post("/api/v1/stock-takes", json={"warehouse": "Kho Tổng Hà Nội"}, headers=wh_mgr_headers)
    take = create_res.json()
    take_id = take["id"]

    it_phone = next(it for it in take["items"] if it["sku"] == "SP-TEST-KK-01")

    # 2. Cập nhật số đếm thực tế thành 42 (tồn sổ ban đầu là 50 -> lệch -8)
    client.put(f"/api/v1/stock-takes/{take_id}/items", json={
        "items": [{"id": it_phone["id"], "actual_quantity": 42}]
    }, headers=wh_mgr_headers)

    # 3. Quản lý kho chốt kiểm kê
    confirm_res = client.post(f"/api/v1/stock-takes/{take_id}/confirm", json={
        "adjustment_reason": "Bù trừ hao hụt thực tế"
    }, headers=wh_mgr_headers)
    assert confirm_res.status_code == 200

    # 4. Kiểm tra CSDL thực tế: tồn kho sản phẩm phải được cập nhật về 42
    db = SessionLocal()
    prod = db.query(Product).filter_by(sku="SP-TEST-KK-01").first()
    assert prod.stock == 42

    profile = db.query(ProductStockProfile).filter_by(product_id=prod.id).first()
    if profile:
        assert profile.stock == 42

    # 5. Kiểm tra thẻ kho (InventoryHistory)
    hist = db.query(InventoryHistory).filter_by(
        code=take["code"],
        sku="SP-TEST-KK-01"
    ).first()
    assert hist is not None
    assert hist.type == "adjust"
    assert hist.quantity == -8
    assert hist.balance_after == 42
    assert "Bù trừ hao hụt thực tế" in hist.note
    db.close()


def test_scope_by_category():
    """Kiểm tra lập phiếu kiểm kê theo nhóm hàng (SCRUM-582, SCRUM-586)."""
    wh_mgr_headers = _get_headers_for_role("wh_mgr", UserRole.WH_MANAGER.value)

    db = SessionLocal()
    cat = db.query(Category).filter_by(code="DM-TEST-01").first()
    cat_id = cat.id
    db.close()

    res = client.post("/api/v1/stock-takes", json={
        "warehouse": "Kho Tổng Hà Nội",
        "scope_type": "CATEGORY",
        "category_id": cat_id,
        "note": "Kiểm kê riêng nhóm điện thoại"
    }, headers=wh_mgr_headers)

    assert res.status_code == 201
    data = res.json()
    assert data["scope_type"] == "CATEGORY"
    assert data["category_id"] == cat_id
    assert data["category_name"] == "Điện Thoại & Phụ Kiện"
    for item in data["items"]:
        assert item["category_name"] == "Điện Thoại & Phụ Kiện"


def test_cancel_stock_take():
    """Kiểm tra hủy phiếu kiểm kê khi chưa chốt."""
    wh_mgr_headers = _get_headers_for_role("wh_mgr", UserRole.WH_MANAGER.value)

    res = client.post("/api/v1/stock-takes", json={"warehouse": "Kho Tổng Hà Nội"}, headers=wh_mgr_headers)
    take_id = res.json()["id"]

    cancel_res = client.post(f"/api/v1/stock-takes/{take_id}/cancel", json={
        "cancel_reason": "Nhập nhầm phạm vi kiểm kê"
    }, headers=wh_mgr_headers)

    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"
    assert cancel_res.json()["cancel_reason"] == "Nhập nhầm phạm vi kiểm kê"


def test_stock_take_filter_query():
    """
    Kiểm tra độ chính xác của bộ lọc phiếu kiểm kê theo dữ liệu thực tế:
    - Tìm kiếm theo mã phiếu
    - Kho hàng thực tế
    - Trạng thái lọc
    """
    wh_mgr_headers = _get_headers_for_role("wh_mgr", UserRole.WH_MANAGER.value)

    # 1. Tạo một phiếu thực tế phục vụ kiểm thử lọc
    create_res = client.post(
        "/api/v1/stock-takes",
        json={"warehouse": "Kho Tổng Hà Nội", "note": "Phiếu test bộ lọc chuẩn hóa"},
        headers=wh_mgr_headers
    )
    assert create_res.status_code == 201
    created_take = create_res.json()
    code = created_take["code"]

    # 2. Gọi API với bộ lọc theo mã vừa tạo
    res = client.get(
        f"/api/v1/stock-takes?search={code}&warehouse=Kho Tổng Hà Nội&status=all",
        headers=wh_mgr_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert any(t["code"] == code for t in data)

    # 3. Lọc theo kho và trạng thái draft
    draft_res = client.get(
        "/api/v1/stock-takes?warehouse=Kho Tổng Hà Nội&status=draft",
        headers=wh_mgr_headers
    )
    assert draft_res.status_code == 200
    draft_data = draft_res.json()
    assert all(t["status"] == "draft" for t in draft_data)


