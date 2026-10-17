import time
from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.order import Order
from app.models.invoice import Invoice
from app.models.product_stock_profile import ProductStockProfile
from app.services.executive_dashboard_service import ExecutiveDashboardService
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Executive Dashboard S8-05
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
def setup_dashboard_db():
    """Khởi tạo schema và dữ liệu mẫu đa dạng cho bài test điều hành bán hàng và kho."""
    ExecutiveDashboardService.clear_cache()
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()

    # 1. Người dùng Quản lý kinh doanh (Sales Manager)
    sm = User(
        id=1,
        username="sales_manager",
        email="sales_manager@warehouse.local",
        role=UserRole.SALES_MANAGER.value,
        full_name="Nguyễn Văn Quản Lý",
        hashed_password=bam_mat_khau("Pass@1234"),
        is_active=True,
        token_version=1,
    )
    db.add(sm)

    # 2. Danh sách đại lý ở 2 khu vực khác nhau
    cust_north_1 = Customer(
        id="CUST-HN-01",
        code="DL-HANOI-01",
        name="Đại Lý Hà Nội Star",
        phone="0911222333",
        region="Miền Bắc",
        status="active",
    )
    cust_north_2 = Customer(
        id="CUST-HP-02",
        code="DL-HAIPHONG-02",
        name="Đại Lý Hải Phòng Pro",
        phone="0911444555",
        region="Miền Bắc",
        status="active",
    )
    cust_south_1 = Customer(
        id="CUST-SG-01",
        code="DL-SAIGON-01",
        name="Đại Lý Sài Gòn Tiến",
        phone="0988777666",
        region="Miền Nam",
        status="active",
    )
    db.add_all([cust_north_1, cust_north_2, cust_south_1])

    # Hạn mức tín dụng
    db.add_all([
        CustomerCreditProfile(customer_id="CUST-HN-01", credit_limit=100000000, current_debt=50000000),
        CustomerCreditProfile(customer_id="CUST-HP-02", credit_limit=50000000, current_debt=30000000),
        CustomerCreditProfile(customer_id="CUST-SG-01", credit_limit=200000000, current_debt=80000000),
    ])

    now = datetime.now(timezone.utc)
    today_dt = datetime(now.year, now.month, now.day, 10, 0, 0, tzinfo=timezone.utc)
    two_days_ago_dt = today_dt - timedelta(days=2)
    five_days_ago_dt = today_dt - timedelta(days=5)

    # 3. Đơn hàng (Orders):
    # - Đơn 1 (Hôm nay, Miền Bắc): 20,000,000đ - Đã duyệt (APPROVED - chờ xuất)
    o1 = Order(
        id="ORD-TODAY-01",
        code="DH-202610-001",
        customer_id=cust_north_1.id,
        customer_name=cust_north_1.name,
        total=20000000,
        status="APPROVED",
        created_at=today_dt,
    )
    # - Đơn 2 (Hôm nay, Miền Nam): 15,000,000đ - Chờ duyệt (PENDING_APPROVAL)
    o2 = Order(
        id="ORD-TODAY-02",
        code="DH-202610-002",
        customer_id=cust_south_1.id,
        customer_name=cust_south_1.name,
        total=15000000,
        status="PENDING_APPROVAL",
        requires_approval=True,
        created_at=today_dt,
    )
    # - Đơn 3 (2 ngày trước, Miền Bắc): 30,000,000đ - Đang đóng gói (PACKING - chờ xuất)
    o3 = Order(
        id="ORD-PREV-01",
        code="DH-202610-003",
        customer_id=cust_north_2.id,
        customer_name=cust_north_2.name,
        total=30000000,
        status="PACKING",
        created_at=two_days_ago_dt,
    )
    # - Đơn 4 (5 ngày trước, Miền Nam): 25,000,000đ - Hoàn tất (COMPLETED)
    o4 = Order(
        id="ORD-PREV-02",
        code="DH-202610-004",
        customer_id=cust_south_1.id,
        customer_name=cust_south_1.name,
        total=25000000,
        status="COMPLETED",
        created_at=five_days_ago_dt,
    )
    # - Đơn 5 (Đơn hủy): 10,000,000đ - CANCELLED (Không tính doanh thu)
    o5 = Order(
        id="ORD-CANCELLED-01",
        code="DH-202610-005",
        customer_id=cust_north_1.id,
        customer_name=cust_north_1.name,
        total=10000000,
        status="CANCELLED",
        created_at=today_dt,
    )
    db.add_all([o1, o2, o3, o4, o5])

    # 4. Hóa đơn công nợ quá hạn (Invoices):
    # - Hóa đơn quá hạn 1: CUST-SG-01 nợ 50,000,000đ quá hạn 20 ngày
    inv1 = Invoice(
        id="HD-202609-001",
        customer_id=cust_south_1.id,
        customer_name=cust_south_1.name,
        total_amount=50000000,
        paid_amount=0,
        remaining_amount=50000000,
        status="UNPAID",
        due_date=now - timedelta(days=20),
        issued_by=1,
        created_at=now - timedelta(days=50),
    )
    # - Hóa đơn quá hạn 2: CUST-HN-01 nợ 30,000,000đ quá hạn 10 ngày
    inv2 = Invoice(
        id="HD-202609-002",
        customer_id=cust_north_1.id,
        customer_name=cust_north_1.name,
        total_amount=40000000,
        paid_amount=10000000,
        remaining_amount=30000000,
        status="PARTIALLY_PAID",
        due_date=now - timedelta(days=10),
        issued_by=1,
        created_at=now - timedelta(days=40),
    )
    # - Hóa đơn quá hạn 3: CUST-HP-02 nợ 10,000,000đ quá hạn 5 ngày
    inv3 = Invoice(
        id="HD-202609-003",
        customer_id=cust_north_2.id,
        customer_name=cust_north_2.name,
        total_amount=10000000,
        paid_amount=0,
        remaining_amount=10000000,
        status="UNPAID",
        due_date=now - timedelta(days=5),
        issued_by=1,
        created_at=now - timedelta(days=35),
    )
    # - Hóa đơn CHƯA quá hạn (due_date trong tương lai): 20,000,000đ
    inv4 = Invoice(
        id="HD-202610-004",
        customer_id=cust_north_1.id,
        customer_name=cust_north_1.name,
        total_amount=20000000,
        paid_amount=0,
        remaining_amount=20000000,
        status="UNPAID",
        due_date=now + timedelta(days=15),
        issued_by=1,
        created_at=now,
    )
    db.add_all([inv1, inv2, inv3, inv4])

    # 5. Tồn kho tối thiểu:
    # - SKU-01: Tồn 5 < Định mức 20 -> DƯỚI TỒN TỐI THIỂU
    # - SKU-02: Tồn 3 < Định mức 10 -> DƯỚI TỒN TỐI THIỂU
    # - SKU-03: Tồn 50 >= Định mức 30 -> Đủ tồn kho
    db.add_all([
        ProductStockProfile(product_id="PRD-01", sku="SKU-COCA-330", stock=5, min_stock=20),
        ProductStockProfile(product_id="PRD-02", sku="SKU-PEPSI-330", stock=3, min_stock=10),
        ProductStockProfile(product_id="PRD-03", sku="SKU-RED-BULL", stock=50, min_stock=30),
    ])

    db.commit()
    db.close()

    yield

    ExecutiveDashboardService.clear_cache()
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def auth_header(user_id: int = 1, role: str = UserRole.SALES_MANAGER.value) -> dict:
    token = tao_token_truy_cap(
        du_lieu={
            "sub": str(user_id),
            "user_id": user_id,
            "role": role,
            "token_version": 1,
        }
    )
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# TEST 1: TÍNH TOÁN CHÍNH XÁC 6 CHỈ SỐ KPI ĐIỀU HÀNH BÁN HÀNG VÀ KHO (SUBTASK 10/11)
# ==============================================================================
def test_01_kpi_summary_calculation(client):
    headers = auth_header()
    resp = client.get("/api/v1/executive-dashboard", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    kpis = data["kpis"]

    # 1. Doanh số hôm nay: Đơn 1 (20tr) + Đơn 2 (15tr) = 35tr (bỏ qua đơn hủy 10tr)
    assert kpis["revenue_today"] == 35000000
    assert kpis["total_orders_today"] == 2

    # 2. Doanh số tháng này: Đơn 1 (20tr) + Đơn 2 (15tr) + Đơn 3 (30tr) + Đơn 4 (25tr) = 90tr
    assert kpis["revenue_this_month"] == 90000000
    assert kpis["total_orders_this_month"] == 4

    # 3. Đơn chờ duyệt: Đơn 2 (PENDING_APPROVAL) = 1 đơn
    assert kpis["pending_approval_orders"] == 1

    # 4. Đơn chờ xuất kho: Đơn 1 (APPROVED) + Đơn 3 (PACKING) = 2 đơn
    assert kpis["pending_dispatch_orders"] == 2

    # 5. Tổng công nợ quá hạn: inv1 (50tr) + inv2 (30tr) + inv3 (10tr) = 90tr (bỏ qua inv4 chưa tới hạn)
    assert kpis["overdue_debt_amount"] == 90000000
    assert kpis["overdue_agencies_count"] == 3

    # 6. Số lượng SKU dưới định mức tồn tối thiểu: SKU-01, SKU-02 = 2 SKU
    assert kpis["low_stock_sku_count"] == 2


# ==============================================================================
# TEST 2: DANH SÁCH ĐẠI LÝ QUÁ HẠN CÔNG NỢ SẮP XẾP THEO SỐ TIỀN GIẢM DẦN (SUBTASK 12/13)
# ==============================================================================
def test_02_overdue_agencies_sorted_descending_by_amount(client):
    headers = auth_header()
    resp = client.get("/api/v1/executive-dashboard/overdue-agencies", headers=headers)
    assert resp.status_code == 200, resp.text
    agencies = resp.json()

    assert len(agencies) == 3

    # Kiểm tra thứ tự sắp xếp giảm dần theo số tiền nợ quá hạn
    # Thứ tự phải là: CUST-SG-01 (50tr) -> CUST-HN-01 (30tr) -> CUST-HP-02 (10tr)
    assert agencies[0]["customer_id"] == "CUST-SG-01"
    assert agencies[0]["overdue_amount"] == 50000000
    assert agencies[0]["max_overdue_days"] >= 20
    assert agencies[0]["credit_limit"] == 200000000

    assert agencies[1]["customer_id"] == "CUST-HN-01"
    assert agencies[1]["overdue_amount"] == 30000000
    assert agencies[1]["max_overdue_days"] >= 10

    assert agencies[2]["customer_id"] == "CUST-HP-02"
    assert agencies[2]["overdue_amount"] == 10000000
    assert agencies[2]["max_overdue_days"] >= 5

    # Đảm bảo dãy số tiền luôn giảm dần
    amounts = [a["overdue_amount"] for a in agencies]
    assert amounts == sorted(amounts, reverse=True)


# ==============================================================================
# TEST 3: BIỂU ĐỒ DOANH SỐ THEO NGÀY TRONG THÁNG (SUBTASK 16/17)
# ==============================================================================
def test_03_daily_sales_chart(client):
    headers = auth_header()
    resp = client.get("/api/v1/executive-dashboard/daily-sales", headers=headers)
    assert resp.status_code == 200, resp.text
    daily = resp.json()

    # Phải có đủ các ngày trong tháng (từ 28 đến 31 ngày)
    assert len(daily) >= 28

    # Kiểm tra ngày hôm nay có doanh số 35,000,000đ và 2 đơn
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    today_point = next((d for d in daily if d["date"] == today_str), None)
    assert today_point is not None
    assert today_point["sales_amount"] == 35000000
    assert today_point["order_count"] == 2

    # Tổng doanh số các ngày cộng lại phải bằng doanh số tháng
    total_chart_sales = sum(d["sales_amount"] for d in daily)
    assert total_chart_sales == 90000000


# ==============================================================================
# TEST 4: BIỂU ĐỒ DOANH SỐ THEO KHU VỰC (SUBTASK 16/17)
# ==============================================================================
def test_04_regional_sales_chart(client):
    headers = auth_header()
    resp = client.get("/api/v1/executive-dashboard/regional-sales", headers=headers)
    assert resp.status_code == 200, resp.text
    regions = resp.json()

    # Có 2 khu vực: Miền Bắc và Miền Nam
    # Miền Bắc: Đơn 1 (20tr) + Đơn 3 (30tr) = 50tr
    # Miền Nam: Đơn 2 (15tr) + Đơn 4 (25tr) = 40tr
    # Tổng: 90tr -> Miền Bắc = 55.6%, Miền Nam = 44.4%
    assert len(regions) == 2

    north = next(r for r in regions if r["region"] == "Miền Bắc")
    south = next(r for r in regions if r["region"] == "Miền Nam")

    assert north["sales_amount"] == 50000000
    assert north["order_count"] == 2
    assert north["percentage"] == pytest.approx(55.6, 0.1)

    assert south["sales_amount"] == 40000000
    assert south["order_count"] == 2
    assert south["percentage"] == pytest.approx(44.4, 0.1)


# ==============================================================================
# TEST 5: TỐI ƯU HIỆU NĂNG VÀ CƠ CHẾ CACHING DƯỚI 2 GIÂY (SUBTASK 14/15)
# ==============================================================================
def test_05_caching_and_sub_two_second_sla(client):
    headers = auth_header()

    # 1. Lần gọi đầu tiên: Chưa có cache
    t_start = time.perf_counter()
    resp1 = client.get("/api/v1/executive-dashboard", headers=headers)
    dur1 = (time.perf_counter() - t_start) * 1000
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["cached"] is False
    assert data1["execution_time_ms"] < 2000.0  # Đạt chuẩn SLA dưới 2 giây (2000ms)
    assert dur1 < 2000.0

    # 2. Lần gọi thứ hai: Đã có trong cache
    resp2 = client.get("/api/v1/executive-dashboard", headers=headers)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["cached"] is True
    assert data2["execution_time_ms"] < 50.0  # Cache trả về siêu nhanh dưới 50ms

    # 3. Gọi với refresh=True: Ép tính toán lại
    resp3 = client.get("/api/v1/executive-dashboard?refresh=true", headers=headers)
    assert resp3.status_code == 200
    data3 = resp3.json()
    assert data3["cached"] is False

    # 4. Gọi API xóa cache
    resp_clear = client.post("/api/v1/executive-dashboard/clear-cache", headers=headers)
    assert resp_clear.status_code == 200
    assert "Đã làm sạch" in resp_clear.json()["message"]


# ==============================================================================
# TEST 6: BỘ LỌC DỮ LIỆU THEO KHU VỰC ĐỊA LÝ
# ==============================================================================
def test_06_filter_dashboard_by_region(client):
    headers = auth_header()

    # Lọc chỉ riêng Miền Bắc
    resp = client.get("/api/v1/executive-dashboard?region=Mi%E1%BB%81n%20B%E1%BA%AFc", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    kpis = data["kpis"]
    # Doanh số hôm nay của riêng Miền Bắc: Đơn 1 = 20tr
    assert kpis["revenue_today"] == 20000000
    # Doanh số tháng này của riêng Miền Bắc: Đơn 1 (20tr) + Đơn 3 (30tr) = 50tr
    assert kpis["revenue_this_month"] == 50000000

    # Danh sách đại lý quá hạn chỉ gồm đại lý Miền Bắc: CUST-HN-01 (30tr) và CUST-HP-02 (10tr)
    overdue = data["overdue_agencies"]
    assert len(overdue) == 2
    assert all(a["region"] == "Miền Bắc" for a in overdue)
