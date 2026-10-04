from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate

SEED_SUPPLIERS = [
    {
        "id": "SUP-001",
        "code": "NCC-01",
        "name": "Apple Distribution VN",
        "contact_person": "Trịnh Hoài Nam",
        "phone": "02838221199",
        "email": "b2b@apple-dist.vn",
        "address": "Tầng 18, Tòa nhà Bitexco, Quận 1, TP. HCM",
        "total_imports": 48,
        "total_spent": 1250000000.0,
        "status": "active"
    },
    {
        "id": "SUP-002",
        "code": "NCC-02",
        "name": "Samsung Electronics Vina",
        "contact_person": "Kim Tae Young",
        "phone": "02839103344",
        "email": "supply@samsungvina.vn",
        "address": "Khu Công Nghệ Cao, TP. Thủ Đức, TP. HCM",
        "total_imports": 42,
        "total_spent": 980000000.0,
        "status": "active"
    },
    {
        "id": "SUP-003",
        "code": "NCC-03",
        "name": "Dell Global Solution VN",
        "contact_person": "Nguyễn Thành Long",
        "phone": "02437894455",
        "email": "contact@dell-partner.vn",
        "address": "Tòa nhà Keangnam Landmark 72, Nam Từ Liêm, Hà Nội",
        "total_imports": 26,
        "total_spent": 640000000.0,
        "status": "active"
    },
    {
        "id": "SUP-004",
        "code": "NCC-04",
        "name": "Sony Vietnam Audio",
        "contact_person": "Lê Hải Đăng",
        "phone": "02838225566",
        "email": "order@sony.com.vn",
        "address": "Tòa nhà Sailing Tower, 111A Pasteur, Quận 1, TP. HCM",
        "total_imports": 30,
        "total_spent": 520000000.0,
        "status": "active"
    },
    {
        "id": "SUP-005",
        "code": "NCC-05",
        "name": "Logitech Official Partner",
        "contact_person": "Trần Thu Hà",
        "phone": "02439332211",
        "email": "partners@logi-vietnam.com",
        "address": "83B Lý Thường Kiệt, Hoàn Kiếm, Hà Nội",
        "total_imports": 35,
        "total_spent": 410000000.0,
        "status": "active"
    }
]


def ensure_seed_suppliers(db: Session):
    if db.query(Supplier).count() == 0:
        for s in SEED_SUPPLIERS:
            db.add(Supplier(**s))
        db.commit()


def get_all_suppliers(db: Session, search: Optional[str] = None) -> List[Supplier]:
    ensure_seed_suppliers(db)
    query = db.query(Supplier)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Supplier.name.ilike(s)) | (Supplier.code.ilike(s)) | (Supplier.contact_person.ilike(s))
        )
    return query.order_by(Supplier.code.asc()).all()


def get_supplier_by_id(db: Session, supplier_id: str) -> Supplier:
    ensure_seed_suppliers(db)
    sup = db.query(Supplier).filter(
        (Supplier.id == supplier_id) | (Supplier.code == supplier_id)
    ).first()
    if not sup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhà cung cấp với mã '{supplier_id}'."
        )
    return sup


def create_supplier(db: Session, supplier_in: SupplierCreate) -> Supplier:
    ensure_seed_suppliers(db)
    count = db.query(Supplier).count() + 1
    sup_id = supplier_in.id or f"SUP-{str(count).zfill(3)}"
    sup_code = supplier_in.code or f"NCC-{str(count).zfill(2)}"
    
    data = supplier_in.model_dump(exclude_unset=True)
    data["id"] = sup_id
    data["code"] = sup_code
    
    supplier = Supplier(**data)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


def update_supplier(db: Session, supplier_id: str, supplier_in: SupplierUpdate) -> Supplier:
    supplier = get_supplier_by_id(db, supplier_id)
    update_data = supplier_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(supplier, key, value)
    db.commit()
    db.refresh(supplier)
    return supplier


def delete_supplier(db: Session, supplier_id: str) -> bool:
    supplier = get_supplier_by_id(db, supplier_id)
    db.delete(supplier)
    db.commit()
    return True
