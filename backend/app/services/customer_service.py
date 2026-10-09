import math
from typing import List, Optional, Dict, Any, Union
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
        "region": "Miền Nam",
        "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
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
        "region": "Miền Bắc",
        "assigned_sales_rep": "Nguyễn Văn Giám Đốc Kinh Doanh",
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
        "region": "Miền Nam",
        "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
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
        "region": "Miền Nam",
        "assigned_sales_rep": "Trần Quản Trị Hệ Thống",
        "total_orders": 25,
        "total_spent": 310000000.0,
        "last_order_date": "2026-09-30",
        "status": "locked"
    },
    {
        "id": "CUS-005",
        "code": "KH-1005",
        "name": "Chuỗi Bán Lẻ TechZone Miền Trung",
        "phone": "02363556677",
        "email": "order@techzone.vn",
        "address": "12 Nguyễn Văn Linh, Quận Hải Châu, Đà Nẵng",
        "customer_group": "TIER_2",
        "region": "Miền Trung",
        "assigned_sales_rep": "Lê Thị Nhân Viên Kinh Doanh",
        "total_orders": 16,
        "total_spent": 195000000.0,
        "last_order_date": "2026-09-22",
        "status": "active"
    }
]


def ensure_seed_customers(db: Session):
    """Đảm bảo dữ liệu mẫu và tự động bổ sung region, assigned_sales_rep nếu chưa có."""
    if db.query(Customer).count() == 0:
        for c in SEED_CUSTOMERS:
            db.add(Customer(**c))
        db.commit()
    else:
        # Bổ sung dữ liệu khu vực và người phụ trách cho các bản ghi cũ chưa có
        customers = db.query(Customer).all()
        updated = False
        sample_regions = ["Miền Bắc", "Miền Trung", "Miền Nam", "Tây Nguyên"]
        sample_reps = [
            "Lê Thị Nhân Viên Kinh Doanh",
            "Nguyễn Văn Giám Đốc Kinh Doanh",
            "Trần Quản Trị Hệ Thống"
        ]
        for idx, cus in enumerate(customers):
            if not cus.region:
                # Gán theo địa chỉ hoặc xoay vòng
                addr = (cus.address or "").lower()
                if "hà nội" in addr or "bắc" in addr:
                    cus.region = "Miền Bắc"
                elif "đà nẵng" in addr or "huế" in addr or "trung" in addr:
                    cus.region = "Miền Trung"
                else:
                    cus.region = sample_regions[idx % len(sample_regions)]
                updated = True
            if not cus.assigned_sales_rep:
                cus.assigned_sales_rep = sample_reps[idx % len(sample_reps)]
                updated = True
        if updated:
            try:
                db.commit()
            except Exception:
                db.rollback()


def get_filter_options(db: Session) -> Dict[str, List[str]]:
    """Lấy danh sách các giá trị bộ lọc đại lý đang có trong hệ thống (SCRUM-229)."""
    ensure_seed_customers(db)
    
    # Lấy danh sách khu vực
    regions_query = db.query(Customer.region).filter(Customer.region.isnot(None)).distinct().all()
    regions = sorted(list({r[0] for r in regions_query if r[0]}))
    if not regions:
        regions = ["Miền Bắc", "Miền Trung", "Miền Nam", "Tây Nguyên"]

    # Lấy danh sách nhóm khách hàng
    groups_query = db.query(Customer.customer_group).filter(Customer.customer_group.isnot(None)).distinct().all()
    groups = sorted(list({g[0] for g in groups_query if g[0]}))
    if not groups:
        groups = ["TIER_1", "TIER_2", "WHOLESALE", "VIP", "RETAIL"]

    # Lấy danh sách người phụ trách
    reps_query = db.query(Customer.assigned_sales_rep).filter(Customer.assigned_sales_rep.isnot(None)).distinct().all()
    reps = sorted(list({rp[0] for rp in reps_query if rp[0]}))
    if not reps:
        reps = ["Lê Thị Nhân Viên Kinh Doanh", "Nguyễn Văn Giám Đốc Kinh Doanh", "Trần Quản Trị Hệ Thống"]

    # Danh sách trạng thái chuẩn
    statuses = ["active", "inactive", "locked"]

    return {
        "regions": regions,
        "customer_groups": groups,
        "sales_reps": reps,
        "statuses": statuses,
    }


def get_all_customers(
    db: Session,
    search: Optional[str] = None,
    customer_group: Optional[str] = None,
    region: Optional[str] = None,
    assigned_sales_rep: Optional[str] = None,
    status: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> Union[Dict[str, Any], List[Customer]]:
    """
    Truy vấn và lọc danh sách đại lý theo các tiêu chí (SCRUM-229):
    - Tìm nhanh theo mã đại lý, tên hoặc số điện thoại
    - Lọc theo khu vực địa bàn (region)
    - Lọc theo nhóm khách hàng (customer_group)
    - Lọc theo người phụ trách (assigned_sales_rep)
    - Lọc theo trạng thái (status: active, inactive, locked)
    - Phân trang dữ liệu (khi truyền page/page_size)
    """
    ensure_seed_customers(db)
    query = db.query(Customer)

    # 1. Tìm nhanh theo mã, tên, số điện thoại
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            (Customer.name.ilike(s)) | (Customer.code.ilike(s)) | (Customer.phone.ilike(s))
        )

    # 2. Lọc theo nhóm khách hàng
    if customer_group and customer_group.strip().lower() != "all":
        query = query.filter(Customer.customer_group == customer_group.strip())

    # 3. Lọc theo khu vực
    if region and region.strip().lower() != "all":
        query = query.filter(Customer.region == region.strip())

    # 4. Lọc theo người phụ trách
    if assigned_sales_rep and assigned_sales_rep.strip().lower() != "all":
        query = query.filter(Customer.assigned_sales_rep == assigned_sales_rep.strip())

    # 5. Lọc theo trạng thái
    if status and status.strip().lower() != "all":
        query = query.filter(Customer.status == status.strip().lower())

    # Sắp xếp mặc định theo mã đại lý tăng dần
    query = query.order_by(Customer.code.asc())

    # 6. Phân trang nếu được yêu cầu
    if page is not None or page_size is not None:
        total = query.count()
        p = max(1, page or 1)
        ps = max(1, min(page_size or 10, 1000))
        offset = (p - 1) * ps
        items = query.offset(offset).limit(ps).all()
        total_pages = max(1, math.ceil(total / ps))
        return {
            "items": items,
            "total": total,
            "page": p,
            "page_size": ps,
            "total_pages": total_pages,
        }

    return query.all()


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
