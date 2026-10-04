import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.core.database import Base, lay_phien_db
from app.models.category import Category
from app.models.product import Product

# Sử dụng DB in-memory riêng biệt cho test
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_lay_phien_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db
    yield
    Base.metadata.drop_all(bind=test_engine)


client = TestClient(app)


# ==============================================================================
# BỘ TEST SCRUM-214: QUẢN LÝ NHÓM HÀNG NHIỀU CẤP & CHUYỂN SẢN PHẨM
# ==============================================================================

def test_create_category_hierarchy_min_3_levels():
    """Kiểm tra tạo cấu trúc nhóm hàng nhiều cấp (tối thiểu 3 cấp) theo SCRUM-214."""
    # 1. Cấp 1: Ngành hàng lớn (Root)
    res_l1 = client.post("/api/v1/categories", json={
        "code": "NGANH_DIEN_TU",
        "name": "Ngành hàng Điện tử",
        "description": "Toàn bộ sản phẩm công nghệ điện tử",
        "parent_id": None
    })
    assert res_l1.status_code == 201
    l1_data = res_l1.json()
    assert l1_data["level"] == 1
    assert l1_data["parent_id"] is None
    l1_id = l1_data["id"]

    # 2. Cấp 2: Nhóm hàng trực thuộc Cấp 1
    res_l2 = client.post("/api/v1/categories", json={
        "code": "NHOM_DIEN_THOAI",
        "name": "Nhóm Điện thoại",
        "parent_id": l1_id
    })
    assert res_l2.status_code == 201
    l2_data = res_l2.json()
    assert l2_data["level"] == 2
    assert l2_data["parent_id"] == l1_id
    l2_id = l2_data["id"]

    # 3. Cấp 3: Tiểu nhóm trực thuộc Cấp 2
    res_l3 = client.post("/api/v1/categories", json={
        "code": "TIEU_NHOM_SMARTPHONE",
        "name": "Tiểu nhóm Điện thoại thông minh",
        "parent_id": l2_id
    })
    assert res_l3.status_code == 201
    l3_data = res_l3.json()
    assert l3_data["level"] == 3
    assert l3_data["parent_id"] == l2_id


def test_get_category_tree_structure():
    """Kiểm tra API /tree trả về dữ liệu lồng nhau đúng quan hệ cha - con tối thiểu 3 cấp."""
    # Khởi tạo cây dữ liệu mẫu qua service
    res_seed = client.post("/api/v1/categories/seed-samples")
    assert res_seed.status_code == 200

    # Gọi API lấy cây danh mục
    res_tree = client.get("/api/v1/categories/tree")
    assert res_tree.status_code == 200
    tree_data = res_tree.json()
    assert len(tree_data) >= 2  # Gồm Điện tử và Gia dụng

    # Kiểm tra cấp 1: DIEN_TU
    dien_tu_node = next((node for node in tree_data if node["code"] == "DIEN_TU"), None)
    assert dien_tu_node is not None
    assert dien_tu_node["level"] == 1
    assert len(dien_tu_node["children"]) >= 2  # Điện thoại & Laptop

    # Kiểm tra cấp 2: DIEN_THOAI_MTB
    dt_node = next((child for child in dien_tu_node["children"] if child["code"] == "DIEN_THOAI_MTB"), None)
    assert dt_node is not None
    assert dt_node["level"] == 2
    assert len(dt_node["children"]) >= 2  # Smartphone & Tablet

    # Kiểm tra cấp 3: SMARTPHONE
    sp_node = next((sub for sub in dt_node["children"] if sub["code"] == "SMARTPHONE"), None)
    assert sp_node is not None
    assert sp_node["level"] == 3
    assert sp_node["product_count"] >= 2  # iPhone và Samsung


def test_cycle_and_self_parent_prevention():
    """Kiểm tra ngăn chặn tạo chu trình vòng lặp cha-con và tự làm cha chính mình."""
    # Tạo 2 nhóm
    res1 = client.post("/api/v1/categories", json={"code": "PARENT_A", "name": "Nhóm A"})
    id_a = res1.json()["id"]

    res2 = client.post("/api/v1/categories", json={"code": "CHILD_B", "name": "Nhóm B", "parent_id": id_a})
    id_b = res2.json()["id"]

    # 1. Tự làm cha chính mình -> 400
    res_self = client.put(f"/api/v1/categories/{id_a}", json={"parent_id": id_a})
    assert res_self.status_code == 400
    assert "tự làm nhóm cha" in res_self.json()["detail"]

    # 2. Đổi cha của A thành B (B vốn là con của A) -> 400
    res_cycle = client.put(f"/api/v1/categories/{id_a}", json={"parent_id": id_b})
    assert res_cycle.status_code == 400
    assert "xung đột vòng lặp" in res_cycle.json()["detail"]


