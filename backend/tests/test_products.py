import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.product import Product, ProductStatus
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test sản phẩm
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
def setup_product_test_database():
    """Tạo schema và dữ liệu người dùng kiểm thử trước mỗi test case."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    # 1. Quản lý kinh doanh (Sales Manager)
    sm_user = User(
        username="sales_manager_test",
        email="sales_manager@warehouse.local",
        full_name="Nguyễn Văn Quản Lý",
        role=UserRole.SALES_MANAGER.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    # 2. Nhân viên bán hàng (Sales Rep)
    sr_user = User(
        username="sales_rep_test",
        email="sales_rep@warehouse.local",
        full_name="Lê Thị Bán Hàng",
        role=UserRole.SALES_REP.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    # 3. Quản trị viên (Admin)
    admin_user = User(
        username="admin_test",
        email="admin@warehouse.local",
        full_name="Trần Quản Trị",
        role=UserRole.ADMIN.value,
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    db.add_all([sm_user, sr_user, admin_user])
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


client = TestClient(app)


def get_token(username: str) -> str:
    """Tạo token Bearer cho user tương ứng."""
    db = TestingSessionLocal()
    user = db.query(User).filter(User.username == username).first()
    db.close()
    return tao_token_truy_cap({
        "user_id": user.id,
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "token_version": user.token_version,
    })


# ==============================================================================
# 1. SCRUM-376: Tạo mới, cập nhật, xem chi tiết và phân trang danh mục
# ==============================================================================

def test_scrum_376_create_product_success():
    """Tạo mới sản phẩm thành công với đầy đủ thông tin chuẩn hóa."""
    token = get_token("sales_manager_test")
    payload = {
        "sku": "sp-vinamilk-100",
        "name": "Sữa tươi Vinamilk 100% Không đường 1L",
        "category": "Sữa tươi",
        "unit": "Hộp",
        "packaging_spec": "12 hộp/thùng",
        "cost_price": 25000.0,
        "status": "ACTIVE"
    }
    res = client.post("/api/v1/products", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201
    data = res.json()
    assert data["sku"] == "SP-VINAMILK-100"  # SKU tự động UPPER
    assert data["name"] == payload["name"]
    assert data["category"] == payload["category"]
    assert data["unit"] == payload["unit"]
    assert data["packaging_spec"] == payload["packaging_spec"]
    assert data["cost_price"] == 25000.0
    assert data["status"] == "ACTIVE"
    assert data["has_transactions"] is False


def test_scrum_376_list_and_paginate_products():
    """Lấy danh sách sản phẩm có tìm kiếm và phân trang."""
    token = get_token("sales_manager_test")
    # Tạo 3 sản phẩm mẫu
    for i in range(1, 4):
        client.post("/api/v1/products", json={
            "sku": f"SKU-DEMO-{i}",
            "name": f"Sản phẩm mẫu số {i}",
            "category": "Bánh kẹo" if i < 3 else "Nước ngọt",
            "unit": "Gói",
            "cost_price": 10000.0 * i,
        }, headers={"Authorization": f"Bearer {token}"})

    # Phân trang page 1, page_size 2
    res = client.get("/api/v1/products?page=1&page_size=2", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["total_pages"] == 2

    # Tìm kiếm theo từ khóa
    res_search = client.get("/api/v1/products?search=DEMO-1", headers={"Authorization": f"Bearer {token}"})
    assert res_search.status_code == 200
    assert res_search.json()["total"] == 1
    assert res_search.json()["items"][0]["sku"] == "SKU-DEMO-1"

    # Lọc theo nhóm hàng
    res_cat = client.get("/api/v1/products?category=Nước ngọt", headers={"Authorization": f"Bearer {token}"})
    assert res_cat.status_code == 200
    assert res_cat.json()["total"] == 1
    assert res_cat.json()["items"][0]["sku"] == "SKU-DEMO-3"


def test_scrum_376_update_product():
    """Cập nhật thông tin sản phẩm."""
    token = get_token("sales_manager_test")
    res = client.post("/api/v1/products", json={
        "sku": "SP-UPDATE-01",
        "name": "Tên cũ",
        "category": "Đồ uống",
        "unit": "Chai",
        "cost_price": 5000.0,
    }, headers={"Authorization": f"Bearer {token}"})
    prod_id = res.json()["id"]

    # Cập nhật tên và quy cách
    update_res = client.put(f"/api/v1/products/{prod_id}", json={
        "name": "Tên mới đã cập nhật",
        "packaging_spec": "24 chai/thùng"
    }, headers={"Authorization": f"Bearer {token}"})
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Tên mới đã cập nhật"
    assert update_res.json()["packaging_spec"] == "24 chai/thùng"


# ==============================================================================
# 2. SCRUM-377: Kiểm tra duy nhất mã SKU và các ràng buộc dữ liệu
# ==============================================================================

def test_scrum_377_duplicate_sku_creation():
    """Kiểm tra báo lỗi khi tạo sản phẩm có mã SKU đã tồn tại (HTTP 400)."""
    token = get_token("sales_manager_test")
    client.post("/api/v1/products", json={
        "sku": "SKU-UNIQUE-01",
        "name": "Sản phẩm A",
        "category": "Gia dụng",
        "unit": "Cái",
    }, headers={"Authorization": f"Bearer {token}"})

    # Cố tình tạo sản phẩm thứ 2 trùng SKU (kể cả viết thường)
    res_dup = client.post("/api/v1/products", json={
        "sku": "sku-unique-01",
        "name": "Sản phẩm B",
        "category": "Gia dụng",
        "unit": "Cái",
    }, headers={"Authorization": f"Bearer {token}"})
    assert res_dup.status_code == 400
    assert "đã tồn tại trong hệ thống" in res_dup.json()["detail"]


def test_scrum_377_duplicate_sku_on_update():
    """Kiểm tra báo lỗi khi cập nhật mã SKU trùng với sản phẩm khác (HTTP 400)."""
    token = get_token("sales_manager_test")
    client.post("/api/v1/products", json={
        "sku": "SKU-PROD-A",
        "name": "Sản phẩm A",
        "category": "Gia dụng",
        "unit": "Cái",
    }, headers={"Authorization": f"Bearer {token}"})

    res_b = client.post("/api/v1/products", json={
        "sku": "SKU-PROD-B",
        "name": "Sản phẩm B",
        "category": "Gia dụng",
        "unit": "Cái",
    }, headers={"Authorization": f"Bearer {token}"})
    prod_b_id = res_b.json()["id"]

    # Đổi SKU của B thành SKU của A -> phải báo lỗi 400
    res_err = client.put(f"/api/v1/products/{prod_b_id}", json={
        "sku": "SKU-PROD-A"
    }, headers={"Authorization": f"Bearer {token}"})
    assert res_err.status_code == 400
    assert "đã được sử dụng bởi sản phẩm khác" in res_err.json()["detail"]


def test_scrum_377_blank_or_invalid_fields():
    """Kiểm tra validation: trường rỗng hoặc định dạng SKU sai (HTTP 422)."""
    token = get_token("sales_manager_test")
    # Tên rỗng
    res = client.post("/api/v1/products", json={
        "sku": "SKU-VALID",
        "name": "   ",
        "category": "Category",
        "unit": "Unit"
    }, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 422

    # SKU chứa ký tự đặc biệt không hợp lệ
    res_bad_sku = client.post("/api/v1/products", json={
        "sku": "SKU@#$%",
        "name": "Valid Name",
        "category": "Category",
        "unit": "Unit"
    }, headers={"Authorization": f"Bearer {token}"})
    assert res_bad_sku.status_code == 422


# ==============================================================================
# 3. SCRUM-378: Phân quyền xem và sửa giá vốn chỉ dành cho Quản lý kinh doanh
# ==============================================================================

def test_scrum_378_sales_manager_can_view_and_edit_cost_price():
    """Quản lý kinh doanh (Sales Manager) xem và cập nhật được giá vốn."""
    sm_token = get_token("sales_manager_test")
    res = client.post("/api/v1/products", json={
        "sku": "SKU-COST-TEST",
        "name": "Sản phẩm giá vốn",
        "category": "Hàng tiêu dùng",
        "unit": "Chai",
        "cost_price": 50000.0,
    }, headers={"Authorization": f"Bearer {sm_token}"})
    prod_id = res.json()["id"]
    assert res.json()["cost_price"] == 50000.0

    # Sửa giá vốn
    update_res = client.put(f"/api/v1/products/{prod_id}", json={
        "cost_price": 55000.0
    }, headers={"Authorization": f"Bearer {sm_token}"})
    assert update_res.status_code == 200
    assert update_res.json()["cost_price"] == 55000.0


def test_scrum_378_sales_rep_cannot_view_or_edit_cost_price():
    """Nhân viên bán hàng (Sales Rep) bị ẩn giá vốn và không được phép sửa giá vốn."""
    sm_token = get_token("sales_manager_test")
    res = client.post("/api/v1/products", json={
        "sku": "SKU-COST-PROTECT",
        "name": "Sản phẩm bảo vệ giá vốn",
        "category": "Hàng tiêu dùng",
        "unit": "Chai",
        "cost_price": 80000.0,
    }, headers={"Authorization": f"Bearer {sm_token}"})
    prod_id = res.json()["id"]

    # 1. Sales Rep xem danh sách -> cost_price phải là None
    sr_token = get_token("sales_rep_test")
    res_get = client.get(f"/api/v1/products/{prod_id}", headers={"Authorization": f"Bearer {sr_token}"})
    assert res_get.status_code == 200
    assert res_get.json()["cost_price"] is None

    # 2. Sales Rep xem phân trang -> cost_price phải là None
    res_list = client.get("/api/v1/products", headers={"Authorization": f"Bearer {sr_token}"})
    assert res_list.status_code == 200
    for item in res_list.json()["items"]:
        assert item["cost_price"] is None

    # 3. Sales Rep cố tình cập nhật cost_price -> HTTP 403 Forbidden
    res_edit = client.put(f"/api/v1/products/{prod_id}", json={
        "cost_price": 10000.0
    }, headers={"Authorization": f"Bearer {sr_token}"})
    assert res_edit.status_code == 403
    assert "Chỉ Quản lý kinh doanh mới có quyền" in res_edit.json()["detail"]


# ==============================================================================
# 4. SCRUM-379: Quản lý ảnh sản phẩm và lưu trữ thông tin hiển thị
# ==============================================================================

def test_scrum_379_upload_product_image():
    """Tải lên file ảnh hợp lệ cho sản phẩm."""
    sm_token = get_token("sales_manager_test")
    res = client.post("/api/v1/products", json={
        "sku": "SKU-IMAGE-01",
        "name": "Sản phẩm có ảnh",
        "category": "Gia dụng",
        "unit": "Bộ",
    }, headers={"Authorization": f"Bearer {sm_token}"})
    prod_id = res.json()["id"]

    # Giả lập file ảnh PNG hợp lệ
    fake_png = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
    upload_res = client.post(
        f"/api/v1/products/{prod_id}/image",
        files={"file": ("product.png", fake_png, "image/png")},
        headers={"Authorization": f"Bearer {sm_token}"}
    )
    assert upload_res.status_code == 200
    assert upload_res.json()["image_url"] is not None
    assert upload_res.json()["image_url"].startswith("/static/products/")


def test_scrum_379_upload_invalid_extension():
    """Tải lên file có định dạng không được phép (vd: .exe, .txt) bị từ chối (HTTP 400)."""
    sm_token = get_token("sales_manager_test")
    res = client.post("/api/v1/products", json={
        "sku": "SKU-IMAGE-BAD",
        "name": "Sản phẩm test ảnh lỗi",
        "category": "Gia dụng",
        "unit": "Bộ",
    }, headers={"Authorization": f"Bearer {sm_token}"})
    prod_id = res.json()["id"]

    fake_file = io.BytesIO(b"Hello world")
    upload_res = client.post(
        f"/api/v1/products/{prod_id}/image",
        files={"file": ("malicious.exe", fake_file, "application/octet-stream")},
        headers={"Authorization": f"Bearer {sm_token}"}
    )
    assert upload_res.status_code == 400
    assert "Định dạng file không hợp lệ" in upload_res.json()["detail"]


# ==============================================================================
# 5. SCRUM-375: Xử lý nghiệp vụ ngừng kinh doanh thay vì xóa sản phẩm đã có giao dịch
# ==============================================================================

def test_scrum_375_delete_product_without_transactions():
    """Sản phẩm chưa có giao dịch được phép xóa bình thường."""
    sm_token = get_token("sales_manager_test")
    res = client.post("/api/v1/products", json={
        "sku": "SKU-NO-TRANS",
        "name": "Sản phẩm xóa được",
        "category": "Đồ chơi",
        "unit": "Cái",
    }, headers={"Authorization": f"Bearer {sm_token}"})
    prod_id = res.json()["id"]

    del_res = client.delete(f"/api/v1/products/{prod_id}", headers={"Authorization": f"Bearer {sm_token}"})
    assert del_res.status_code == 200
    assert "Đã xóa sản phẩm" in del_res.json()["message"]

    # Kiểm tra không còn trong danh mục
    get_res = client.get(f"/api/v1/products/{prod_id}", headers={"Authorization": f"Bearer {sm_token}"})
    assert get_res.status_code == 404


def test_scrum_375_cannot_delete_product_with_transactions():
    """Sản phẩm ĐÃ phát sinh giao dịch không được xóa mà phải ngừng kinh doanh (HTTP 400)."""
    sm_token = get_token("sales_manager_test")
    res = client.post("/api/v1/products", json={
        "sku": "SKU-HAS-TRANS",
        "name": "Sản phẩm đã bán nhiều",
        "category": "Thực phẩm",
        "unit": "Thùng",
    }, headers={"Authorization": f"Bearer {sm_token}"})
    prod_id = res.json()["id"]

    # Giả lập sản phẩm đã phát sinh giao dịch trong CSDL
    db = TestingSessionLocal()
    prod = db.query(Product).filter(Product.id == prod_id).first()
    prod.has_transactions = True
    db.commit()
    db.close()

    # Thử gọi DELETE -> bị từ chối với HTTP 400
    del_res = client.delete(f"/api/v1/products/{prod_id}", headers={"Authorization": f"Bearer {sm_token}"})
    assert del_res.status_code == 400
    assert "đã phát sinh giao dịch trong hệ thống, không thể xóa" in del_res.json()["detail"]

    # Thay vì xóa, gọi endpoint ngừng kinh doanh
    deact_res = client.post(f"/api/v1/products/{prod_id}/deactivate", headers={"Authorization": f"Bearer {sm_token}"})
    assert deact_res.status_code == 200
    assert deact_res.json()["status"] == "INACTIVE"

    # Kích hoạt lại kinh doanh
    act_res = client.post(f"/api/v1/products/{prod_id}/activate", headers={"Authorization": f"Bearer {sm_token}"})
    assert act_res.status_code == 200
    assert act_res.json()["status"] == "ACTIVE"


def test_create_product_with_frontend_payload():
    """Kiểm tra tạo mới sản phẩm với đầy đủ các trường từ Frontend gửi lên:
    - status chữ thường ('active')
    - sale_price, packaging_specification, barcode
    - stock, min_stock, description
    """
    token = get_token("admin_test")
    payload = {
        "sku": "SP-FE-NEW-01",
        "barcode": "893850999999",
        "name": "Nước tương Nam Dương đậm đặc 500ml",
        "category": "Gia vị & Chế biến",
        "supplier_id": "ncc-01",
        "supplier_name": "Công ty CP Nam Dương",
        "cost_price": 18000,
        "sale_price": 25000,
        "stock": 150,
        "min_stock": 20,
        "unit": "Chai",
        "packaging_specification": "24 chai/thùng",
        "image": "https://example.com/namduong.png",
        "description": "Nước tương thơm ngon",
        "status": "active",
    }
    res = client.post("/api/v1/products", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201
    data = res.json()
    assert data["sku"] == "SP-FE-NEW-01"
    assert data["name"] == "Nước tương Nam Dương đậm đặc 500ml"
    assert data["price"] == 25000
    assert data["sale_price"] == 25000
    assert data["cost_price"] == 18000
    assert data["stock"] == 150
    assert data["min_stock"] == 20
    assert data["packaging_spec"] == "24 chai/thùng"
    assert data["status"] == "ACTIVE"


def test_create_product_by_sales_rep_auto_sets_zero_cost_price():
    """Nhân viên bán hàng (sales_rep) tạo sản phẩm không bị lỗi 403, giá vốn được set về 0."""
    token = get_token("sales_rep_test")
    payload = {
        "sku": "SP-SALESREP-01",
        "name": "Bánh quy kem dâu",
        "category": "Bánh kẹo",
        "cost_price": 50000,
        "sale_price": 60000,
        "unit": "Hộp",
        "status": "active",
    }
    res = client.post("/api/v1/products", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201
    data = res.json()
    # Nhân viên sales_rep không xem được cost_price (trả về None)
    assert data["cost_price"] is None
    assert data["price"] == 60000
    assert data["status"] == "ACTIVE"


def test_product_image_url_persisted_and_updated():
    """Kiểm tra URL hình ảnh được lưu và cập nhật chính xác, trả về cả image và image_url."""
    token = get_token("admin_test")
    test_img = "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=500"
    res = client.post("/api/v1/products", json={
        "sku": "SP-IMG-TEST",
        "name": "Bánh mì hoa cúc Pháp",
        "category": "Bánh tươi",
        "unit": "Ổ",
        "image": test_img,
    }, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201
    prod = res.json()
    assert prod["image_url"] == test_img
    assert prod["image"] == test_img

    # Cập nhật ảnh mới
    new_img = "https://images.unsplash.com/photo-custom-999.png"
    upd_res = client.put(f"/api/v1/products/{prod['id']}", json={
        "image": new_img,
    }, headers={"Authorization": f"Bearer {token}"})
    assert upd_res.status_code == 200
    upd_prod = upd_res.json()
    assert upd_prod["image_url"] == new_img
    assert upd_prod["image"] == new_img


