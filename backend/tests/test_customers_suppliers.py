import uuid
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_customers_api():
    uid = uuid.uuid4().hex[:6]
    
    # List
    res = client.get("/api/v1/customers")
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # Create
    new_cus = {
        "name": f"Khách {uid}",
        "phone": "0988776655",
        "email": f"khach_{uid}@test.local",
        "customer_group": "TIER_1"
    }
    create_res = client.post("/api/v1/customers", json=new_cus)
    assert create_res.status_code == 201
    cus_id = create_res.json()["id"]

    # Detail
    detail_res = client.get(f"/api/v1/customers/{cus_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["phone"] == "0988776655"

    # Delete
    del_res = client.delete(f"/api/v1/customers/{cus_id}")
    assert del_res.status_code == 200


def test_suppliers_api():
    uid = uuid.uuid4().hex[:6]
    
    # List
    res = client.get("/api/v1/suppliers")
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # Create
    new_sup = {
        "name": f"Nhà Cung Cấp {uid}",
        "contact_person": "Nguyễn Văn Đại Diện",
        "phone": "0243123456",
        "email": f"ncc_{uid}@test.local"
    }
    create_res = client.post("/api/v1/suppliers", json=new_sup)
    assert create_res.status_code == 201
    sup_id = create_res.json()["id"]

    # Detail
    detail_res = client.get(f"/api/v1/suppliers/{sup_id}")
    assert detail_res.status_code == 200

    # Delete
    del_res = client.delete(f"/api/v1/suppliers/{sup_id}")
    assert del_res.status_code == 200
