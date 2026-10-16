from datetime import datetime, date, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, lay_phien_db
from app.core.security import bam_mat_khau, tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.notification import AppNotification
from app.models.payment_reminder_log import PaymentReminderLog, ReminderType
from app.services import email_service
from app.services import payment_reminder_service
from main import app

# Database SQLite in-memory tách biệt dùng StaticPool cho test Payment Reminders S7-08
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
def setup_payment_reminder_test_db():
    """Tạo schema và dữ liệu người dùng / đại lý trước mỗi test."""
    Base.metadata.create_all(bind=test_engine)
    app.dependency_overrides[lay_phien_db] = override_lay_phien_db
    email_service.clear_mock_outbox()

    db = TestingSessionLocal()
    users = [
        User(
            id=1,
            username="admin_remind",
            email="admin_remind@test.local",
            role=UserRole.ADMIN.value,
            full_name="Quản Trị Viên Kế Toán",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=2,
            username="accountant_staff",
            email="accountant@test.local",
            role=UserRole.ACCOUNTANT.value,
            full_name="Kế Toán Công Nợ",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=3,
            username="agency_a_user",
            email="contact@daily-a.vn",
            role=UserRole.CUSTOMER.value,
            full_name="Đại Lý Tuấn Phương",
            customer_id="CUS-001",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
        User(
            id=4,
            username="agency_b_user",
            email="contact@daily-b.vn",
            role=UserRole.CUSTOMER.value,
            full_name="Đại Lý Minh Anh",
            customer_id="CUS-002",
            hashed_password=bam_mat_khau("Pass@1234"),
            is_active=True,
            token_version=1,
        ),
    ]
    for u in users:
        db.add(u)

    customers = [
        Customer(
            id="CUS-001",
            code="CUS-001",
            name="Đại Lý Tuấn Phương",
            phone="0901111111",
            email="contact@daily-a.vn",
            status="active",
        ),
        Customer(
            id="CUS-002",
            code="CUS-002",
            name="Đại Lý Minh Anh",
            phone="0902222222",
            email="contact@daily-b.vn",
            status="active",
        ),
    ]
    for c in customers:
        db.add(c)

    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    email_service.clear_mock_outbox()


def make_auth_header(user_id: int, role: str, customer_id: str = None, token_version: int = 1) -> dict:
    """Tạo Bearer token xác thực cho các vai trò."""
    token = tao_token_truy_cap(du_lieu={
        "sub": str(user_id),
        "user_id": user_id,
        "role": role,
        "customer_id": customer_id,
        "token_version": token_version,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    return TestClient(app)


# ==============================================================================
# BÀI KIỂM THỬ SCRUM-764 CHO USER STORY S7-08
# ==============================================================================

def test_01_detect_candidates_before_due_3_days():
    """
    Test 01 (SCRUM-760): Phát hiện hoá đơn sắp đến hạn trước đúng 3 ngày (BEFORE_DUE_3_DAYS).
    """
    db = TestingSessionLocal()
    target_d = date(2026, 10, 20)
    due_d = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)  # Đúng 3 ngày sau

    inv = Invoice(
        id="HD-2026-3DAYS",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=15000000,
        paid_amount=0,
        remaining_amount=15000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=due_d,
        issued_by=1,
    )
    db.add(inv)
    db.commit()

    candidates = payment_reminder_service.get_candidates(db=db, target_date=target_d)
    assert len(candidates) == 1

    c = candidates[0]
    assert c.invoice_id == "HD-2026-3DAYS"
    assert c.reminder_type == ReminderType.BEFORE_DUE_3_DAYS.value
    assert c.days_until_due == 3
    assert c.days_overdue == 0
    assert c.remaining_amount == 15000000
    assert c.already_reminded_today is False
    db.close()


def test_02_detect_candidates_overdue():
    """
    Test 02 (SCRUM-760): Phát hiện hoá đơn quá hạn thanh toán (OVERDUE) và tính chính xác số ngày quá hạn.
    """
    db = TestingSessionLocal()
    target_d = date(2026, 10, 20)
    due_d = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)  # Đã quá hạn 5 ngày

    inv = Invoice(
        id="HD-2026-OVERDUE-5",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=20000000,
        paid_amount=5000000,
        remaining_amount=15000000,
        status=InvoiceStatus.PARTIALLY_PAID.value,
        due_date=due_d,
        issued_by=1,
    )
    db.add(inv)
    db.commit()

    candidates = payment_reminder_service.get_candidates(db=db, target_date=target_d)
    assert len(candidates) == 1

    c = candidates[0]
    assert c.invoice_id == "HD-2026-OVERDUE-5"
    assert c.reminder_type == ReminderType.OVERDUE.value
    assert c.days_overdue == 5
    assert c.days_until_due == 0
    assert c.remaining_amount == 15000000
    db.close()


def test_03_ignore_invoices_not_matching_reminder_rules():
    """
    Test 03 (SCRUM-760): Bỏ qua các hoá đơn không đủ điều kiện nhắc hạn:
    - Hoá đơn đã thanh toán đủ (PAID, remaining = 0).
    - Hoá đơn còn hạn hơn 3 ngày (ví dụ còn 7 ngày).
    - Hoá đơn còn hạn 1 hoặc 2 ngày (không phải mốc nhắc 3 ngày).
    """
    db = TestingSessionLocal()
    target_d = date(2026, 10, 20)

    # 1. Hoá đơn đã thanh toán xong
    inv_paid = Invoice(
        id="HD-PAID",
        customer_id="CUS-001",
        total_amount=10000000,
        paid_amount=10000000,
        remaining_amount=0,
        status=InvoiceStatus.PAID.value,
        due_date=datetime(2026, 10, 23, tzinfo=timezone.utc),
        issued_by=1,
    )
    # 2. Hoá đơn còn hạn 7 ngày
    inv_7days = Invoice(
        id="HD-7DAYS",
        customer_id="CUS-001",
        total_amount=5000000,
        paid_amount=0,
        remaining_amount=5000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 27, tzinfo=timezone.utc),
        issued_by=1,
    )
    # 3. Hoá đơn còn hạn 1 ngày
    inv_1day = Invoice(
        id="HD-1DAY",
        customer_id="CUS-001",
        total_amount=3000000,
        paid_amount=0,
        remaining_amount=3000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 21, tzinfo=timezone.utc),
        issued_by=1,
    )
    db.add(inv_paid)
    db.add(inv_7days)
    db.add(inv_1day)
    db.commit()

    candidates = payment_reminder_service.get_candidates(db=db, target_date=target_d)
    assert len(candidates) == 0
    db.close()


