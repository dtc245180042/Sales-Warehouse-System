import uuid
from datetime import datetime, timezone
import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.security import tao_token_truy_cap
from app.models.auth import User
from app.models.product import Product
from app.models.stock_transfer import StockTransfer, StockTransferItem, WarehouseStock
from app.models.inventory import InventoryHistory
from app.services.stock_transfer_service import get_or_create_warehouse_stock

client = TestClient(app)


def _get_auth_headers(username="wh_mgr", role="WarehouseManager", user_id=4):
    db = SessionLocal()
    user = db.query(User).filter_by(username=username).first()
    tv = user.token_version if user else 1
    uid = user.id if user else user_id
    db.close()
    token = tao_token_truy_cap({
        "sub": username,
        "user_id": uid,
        "username": username,
        "role": role,
        "token_version": tv
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def transfer_fixture():
    """Tạo sản phẩm mẫu và khởi tạo tồn kho cho 2 kho khác nhau."""
    db = SessionLocal()
    uid = uuid.uuid4().hex[:6]
    product = Product(
        id=f"PROD-TRF-{uid}",
        sku=f"SKU-TRF-{uid}",
        name=f"Laptop Dell Precision {uid}",
        category="Máy tính",
        cost_price=20000000.0,
        sale_price=25000000.0,
        stock=100,
        min_stock=5,
        unit="máy",
        status="active",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(product)
    db.commit()

    # Khởi tạo tồn kho tại kho xuất: Kho Tổng Hà Nội = 50 máy
    wh_hn = get_or_create_warehouse_stock(db, "Kho Tổng Hà Nội", product.id, product.sku)
    wh_hn.stock = 50
    wh_hn.physical_stock = 50
    wh_hn.in_transit_stock = 0

    # Khởi tạo tồn kho tại kho đích: Kho Đà Nẵng = 10 máy
    wh_dn = get_or_create_warehouse_stock(db, "Kho Đà Nẵng", product.id, product.sku)
    wh_dn.stock = 10
    wh_dn.physical_stock = 10
    wh_dn.in_transit_stock = 0

    pid = product.id
    sku = product.sku
    name = product.name

    db.commit()
    db.close()

    yield {
        "product_id": pid,
        "sku": sku,
        "product_name": name,
        "source_warehouse": "Kho Tổng Hà Nội",
        "destination_warehouse": "Kho Đà Nẵng",
    }

    # Dọn dẹp dữ liệu test để không ô nhiễm CSDL thật của bài
    cleanup_db = SessionLocal()
    try:
        cleanup_db.execute(text(f"DELETE FROM stock_transfer_items WHERE product_id = '{pid}'"))
        cleanup_db.execute(text("DELETE FROM stock_transfers WHERE id NOT IN (SELECT DISTINCT transfer_id FROM stock_transfer_items)"))
        cleanup_db.execute(text(f"DELETE FROM warehouse_stocks WHERE product_id = '{pid}'"))
        cleanup_db.execute(text(f"DELETE FROM products WHERE id = '{pid}'"))
        cleanup_db.commit()
    finally:
        cleanup_db.close()


def test_scrum574_create_stock_transfer_valid(transfer_fixture):
    """SCRUM-574: Lập phiếu chuyển kho nội bộ hợp lệ ở trạng thái draft."""
    headers = _get_auth_headers()
    payload = {
        "source_warehouse": transfer_fixture["source_warehouse"],
        "destination_warehouse": transfer_fixture["destination_warehouse"],
        "note": "Điều chuyển cân đối hàng tồn cho chi nhánh Đà Nẵng",
        "ship_immediately": False,
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "sku": transfer_fixture["sku"],
                "product_name": transfer_fixture["product_name"],
                "unit": "máy",
                "transfer_quantity": 15,
                "cost_price": 20000000.0,
            }
        ]
    }

    res = client.post("/api/v1/stock-transfers", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["status"] == "draft"
    assert data["source_warehouse"] == "Kho Tổng Hà Nội"
    assert data["destination_warehouse"] == "Kho Đà Nẵng"
    assert data["total_items"] == 15
    assert len(data["items"]) == 1
    assert data["items"][0]["transfer_quantity"] == 15
    assert data["items"][0]["received_quantity"] is None
    assert data["code"].startswith("PCK-")


def test_scrum572_business_constraints_validation(transfer_fixture):
    """SCRUM-572: Kiểm tra các ràng buộc nghiệp vụ phiếu chuyển kho."""
    headers = _get_auth_headers()

    # 1. Kho xuất trùng kho nhập
    res1 = client.post("/api/v1/stock-transfers", json={
        "source_warehouse": "Kho Tổng Hà Nội",
        "destination_warehouse": "Kho Tổng Hà Nội",
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "sku": transfer_fixture["sku"],
                "product_name": transfer_fixture["product_name"],
                "unit": "máy",
                "transfer_quantity": 5,
                "cost_price": 20000000.0,
            }
        ]
    }, headers=headers)
    assert res1.status_code == 400
    assert "Kho xuất và kho nhập không được trùng nhau" in res1.json()["detail"]

    # 2. Số lượng chuyển <= 0
    res2 = client.post("/api/v1/stock-transfers", json={
        "source_warehouse": transfer_fixture["source_warehouse"],
        "destination_warehouse": transfer_fixture["destination_warehouse"],
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "sku": transfer_fixture["sku"],
                "product_name": transfer_fixture["product_name"],
                "unit": "máy",
                "transfer_quantity": 0,
                "cost_price": 20000000.0,
            }
        ]
    }, headers=headers)
    assert res2.status_code == 422 or res2.status_code == 400

    # 3. Vượt quá tồn kho nguồn (kho nguồn chỉ có 50 máy, yêu cầu chuyển 999)
    res3 = client.post("/api/v1/stock-transfers", json={
        "source_warehouse": transfer_fixture["source_warehouse"],
        "destination_warehouse": transfer_fixture["destination_warehouse"],
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "sku": transfer_fixture["sku"],
                "product_name": transfer_fixture["product_name"],
                "unit": "máy",
                "transfer_quantity": 999,
                "cost_price": 20000000.0,
            }
        ]
    }, headers=headers)
    assert res3.status_code == 400
    assert "không đủ tồn kho để chuyển" in res3.json()["detail"]


