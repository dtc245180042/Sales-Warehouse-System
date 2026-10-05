"""
supplier_service.py — SCRUM-217 Backend Service
Xử lý nghiệp vụ quản lý danh mục nhà cung cấp.

Subtasks đã triển khai:
  - SCRUM-409: API quản lý danh mục NCC (tạo mới, cập nhật, tra cứu, phân trang)
  - SCRUM-408: Trả về thông tin trạng thái + cảnh báo khi không thể xóa
  - SCRUM-410: Ràng buộc nghiệp vụ cho mã NCC, mã số thuế, điều khoản thanh toán
  - SCRUM-412: Ngừng giao dịch thay vì xóa cứng khi đã có phiếu nhập
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from app.models.supplier import Supplier
from app.models.inventory import StockReceipt
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierDeleteResponse


# ─── Dữ liệu mẫu ──────────────────────────────────────────────────────────────

SEED_SUPPLIERS = [
    {
        "id": "SUP-001",
        "code": "NCC-01",
        "name": "Apple Distribution VN",
        "tax_code": "0301234567",
        "payment_terms": "NET30",
        "contact_person": "Trịnh Hoài Nam",
        "phone": "02838221199",
        "email": "b2b@apple-dist.vn",
        "address": "Tầng 18, Tòa nhà Bitexco, Quận 1, TP. HCM",
        "total_imports": 48,
        "total_spent": 1250000000.0,
        "status": "active",
        "has_receipts": True,
    },
    {
        "id": "SUP-002",
        "code": "NCC-02",
        "name": "Samsung Electronics Vina",
        "tax_code": "0301234568",
        "payment_terms": "NET60",
        "contact_person": "Kim Tae Young",
        "phone": "02839103344",
        "email": "supply@samsungvina.vn",
        "address": "Khu Công Nghệ Cao, TP. Thủ Đức, TP. HCM",
        "total_imports": 42,
        "total_spent": 980000000.0,
        "status": "active",
        "has_receipts": True,
    },
    {
        "id": "SUP-003",
        "code": "NCC-03",
        "name": "Dell Global Solution VN",
        "tax_code": "0301234569",
        "payment_terms": "COD",
        "contact_person": "Nguyễn Thành Long",
        "phone": "02437894455",
        "email": "contact@dell-partner.vn",
        "address": "Tòa nhà Keangnam Landmark 72, Nam Từ Liêm, Hà Nội",
        "total_imports": 26,
        "total_spent": 640000000.0,
        "status": "active",
        "has_receipts": True,
    },
    {
        "id": "SUP-004",
        "code": "NCC-04",
        "name": "Sony Vietnam Audio",
        "tax_code": "0301234570",
        "payment_terms": "T/T 45 ngày",
        "contact_person": "Lê Hải Đăng",
        "phone": "02838225566",
        "email": "order@sony.com.vn",
        "address": "Tòa nhà Sailing Tower, 111A Pasteur, Quận 1, TP. HCM",
        "total_imports": 30,
        "total_spent": 520000000.0,
        "status": "active",
        "has_receipts": False,
    },
    {
        "id": "SUP-005",
        "code": "NCC-05",
        "name": "Logitech Official Partner",
        "tax_code": "0301234571",
        "payment_terms": "NET15",
        "contact_person": "Trần Thu Hà",
        "phone": "02439332211",
        "email": "partners@logi-vietnam.com",
        "address": "83B Lý Thường Kiệt, Hoàn Kiếm, Hà Nội",
        "total_imports": 35,
        "total_spent": 410000000.0,
        "status": "active",
        "has_receipts": False,
    },
]


def ensure_seed_suppliers(db: Session) -> None:
    """Nạp dữ liệu mẫu nếu bảng đang trống."""
    if db.query(Supplier).count() == 0:
        for s in SEED_SUPPLIERS:
            db.add(Supplier(**s))
        db.commit()


# ─── SCRUM-409: Kiểm tra trùng mã NCC / mã số thuế (SCRUM-410) ───────────────

def _assert_code_unique(db: Session, code: str, exclude_id: Optional[str] = None) -> None:
    """Đảm bảo mã NCC không bị trùng lặp trong hệ thống."""
    q = db.query(Supplier).filter(Supplier.code == code)
    if exclude_id:
        q = q.filter(Supplier.id != exclude_id)
    if q.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Mã nhà cung cấp '{code}' đã tồn tại trong hệ thống.",
        )


def _assert_tax_code_unique(db: Session, tax_code: str, exclude_id: Optional[str] = None) -> None:
    """Đảm bảo mã số thuế không bị trùng lặp."""
    q = db.query(Supplier).filter(Supplier.tax_code == tax_code)
    if exclude_id:
        q = q.filter(Supplier.id != exclude_id)
    if q.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Mã số thuế '{tax_code}' đã được đăng ký bởi nhà cung cấp khác.",
        )


def _has_import_receipts(db: Session, supplier_id: str) -> bool:
    """Kiểm tra nhà cung cấp đã phát sinh phiếu nhập kho chưa."""
    return (
        db.query(StockReceipt)
        .filter(
            StockReceipt.supplier_id == supplier_id,
            StockReceipt.type == "in",
        )
        .count()
        > 0
    )


# ─── Queries ──────────────────────────────────────────────────────────────────

def get_all_suppliers(
    db: Session,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[Supplier]:
    """Lấy danh sách nhà cung cấp, hỗ trợ tìm kiếm và lọc trạng thái."""
    ensure_seed_suppliers(db)
    query = db.query(Supplier)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Supplier.name.ilike(s))
            | (Supplier.code.ilike(s))
            | (Supplier.contact_person.ilike(s))
            | (Supplier.tax_code.ilike(s))
        )
    if status_filter:
        query = query.filter(Supplier.status == status_filter)

    return query.order_by(Supplier.code.asc()).offset(skip).limit(limit).all()


def get_supplier_by_id(db: Session, supplier_id: str) -> Supplier:
    """Lấy chi tiết nhà cung cấp theo ID hoặc mã NCC."""
    ensure_seed_suppliers(db)
    sup = db.query(Supplier).filter(
        (Supplier.id == supplier_id) | (Supplier.code == supplier_id)
    ).first()
    if not sup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhà cung cấp với mã '{supplier_id}'.",
        )
    return sup


# ─── SCRUM-409: Tạo mới ───────────────────────────────────────────────────────

def create_supplier(db: Session, supplier_in: SupplierCreate) -> Supplier:
    """Tạo mới nhà cung cấp. Kiểm tra trùng mã NCC và mã số thuế."""
    ensure_seed_suppliers(db)

    # Tự sinh mã nếu không cung cấp
    count = db.query(func.count(Supplier.id)).scalar() + 1
    sup_id = supplier_in.id or f"SUP-{str(count).zfill(3)}"
    sup_code = supplier_in.code or f"NCC-{str(count).zfill(2)}"

    # SCRUM-410: Kiểm tra trùng
    _assert_code_unique(db, sup_code)
    if supplier_in.tax_code:
        _assert_tax_code_unique(db, supplier_in.tax_code)

    data = supplier_in.model_dump(exclude_unset=True)
    data["id"] = sup_id
    data["code"] = sup_code

    supplier = Supplier(**data)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


# ─── Cập nhật ─────────────────────────────────────────────────────────────────

def update_supplier(
    db: Session, supplier_id: str, supplier_in: SupplierUpdate
) -> Supplier:
    """Cập nhật thông tin nhà cung cấp. Kiểm tra trùng mã số thuế nếu thay đổi."""
    supplier = get_supplier_by_id(db, supplier_id)
    update_data = supplier_in.model_dump(exclude_unset=True)

    # SCRUM-410: Kiểm tra trùng mã số thuế nếu thay đổi
    if "tax_code" in update_data and update_data["tax_code"] != supplier.tax_code:
        _assert_tax_code_unique(db, update_data["tax_code"], exclude_id=supplier.id)

    for key, value in update_data.items():
        setattr(supplier, key, value)

    db.commit()
    db.refresh(supplier)
    return supplier


# ─── SCRUM-408 + SCRUM-412: Xóa thông minh ───────────────────────────────────

def delete_or_deactivate_supplier(
    db: Session, supplier_id: str
) -> SupplierDeleteResponse:
    """
    Xử lý yêu cầu xóa nhà cung cấp theo nghiệp vụ:
    - Nếu NCC chưa có phiếu nhập kho → xóa cứng (hard delete).
    - Nếu NCC đã có phiếu nhập kho → chuyển sang 'inactive' (ngừng giao dịch),
      đồng thời trả về cảnh báo rõ ràng cho client (SCRUM-408).
    """
    supplier = get_supplier_by_id(db, supplier_id)

    # Kiểm tra phiếu nhập kho trong DB thực tế
    has_receipts = supplier.has_receipts or _has_import_receipts(db, supplier.id)

    if has_receipts:
        # SCRUM-412: Không cho xóa cứng — ngừng giao dịch
        if supplier.status == "inactive":
            return SupplierDeleteResponse(
                supplier_id=supplier.id,
                action="deactivated",
                message=f"Nhà cung cấp '{supplier.name}' đã ở trạng thái ngừng giao dịch.",
                warning="Nhà cung cấp đã có phiếu nhập kho nên không thể xóa khỏi hệ thống.",
            )

        supplier.status = "inactive"
        supplier.has_receipts = True
        db.commit()

        # SCRUM-408: Trả về cảnh báo chi tiết
        return SupplierDeleteResponse(
            supplier_id=supplier.id,
            action="deactivated",
            message=f"Đã chuyển nhà cung cấp '{supplier.name}' sang trạng thái 'Ngừng giao dịch'.",
            warning=(
                "Nhà cung cấp đã có phiếu nhập kho nên không thể xóa vĩnh viễn. "
                "Hệ thống đã tự động ngừng giao dịch để bảo toàn dữ liệu lịch sử."
            ),
        )

    # Chưa có phiếu nhập → xóa cứng an toàn
    db.delete(supplier)
    db.commit()
    return SupplierDeleteResponse(
        supplier_id=supplier_id,
        action="deleted",
        message=f"Đã xóa nhà cung cấp '{supplier.name}' thành công.",
    )
