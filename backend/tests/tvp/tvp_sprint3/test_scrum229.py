from __future__ import annotations
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_agencies_with_search_and_filter():
    response = client.get("/api/agencies?search=090&region=MienBac")
    assert response.status_code == 200
    
    data = response.json()
    assert "items" in data
    assert "total" in data
    
    if len(data["items"]) > 0:
        first_item = data["items"][0]
        assert "region" in first_item
        assert "customer_group" in first_item
        assert "assigned_person" in first_item
        assert "status" in first_item