def test_scrum570_ship_stock_transfer_flow(transfer_fixture):
    """SCRUM-570: Xuất kho chuyển đi - trừ tồn kho đi, ghi nhận in-transit, kho đích CHƯA cộng."""
    headers = _get_auth_headers()

    # 1. Tạo phiếu draft
    create_res = client.post("/api/v1/stock-transfers", json={
        "source_warehouse": transfer_fixture["source_warehouse"],
        "destination_warehouse": transfer_fixture["destination_warehouse"],
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "sku": transfer_fixture["sku"],
                "product_name": transfer_fixture["product_name"],
                "unit": "máy",
                "transfer_quantity": 20,
                "cost_price": 20000000.0,
            }
        ]
    }, headers=headers)
    assert create_res.status_code == 201
    trf = create_res.json()
    trf_id = trf["id"]

    # 2. Thực hiện xuất kho chuyển đi (ship)
    ship_res = client.post(f"/api/v1/stock-transfers/{trf_id}/ship", json={
        "shipped_by": "Thủ kho Nguyễn Văn A",
        "note": "Hàng đã bàn giao cho đơn vị vận chuyển Viettel Post"
    }, headers=headers)
    assert ship_res.status_code == 200, ship_res.text
    shipped_data = ship_res.json()
    assert shipped_data["status"] == "in_transit"
    assert shipped_data["shipped_by"] == "Thủ kho Nguyễn Văn A"
    assert shipped_data["shipped_at"] is not None

    # 3. Kiểm tra cơ sở dữ liệu:
    # - Kho đi (Hà Nội): giảm từ 50 xuống 30
    # - Kho đến (Đà Nẵng): tồn kho VẪN LÀ 10, in_transit = 20
    db = SessionLocal()
    wh_hn = get_or_create_warehouse_stock(db, "Kho Tổng Hà Nội", transfer_fixture["product_id"])
    wh_dn = get_or_create_warehouse_stock(db, "Kho Đà Nẵng", transfer_fixture["product_id"])
    assert wh_hn.stock == 30
    assert wh_dn.stock == 10  # CHƯA cộng vào kho đến!
    assert wh_dn.in_transit_stock == 20

    # Kiểm tra thẻ kho (InventoryHistory) xuất kho
    hist = db.query(InventoryHistory).filter(
        InventoryHistory.code == shipped_data["code"],
        InventoryHistory.warehouse == "Kho Tổng Hà Nội"
    ).first()
    assert hist is not None
    assert hist.quantity == -20
    assert hist.balance_after == 30
    db.close()