def test_04_run_daily_job_generates_email_and_inapp_notifications():
    """
    Test 04 (SCRUM-761, SCRUM-762, SCRUM-759):
    Chạy job định kỳ ngày quét:
    - Hoá đơn 1: trước hạn 3 ngày -> sinh email nhắc và in-app notification.
    - Hoá đơn 2: quá hạn 2 ngày -> sinh email cảnh báo và in-app notification.
    """
    db = TestingSessionLocal()
    target_d = date(2026, 10, 20)
    target_str = "2026-10-20"

    # Hoá đơn trước hạn 3 ngày
    db.add(Invoice(
        id="HD-EXP-3DAYS",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=10000000,
        paid_amount=0,
        remaining_amount=10000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 23, tzinfo=timezone.utc),
        issued_by=1,
    ))
    # Hoá đơn quá hạn 2 ngày
    db.add(Invoice(
        id="HD-EXP-OVERDUE",
        customer_id="CUS-002",
        customer_name="Đại Lý Minh Anh",
        total_amount=25000000,
        paid_amount=5000000,
        remaining_amount=20000000,
        status=InvoiceStatus.PARTIALLY_PAID.value,
        due_date=datetime(2026, 10, 18, tzinfo=timezone.utc),
        issued_by=1,
    ))
    db.commit()

    res = payment_reminder_service.run_daily_payment_reminder_job(
        db=db,
        target_date_str=target_str,
    )

    assert res.success is True
    assert res.run_date == "2026-10-20"
    assert res.total_invoices_scanned == 2
    assert res.before_due_count == 1
    assert res.overdue_count == 1
    assert res.emails_sent == 2
    assert res.in_app_created == 2
    assert res.skipped_duplicates == 0

    # Kiểm tra hộp thư giả lập email (SCRUM-762)
    outbox = email_service.get_mock_outbox()
    assert len(outbox) == 2
    email_3d = next(e for e in outbox if e["invoice_id"] == "HD-EXP-3DAYS")
    assert "Nhắc hạn thanh toán" in email_3d["subject"]
    assert email_3d["to_email"] == "contact@daily-a.vn"

    email_ov = next(e for e in outbox if e["invoice_id"] == "HD-EXP-OVERDUE")
    assert "CẢNH BÁO QUÁ HẠN" in email_ov["subject"]
    assert email_ov["to_email"] == "contact@daily-b.vn"

    # Kiểm tra thông báo trong ứng dụng (SCRUM-759)
    notifs = db.query(AppNotification).all()
    assert len(notifs) == 2
    notif_a = next(n for n in notifs if n.customer_id == "CUS-001")
    assert notif_a.reference_id == "HD-EXP-3DAYS"
    assert notif_a.is_read is False

    notif_b = next(n for n in notifs if n.customer_id == "CUS-002")
    assert notif_b.reference_id == "HD-EXP-OVERDUE"
    assert "quá hạn" in notif_b.title.lower()

    # Kiểm tra log chống gửi trùng (SCRUM-763)
    logs = db.query(PaymentReminderLog).all()
    assert len(logs) == 2
    assert all(l.run_date == "2026-10-20" for l in logs)
    db.close()


