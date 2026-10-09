from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException, status
from app.models.customer import Customer
from app.models.auth import User, UserRole
from app.models.customer_assignment import CustomerAssignment, CustomerAssignmentHistory
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from app.services.audit_service import log_activity

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


def enrich_customer_with_assignment(db: Session, customer: Customer) -> CustomerResponse:
    """Gắn kèm thông tin nhân viên phụ trách cho đại lý."""
    resp = CustomerResponse.model_validate(customer)
    assignment = db.query(CustomerAssignment).filter(
        CustomerAssignment.customer_id == customer.id
    ).first()
    if assignment and assignment.assigned_staff_id:
        staff = db.query(User).filter(User.id == assignment.assigned_staff_id).first()
        resp.assigned_staff_id = str(assignment.assigned_staff_id)
        if staff:
            resp.assigned_staff_name = staff.full_name or staff.username
            resp.assigned_staff_phone = staff.phone_number
        if assignment.assigned_at:
            resp.assigned_at = assignment.assigned_at.strftime("%Y-%m-%d %H:%M:%S")
    return resp


def get_all_customers(
    db: Session,
    search: Optional[str] = None,
    customer_group: Optional[str] = None,
    assigned_staff_id: Optional[str] = None,
    region: Optional[str] = None,
    current_user: Optional[User] = None,
) -> List[CustomerResponse]:
    ensure_seed_customers(db)
    query = db.query(Customer)

    # Phạm vi phân quyền (Scope Guard):
    # Nếu người dùng là Sales Rep -> Chỉ được xem đại lý mình phụ trách (assigned_staff_id == user.id)
    # Đại lý chưa gán hoặc thuộc Sales Rep khác sẽ bị ẩn hoàn toàn (lọc ở tầng query)
    if current_user and current_user.role == UserRole.SALES_REP.value:
        query = query.join(
            CustomerAssignment, Customer.id == CustomerAssignment.customer_id
        ).filter(
            CustomerAssignment.assigned_staff_id == current_user.id
        )
    else:
        # Nếu là Manager / Admin / Accountant / v.v. -> Xem được 100% và có thể dùng bộ lọc
        if assigned_staff_id:
            if assigned_staff_id == "unassigned":
                # Lọc đại lý chưa phân công
                query = query.outerjoin(
                    CustomerAssignment, Customer.id == CustomerAssignment.customer_id
                ).filter(
                    or_(
                        CustomerAssignment.assigned_staff_id.is_(None),
                        CustomerAssignment.id.is_(None)
                    )
                )
            else:
                try:
                    staff_id_int = int(assigned_staff_id)
                    query = query.join(
                        CustomerAssignment, Customer.id == CustomerAssignment.customer_id
                    ).filter(
                        CustomerAssignment.assigned_staff_id == staff_id_int
                    )
                except ValueError:
                    pass

    # Bộ lọc khu vực (Region Filter) dựa trên địa chỉ sẵn có của đại lý
    if region and region.strip() and region != "all":
        reg = f"%{region.strip()}%"
        query = query.filter(Customer.address.ilike(reg))

    # Bộ lọc tìm kiếm
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (Customer.name.ilike(s)) | (Customer.code.ilike(s)) | (Customer.phone.ilike(s))
        )

    # Bộ lọc nhóm khách hàng
    if customer_group and customer_group != "all":
        query = query.filter(Customer.customer_group == customer_group)

    customers = query.order_by(Customer.code.asc()).all()
    return [enrich_customer_with_assignment(db, c) for c in customers]


def get_customer_by_id(
    db: Session,
    customer_id: str,
    current_user: Optional[User] = None,
) -> CustomerResponse:
    ensure_seed_customers(db)
    cus = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    if not cus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
        )

    # Kiểm tra quyền truy cập phạm vi (Scope Guard chống IDOR):
    # Sales Rep truy cập đại lý ngoài phạm vi phụ trách -> trả 404 (không trả 403)
    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == cus.id,
            CustomerAssignment.assigned_staff_id == current_user.id
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
            )

    return enrich_customer_with_assignment(db, cus)


def create_customer(
    db: Session,
    customer_in: CustomerCreate,
    current_user: Optional[User] = None,
) -> CustomerResponse:
    ensure_seed_customers(db)
    count = db.query(Customer).count() + 1
    cus_id = customer_in.id or f"CUS-{str(count).zfill(3)}"
    cus_code = customer_in.code or f"KH-{1000 + count}"
    
    data = customer_in.model_dump(exclude_unset=True)
    data["id"] = cus_id
    data["code"] = cus_code
    
    customer = Customer(**data)
    db.add(customer)

    # Quy tắc bắt buộc: Nếu Sales Rep tạo đại lý mới -> Tự gán cho chính họ trong CÙNG TRANSACTION!
    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = CustomerAssignment(
            customer_id=cus_id,
            assigned_staff_id=current_user.id,
            assigned_by=current_user.username,
            assigned_at=datetime.now(timezone.utc),
            notes="Tự động phân công khi nhân viên kinh doanh tạo đại lý mới"
        )
        db.add(assignment)

        # Ghi nhận lịch sử phân công tự động
        history = CustomerAssignmentHistory(
            customer_id=cus_id,
            customer_name=customer.name,
            from_staff_id=None,
            from_staff_name=None,
            to_staff_id=str(current_user.id),
            to_staff_name=current_user.full_name or current_user.username,
            action_type="ASSIGN",
            reason="Tự động phân công khi nhân viên kinh doanh tạo đại lý mới",
            performed_by=current_user.username,
            created_at=datetime.now(timezone.utc),
        )
        db.add(history)
    else:
        # Nếu Admin/Manager tạo -> tạo bản ghi phân công trống
        assignment = CustomerAssignment(
            customer_id=cus_id,
            assigned_staff_id=None,
            assigned_by=current_user.username if current_user else "Hệ thống",
            assigned_at=datetime.now(timezone.utc),
            notes="Đại lý mới chưa phân công"
        )
        db.add(assignment)

    db.commit()
    db.refresh(customer)
    return enrich_customer_with_assignment(db, customer)


def update_customer(
    db: Session,
    customer_id: str,
    customer_in: CustomerUpdate,
    current_user: Optional[User] = None,
) -> CustomerResponse:
    # Xác thực phạm vi trước khi cho phép cập nhật
    get_customer_by_id(db, customer_id, current_user)
    
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    
    update_data = customer_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return enrich_customer_with_assignment(db, customer)


def delete_customer(
    db: Session,
    customer_id: str,
    current_user: Optional[User] = None,
) -> bool:
    get_customer_by_id(db, customer_id, current_user)
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == customer.id).delete()
    db.delete(customer)
    db.commit()
    return True
