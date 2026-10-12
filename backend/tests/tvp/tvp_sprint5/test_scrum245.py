import pytest
from backend.app.api import warehouse_api, location_api, warehouse_validation, agency_warehouse_api

def test_scrum_534_create_and_list_warehouse():
    wh_data = warehouse_api.WarehouseCreate(
        code="WH_TEST_01", name="Kho Test", address="HN", manager_name="Phúc"
    )
    res = warehouse_api.create_warehouse(wh_data)
    assert res["code"] == "WH_TEST_01"

def test_scrum_533_create_location():
    loc_data = location_api.LocationCreate(
        warehouse_id="WH_1", location_code="A1", location_name="Kệ A1", zone_or_shelf="Khu A"
    )
    res = location_api.create_location(loc_data)
    assert res["location_code"] == "A1"

def test_scrum_535_validation_unique_code():
    db_dummy = {"WH_1": {"code": "WH01", "name": "Kho 1"}}
    with pytest.raises(Exception):
        warehouse_validation.validate_unique_warehouse_code("WH01", db_dummy)

def test_scrum_536_assign_agency_warehouse():
    db_dummy = {"WH_1": {"id": "WH_1", "status": "ACTIVE"}}
    req = agency_warehouse_api.AssignWarehouseReq(agency_id="AG_01", warehouse_id="WH_1")
    res = agency_warehouse_api.assign_default_warehouse(req, db_dummy)
    assert res["default_warehouse_id"] == "WH_1"