def test_05_anti_duplicate_same_day():
    """
    Test 05 (SCRUM-763): Chống gửi trùng nhiều lần cho cùng một hoá đơn trong cùng một ngày.
    - Lần chạy 1: Gửi 1 email + 1 in-app notification.
    - Lần chạy 2 (cùng ngày): Không gửi thêm email nào, không tạo thêm thông báo nào, skipped_duplicates = 1.
    """
    db = TestingSessionLocal()
    target_str = "2026-10-20"

    db.add(Invoice(
        id="HD-DUP-TEST",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=12000000,
        paid_amount=0,
        remaining_amount=12000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 23, tzinfo=timezone.utc),  # trước 3 ngày
        issued_by=1,
    ))
    db.commit()

    # Lần chạy 1
    res1 = payment_reminder_service.run_daily_payment_reminder_job(
        db=db,
        target_date_str=target_str,
    )
    assert res1.emails_sent == 1
    assert res1.in_app_created == 1
    assert res1.skipped_duplicates == 0
    assert len(email_service.get_mock_outbox()) == 1
    assert db.query(AppNotification).count() == 1

    # Lần chạy 2: Cùng ngày 2026-10-20
    res2 = payment_reminder_service.run_daily_payment_reminder_job(
        db=db,
        target_date_str=target_str,
    )
    assert res2.emails_sent == 0
    assert res2.in_app_created == 0
    assert res2.skipped_duplicates == 1  # Đã bị skip vì chống gửi trùng!
    assert res2.details[0].skipped is True
    assert "Đã gửi nhắc" in res2.details[0].skip_reason

    # Kiểm tra hộp thư và bảng notification không bị tăng thêm
    assert len(email_service.get_mock_outbox()) == 1
    assert db.query(AppNotification).count() == 1
    assert db.query(PaymentReminderLog).count() == 1
    db.close()


def test_06_allow_reminder_on_different_days():
    """
    Test 06 (SCRUM-763): Cho phép gửi nhắc tiếp tục khi sang ngày mới (ví dụ hoá đơn tiếp tục quá hạn).
    """
    db = TestingSessionLocal()
    # Hoá đơn quá hạn
    db.add(Invoice(
        id="HD-MULTI-DAY",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=8000000,
        paid_amount=0,
        remaining_amount=8000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 15, tzinfo=timezone.utc),
        issued_by=1,
    ))
    db.commit()

    # Ngày 1: 2026-10-20 (quá hạn 5 ngày)
    res_day1 = payment_reminder_service.run_daily_payment_reminder_job(
        db=db,
        target_date_str="2026-10-20",
    )
    assert res_day1.emails_sent == 1
    assert res_day1.skipped_duplicates == 0

    # Ngày 2: 2026-10-21 (quá hạn 6 ngày) -> Được phép gửi nhắc cho ngày mới
    res_day2 = payment_reminder_service.run_daily_payment_reminder_job(
        db=db,
        target_date_str="2026-10-21",
    )
    assert res_day2.emails_sent == 1
    assert res_day2.skipped_duplicates == 0

    # Kiểm tra log ghi 2 ngày khác nhau
    logs = db.query(PaymentReminderLog).order_by(PaymentReminderLog.run_date.asc()).all()
    assert len(logs) == 2
    assert logs[0].run_date == "2026-10-20"
    assert logs[1].run_date == "2026-10-21"
    db.close()


