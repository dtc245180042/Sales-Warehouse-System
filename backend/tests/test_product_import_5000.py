import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.product import Product
from app.services.product_import_service import ProductImportService
from main import app

TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_lay_phien_db():
    phien_db = TestingSessionLocal()
    try:
        yield phien_db
    finally:
        phien_db.close()

@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db
    db = TestingSessionLocal()
    sm_user = User(
        id=99,
        username="manager_test",
        email="manager@company.vn",
        hashed_password=bam_mat_khau("Pass@123"),
        full_name="Quản Lý Kho",
        role=UserRole.SALES_MANAGER.value,
        is_active=True,
        token_version=1,
    )
    db.add(sm_user)
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()

def test_execute_import_batch_and_all_products():
    db = TestingSessionLocal()
    # 1. Giả lập 200 sản phẩm theo Cách 1: [NHÓM]-[HÃNG]-[MODEL]-[THUỘC TÍNH]
    items = []
    for i in range(1, 201):
        items.append({
            "sku": f"DT-APL-IP{i}-128",
            "name": f"iPhone {i} 128GB",
            "category": "Điện thoại",
            "unit": "Chiếc",
            "cost_price": 10000000,
            "price": 12000000,
            "status": "ACTIVE",
            "action": "CREATE"
        })

    # 2. Gọi execute_import kiểm tra tốc độ batch
    res = ProductImportService.execute_import(items, db, {"username": "manager_test", "role": "SalesManager"})
    assert res["success_count"] == 200
    assert res["created_count"] == 200

    # 3. Kiểm tra endpoint GET /products với all_products=True
    client = TestClient(app)
    token = tao_token_truy_cap({
        "user_id": 99,
        "sub": "99",
        "username": "manager_test",
        "role": UserRole.SALES_MANAGER.value,
        "token_version": 1,
    })
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/products?all_products=true&page_size=10000", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 200
    assert len(data["items"]) == 200
    assert data["items"][0]["sku"] == "DT-APL-IP200-128"
    db.close()