def test_scrum571_receive_stock_transfer_flow_complete(transfer_fixture):
    """SCRUM-571: Kho đến xác nhận nhận đủ hàng -> cộng tồn kho đến, khóa phiếu completed."""
    headers = _get_auth_headers()

    # 1. Tạo và xuất chuyển đi ngay 15 máy
    create_res = client.post("/api/v1/stock-transfers", json={
        "source_warehouse": transfer_fixture["source_warehouse"],
        "destination_warehouse": transfer_fixture["destination_warehouse"],
        "ship_immediately": True,
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "sku": transfer_fixture["sku"],
                "product_name": transfer_fixture["product_name"],
                "unit": "máy",
                "transfer_quantity": 15,
                "cost_price": 20000000.0,
            }
        ]
    }, headers=headers)
    assert create_res.status_code == 201
    trf = create_res.json()
    assert trf["status"] == "in_transit"
    trf_id = trf["id"]

    # 2. Kho đến xác nhận nhận đủ 15 máy
    recv_res = client.post(f"/api/v1/stock-transfers/{trf_id}/receive", json={
        "received_by": "Thủ kho chi nhánh Đà Nẵng",
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "received_quantity": 15,
            }
        ],
        "note": "Kiểm đếm nguyên đai nguyên kiện đủ 15 máy"
    }, headers=headers)
    assert recv_res.status_code == 200, recv_res.text
    recv_data = recv_res.json()

    assert recv_data["status"] == "completed"
    assert recv_data["total_received_items"] == 15
    assert recv_data["has_discrepancy"] is False
    assert recv_data["received_by"] == "Thủ kho chi nhánh Đà Nẵng"
    assert recv_data["received_at"] is not None

    # 3. Kiểm tra tồn kho tại kho đến: 10 + 15 = 25, in_transit = 0
    db = SessionLocal()
    wh_dn = get_or_create_warehouse_stock(db, "Kho Đà Nẵng", transfer_fixture["product_id"])
    assert wh_dn.stock == 25
    assert wh_dn.in_transit_stock == 0

    # Kiểm tra thẻ kho nhập kho đến
    hist_in = db.query(InventoryHistory).filter(
        InventoryHistory.code == recv_data["code"],
        InventoryHistory.warehouse == "Kho Đà Nẵng"
    ).first()
    assert hist_in is not None
    assert hist_in.quantity == 15
    assert hist_in.balance_after == 25
    db.close()

    # 4. Phiếu đã completed -> thử hủy phải bị từ chối
    cancel_res = client.post(f"/api/v1/stock-transfers/{trf_id}/cancel", json={
        "cancel_reason": "Hủy nhầm"
    }, headers=headers)
    assert cancel_res.status_code == 400
    assert "Không thể hủy phiếu chuyển kho đã hoàn thành" in cancel_res.json()["detail"]


