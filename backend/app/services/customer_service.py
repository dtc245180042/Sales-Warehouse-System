from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerUpdate

SEED_CUSTOMERS = [
    {
        "id": "CUS-001",
        "code": "KH-1001",
        "name": "Nguyễn Quốc Cường",
        "phone": "0903112233",
        "email": "cuong.nguyen@gmail.com",
        "address": "128 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. HCM",
        "customer_group": "RETAIL",
        "total_orders": 18,
        "total_spent": 145800000.0,
        "last_order_date": "2026-09-28",
        "status": "active"
    },
    {
        "id": "CUS-002",
        "code": "KH-1002",
        "name": "Trần Mai Phương",
        "phone": "0918223344",
        "email": "phuong.tran@vietcombank.com.vn",
        "address": "45 Phố Tràng Tiền, Quận Hoàn Kiếm, Hà Nội",
        "customer_group": "VIP",
        "total_orders": 12,
        "total_spent": 98500000.0,
        "last_order_date": "2026-09-25",
        "status": "active"
    },
    {
        "id": "CUS-003",
        "code": "KH-1003",
        "name": "Công Ty Cổ Phần Công Nghệ F-Soft",
        "phone": "02838997788",
        "email": "procurement@f-soft.vn",
        "address": "Tòa nhà FPT, Khu Công nghệ cao, TP. Thủ Đức, TP. HCM",
        "customer_group": "TIER_1",
        "total_orders": 34,
        "total_spent": 420000000.0,
        "last_order_date": "2026-10-01",
        "status": "active"
    },
    {
        "id": "CUS-004",
        "code": "KH-1004",
        "name": "Đại Lý Thiết Bị Số Tuấn Phương",
        "phone": "0907890123",
        "email": "customer@warehouse.local",
        "address": "88 Đường 3/2, Quận 10, TP. HCM",
        "customer_group": "TIER_1",
        "total_orders": 25,
        "total_spent": 310000000.0,
        "last_order_date": "2026-09-30",
        "status": "active"
    },
    {
        "id": "CUS-005",
        "code": "KH-1005",
        "name": "Chuỗi Bán Lẻ TechZone Miền Trung",
        "phone": "02363556677",
        "email": "order@techzone.vn",
        "address": "12 Nguyễn Văn Linh, Quận Hải Châu, Đà Nẵng",
        "customer_group": "TIER_2",
        "total_orders": 16,
        "total_spent": 195000000.0,
        "last_order_date": "2026-09-22",
        "status": "active"
    }
]


def ensure_seed_customers(db: Session):
    if db.query(Customer).count() == 0:
        for c in SEED_CUSTOMERS:
            db.add(Customer(**c))
        db.commit()


def get_all_customers(
    db: Session,
    search: Optional[str] = None,
    customer_group: Optional[str] = None,
) -> List[Customer]:
    ensure_seed_customers(db)
    query = db.query(Customer)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Customer.name.ilike(s)) | (Customer.code.ilike(s)) | (Customer.phone.ilike(s))
        )
    if customer_group and customer_group != "all":
        query = query.filter(Customer.customer_group == customer_group)
    return query.order_by(Customer.code.asc()).all()


def get_customer_by_id(db: Session, customer_id: str) -> Customer:
    ensure_seed_customers(db)
    cus = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    if not cus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khách hàng với mã '{customer_id}'."
        )
    return cus


def create_customer(db: Session, customer_in: CustomerCreate) -> Customer:
    ensure_seed_customers(db)
    count = db.query(Customer).count() + 1
    cus_id = customer_in.id or f"CUS-{str(count).zfill(3)}"
    cus_code = customer_in.code or f"KH-{1000 + count}"
    
    data = customer_in.model_dump(exclude_unset=True)
    data["id"] = cus_id
    data["code"] = cus_code
    
    customer = Customer(**data)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def update_customer(db: Session, customer_id: str, customer_in: CustomerUpdate) -> Customer:
    customer = get_customer_by_id(db, customer_id)
    update_data = customer_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


def delete_customer(db: Session, customer_id: str) -> bool:
    customer = get_customer_by_id(db, customer_id)
    db.delete(customer)
    db.commit()
    return True
