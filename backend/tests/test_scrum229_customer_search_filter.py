import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.core.database import Base, lay_phien_db
from app.models.customer import Customer

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

    db = TestingSessionLocal()
    # Nạp bộ dữ liệu kiểm thử chuẩn SCRUM-229
    sample_customers = [
        Customer(
            id="CUS-T01",
            code="DL-HN-001",
            name="Đại Lý Phân Phối Thăng Long",
            phone="0911223344",
            email="thanglong@hanoi.vn",
            address="12 Cầu Giấy, Hà Nội",
            customer_group="TIER_1",
            region="Miền Bắc",
            assigned_sales_rep="Lê Thị Nhân Viên Kinh Doanh",
            status="active",
            total_orders=10,
            total_spent=150000000.0,
        ),
        Customer(
            id="CUS-T02",
            code="DL-DN-002",
            name="Đại Lý Thiết Bị Sông Hàn",
            phone="0922334455",
            email="songhan@danang.vn",
            address="45 Bạch Đằng, Đà Nẵng",
            customer_group="TIER_2",
            region="Miền Trung",
            assigned_sales_rep="Lê Thị Nhân Viên Kinh Doanh",
            status="active",
            total_orders=5,
            total_spent=50000000.0,
        ),
        Customer(
            id="CUS-T03",
            code="DL-SG-003",
            name="Đại Lý Bán Buôn Sài Gòn Pro",
            phone="0933445566",
            email="saigonpro@tphcm.vn",
            address="88 Nguyễn Huệ, Quận 1, TP. HCM",
            customer_group="WHOLESALE",
            region="Miền Nam",
            assigned_sales_rep="Nguyễn Văn Giám Đốc Kinh Doanh",
            status="locked",
            total_orders=20,
            total_spent=350000000.0,
        ),
        Customer(
            id="CUS-T04",
            code="DL-TN-004",
            name="Cửa Hàng Bán Lẻ Ban Mê",
            phone="0944556677",
            email="banme@daklak.vn",
            address="10 Lê Duẩn, Buôn Ma Thuột",
            customer_group="RETAIL",
            region="Tây Nguyên",
            assigned_sales_rep="Trần Quản Trị Hệ Thống",
            status="inactive",
            total_orders=2,
            total_spent=12000000.0,
        ),
        Customer(
            id="CUS-T05",
            code="DL-HN-005",
            name="Đại Lý VIP An Dương Vương",
            phone="0955667788",
            email="anduong@hanoi.vn",
            address="68 An Dương Vương, Hà Nội",
            customer_group="VIP",
            region="Miền Bắc",
            assigned_sales_rep="Lê Thị Nhân Viên Kinh Doanh",
            status="active",
            total_orders=15,
            total_spent=280000000.0,
        ),
    ]
    for c in sample_customers:
        db.add(c)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.pop(lay_phien_db, None)


client = TestClient(app)


def test_get_filter_options():
    """Kiểm thử API lấy danh sách tùy chọn lọc."""
    res = client.get("/api/v1/customers/filter-options")
    assert res.status_code == 200
    data = res.json()
    assert "regions" in data
    assert "customer_groups" in data
    assert "sales_reps" in data
    assert "statuses" in data
    assert "Miền Bắc" in data["regions"]
    assert "TIER_1" in data["customer_groups"]
    assert "active" in data["statuses"]


def test_quick_search_by_code():
    """Kiểm thử tìm nhanh theo mã đại lý."""
    res = client.get("/api/v1/customers?search=DL-HN-001")
    assert res.status_code == 200
    data = res.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) == 1
    assert items[0]["code"] == "DL-HN-001"
    assert items[0]["name"] == "Đại Lý Phân Phối Thăng Long"


def test_quick_search_by_name():
    """Kiểm thử tìm nhanh theo tên đại lý (không phân biệt hoa thường)."""
    res = client.get("/api/v1/customers?search=thăng long")
    assert res.status_code == 200
    data = res.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) == 1
    assert items[0]["code"] == "DL-HN-001"


def test_quick_search_by_phone():
    """Kiểm thử tìm nhanh theo số điện thoại."""
    res = client.get("/api/v1/customers?search=0933445566")
    assert res.status_code == 200
    data = res.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) == 1
    assert items[0]["code"] == "DL-SG-003"


def test_filter_by_region():
    """Kiểm thử lọc theo khu vực địa bàn."""
    res = client.get("/api/v1/customers?region=Miền Bắc")
    assert res.status_code == 200
    data = res.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) == 2
    for item in items:
        assert item["region"] == "Miền Bắc"


def test_filter_by_customer_group():
    """Kiểm thử lọc theo nhóm khách hàng."""
    res = client.get("/api/v1/customers?customer_group=WHOLESALE")
    assert res.status_code == 200
    data = res.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) == 1
    assert items[0]["customer_group"] == "WHOLESALE"


def test_filter_by_assigned_sales_rep():
    """Kiểm thử lọc theo nhân viên kinh doanh phụ trách."""
    res = client.get("/api/v1/customers?assigned_sales_rep=Lê Thị Nhân Viên Kinh Doanh")
    assert res.status_code == 200
    data = res.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) == 3
    for item in items:
        assert item["assigned_sales_rep"] == "Lê Thị Nhân Viên Kinh Doanh"


def test_filter_by_status():
    """Kiểm thử lọc theo trạng thái đại lý (locked / active / inactive)."""
    res = client.get("/api/v1/customers?status=locked")
    assert res.status_code == 200
    data = res.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) == 1
    assert items[0]["status"] == "locked"


def test_multi_filter_combination():
    """Kiểm thử kết hợp nhiều bộ lọc cùng lúc: khu vực + người phụ trách + trạng thái."""
    res = client.get(
        "/api/v1/customers?region=Miền Bắc&assigned_sales_rep=Lê Thị Nhân Viên Kinh Doanh&status=active"
    )
    assert res.status_code == 200
    data = res.json()
    items = data["items"] if isinstance(data, dict) else data
    assert len(items) == 2
    for item in items:
        assert item["region"] == "Miền Bắc"
        assert item["status"] == "active"
        assert item["assigned_sales_rep"] == "Lê Thị Nhân Viên Kinh Doanh"


def test_pagination():
    """Kiểm thử phân trang kết quả danh sách đại lý."""
    res = client.get("/api/v1/customers?page=1&page_size=2")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, dict)
    assert data["total"] == 5
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["total_pages"] == 3
    assert len(data["items"]) == 2

    # Trang 2
    res_page2 = client.get("/api/v1/customers?page=2&page_size=2")
    assert res_page2.status_code == 200
    data2 = res_page2.json()
    assert data2["page"] == 2
    assert len(data2["items"]) == 2
    assert data2["items"][0]["code"] != data["items"][0]["code"]


def test_empty_search_result():
    """Kiểm thử tra cứu với từ khóa không tồn tại trả về rỗng hợp lệ."""
    res = client.get("/api/v1/customers?search=KHONG_TON_TAI_99999&page=1&page_size=10")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, dict)
    assert data["total"] == 0
    assert len(data["items"]) == 0
    assert data["total_pages"] == 1