def test_scrum573_receive_with_discrepancy_requires_reason(transfer_fixture):
    """SCRUM-573: Nhận hàng có chênh lệch bắt buộc phải nhập lý do."""
    headers = _get_auth_headers()

    # Tạo và ship 10 máy
    create_res = client.post("/api/v1/stock-transfers", json={
        "source_warehouse": transfer_fixture["source_warehouse"],
        "destination_warehouse": transfer_fixture["destination_warehouse"],
        "ship_immediately": True,
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "sku": transfer_fixture["sku"],
                "product_name": transfer_fixture["product_name"],
                "unit": "máy",
                "transfer_quantity": 10,
                "cost_price": 20000000.0,
            }
        ]
    }, headers=headers)
    trf_id = create_res.json()["id"]

    # 1. Nhận thiếu 2 máy (thực nhận 8) nhưng KHÔNG nhập lý do -> Bị từ chối 400
    recv_no_reason = client.post(f"/api/v1/stock-transfers/{trf_id}/receive", json={
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "received_quantity": 8,
            }
        ]
    }, headers=headers)
    assert recv_no_reason.status_code == 400
    assert "Bắt buộc phải nhập lý do giải trình chênh lệch" in recv_no_reason.json()["detail"]

    # 2. Nhận thiếu 2 máy CÓ lý do -> Thành công
    recv_with_reason = client.post(f"/api/v1/stock-transfers/{trf_id}/receive", json={
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "received_quantity": 8,
                "discrepancy_reason": "Thùng hàng bị ướt, hỏng 2 máy trên đường vận chuyển xe tải"
            }
        ],
        "discrepancy_reason": "Biên bản kiểm nhận giao nhận Viettel Post ghi nhận 2 máy hư hỏng bao bì"
    }, headers=headers)
    assert recv_with_reason.status_code == 200
    disc_data = recv_with_reason.json()
    assert disc_data["status"] == "completed"
    assert disc_data["total_received_items"] == 8
    assert disc_data["has_discrepancy"] is True
    assert disc_data["items"][0]["discrepancy_quantity"] == -2
    assert "ướt, hỏng" in disc_data["items"][0]["discrepancy_reason"]


def test_scrum575_in_transit_summary_and_cancel_flow(transfer_fixture):
    """SCRUM-575: Thống kê hàng in-transit và hủy phiếu đang in-transit hoàn tồn về kho nguồn."""
    headers = _get_auth_headers()

    # Tạo và ship 5 máy
    create_res = client.post("/api/v1/stock-transfers", json={
        "source_warehouse": transfer_fixture["source_warehouse"],
        "destination_warehouse": transfer_fixture["destination_warehouse"],
        "ship_immediately": True,
        "items": [
            {
                "product_id": transfer_fixture["product_id"],
                "sku": transfer_fixture["sku"],
                "product_name": transfer_fixture["product_name"],
                "unit": "máy",
                "transfer_quantity": 5,
                "cost_price": 20000000.0,
            }
        ]
    }, headers=headers)
    trf_id = create_res.json()["id"]

    # Tra cứu hàng in-transit
    summary_res = client.get("/api/v1/stock-transfers/in-transit-summary", headers=headers)
    assert summary_res.status_code == 200
    in_transit_list = summary_res.json()
    matching = [x for x in in_transit_list if x["transfer_id"] == trf_id]
    assert len(matching) == 1
    assert matching[0]["in_transit_quantity"] == 5

    # Hủy phiếu khi đang in-transit
    cancel_res = client.post(f"/api/v1/stock-transfers/{trf_id}/cancel", json={
        "cancel_reason": "Xe gặp sự cố, hủy đơn chuyển và kéo hàng về kho cũ"
    }, headers=headers)
    assert cancel_res.status_code == 200
    canceled_data = cancel_res.json()
    assert canceled_data["status"] == "cancelled"

    # Kiểm tra lại tồn kho: in_transit đã bị giảm, hàng được hoàn về kho nguồn
    summary_res2 = client.get("/api/v1/stock-transfers/in-transit-summary", headers=headers)
    assert not any(x["transfer_id"] == trf_id for x in summary_res2.json())
