import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, Base, engine
from app.models.auth import User, UserRole
from app.models.customer import Customer
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.invoice import Invoice, InvoiceStatus
from app.models.order import Order
from app.models.debt_risk import (
    DebtRiskConfig,
    CustomerDebtFlag,
    CustomerDebtFlagHistory,
    DebtRiskActionEnum,
    DebtRiskLevelEnum,
    DebtRiskEventTypeEnum,
)
from app.schemas.order import OrderCreate, OrderItemCreate
from app.schemas.payment import PaymentCreateRequest
from app.models.payment import PaymentMethod
from app.services import debt_risk_service
from app.services.order_service import create_order
from app.services.payment_service import PaymentService
from main import app

client = TestClient(app)


@pytest.fixture(scope="function")
def db_session():
    """Tạo session database cho từng test function và dọn dẹp sau khi chạy."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_tables():
    """Đảm bảo bảng cơ sở dữ liệu đã sẵn sàng."""
    Base.metadata.create_all(bind=engine)


def _get_or_create_test_accountant(db: Session) -> User:
    acc = db.query(User).filter(User.username == "test_accountant_s704").first()
    if not acc:
        acc = User(
            username="test_accountant_s704",
            email="accountant_s704@example.com",
            full_name="Kế Toán Công Nợ S704",
            role=UserRole.ACCOUNTANT.value,
            hashed_password="fakehashedpassword",
            is_active=True,
        )
        db.add(acc)
        db.commit()
        db.refresh(acc)
    return acc


def _get_or_create_test_customer(db: Session, cust_id: str, cust_name: str, credit_limit: int = 50_000_000, max_days: int = 30) -> Customer:
    cust = db.query(Customer).filter(Customer.id == cust_id).first()
    if not cust:
        cust = Customer(
            id=cust_id,
            code=cust_id,
            name=cust_name,
            phone="0912345678",
            customer_group="TIER_1",
            status="active",
        )
        db.add(cust)
        db.commit()
        db.refresh(cust)

    prof = db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == cust_id).first()
    if not prof:
        prof = CustomerCreditProfile(
            customer_id=cust_id,
            credit_limit=credit_limit,
            max_debt_days=max_days,
            current_debt=0,
            updated_by="system",
        )
        db.add(prof)
        db.commit()
    else:
        prof.credit_limit = credit_limit
        prof.max_debt_days = max_days
        db.commit()

    return cust


# ======================================================================================
# SCRUM-727: API và dữ liệu cấu hình hành vi xử lý khi đại lý bị gắn cờ
# ======================================================================================
def test_scrum727_get_and_update_debt_risk_config(db_session: Session):
    """Kiểm tra API cấu hình hành vi: GET và PUT với các lựa chọn BLOCK, REQUIRE_APPROVAL, WARNING_ONLY."""
    accountant = _get_or_create_test_accountant(db_session)

    # 1. GET cấu hình mặc định
    resp = client.get("/api/v1/debt-risk/config")
    assert resp.status_code == 200, resp.text
    cfg = resp.json()
    assert cfg["config_code"] == "DEFAULT"
    assert "action_on_overdue" in cfg
    assert "action_on_credit_limit_exceeded" in cfg

    # 2. PUT cập nhật cấu hình mới
    update_payload = {
        "auto_flag_enabled": True,
        "action_on_overdue": "BLOCK",
        "action_on_credit_limit_exceeded": "REQUIRE_APPROVAL",
        "grace_period_days": 2,
        "min_debt_to_flag": 50000,
        "auto_lock_on_flag": True,
        "description": "Cấu hình thử nghiệm Sprint 7",
    }
    app.dependency_overrides = {}
    from app.core.dependencies import lay_nguoi_dung_hien_tai
    app.dependency_overrides[lay_nguoi_dung_hien_tai] = lambda: accountant

    try:
        resp_update = client.put("/api/v1/debt-risk/config", json=update_payload)
        assert resp_update.status_code == 200, resp_update.text
        updated_data = resp_update.json()
        assert updated_data["grace_period_days"] == 2
        assert updated_data["min_debt_to_flag"] == 50000
        assert updated_data["action_on_overdue"] == "BLOCK"
        assert updated_data["action_on_credit_limit_exceeded"] == "REQUIRE_APPROVAL"
    finally:
        app.dependency_overrides = {}
        # Dọn dẹp khôi phục lại cấu hình sạch mặc định ban đầu để không gây rác CSDL thực tế khi test GUI
        try:
            restore_payload = {
                "auto_flag_enabled": True,
                "action_on_overdue": "BLOCK",
                "action_on_credit_limit_exceeded": "REQUIRE_APPROVAL",
                "grace_period_days": 0,
                "min_debt_to_flag": 0,
                "auto_lock_on_flag": True,
                "description": "",
            }
            app.dependency_overrides[lay_nguoi_dung_hien_tai] = lambda: accountant
            client.put("/api/v1/debt-risk/config", json=restore_payload)
        except Exception:
            pass
        finally:
            app.dependency_overrides = {}


# ======================================================================================
# SCRUM-729: Logic đánh giá đại lý vượt hạn mức hoặc quá hạn và gắn cờ rủi ro tự động
# ======================================================================================
def test_scrum729_evaluate_limit_exceeded_and_overdue(db_session: Session):
    """Kiểm tra tự động gắn cờ khi đại lý vượt hạn mức hoặc có hóa đơn quá hạn."""
    cust_id = "CUS-TEST-S704-AUTO"
    _get_or_create_test_customer(db_session, cust_id, "Đại lý Test S704 Auto", credit_limit=20_000_000, max_days=15)

    now_utc = datetime.now(timezone.utc)
    # Tạo 1 hóa đơn quá hạn 20 ngày
    past_due = now_utc - timedelta(days=20)
    inv = Invoice(
        id="HD-2026-0000001",
        customer_id=cust_id,
        customer_name="Đại lý Test S704 Auto",
        total_amount=30_000_000,
        paid_amount=0,
        remaining_amount=30_000_000,
        status="UNPAID",
        issued_at=now_utc - timedelta(days=35),
        due_date=past_due,
        issued_by=1,
    )
    db_session.merge(inv)
    db_session.commit()

    # Đánh giá rủi ro
    flag = debt_risk_service.evaluate_customer_debt_risk(
        db=db_session,
        customer_id=cust_id,
        source="TEST_729",
        actor_username="test_suite",
        commit=True,
    )

    assert flag.is_flagged is True
    # Do 30 triệu > 20 triệu (vượt hạn mức) VÀ quá hạn 20 ngày -> HIGH_RISK
    assert flag.risk_level == DebtRiskLevelEnum.HIGH_RISK
    assert flag.overdue_amount == 30_000_000
    assert flag.max_overdue_days >= 19
    assert flag.excess_amount == 10_000_000
    assert flag.is_blocked is True  # Mặc định HIGH_RISK với action BLOCK -> is_blocked = True


# ======================================================================================
# SCRUM-726: Thiết kế cơ chế khoá bán hoặc chuyển sang trạng thái cần duyệt khi bị gắn cờ
# ======================================================================================
def test_scrum726_block_order_when_flagged_with_block(db_session: Session):
    """Khi đại lý bị gắn cờ và cấu hình là BLOCK: Bị chặn tạo đơn hoàn toàn."""
    cust_id = "CUS-TEST-BLOCKED"
    _get_or_create_test_customer(db_session, cust_id, "Đại lý Bị Chặn Bán", credit_limit=10_000_000)

    # Đặt cờ trực tiếp là FLAGGED và BLOCK
    flag = debt_risk_service.get_or_create_customer_debt_flag(db=db_session, customer_id=cust_id, for_update=True)
    flag.is_flagged = True
    flag.risk_level = DebtRiskLevelEnum.OVERDUE
    flag.action_applied = DebtRiskActionEnum.BLOCK
    flag.is_blocked = True
    flag.flag_reason = "Đại lý có khoản nợ quá hạn 45 ngày"
    db_session.commit()

    # Tạo đơn hàng chính thức
    order_in = OrderCreate(
        customer_id=cust_id,
        customer_name="Đại lý Bị Chặn Bán",
        customer_phone="0912345678",
        customer_address="Hà Nội",
        total=5_000_000,
        paid_amount=0,
        status="pending",
        items=[
            OrderItemCreate(
                product_id="PRD-001",
                sku="SP001",
                name="Sữa hạt",
                price=100000,
                quantity=50,
                unit="hộp",
            )
        ]
    )

    with pytest.raises(Exception) as excinfo:
        create_order(db=db_session, order_in=order_in)
    assert "KHOÁ BÁN" in str(excinfo.value.detail) or "chặn" in str(excinfo.value.detail).lower()


def test_scrum726_require_approval_when_flagged_with_approval(db_session: Session):
    """Khi đại lý bị gắn cờ và cấu hình là REQUIRE_APPROVAL: Đơn hàng tự động chuyển sang pending_approval."""
    cust_id = "CUS-TEST-APPROVAL"
    _get_or_create_test_customer(db_session, cust_id, "Đại lý Cần Duyệt", credit_limit=10_000_000)

    flag = debt_risk_service.get_or_create_customer_debt_flag(db=db_session, customer_id=cust_id, for_update=True)
    flag.is_flagged = True
    flag.risk_level = DebtRiskLevelEnum.LIMIT_EXCEEDED
    flag.action_applied = DebtRiskActionEnum.REQUIRE_APPROVAL
    flag.is_blocked = False
    flag.requires_approval = True
    flag.flag_reason = "Vượt hạn mức 5,000,000 đ"
    db_session.commit()

    order_in = OrderCreate(
        customer_id=cust_id,
        customer_name="Đại lý Cần Duyệt",
        customer_phone="0912345678",
        customer_address="Hà Nội",
        total=2_000_000,
        paid_amount=0,
        status="pending",
        items=[
            OrderItemCreate(
                product_id="PRD-001",
                sku="SP001",
                name="Sữa hạt",
                price=100000,
                quantity=20,
                unit="hộp",
            )
        ]
    )

    order = create_order(db=db_session, order_in=order_in)
    assert order.status == "pending_approval"
    assert order.requires_approval is True


# ======================================================================================
# SCRUM-731: Cơ chế ghi nhận lịch sử cảnh báo và trạng thái khoá/bỏ khoá do công nợ
# ======================================================================================
def test_scrum731_audit_history_logging(db_session: Session):
    """Kiểm tra ghi nhận lịch sử bất biến khi gắn cờ và khóa/bỏ khóa đại lý."""
    cust_id = "CUS-TEST-HIST"
    _get_or_create_test_customer(db_session, cust_id, "Đại lý Test Lịch Sử", credit_limit=5_000_000)
    db_session.query(CustomerDebtFlagHistory).filter(CustomerDebtFlagHistory.customer_id == cust_id).delete()
    db_session.query(CustomerDebtFlag).filter(CustomerDebtFlag.customer_id == cust_id).delete()
    db_session.commit()

    # 1. Gắn cờ vi phạm
    now_utc = datetime.now(timezone.utc)
    inv = Invoice(
        id="HD-2026-0000002",
        customer_id=cust_id,
        customer_name="Đại lý Test Lịch Sử",
        total_amount=15_000_000,
        paid_amount=0,
        remaining_amount=15_000_000,
        status="UNPAID",
        issued_at=now_utc - timedelta(days=20),
        due_date=now_utc - timedelta(days=5),
        issued_by=1,
    )
    db_session.merge(inv)
    db_session.commit()

    debt_risk_service.evaluate_customer_debt_risk(
        db=db_session,
        customer_id=cust_id,
        source="TEST_HIST",
        actor_username="auditor",
        commit=True,
    )

    # Kiểm tra API lịch sử của đại lý này
    resp = client.get(f"/api/v1/debt-risk/flags/{cust_id}/history")
    assert resp.status_code == 200, resp.text
    histories = resp.json()
    assert len(histories) > 0
    event_types = [h["event_type"] for h in histories]
    assert DebtRiskEventTypeEnum.FLAGGED in event_types or DebtRiskEventTypeEnum.AUTO_LOCKED in event_types


# ======================================================================================
# SCRUM-728: Xây dựng job chạy hằng ngày để đánh giá lại trạng thái rủi ro công nợ của đại lý
# ======================================================================================
def test_scrum728_daily_evaluation_job(db_session: Session):
    """Kiểm tra job chạy hằng ngày quét và đánh giá toàn bộ đại lý."""
    resp = client.post("/api/v1/debt-risk/jobs/daily-evaluation")
    assert resp.status_code == 200, resp.text
    job_result = resp.json()
    assert job_result["total_customers_scanned"] >= 0
    assert "executed_at" in job_result
    assert "details" in job_result


# ======================================================================================
# SCRUM-725: Kích hoạt đánh giá lại trạng thái công nợ ngay sau mỗi lần ghi nhận thanh toán
# ======================================================================================
def test_scrum725_auto_reevaluate_and_unflag_after_payment(db_session: Session):
    """
    Kịch bản: Đại lý đang bị gắn cờ do nợ quá hạn.
    Kế toán lập phiếu thu thanh toán 100% khoản nợ.
    Hook SCRUM-725 tự động kích hoạt đánh giá lại, gỡ cờ rủi ro và bỏ khóa bán tức thì!
    """
    cust_id = "CUS-TEST-PAY-UNFLAG"
    _get_or_create_test_customer(db_session, cust_id, "Đại lý Test Thanh Toán Gỡ Cờ", credit_limit=50_000_000)

    now_utc = datetime.now(timezone.utc)
    # 1. Tạo hóa đơn nợ quá hạn
    inv = Invoice(
        id="HD-2026-0000003",
        customer_id=cust_id,
        customer_name="Đại lý Test Thanh Toán Gỡ Cờ",
        total_amount=10_000_000,
        paid_amount=0,
        remaining_amount=10_000_000,
        status="UNPAID",
        issued_at=now_utc - timedelta(days=25),
        due_date=now_utc - timedelta(days=10),
        issued_by=1,
    )
    db_session.merge(inv)
    db_session.commit()

    # 2. Đánh giá để đại lý bị gắn cờ
    flag_before = debt_risk_service.evaluate_customer_debt_risk(
        db=db_session,
        customer_id=cust_id,
        source="TEST_BEFORE_PAY",
        actor_username="system",
        commit=True,
    )
    assert flag_before.is_flagged is True

    # 3. Kế toán ghi nhận thanh toán thu đủ 10 triệu
    accountant = _get_or_create_test_accountant(db_session)
    payment_payload = PaymentCreateRequest(
        customer_id=cust_id,
        amount=10_000_000,
        payment_method=PaymentMethod.BANK_TRANSFER,
        reference_code="UNC-123456",
        notes="Thanh toán nợ quá hạn",
    )

    payment = PaymentService.create_payment(
        db=db_session,
        payload=payment_payload,
        current_user=accountant,
    )
    assert payment.id is not None

    # 4. Kiểm tra cờ rủi ro sau thanh toán (đã được hook SCRUM-725 tự động gỡ cờ!)
    flag_after = db_session.query(CustomerDebtFlag).filter(CustomerDebtFlag.customer_id == cust_id).first()
    assert flag_after is not None
    assert flag_after.is_flagged is False
    assert flag_after.risk_level == DebtRiskLevelEnum.SAFE
    assert flag_after.is_blocked is False
    assert flag_after.total_debt == 0

    # Dọn dẹp bản ghi lịch sử test để không ảnh hưởng dữ liệu thực tế trên GUI
    db_session.query(CustomerDebtFlagHistory).filter(CustomerDebtFlagHistory.customer_id == cust_id).delete()
    db_session.commit()


# ======================================================================================
# SCRUM-727: Thống kê tổng quan rủi ro công nợ
# ======================================================================================
def test_debt_risk_overview_summary_endpoint(db_session: Session):
    """Kiểm tra API summary phục vụ hiển thị KPI trên màn hình cấu hình."""
    resp = client.get("/api/v1/debt-risk/summary")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "total_customers" in data
    assert "safe_count" in data
    assert "overdue_count" in data
    assert "limit_exceeded_count" in data
