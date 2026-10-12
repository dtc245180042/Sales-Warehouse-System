import pytest
from pydantic import ValidationError
from app.schemas.product import ProductCreateRequest, ProductUpdateRequest, NON_TECH_KEYWORDS
from app.core.database import SessionLocal
from app.models.product import Product


def test_reject_non_tech_product_creation_via_schema():
    """Hệ thống Sales & Warehouse chỉ kinh doanh sản phẩm công nghệ.
    Bắt buộc chặn và ném ValidationError khi tạo sản phẩm có tên hoặc category phi công nghệ.
    """
    # 1. Thử tạo sản phẩm Sữa tươi Vinamilk
    with pytest.raises(ValidationError) as exc1:
        ProductCreateRequest(
            sku="TECH-TEST-SUA-01",
            name="Sữa tươi tiệt trùng Vinamilk 100% Không Đường",
            category="Điện thoại thông minh (Smartphones)",
            unit="Chiếc"
        )
    assert "chỉ kinh doanh sản phẩm công nghệ" in str(exc1.value)

    # 2. Thử tạo sản phẩm Bánh kẹo
    with pytest.raises(ValidationError) as exc2:
        ProductCreateRequest(
            sku="TECH-TEST-BANH-01",
            name="Bánh trung thu Kinh Đô",
            category="Điện thoại & Máy tính bảng",
            unit="Chiếc"
        )
    assert "chỉ kinh doanh sản phẩm công nghệ" in str(exc2.value)

    # 3. Thử tạo sản phẩm nhóm Đồ uống / Nước ngọt
    with pytest.raises(ValidationError) as exc3:
        ProductCreateRequest(
            sku="TECH-TEST-NUOC-01",
            name="Nước Tăng Lực Bò Húc Chai 250ml",
            category="Đồ uống",
            unit="Lon"
        )
    assert "chỉ kinh doanh sản phẩm công nghệ" in str(exc3.value)


def test_reject_non_tech_product_update_via_schema():
    """Từ chối cập nhật sản phẩm công nghệ thành tên hoặc nhóm phi công nghệ."""
    with pytest.raises(ValidationError) as exc:
        ProductUpdateRequest(
            name="Sữa Chua Nếp Cẩm Ba Vì",
            category="Thực phẩm"
        )
    assert "chỉ kinh doanh sản phẩm công nghệ" in str(exc.value)


def test_accept_valid_tech_products():
    """Chấp nhận sản phẩm công nghệ hợp lệ."""
    valid_prod = ProductCreateRequest(
        sku="TECH-IP15P-256-TI",
        name="iPhone 15 Pro Max 256GB Titan Tự Nhiên",
        category="Điện thoại thông minh (Smartphones)",
        unit="Chiếc",
        cost_price=28000000.0
    )
    assert valid_prod.sku == "TECH-IP15P-256-TI"
    assert valid_prod.category == "Điện thoại thông minh (Smartphones)"


def test_database_contains_only_tech_products():
    """Kiểm tra cơ sở dữ liệu: toàn bộ sản phẩm trong bảng products phải là hàng công nghệ hợp lệ."""
    db = SessionLocal()
    try:
        products = db.query(Product).all()
        for p in products:
            p_name = (p.name or "").lower()
            p_cat = (p.category or "").lower()
            for kw in NON_TECH_KEYWORDS:
                assert kw not in p_name, f"Phát hiện sản phẩm phi công nghệ trong DB: ID={p.id}, Name='{p.name}', Keyword='{kw}'"
                assert kw not in p_cat, f"Phát hiện nhóm hàng phi công nghệ trong DB: ID={p.id}, Category='{p.category}', Keyword='{kw}'"
    finally:
        db.close()
