import pytest
from app.api.stock_card import get_stock_card

def test_scrum_648_get_stock_card():
    res = get_stock_card(product_id="SKU001")
    assert len(res) > 0
    assert res[0].product_id == "SKU001"

def test_scrum_644_balance_after_and_doc_ref():
    res = get_stock_card(product_id="SKU001")
    assert res[0].balance_after == 100
    assert res[0].doc_ref_id == "PN001"

def test_scrum_646_filter_by_warehouse():
    res = get_stock_card(product_id="SKU001", warehouse_id="WH01")
    assert all(item.warehouse_id == "WH01" for item in res)