def test_transfer_products_between_categories():
    """Kiểm tra chức năng chuyển sản phẩm từ nhóm này sang nhóm khác (SCRUM-214)."""
    # Tạo 2 nhóm hàng đích và nguồn
    cat_source = client.post("/api/v1/categories", json={"code": "SOURCE_CAT", "name": "Nhóm Nguồn"}).json()
    cat_target = client.post("/api/v1/categories", json={"code": "TARGET_CAT", "name": "Nhóm Đích"}).json()

    # Tạo 2 sản phẩm thuộc nhóm nguồn
    prod1 = client.post("/api/v1/categories/products", json={
        "sku": "PROD-TRANSFER-1", "name": "Sản phẩm A", "category_id": cat_source["id"], "price": 100000
    }).json()
    prod2 = client.post("/api/v1/categories/products", json={
        "sku": "PROD-TRANSFER-2", "name": "Sản phẩm B", "category_id": cat_source["id"], "price": 200000
    }).json()

    # Xác nhận trước khi chuyển
    prods_in_source = client.get(f"/api/v1/categories/{cat_source['id']}/products").json()
    assert len(prods_in_source) == 2

    # Gọi API chuyển sản phẩm sang TARGET_CAT
    res_transfer = client.post("/api/v1/categories/transfer-products", json={
        "source_category_id": cat_source["id"],
        "target_category_id": cat_target["id"],
        "product_ids": [prod1["id"], prod2["id"]]
    })
    assert res_transfer.status_code == 200
    transfer_res = res_transfer.json()
    assert transfer_res["success"] is True
    assert transfer_res["transferred_count"] == 2

    # Kiểm tra nhóm nguồn giờ không còn sản phẩm nào
    prods_source_after = client.get(f"/api/v1/categories/{cat_source['id']}/products").json()
    assert len(prods_source_after) == 0

    # Kiểm tra nhóm đích hiện có 2 sản phẩm
    prods_target_after = client.get(f"/api/v1/categories/{cat_target['id']}/products").json()
    assert len(prods_target_after) == 2


def test_prevent_delete_category_when_has_products():
    """RÀNG BUỘC SCRUM-214: Nhóm còn sản phẩm thì không xóa được (HTTP 400)."""
    cat = client.post("/api/v1/categories", json={"code": "CAT_WITH_PROD", "name": "Nhóm Có Hàng"}).json()
    client.post("/api/v1/categories/products", json={
        "sku": "SP-001", "name": "Hàng tồn mẫu", "category_id": cat["id"], "price": 50000
    })

    # Cố tình xóa nhóm đang có sản phẩm
    res_del = client.delete(f"/api/v1/categories/{cat['id']}")
    assert res_del.status_code == 400
    assert "vì đang chứa" in res_del.json()["detail"]
    assert "sản phẩm trực thuộc" in res_del.json()["detail"]


def test_prevent_delete_category_when_has_children():
    """RÀNG BUỘC SCRUM-214: Nhóm còn nhóm con trực thuộc thì không xóa được (HTTP 400)."""
    parent = client.post("/api/v1/categories", json={"code": "PARENT_GUARD", "name": "Nhóm Cha"}).json()
    client.post("/api/v1/categories", json={"code": "CHILD_GUARD", "name": "Nhóm Con", "parent_id": parent["id"]})

    # Cố tình xóa nhóm cha khi nhóm con còn tồn tại
    res_del = client.delete(f"/api/v1/categories/{parent['id']}")
    assert res_del.status_code == 400
    assert "nhóm hàng con trực thuộc" in res_del.json()["detail"]


def test_delete_empty_category_success():
    """Nhóm hàng không có sản phẩm và không có nhóm con thì được phép xóa thành công (HTTP 200)."""
    cat = client.post("/api/v1/categories", json={"code": "EMPTY_CAT", "name": "Nhóm Hàng Rỗng"}).json()
    res_del = client.delete(f"/api/v1/categories/{cat['id']}")
    assert res_del.status_code == 200
    assert res_del.json()["success"] is True

    # Xác nhận sau khi xóa thì truy vấn trả về 404
    res_get = client.get(f"/api/v1/categories/{cat['id']}")
    assert res_get.status_code == 404
