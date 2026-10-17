"""Kiểm thử API phiếu soạn với CSDL tách biệt, không sửa dữ liệu làm việc."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import tao_token_truy_cap
from app.models.auth import User
from app.models.customer_warehouse_profile import CustomerWarehouseProfile
from app.models.order import Order, OrderItem
from app.models.picking_list import PickingList, PickingListItem, PickingLocation
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.stock_reservation import StockReservation
from app.models.warehouse_stock import StockLedgerEntry, WarehouseStock
from main import app


WAREHOUSE = "Kho Tổng Hà Nội"


@pytest.fixture
def picking_env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    db = factory()
    for user_id, role, warehouse in [(901, "Admin", None), (902, "Warehouse", WAREHOUSE),
                                     (903, "Warehouse", "Kho Đà Nẵng"), (904, "Sales Rep", None),
                                     (905, "WH Manager", WAREHOUSE), (906, "Customer", None)]:
        db.add(User(id=user_id, username=f"pick-{user_id}", email=f"pick-{user_id}@test.local",
                    role=role, assigned_warehouse=warehouse, hashed_password="unused", is_active=True, token_version=1))
    for product_id, sku, quantity, location, sequence in [("PICK-A", "P-A", 100, "A-02", 20), ("PICK-B", "P-B", 100, "A-01", 10)]:
        db.add(Product(id=product_id, sku=sku, name=sku, unit="cái", stock=quantity, is_active=True))
        db.add(WarehouseStock(product_id=product_id, sku=sku, warehouse_id=1, warehouse=WAREHOUSE,
                              physical_stock=quantity, stock=quantity))
        db.add(ProductStockProfile(product_id=product_id, sku=sku, warehouse=WAREHOUSE,
                                   physical_stock=quantity, stock=quantity, reserved_stock=0))
        db.add(PickingLocation(warehouse_id=1, product_id=product_id, location_code=location, route_sequence=sequence))
    for order_id, status in [("PICK-01", "APPROVED"), ("PICK-02", "confirmed"), ("PICK-03", "pending")]:
        db.add(Order(id=order_id, code=order_id, customer_id="PICK-C", customer_name="Đại lý thử", status=status))
        db.flush()
        for product_id, quantity in [("PICK-A", 5), ("PICK-B", 3)]:
            db.add(OrderItem(order_id=order_id, product_id=product_id, sku=f"P-{product_id[-1]}",
                             name=product_id, quantity=quantity, unit="cái"))
    db.commit()

    def override_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    old_override = app.dependency_overrides.get(lay_phien_db)
    app.dependency_overrides[lay_phien_db] = override_db
    client = TestClient(app)

    def headers(user_id=901):
        token = tao_token_truy_cap(du_lieu={"sub": str(user_id), "user_id": user_id, "token_version": 1})
        return {"Authorization": f"Bearer {token}"}

    yield client, db, headers
    client.close()
    db.close()
    if old_override is None:
        app.dependency_overrides.pop(lay_phien_db, None)
    else:
        app.dependency_overrides[lay_phien_db] = old_override
    engine.dispose()


def create(client, headers, order_ids=None, request_id="pick-request"):
    return client.post("/api/v1/picking-lists", headers=headers(), json={
        "warehouse_id": 1, "order_ids": order_ids or ["PICK-01", "PICK-02"], "client_request_id": request_id,
    })


def update(client, headers, sheet, item, quantity, reason=None, version=None):
    return client.patch(f"/api/v1/picking-lists/{sheet['id']}/items/{item['id']}", headers=headers(), json={
        "picked_quantity": quantity, "shortfall_reason": reason, "expected_version": version or item["version"],
    })


def test_merge_orders_route_snapshot_and_reservation(picking_env):
    client, db, headers = picking_env
    preview = client.post("/api/v1/picking-lists/previews", headers=headers(), json={"warehouse_id": 1, "order_ids": ["PICK-01", "PICK-02"]})
    assert preview.status_code == 200
    assert preview.json()["can_create"] is True
    assert preview.json()["total_lines"] == 4
    response = create(client, headers)
    assert response.status_code == 201, response.text
    data = response.json()
    assert len(data["orders"]) == 2
    assert [i["location_code"] for i in data["items"]] == ["A-01", "A-01", "A-02", "A-02"]
    assert data["total_quantity"] == 16
    assert sum(r.reserved_quantity for r in db.query(StockReservation).all()) == 16
    assert db.query(WarehouseStock).filter_by(product_id="PICK-A").one().physical_stock == 100
    assert db.query(ProductStockProfile).filter_by(product_id="PICK-A").one().stock == 90
    assert db.query(StockLedgerEntry).count() == 0
    changed = client.put("/api/v1/picking-lists/locations/1/P-A", headers=headers(), json={"location_code": "Z-99", "route_sequence": 1})
    assert changed.status_code == 200
    assert client.get(f"/api/v1/picking-lists/{data['id']}", headers=headers()).json()["items"][2]["location_code"] == "A-02"


@pytest.mark.parametrize("quantity,reason,expected", [(0, None, 400), (1, "   ", 400), (99, "Sai số", 400), (-1, None, 422), (1.5, None, 422)])
def test_invalid_pick_quantities_and_short_reason(picking_env, quantity, reason, expected):
    client, db, headers = picking_env
    sheet = create(client, headers).json()
    response = update(client, headers, sheet, sheet["items"][0], quantity, reason)
    assert response.status_code == expected
    db.expire_all()
    assert db.query(PickingListItem).filter_by(id=sheet["items"][0]["id"]).one().version == 1


def test_short_pick_audit_correction_and_optimistic_concurrency(picking_env):
    client, db, headers = picking_env
    sheet = create(client, headers).json()
    line = sheet["items"][0]
    changed = update(client, headers, sheet, line, 0, "Không tìm thấy hàng").json()
    assert changed["items"][0]["status"] == "short"
    assert changed["shortfall_quantity"] == 3
    assert update(client, headers, sheet, line, 3).status_code == 409
    corrected = update(client, headers, changed, changed["items"][0], 3)
    assert corrected.status_code == 200
    assert corrected.json()["shortfall_quantity"] == 0
    log = client.get(f"/api/v1/picking-lists/{sheet['id']}/history", headers=headers()).json()
    assert log["total"] == 2
    assert log["items"][0]["old_reason"] == "Không tìm thấy hàng"
    assert log["items"][0]["new_reason"] is None
    assert log["items"][0]["old_shortfall"] == 3
    assert log["items"][0]["new_quantity"] == 3
    assert log["items"][0]["changed_by"] == 901
    assert db.query(StockLedgerEntry).count() == 0
    assert sum(r.reserved_quantity for r in db.query(StockReservation).all()) == 16


def test_complete_all_lines_and_dispatch_deducts_once(picking_env):
    client, db, headers = picking_env
    sheet = create(client, headers, ["PICK-01"]).json()
    for line in sheet["items"]:
        response = update(client, headers, sheet, line, line["requested_quantity"])
        assert response.status_code == 200
    assert response.json()["status"] == "completed"
    dispatched = client.post("/api/v1/dispatches", headers=headers(), json={
        "client_request_id": "dispatch-after-pick", "order_id": "PICK-01", "warehouse_id": 1,
        "items": [{"product_id": "PICK-A", "dispatched_quantity": 5}, {"product_id": "PICK-B", "dispatched_quantity": 3}],
    })
    assert dispatched.status_code == 201, dispatched.text
    db.expire_all()
    assert db.query(WarehouseStock).filter_by(product_id="PICK-A").one().physical_stock == 95
    assert db.query(WarehouseStock).filter_by(product_id="PICK-B").one().physical_stock == 97
    assert db.query(StockReservation).filter_by(status="active").count() == 0
    assert update(client, headers, sheet, response.json()["items"][0], 3).status_code == 409


def test_idempotency_and_duplicate_claim(picking_env):
    client, db, headers = picking_env
    first = create(client, headers)
    assert create(client, headers).json()["id"] == first.json()["id"]
    assert db.query(PickingList).count() == 1
    assert create(client, headers, request_id="new-request").status_code == 409
    assert create(client, headers, ["PICK-01"], request_id="pick-request").status_code == 409
    assert client.get("/api/v1/picking-lists/eligible-orders?warehouse_id=1", headers=headers()).json()["items"] == []


def test_missing_location_or_insufficient_stock_is_atomic(picking_env):
    client, db, headers = picking_env
    db.query(PickingLocation).filter_by(product_id="PICK-A").delete()
    db.commit()
    preview = client.post("/api/v1/picking-lists/previews", headers=headers(), json={"warehouse_id": 1, "order_ids": ["PICK-01"]}).json()
    assert preview["can_create"] is False
    assert "vị trí" in preview["warnings"][0]
    assert create(client, headers).status_code == 400
    assert db.query(PickingList).count() == 0
    assert db.query(StockReservation).count() == 0
    db.add(PickingLocation(product_id="PICK-A", warehouse_id=1, location_code="A", route_sequence=20))
    db.query(WarehouseStock).filter_by(product_id="PICK-A").update({"physical_stock": 0})
    db.commit()
    assert create(client, headers).status_code == 400
    assert db.query(PickingList).count() == 0
    assert db.query(StockReservation).count() == 0


def test_unapproved_missing_and_duplicate_orders_rejected(picking_env):
    client, _, headers = picking_env
    assert create(client, headers, ["PICK-03"]).status_code == 400
    assert create(client, headers, ["missing"]).status_code == 404
    assert create(client, headers, ["PICK-01", "PICK-01"]).status_code == 400


def test_warehouse_scope_roles_and_authentication(picking_env):
    client, _, headers = picking_env
    assert client.get("/api/v1/picking-lists?warehouse_id=1").status_code == 401
    assert client.get("/api/v1/picking-lists?warehouse_id=1", headers=headers(904)).status_code == 403
    assert client.get("/api/v1/picking-lists?warehouse_id=1", headers=headers(906)).status_code == 403
    assert client.get("/api/v1/picking-lists?warehouse_id=1", headers=headers(903)).status_code == 403
    assert client.get("/api/v1/picking-lists?warehouse_id=1", headers=headers(902)).status_code == 200
    sheet = create(client, headers).json()
    assert client.get(f"/api/v1/picking-lists/{sheet['id']}", headers=headers(903)).status_code == 403
    assert client.get(f"/api/v1/picking-lists/{sheet['id']}/history", headers=headers(903)).status_code == 403
    assert client.put("/api/v1/picking-lists/locations/1/P-A", headers=headers(902), json={"location_code": "A", "route_sequence": 1}).status_code == 403


def test_wrong_warehouse_and_existing_reservation_not_duplicated(picking_env):
    client, db, headers = picking_env
    db.add(StockReservation(order_id="PICK-01", product_id="PICK-A", sku="P-A", warehouse=WAREHOUSE, reserved_quantity=5, status="active"))
    db.commit()
    assert create(client, headers, ["PICK-01"]).status_code == 201
    assert db.query(StockReservation).filter_by(order_id="PICK-01", product_id="PICK-A").count() == 1
    db.add(CustomerWarehouseProfile(customer_id="OTHER", warehouse_name="Kho Đà Nẵng", warehouse_code="WH-DANANG"))
    db.query(Order).filter_by(id="PICK-02").update({"customer_id": "OTHER"})
    db.commit()
    assert create(client, headers, ["PICK-02"], request_id="wrong-wh").status_code == 400


def test_cancel_preserves_history_and_allows_recreation(picking_env):
    client, db, headers = picking_env
    sheet = create(client, headers, ["PICK-01"]).json()
    assert update(client, headers, sheet, sheet["items"][0], 3).status_code == 200
    cancelled = client.patch(f"/api/v1/picking-lists/{sheet['id']}", headers=headers(), json={"status": "cancelled", "reason": "Đổi lượt soạn, đã trả hàng"})
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert create(client, headers, ["PICK-01"], request_id="replacement").status_code == 201
    assert db.query(StockReservation).count() == 2
    assert update(client, headers, sheet, sheet["items"][1], 5).status_code == 409


def test_reserved_approval_becomes_packing_and_restores_on_cancel(picking_env):
    client, db, headers = picking_env
    db.query(Order).filter_by(id="PICK-01").update({"status": "reserved"})
    db.commit()
    sheet = create(client, headers, ["PICK-01"]).json()
    db.expire_all()
    assert db.query(Order).filter_by(id="PICK-01").one().status == "PACKING"
    result = client.patch(f"/api/v1/picking-lists/{sheet['id']}", headers=headers(), json={"status": "cancelled", "reason": "Chuyển lượt"})
    assert result.status_code == 200
    db.expire_all()
    assert db.query(Order).filter_by(id="PICK-01").one().status == "reserved"


def test_changed_reservations_source_cancel_and_foreign_line_are_rejected(picking_env):
    client, db, headers = picking_env
    sheet = create(client, headers, ["PICK-01"]).json()
    other = create(client, headers, ["PICK-02"], request_id="other").json()
    assert update(client, headers, sheet, other["items"][0], 3).status_code == 404
    db.query(StockReservation).filter_by(order_id="PICK-01").update({"status": "released"})
    db.commit()
    assert update(client, headers, sheet, sheet["items"][0], 3).status_code == 409
    db.query(Order).filter_by(id="PICK-02").update({"status": "cancelled"})
    db.commit()
    assert update(client, headers, other, other["items"][0], 3).status_code == 409


def test_existing_reservation_in_another_warehouse_is_rejected(picking_env):
    client, db, headers = picking_env
    db.add(StockReservation(order_id="PICK-01", product_id="PICK-A", sku="P-A", warehouse="Kho Đà Nẵng", reserved_quantity=5, status="active"))
    db.commit()
    assert create(client, headers, ["PICK-01"]).status_code == 400
    eligible = client.get("/api/v1/picking-lists/eligible-orders?warehouse_id=1", headers=headers()).json()
    assert [o["id"] for o in eligible["items"]] == ["PICK-02"]


def test_legacy_stock_backfill_and_paginated_queries(picking_env):
    client, db, headers = picking_env
    db.query(WarehouseStock).delete()
    db.commit()
    response = create(client, headers, ["PICK-01"])
    assert response.status_code == 201, response.text
    assert db.query(WarehouseStock).count() == 2
    assert db.query(WarehouseStock).filter_by(product_id="PICK-A").one().physical_stock == 100
    page = client.get("/api/v1/picking-lists?warehouse_id=1&page_size=1&status=pending", headers=headers()).json()
    assert page["total"] == 1
    assert page["items"][0]["orders"][0]["id"] == "PICK-01"
    assert client.get("/api/v1/picking-lists?warehouse_id=1&search=missing", headers=headers()).json()["total"] == 0
    assert client.get("/api/v1/picking-lists?warehouse_id=1&page=0", headers=headers()).status_code == 422


def test_repeated_sku_retains_each_order_line_and_reserves_total(picking_env):
    client, db, headers = picking_env
    db.add(OrderItem(order_id="PICK-01", product_id="PICK-A", sku="P-A", name="P-A", quantity=2, unit="cái"))
    db.commit()
    response = create(client, headers, ["PICK-01"])
    assert response.status_code == 201
    assert response.json()["total_lines"] == 3
    assert response.json()["total_quantity"] == 10
    assert db.query(StockReservation).filter_by(order_id="PICK-01", product_id="PICK-A").one().reserved_quantity == 7


def test_legacy_product_id_unit_alias_and_stock_profile_in_nondefault_warehouse(picking_env):
    client, db, headers = picking_env
    db.query(OrderItem).filter_by(order_id="PICK-01", product_id="PICK-A").update({"product_id": "4", "unit": "Chiếc"})
    db.query(WarehouseStock).delete()
    db.query(ProductStockProfile).update({"warehouse": "Kho Tổng TP.HCM"})
    db.query(PickingLocation).update({"warehouse_id": 3})
    db.commit()
    result = client.post("/api/v1/picking-lists", headers=headers(), json={
        "warehouse_id": 3, "order_ids": ["PICK-01"], "client_request_id": "legacy-hcm",
    })
    assert result.status_code == 201, result.text
    line = next(i for i in result.json()["items"] if i["sku"] == "P-A")
    assert line["product_id"] == "PICK-A"
    assert line["unit"] == "cái"
    assert db.query(WarehouseStock).filter_by(warehouse_id=3).count() == 2
    assert db.query(WarehouseStock).filter_by(warehouse_id=1).count() == 0
    assert update(client, headers, result.json(), line, 5).status_code == 200
