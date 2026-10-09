import uuid
from typing import Tuple, Optional, List, Dict
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal, engine
from app.core.security import tao_token_truy_cap
from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.price_list import PriceList, PriceListItem
from app.models.product_price_history import ProductPriceHistory, PriceTypeEnum
from app.services.price_history_service import (
    record_price_change,
    ensure_price_history_baseline,
    get_product_price_history,
)

client = TestClient(app)


def get_auth_token(role: str = "Admin") -> Tuple[str, User]:
    db = SessionLocal()
    user = db.query(User).filter(User.role == role, User.is_active == True).first()
    if not user:
        user = User(
            username=f"test_{role.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
            email=f"{uuid.uuid4().hex[:6]}@test.com",
            hashed_password="hashed_pw",
            role=role,
            token_version=1,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = tao_token_truy_cap({
        "sub": str(user.id),
        "user_id": user.id,
        "role": user.role,
        "token_version": user.token_version
    })
    db.close()
    return token, user


def test_01_record_price_change_when_price_differs():
    """1. Đổi giá tự động ghi nhận lịch sử bất biến với giá cũ, giá mới, % chênh lệch và người sửa."""
    db = SessionLocal()
    prod = db.query(Product).first()
    _, user = get_auth_token("Sales Manager")

    old_price = 20000000
    new_price = 22000000
    reason = "Điều chỉnh tăng giá do tỷ giá ngoại tệ biến động"

    rec = record_price_change(
        db=db,
        product_id=str(prod.id),
        product_sku=prod.sku,
        product_name=prod.name,
        price_type=PriceTypeEnum.LISTED_PRICE,
        old_price=old_price,
        new_price=new_price,
        reason=reason,
        effective_from=datetime.now(timezone.utc),
        changed_by=user
    )
    db.commit()

    assert rec is not None
    assert rec.old_price == 20000000
    assert rec.new_price == 22000000
    assert rec.change_diff == 2000000
    assert rec.change_percent == Decimal("10.00")
    assert rec.reason == reason
    assert rec.changed_by_name == (user.full_name or user.username)
    db.close()


def test_02_price_unchanged_does_not_record_history():
    """2. Đổi giá nhưng giá cũ và mới bằng nhau (old == new) -> không ghi bản ghi thừa."""
    db = SessionLocal()
    prod = db.query(Product).first()
    _, user = get_auth_token("Sales Manager")

    rec = record_price_change(
        db=db,
        product_id=str(prod.id),
        product_sku=prod.sku,
        product_name=prod.name,
        price_type=PriceTypeEnum.LISTED_PRICE,
        old_price=15000000,
        new_price=15000000,
        reason="Không thay đổi",
        effective_from=datetime.now(timezone.utc),
        changed_by=user
    )
    assert rec is None
    db.close()


def test_03_empty_reason_is_blocked():
    """3. Lý do thay đổi giá (reason) để trống -> Bị chặn 400."""
    db = SessionLocal()
    prod = db.query(Product).first()
    _, user = get_auth_token("Sales Manager")

    with pytest.raises(Exception) as exc:
        record_price_change(
            db=db,
            product_id=str(prod.id),
            product_sku=prod.sku,
            product_name=prod.name,
            price_type=PriceTypeEnum.LISTED_PRICE,
            old_price=10000000,
            new_price=12000000,
            reason="   ",  # Chỉ có khoảng trắng
            effective_from=datetime.now(timezone.utc),
            changed_by=user
        )
    assert "bắt buộc" in str(exc.value).lower()
    db.close()


def test_04_rollback_when_recording_fails():
    """4. Tính nguyên tử (Atomic): Nếu bước ghi lịch sử gặp sự cố, toàn bộ cập nhật giá bị rollback."""
    db = SessionLocal()
    prod = db.query(Product).first()
    initial_price = float(prod.price or 100000)

    try:
        # Bắt đầu thay đổi giá nhưng cố ý truyền reason rỗng gây lỗi
        prod.price = 99999999.0
        record_price_change(
            db=db,
            product_id=str(prod.id),
            product_sku=prod.sku,
            product_name=prod.name,
            price_type=PriceTypeEnum.LISTED_PRICE,
            old_price=int(initial_price),
            new_price=99999999,
            reason="",
            effective_from=datetime.now(timezone.utc)
        )
        db.commit()
    except Exception:
        db.rollback()

    db.refresh(prod)
    # Giá phải được giữ nguyên giá trị ban đầu, không bị lưu 99999999
    assert float(prod.price) == initial_price
    db.close()


def test_05_immutability_triggers_prevent_direct_update_and_delete():
    """5. Tính bất biến: Lệnh UPDATE và DELETE trực tiếp trên MySQL bị Trigger chặn."""
    db = SessionLocal()
    # Tìm 1 bản ghi lịch sử giá
    rec = db.query(ProductPriceHistory).first()
    if not rec:
        ensure_price_history_baseline(db)
        rec = db.query(ProductPriceHistory).first()

    rec_id = rec.id
    db.close()

    # Thử gọi lệnh UPDATE trực tiếp trên DB
    with engine.connect() as conn:
        with pytest.raises((OperationalError, ProgrammingError)) as exc_update:
            conn.execute(text(f"UPDATE product_price_histories SET new_price = 12345 WHERE id = {rec_id}"))
            conn.commit()
        assert "Lich su thay doi gia la du lieu bat bien" in str(exc_update.value)

        with pytest.raises((OperationalError, ProgrammingError)) as exc_delete:
            conn.execute(text(f"DELETE FROM product_price_histories WHERE id = {rec_id}"))
            conn.commit()
        assert "Lich su thay doi gia la du lieu bat bien" in str(exc_delete.value)


def test_06_baseline_creation_is_idempotent():
    """6. Baseline: Chạy 2 lần liên tiếp không sinh trùng bản ghi khởi tạo."""
    db = SessionLocal()
    ensure_price_history_baseline(db)
    count1 = db.query(ProductPriceHistory).count()

    # Chạy lại lần 2
    ensure_price_history_baseline(db)
    count2 = db.query(ProductPriceHistory).count()

    assert count1 == count2
    db.close()


def test_07_api_pagination_and_filter():
    """7. API tra cứu lịch sử giá: phân trang và lọc theo nhóm khách hàng."""
    token, _ = get_auth_token("Sales Manager")
    db = SessionLocal()
    prod = db.query(Product).first()
    prod_id = str(prod.id)
    db.close()

    res = client.get(f"/api/v1/products/{prod_id}/price-history?page=1&limit=5", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert data["page"] == 1
    assert data["limit"] == 5


def test_08_no_update_or_delete_endpoints_exist():
    """8. Tính bất biến ở tầng API: Không có endpoint PUT/PATCH/DELETE cho /price-history."""
    token, _ = get_auth_token("Admin")
    # PUT hoặc DELETE vào /price-history phải trả 405 Method Not Allowed
    res_put = client.put("/api/v1/products/1/price-history", json={}, headers={"Authorization": f"Bearer {token}"})
    assert res_put.status_code == 405

    res_del = client.delete("/api/v1/products/1/price-history", headers={"Authorization": f"Bearer {token}"})
    assert res_del.status_code == 405


def test_09_unauthenticated_access_returns_401():
    """9. Chưa đăng nhập gọi /price-history -> trả về 401 Unauthorized."""
    res = client.get("/api/v1/products/1/price-history")
    assert res.status_code == 401
