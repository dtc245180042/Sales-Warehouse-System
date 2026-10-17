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
from app.models.route_cash_collection import (
    RouteCashCollection,
    CollectionStatus,
    CollectionPaymentMethod,
    DiscrepancyType,
)
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Route Cash Collection S7-05
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
def setup_route_collection_db():
    """Khởi tạo schema và tài khoản mẫu trước mỗi bài test."""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_test",
            email="admin_test@warehouse.local",
            role=UserRole.ADMIN.value,
            full_name="Quản Trị Viên",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="sales_rep_1",
            email="sales1@warehouse.local",
            role=UserRole.SALES_REP.value,
            full_name="Nguyễn Văn Kinh Doanh 1",
            phone_number="0988111222",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="accountant_1",
            email="acc1@warehouse.local",
            role=UserRole.ACCOUNTANT.value,
            full_name="Trần Thị Kế Toán",
            phone_number="0911333444",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)

    cust = Customer(
        id="CUST-001",
        code="CUST-001",
        name="Đại Lý Tạp Hóa Bình An",
        phone="0901234567",
        address="123 Nguyễn Huệ, Quận 1, TP.HCM",
        status="active",
    )
    db.add(cust)
    db.commit()
    db.close()

    yield

    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def auth_header(user_id: int, role: str) -> dict:
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
# TEST 1: GHI NHẬN KHOẢN THU TẠI CỬA HÀNG KÈM ẢNH BIÊN LAI (SUBTASK 16)
# ==============================================================================
def test_01_record_collection_at_store_with_receipt_image(client):
    headers = auth_header(2, UserRole.SALES_REP.value)
    payload = {
        "customer_id": "CUST-001",
        "route_name": "Tuyến Quận 1 - Chợ Bến Thành",
        "amount": 2500000,
        "payment_method": "CASH",
        "receipt_image_url": "https://storage.example.com/receipts/bien_lai_001.jpg",
        "notes": "Thu tiền đơn hàng giao buổi sáng",
    }
    resp = client.post("/api/v1/route-collections", headers=headers, json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["id"].startswith("TT-")
    assert data["amount"] == 2500000
    assert data["payment_method"] == "CASH"
    assert data["status"] == CollectionStatus.PENDING_REMITTANCE.value
    assert data["is_locked"] is False
    assert data["collector_id"] == 2
    assert data["collector_name"] == "Nguyễn Văn Kinh Doanh 1"
    assert data["customer_name"] == "Đại Lý Tạp Hóa Bình An"
    assert data["receipt_image_url"] == "https://storage.example.com/receipts/bien_lai_001.jpg"


# ==============================================================================
# TEST 2: KẾ TOÁN XÁC NHẬN NỘP TIỀN VỀ CÔNG TY (CHỜ NỘP -> ĐÃ NỘP) (SUBTASK 12)
# ==============================================================================
def test_02_confirm_remittance_by_accountant(client):
    sales_headers = auth_header(2, UserRole.SALES_REP.value)
    acc_headers = auth_header(3, UserRole.ACCOUNTANT.value)

    # 1. NVKD ghi nhận khoản thu
    create_resp = client.post(
        "/api/v1/route-collections",
        headers=sales_headers,
        json={
            "customer_id": "CUST-001",
            "amount": 5000000,
            "route_name": "Tuyến Quận 1",
            "notes": "Tiền mặt thu cửa hàng",
        },
    )
    assert create_resp.status_code == 201
    coll_id = create_resp.json()["id"]

    # 2. Kế toán xác nhận nhận tiền nộp
    confirm_payload = {
        "remitted_amount": 5000000,
        "remittance_notes": "Đã kiểm đếm tiền mặt đầy đủ và nhập quỹ công ty",
    }
    confirm_resp = client.put(
        f"/api/v1/route-collections/{coll_id}/confirm-remittance",
        headers=acc_headers,
        json=confirm_payload,
    )
    assert confirm_resp.status_code == 200, confirm_resp.text
    data = confirm_resp.json()

    assert data["status"] == CollectionStatus.REMITTED.value
    assert data["is_locked"] is True
    assert data["remitted_amount"] == 5000000
    assert data["confirmed_by_id"] == 3
    assert data["confirmed_by_name"] == "Trần Thị Kế Toán"
    assert data["confirmed_at"] is not None
    assert "nhập quỹ công ty" in data["remittance_notes"]


# ==============================================================================
# TEST 3: QUY TẮC CHẶN SỬA / XÓA KHI ĐÃ ĐƯỢC XÁC NHẬN NỘP TIỀN (SUBTASK 14)
# ==============================================================================
def test_03_prevent_edit_and_delete_when_remitted(client):
    sales_headers = auth_header(2, UserRole.SALES_REP.value)
    acc_headers = auth_header(3, UserRole.ACCOUNTANT.value)

    # Tạo khoản thu
    create_resp = client.post(
        "/api/v1/route-collections",
        headers=sales_headers,
        json={"customer_id": "CUST-001", "amount": 1200000},
    )
    coll_id = create_resp.json()["id"]

    # Khi còn PENDING_REMITTANCE -> cho phép sửa
    update_resp = client.put(
        f"/api/v1/route-collections/{coll_id}",
        headers=sales_headers,
        json={"amount": 1500000, "notes": "Cập nhật số tiền đúng"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["amount"] == 1500000

    # Kế toán xác nhận nộp tiền
    client.put(
        f"/api/v1/route-collections/{coll_id}/confirm-remittance",
        headers=acc_headers,
        json={"remitted_amount": 1500000},
    )

    # Sau khi xác nhận -> CHẶN sửa trực tiếp
    bad_update = client.put(
        f"/api/v1/route-collections/{coll_id}",
        headers=sales_headers,
        json={"amount": 2000000},
    )
    assert bad_update.status_code == 400
    assert "không cho phép sửa đổi trực tiếp" in bad_update.json()["detail"]

    # Sau khi xác nhận -> CHẶN xóa trực tiếp
    bad_delete = client.delete(
        f"/api/v1/route-collections/{coll_id}",
        headers=sales_headers,
    )
    assert bad_delete.status_code == 400
    assert "không cho phép xóa trực tiếp" in bad_delete.json()["detail"]


# ==============================================================================
# TEST 4: LẬP CHỨNG TỪ ĐIỀU CHỈNH HOẶC HỦY BÙ CÓ KIỂM SOÁT (SUBTASK 14)
# ==============================================================================
def test_04_controlled_adjustment_and_cancellation(client):
    sales_headers = auth_header(2, UserRole.SALES_REP.value)
    acc_headers = auth_header(3, UserRole.ACCOUNTANT.value)

    # 1. Tạo khoản thu và xác nhận nộp
    c_resp = client.post(
        "/api/v1/route-collections",
        headers=sales_headers,
        json={"customer_id": "CUST-001", "amount": 3000000},
    )
    coll_id = c_resp.json()["id"]
    client.put(
        f"/api/v1/route-collections/{coll_id}/confirm-remittance",
        headers=acc_headers,
        json={"remitted_amount": 3000000},
    )

    # 2. Điều chỉnh giảm 500,000đ (số tiền thực tế là 2,500,000đ)
    adj_payload = {
        "adjusted_amount": 2500000,
        "adjustment_reason": "Đại lý trả lại 1 thùng hàng hỏng vỏ nên giảm trừ trực tiếp 500k",
        "notes": "Biên bản điều chỉnh có xác nhận giữa NVKD và Kế toán",
    }
    adj_resp = client.post(
        f"/api/v1/route-collections/{coll_id}/adjust",
        headers=acc_headers,
        json=adj_payload,
    )
    assert adj_resp.status_code == 201, adj_resp.text
    adj_data = adj_resp.json()

    assert adj_data["is_adjustment"] is True
    assert adj_data["original_collection_id"] == coll_id
    assert adj_data["amount"] == -500000  # Chênh lệch bù trừ
    assert "Đại lý trả lại" in adj_data["adjustment_reason"]

    # Kiểm tra lại phiếu gốc: trạng thái đã chuyển sang ADJUSTED
    orig_resp = client.get(f"/api/v1/route-collections/{coll_id}", headers=sales_headers)
    assert orig_resp.json()["status"] == CollectionStatus.ADJUSTED.value


# ==============================================================================
# TEST 5: TRUY VẤN BẢNG ĐỐI CHIẾU TIỀN THU THEO NHÂN VIÊN VÀ NGÀY (SUBTASK 10)
# ==============================================================================
def test_05_daily_reconciliation_summary(client):
    sales_headers = auth_header(2, UserRole.SALES_REP.value)
    acc_headers = auth_header(3, UserRole.ACCOUNTANT.value)

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Tạo 2 khoản thu: 1 khoản đã nộp, 1 khoản còn chờ nộp
    r1 = client.post(
        "/api/v1/route-collections",
        headers=sales_headers,
        json={"customer_id": "CUST-001", "amount": 4000000},
    )
    id1 = r1.json()["id"]

    client.post(
        "/api/v1/route-collections",
        headers=sales_headers,
        json={"customer_id": "CUST-001", "amount": 2000000},
    )

    # Xác nhận nộp khoản 1
    client.put(
        f"/api/v1/route-collections/{id1}/confirm-remittance",
        headers=acc_headers,
        json={"remitted_amount": 4000000},
    )

    # Truy vấn bảng đối chiếu ngày
    recon_resp = client.get(
        f"/api/v1/route-collections/reconciliation/daily?date={today_str}&collector_id=2",
        headers=acc_headers,
    )
    assert recon_resp.status_code == 200, recon_resp.text
    summaries = recon_resp.json()
    assert len(summaries) == 1

    s = summaries[0]
    assert s["collector_id"] == 2
    assert s["total_collected_amount"] == 6000000  # 4M + 2M
    assert s["total_remitted_amount"] == 4000000   # 4M đã nộp
    assert s["total_pending_amount"] == 2000000    # 2M còn chờ nộp
    assert s["count_collected"] == 2
    assert s["count_remitted"] == 1
    assert s["count_pending"] == 1
    assert s["reconciliation_status"] == DiscrepancyType.BALANCED.value


# ==============================================================================
# TEST 6: PHÁT HIỆN VÀ CẢNH BÁO CHÊNH LỆCH NỘP THIẾU / THỪA (SUBTASK 8)
# ==============================================================================
def test_06_reconciliation_discrepancy_warnings(client):
    sales_headers = auth_header(2, UserRole.SALES_REP.value)
    acc_headers = auth_header(3, UserRole.ACCOUNTANT.value)

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # NVKD thu 5,000,000đ nhưng nộp về chỉ 4,800,000đ (Nộp thiếu 200,000đ)
    c_resp = client.post(
        "/api/v1/route-collections",
        headers=sales_headers,
        json={"customer_id": "CUST-001", "amount": 5000000},
    )
    coll_id = c_resp.json()["id"]

    client.put(
        f"/api/v1/route-collections/{coll_id}/confirm-remittance",
        headers=acc_headers,
        json={"remitted_amount": 4800000, "remittance_notes": "Nộp thiếu 200k, sẽ nộp bù ngày mai"},
    )

    # Gọi API đối chiếu
    recon_resp = client.get(
        f"/api/v1/route-collections/reconciliation/daily?date={today_str}&collector_id=2",
        headers=acc_headers,
    )
    assert recon_resp.status_code == 200
    summaries = recon_resp.json()
    assert len(summaries) == 1
    s = summaries[0]

    assert s["total_collected_amount"] == 5000000
    assert s["total_remitted_amount"] == 4800000
    assert s["discrepancy_amount"] == -200000
    assert s["reconciliation_status"] == DiscrepancyType.UNDER_REMITTED.value
    assert len(s["warnings"]) > 0
    assert any(w["warning_type"] == DiscrepancyType.UNDER_REMITTED.value for w in s["warnings"])
    assert "nộp thiếu" in s["warnings"][0]["message"].lower()