def test_07_api_run_daily_job_endpoint(client):
    """
    Test 07 (SCRUM-761): Kích hoạt job qua API POST /api/v1/payment-reminders/run-daily-job.
    - Quản trị viên/Kế toán: Thành công 200 OK.
    - Đại lý (Customer Role): Bị chặn 403 Forbidden.
    """
    db = TestingSessionLocal()
    db.add(Invoice(
        id="HD-API-JOB",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=5000000,
        paid_amount=0,
        remaining_amount=5000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 23, tzinfo=timezone.utc),
        issued_by=1,
    ))
    db.commit()
    db.close()

    admin_headers = make_auth_header(1, UserRole.ADMIN.value)
    cust_headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")

    # 1. Customer gọi -> Bị chặn 403
    resp_cust = client.post(
        "/api/v1/payment-reminders/run-daily-job",
        json={"target_date": "2026-10-20"},
        headers=cust_headers,
    )
    assert resp_cust.status_code == 403

    # 2. Admin gọi -> Thành công 200
    resp_admin = client.post(
        "/api/v1/payment-reminders/run-daily-job",
        json={"target_date": "2026-10-20"},
        headers=admin_headers,
    )
    assert resp_admin.status_code == 200
    data = resp_admin.json()
    assert data["success"] is True
    assert data["emails_sent"] == 1
    assert data["in_app_created"] == 1


def test_08_api_candidates_and_logs_endpoints(client):
    """
    Test 08 (SCRUM-760, SCRUM-763): API xem trước candidates và tra cứu logs.
    """
    db = TestingSessionLocal()
    db.add(Invoice(
        id="HD-API-CAND",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=6000000,
        paid_amount=0,
        remaining_amount=6000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 23, tzinfo=timezone.utc),
        issued_by=1,
    ))
    db.commit()
    db.close()

    admin_headers = make_auth_header(1, UserRole.ADMIN.value)

    # 1. Tra cứu candidates
    resp_cand = client.get("/api/v1/payment-reminders/candidates?target_date=2026-10-20", headers=admin_headers)
    assert resp_cand.status_code == 200
    cand_data = resp_cand.json()
    assert cand_data["total"] == 1
    assert cand_data["candidates"][0]["invoice_id"] == "HD-API-CAND"

    # Chạy job để sinh log
    client.post("/api/v1/payment-reminders/run-daily-job", json={"target_date": "2026-10-20"}, headers=admin_headers)

    # 2. Tra cứu logs
    resp_logs = client.get("/api/v1/payment-reminders/logs?run_date=2026-10-20", headers=admin_headers)
    assert resp_logs.status_code == 200
    logs_data = resp_logs.json()
    assert logs_data["total"] == 1
    assert logs_data["items"][0]["invoice_id"] == "HD-API-CAND"
    assert logs_data["items"][0]["email_status"] == "SENT"


def test_09_portal_agency_view_notifications_and_idor_protection(client):
    """
    Test 09 (SCRUM-759): Đại lý xem danh sách thông báo in-app và bảo mật chống IDOR.
    - Customer A chỉ thấy thông báo của Customer A.
    - Customer B chỉ thấy thông báo của Customer B.
    - Customer A không thể đánh dấu đọc thông báo của Customer B.
    """
    db = TestingSessionLocal()
    n_a = AppNotification(
        customer_id="CUS-001",
        title="Nhắc nợ Đại Lý A",
        content="Hoá đơn A sắp đến hạn",
        reference_type="INVOICE",
        reference_id="HD-A",
        is_read=False,
    )
    n_b = AppNotification(
        customer_id="CUS-002",
        title="Nhắc nợ Đại Lý B",
        content="Hoá đơn B sắp đến hạn",
        reference_type="INVOICE",
        reference_id="HD-B",
        is_read=False,
    )
    db.add(n_a)
    db.add(n_b)
    db.commit()
    n_a_id = n_a.id
    n_b_id = n_b.id
    db.close()

    cust_a_headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    cust_b_headers = make_auth_header(4, UserRole.CUSTOMER.value, customer_id="CUS-002")

    # 1. Đại lý A xem danh sách -> chỉ thấy thông báo của A
    resp_a = client.get("/api/v1/portal/notifications", headers=cust_a_headers)
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["total"] == 1
    assert data_a["items"][0]["title"] == "Nhắc nợ Đại Lý A"
    assert data_a["unread_count"] == 1

    # 2. Đại lý B xem danh sách -> chỉ thấy thông báo của B
    resp_b = client.get("/api/v1/portal/notifications", headers=cust_b_headers)
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["total"] == 1
    assert data_b["items"][0]["title"] == "Nhắc nợ Đại Lý B"

    # 3. Đại lý A cố tình đánh dấu đã đọc thông báo của Đại lý B -> 404 (chống IDOR)
    resp_mark_b = client.patch(f"/api/v1/portal/notifications/{n_b_id}/read", headers=cust_a_headers)
    assert resp_mark_b.status_code == 404

    # 4. Đại lý A đánh dấu đã đọc thông báo của chính mình -> 200 OK
    resp_mark_a = client.patch(f"/api/v1/portal/notifications/{n_a_id}/read", headers=cust_a_headers)
    assert resp_mark_a.status_code == 200
    assert resp_mark_a.json()["is_read"] is True

    # 5. Kiểm tra unread_count của A về 0
    resp_a_after = client.get("/api/v1/portal/notifications", headers=cust_a_headers)
    assert resp_a_after.json()["unread_count"] == 0


def test_10_portal_agency_mark_all_read(client):
    """
    Test 10 (SCRUM-759): Đại lý đánh dấu đã đọc toàn bộ thông báo (PATCH /portal/notifications/read-all).
    """
    db = TestingSessionLocal()
    for i in range(3):
        db.add(AppNotification(
            customer_id="CUS-001",
            title=f"Thông báo {i+1}",
            content="Nội dung nhắc hạn",
            is_read=False,
        ))
    db.commit()
    db.close()

    cust_a_headers = make_auth_header(3, UserRole.CUSTOMER.value, customer_id="CUS-001")
    resp = client.patch("/api/v1/portal/notifications/read-all", headers=cust_a_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["updated_count"] == 3

    resp_list = client.get("/api/v1/portal/notifications", headers=cust_a_headers)
    assert resp_list.json()["unread_count"] == 0


def test_11_email_and_notification_content_accuracy():
    """
    Test 11 (SCRUM-762, SCRUM-759): Kiểm tra độ chính xác nội dung email và thông báo in-app.
    - Định dạng số tiền có phân cách hàng nghìn VNĐ (ví dụ 18.500.000 đ).
    - Hiển thị ngày đến hạn rõ ràng.
    - Tiêu đề thông báo phản ánh đúng loại nhắc.
    """
    db = TestingSessionLocal()
    inv = Invoice(
        id="HD-CONTENT-TEST",
        customer_id="CUS-001",
        customer_name="Đại Lý Tuấn Phương",
        total_amount=18500000,
        paid_amount=0,
        remaining_amount=18500000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 23, tzinfo=timezone.utc),
        issued_by=1,
    )
    db.add(inv)
    db.commit()

    # 1. Kiểm tra email
    email_service.clear_mock_outbox()
    ok, err = payment_reminder_service.send_payment_reminder_email(
        to_email="test@agency.vn",
        customer_name="Đại Lý Tuấn Phương",
        invoice=inv,
        reminder_type=ReminderType.BEFORE_DUE_3_DAYS.value,
        days_overdue=0,
    )
    assert ok is True
    outbox = email_service.get_mock_outbox()
    assert len(outbox) == 1
    assert outbox[0]["amount_due"] == 18500000
    assert "HD-CONTENT-TEST" in outbox[0]["subject"]

    # 2. Kiểm tra in-app notification
    notif = payment_reminder_service.create_in_app_notification(
        db=db,
        customer_id="CUS-001",
        invoice=inv,
        reminder_type=ReminderType.BEFORE_DUE_3_DAYS.value,
    )
    assert "18.500.000 đ" in notif.content
    assert "HD-CONTENT-TEST" in notif.content
    assert notif.reference_id == "HD-CONTENT-TEST"
    db.close()


def test_12_dry_run_mode():
    """
    Test 12: Chế độ dry_run: Chỉ quét dự kiến số lượng, không gửi email và không tạo dữ liệu vào DB.
    """
    db = TestingSessionLocal()
    db.add(Invoice(
        id="HD-DRY-RUN",
        customer_id="CUS-001",
        total_amount=5000000,
        paid_amount=0,
        remaining_amount=5000000,
        status=InvoiceStatus.UNPAID.value,
        due_date=datetime(2026, 10, 23, tzinfo=timezone.utc),
        issued_by=1,
    ))
    db.commit()

    res = payment_reminder_service.run_daily_payment_reminder_job(
        db=db,
        target_date_str="2026-10-20",
        dry_run=True,
    )

    assert res.total_invoices_scanned == 1
    assert res.emails_sent == 0
    assert res.in_app_created == 0
    assert len(email_service.get_mock_outbox()) == 0
    assert db.query(AppNotification).count() == 0
    assert db.query(PaymentReminderLog).count() == 0
    db.close()
