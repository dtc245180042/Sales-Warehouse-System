import math
import re
import uuid
from typing import List, Optional, Tuple, Dict, Any, Union
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.customer import Customer
from app.models.order import Order
from app.models.auth import User, UserRole
from app.models.customer_assignment import CustomerAssignment, CustomerAssignmentHistory
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.price_list import PriceList
from app.models.audit_log import AuditLog
from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    CustomerStatusUpdate,
)

SEED_CUSTOMERS = [
    {
        "id": "CUS-001",
        "code": "KH-1001",
        "name": "Nguyễn Quốc Cường",
        "phone": "0903112233",
        "email": "cuong.nguyen@gmail.com",
        "address": "128 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP. HCM",
        "customer_group": "RETAIL",
        "tax_code": None,
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
        "tax_code": None,
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
        "tax_code": "0301234567",
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
        "tax_code": "0307890123",
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
        "tax_code": "0401122334",
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
            cust = Customer(**c)
            db.add(cust)
            db.flush()
            # Khởi tạo hồ sơ công nợ mặc định
            if not db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == cust.id).first():
                db.add(CustomerCreditProfile(customer_id=cust.id, credit_limit=0, max_debt_days=0, current_debt=0))
            # Khởi tạo hồ sơ phân công mặc định
            if not db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == cust.id).first():
                db.add(CustomerAssignment(customer_id=cust.id))
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


def _get_dynamic_customer_stats(db: Session, customer_id: str) -> Tuple[int, float, Optional[str]]:
    """Tính toán động số đơn và tổng tiền từ bảng orders thật (không tin cậy cột lưu cứng)."""
    orders_count = db.query(func.count(Order.id)).filter(Order.customer_id == customer_id).scalar() or 0
    total_spent = db.query(func.coalesce(func.sum(Order.total), 0.0)).filter(
        Order.customer_id == customer_id,
        Order.status != "cancelled"
    ).scalar() or 0.0
    
    last_order = db.query(Order).filter(Order.customer_id == customer_id).order_by(Order.created_at.desc()).first()
    last_order_date = last_order.created_at.strftime("%Y-%m-%d") if last_order and last_order.created_at else None
    
    return int(orders_count), float(total_spent), last_order_date


def _enrich_customer_response(db: Session, customer: Customer) -> CustomerResponse:
    """Bổ sung dữ liệu người phụ trách, hạn mức công nợ và số liệu đơn hàng động."""
    orders_count, total_spent, last_order_date = _get_dynamic_customer_stats(db, customer.id)
    
    # Đọc người phụ trách từ bảng phụ customer_assignments
    assigned_staff_id = None
    assigned_staff_name = None
    assigned_staff_phone = None
    assigned_at = None
    assignment = db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == customer.id).first()
    if assignment and assignment.assigned_staff_id:
        assigned_staff_id = str(assignment.assigned_staff_id)
        if assignment.staff:
            assigned_staff_name = assignment.staff.full_name or assignment.staff.username
            assigned_staff_phone = assignment.staff.phone_number
        else:
            staff = db.query(User).filter(User.id == assignment.assigned_staff_id).first()
            if staff:
                assigned_staff_name = staff.full_name or staff.username
                assigned_staff_phone = staff.phone_number
        if assignment.assigned_at:
            assigned_at = assignment.assigned_at.strftime("%Y-%m-%d %H:%M:%S")

    # Đọc hạn mức công nợ từ bảng phụ customer_credit_profiles
    credit_limit = None
    max_debt_days = None
    current_debt = None
    credit_profile = db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == customer.id).first()
    if credit_profile:
        credit_limit = credit_profile.credit_limit
        max_debt_days = credit_profile.max_debt_days
        current_debt = credit_profile.current_debt

    return CustomerResponse(
        id=customer.id,
        code=customer.code,
        name=customer.name,
        phone=customer.phone,
        email=customer.email,
        address=customer.address,
        customer_group=customer.customer_group,
        tax_code=customer.tax_code,
        region=customer.region,
        status=customer.status,
        total_orders=orders_count,
        total_spent=total_spent,
        last_order_date=last_order_date,
        assigned_sales_rep=getattr(customer, "assigned_sales_rep", None) or assigned_staff_name,
        assigned_staff_id=assigned_staff_id,
        assigned_staff_name=assigned_staff_name,
        assigned_staff_phone=assigned_staff_phone,
        assigned_at=assigned_at,
        credit_limit=credit_limit,
        max_debt_days=max_debt_days,
        current_debt=current_debt,
        created_at=customer.created_at,
        updated_at=customer.updated_at
    )


# Alias để tương thích cả hai nhánh
enrich_customer_with_assignment = _enrich_customer_response


def check_sales_rep_scope(db: Session, customer_id: str, current_user: Optional[User]):
    """Guard kiểm tra phạm vi phụ trách: Sales Rep truy cập ngoài phạm vi -> trả 404 (chống IDOR)."""
    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = db.query(CustomerAssignment).filter(
            CustomerAssignment.customer_id == customer_id,
            CustomerAssignment.assigned_staff_id == current_user.id
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy thông tin đại lý '{customer_id}' trong phạm vi phụ trách của bạn."
            )


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
    assigned_staff_id: Optional[str] = None,
    region: Optional[str] = None,
    assigned_sales_rep: Optional[str] = None,
    status_filter: Optional[str] = None,
    status: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    current_user: Optional[User] = None,
) -> Union[Dict[str, Any], List[CustomerResponse]]:
    """
    Truy vấn và lọc danh sách đại lý theo các tiêu chí (S3-03, SC-228, SCRUM-229):
    - Tìm nhanh theo mã đại lý, tên, số điện thoại hoặc MST
    - Lọc theo khu vực địa bàn (region)
    - Lọc theo nhóm khách hàng (customer_group)
    - Lọc theo người phụ trách (assigned_sales_rep / assigned_staff_id)
    - Lọc theo trạng thái (status: active, inactive, locked)
    - Phân trang dữ liệu (khi truyền page/page_size)
    """
    ensure_seed_customers(db)
    query = db.query(Customer)

    # Phạm vi phân quyền (Scope Guard):
    # Sales Rep: Chỉ được xem đại lý mình phụ trách (assigned_staff_id == user.id)
    if current_user and current_user.role == UserRole.SALES_REP.value:
        query = query.join(
            CustomerAssignment, Customer.id == CustomerAssignment.customer_id
        ).filter(
            CustomerAssignment.assigned_staff_id == current_user.id
        )
    else:
        # Manager / Admin: Xem được 100% và hỗ trợ lọc theo nhân viên
        if assigned_staff_id:
            if assigned_staff_id == "unassigned":
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

    # 1. Tìm nhanh theo mã, tên, số điện thoại, MST
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Customer.name.ilike(s),
                Customer.code.ilike(s),
                Customer.phone.ilike(s),
                Customer.tax_code.ilike(s)
            )
        )

    # 2. Bộ lọc nhóm khách hàng
    if customer_group and customer_group.strip().upper() != "ALL":
        query = query.filter(Customer.customer_group == customer_group.strip().upper())

    # 3. Bộ lọc khu vực (Region Filter)
    if region and region.strip() and region.strip().upper() != "ALL":
        reg = f"%{region.strip()}%"
        query = query.filter(
            or_(
                Customer.region.ilike(reg),
                Customer.address.ilike(reg)
            )
        )

    # 4. Bộ lọc người phụ trách (assigned_sales_rep)
    if assigned_sales_rep and assigned_sales_rep.strip().lower() != "all":
        query = query.filter(Customer.assigned_sales_rep == assigned_sales_rep.strip())

    # 5. Bộ lọc trạng thái (status hoặc status_filter)
    st = status or status_filter
    if st and st.strip().lower() != "all":
        query = query.filter(Customer.status == st.strip().lower())

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
            "items": [_enrich_customer_response(db, c) for c in items],
            "total": total,
            "page": p,
            "page_size": ps,
            "total_pages": total_pages,
        }

    customers = query.all()
    return [_enrich_customer_response(db, c) for c in customers]


def get_customer_by_id(
    db: Session,
    customer_id: str,
    current_user: Optional[User] = None,
) -> CustomerResponse:
    ensure_seed_customers(db)
    cus = db.query(Customer).filter(
        or_(Customer.id == customer_id, Customer.code == customer_id)
    ).first()
    if not cus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
        )

    # Scope Guard chống IDOR
    check_sales_rep_scope(db, cus.id, current_user)
    return _enrich_customer_response(db, cus)


def create_customer(
    db: Session,
    customer_in: CustomerCreate,
    current_user: Optional[User] = None,
) -> CustomerResponse:
    ensure_seed_customers(db)

    # 1. Kiểm tra mã đại lý: Trim, Case-Insensitive Unique Check
    code = customer_in.code
    if not code:
        count = db.query(Customer).count() + 1
        code = f"KH-{1000 + count}"
    code = code.strip().upper()

    existing_code = db.query(Customer).filter(func.lower(Customer.code) == func.lower(code)).first()
    if existing_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã đại lý '{code}' đã tồn tại trong hệ thống. Vui lòng sử dụng mã khác."
        )

    # 2. Kiểm tra Mã số thuế không được trùng lặp
    tax_code = customer_in.tax_code
    if tax_code:
        tax_code = tax_code.strip()
        existing_tax = db.query(Customer).filter(Customer.tax_code == tax_code).first()
        if existing_tax:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã số thuế '{tax_code}' đã được đăng ký cho đại lý '{existing_tax.name}' ({existing_tax.code})."
            )

    count_id = db.query(Customer).count() + 1
    cus_id = customer_in.id or f"CUS-{str(count_id).zfill(3)}"
    while db.query(Customer).filter(Customer.id == cus_id).first():
        count_id += 1
        cus_id = f"CUS-{str(count_id).zfill(3)}"

    data = customer_in.model_dump(exclude_unset=True)
    data["id"] = cus_id
    data["code"] = code
    data["tax_code"] = tax_code
    data["total_orders"] = 0
    data["total_spent"] = 0.0

    customer = Customer(**data)
    db.add(customer)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã đại lý '{code}' đã tồn tại trong hệ thống. Vui lòng sử dụng mã khác."
        )

    # 3. Tạo hồ sơ công nợ mặc định trong cùng 1 Transaction
    credit_prof = CustomerCreditProfile(
        customer_id=customer.id,
        credit_limit=0,
        max_debt_days=0,
        current_debt=0,
        updated_by=current_user.username if current_user else "Hệ thống"
    )
    db.add(credit_prof)

    # 4. Phân công trong cùng 1 Transaction
    if current_user and current_user.role == UserRole.SALES_REP.value:
        assignment = CustomerAssignment(
            customer_id=customer.id,
            assigned_staff_id=current_user.id,
            assigned_by=current_user.username,
            assigned_at=datetime.now(timezone.utc),
            notes="Tự động phân công khi nhân viên kinh doanh tạo đại lý mới"
        )
        db.add(assignment)

        # Ghi nhận lịch sử phân công tự động
        history = CustomerAssignmentHistory(
            customer_id=customer.id,
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
        assignment = CustomerAssignment(
            customer_id=customer.id,
            assigned_staff_id=None,
            assigned_by=current_user.username if current_user else "Hệ thống",
            assigned_at=datetime.now(timezone.utc),
            notes="Đại lý mới chưa phân công"
        )
        db.add(assignment)

    # 5. Ghi AuditLog
    if current_user:
        audit = AuditLog(
            entity_type="CUSTOMER",
            entity_id=customer.id,
            entity_name=customer.name,
            action="CREATE",
            new_values={"code": customer.code, "name": customer.name, "group": customer.customer_group},
            change_summary=f"Tạo mới hồ sơ đại lý '{customer.name}' ({customer.code})",
            user_id=current_user.id,
            username=current_user.username,
            user_fullname=current_user.full_name,
            user_role=current_user.role,
            reason="Khai báo hồ sơ đại lý mới"
        )
        db.add(audit)

    db.commit()
    db.refresh(customer)
    return _enrich_customer_response(db, customer)


def update_customer(
    db: Session,
    customer_id: str,
    customer_in: CustomerUpdate,
    current_user: Optional[User] = None,
) -> CustomerResponse:
    ensure_seed_customers(db)
    customer = db.query(Customer).filter(
        or_(Customer.id == customer_id, Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
        )

    # Scope Guard
    check_sales_rep_scope(db, customer.id, current_user)

    update_data = customer_in.model_dump(exclude_unset=True)

    # 1. Kiểm tra khóa sửa mã đại lý khi đã phát sinh đơn hàng
    if "code" in update_data and update_data["code"]:
        new_code = update_data["code"].strip().upper()
        if new_code != customer.code:
            orders_count = db.query(Order).filter(Order.customer_id == customer.id).count()
            if orders_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Đại lý đã phát sinh giao dịch, không được phép thay đổi mã đại lý."
                )
            # Kiểm tra trùng lặp với đại lý khác
            dup = db.query(Customer).filter(
                func.lower(Customer.code) == func.lower(new_code),
                Customer.id != customer.id
            ).first()
            if dup:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Mã đại lý '{new_code}' đã tồn tại trong hệ thống. Vui lòng sử dụng mã khác."
                )
            update_data["code"] = new_code

    # 2. Kiểm tra trùng mã số thuế với đại lý khác
    if "tax_code" in update_data and update_data["tax_code"]:
        new_tax = update_data["tax_code"].strip()
        dup_tax = db.query(Customer).filter(
            Customer.tax_code == new_tax,
            Customer.id != customer.id
        ).first()
        if dup_tax:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã số thuế '{new_tax}' đã được đăng ký cho đại lý '{dup_tax.name}' ({dup_tax.code})."
            )
        update_data["tax_code"] = new_tax

    old_snapshot = {"name": customer.name, "customer_group": customer.customer_group, "status": customer.status}

    for key, value in update_data.items():
        setattr(customer, key, value)

    # Ghi AuditLog
    if current_user:
        audit = AuditLog(
            entity_type="CUSTOMER",
            entity_id=customer.id,
            entity_name=customer.name,
            action="UPDATE",
            old_values=old_snapshot,
            new_values=update_data,
            change_summary=f"Cập nhật hồ sơ đại lý '{customer.name}'",
            user_id=current_user.id,
            username=current_user.username,
            user_fullname=current_user.full_name,
            user_role=current_user.role,
            reason="Cập nhật thông tin đại lý"
        )
        db.add(audit)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dữ liệu cập nhật bị trùng lặp mã đại lý hoặc mã số thuế."
        )

    db.refresh(customer)
    return _enrich_customer_response(db, customer)


def update_customer_status(
    db: Session,
    customer_id: str,
    status_in: CustomerStatusUpdate,
    current_user: Optional[User] = None
) -> CustomerResponse:
    """Chuyển đổi trạng thái nhanh: active <-> inactive."""
    customer = db.query(Customer).filter(
        or_(Customer.id == customer_id, Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
        )

    check_sales_rep_scope(db, customer.id, current_user)

    old_status = customer.status
    customer.status = status_in.status.lower()

    if current_user:
        audit = AuditLog(
            entity_type="CUSTOMER",
            entity_id=customer.id,
            entity_name=customer.name,
            action="STATUS_CHANGE",
            old_values={"status": old_status},
            new_values={"status": customer.status},
            change_summary=f"Đổi trạng thái đại lý '{customer.name}' sang '{customer.status}'",
            user_id=current_user.id,
            username=current_user.username,
            user_fullname=current_user.full_name,
            user_role=current_user.role,
            reason="Chuyển trạng thái giao dịch đại lý"
        )
        db.add(audit)

    db.commit()
    db.refresh(customer)
    return _enrich_customer_response(db, customer)


def delete_customer(
    db: Session,
    customer_id: str,
    current_user: Optional[User] = None,
) -> bool:
    """
    Xóa đại lý: Chặn (400) nếu tồn tại đơn hàng, công nợ hoặc lịch sử phân công (SCRUM-433).
    """
    customer = db.query(Customer).filter(
        or_(Customer.id == customer_id, Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
        )

    check_sales_rep_scope(db, customer.id, current_user)

    # 1. Kiểm tra đơn hàng thật trong bảng orders
    orders_count = db.query(Order).filter(Order.customer_id == customer.id).count()
    if orders_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đại lý này đã phát sinh {orders_count} giao dịch/đơn hàng nên không thể xóa. Bạn chỉ có thể chuyển trạng thái sang 'Ngừng giao dịch'."
        )

    # 2. Kiểm tra dư nợ công nợ
    credit_profile = db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == customer.id).first()
    if credit_profile and credit_profile.current_debt > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đại lý đang có khoản nợ {credit_profile.current_debt:,} đ chưa thanh toán nên không thể xóa."
        )

    # 3. Kiểm tra lịch sử phân công địa bàn
    histories_count = db.query(CustomerAssignmentHistory).filter(CustomerAssignmentHistory.customer_id == customer.id).count()
    if histories_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đại lý đã có lịch sử bàn giao địa bàn trong hệ thống nên không thể xóa. Bạn chỉ có thể chuyển trạng thái sang 'Ngừng giao dịch'."
        )

    # Cho phép xóa an toàn khi chưa phát sinh giao dịch
    # Dọn dẹp bảng phụ
    db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id == customer.id).delete()
    db.query(CustomerAssignment).filter(CustomerAssignment.customer_id == customer.id).delete()
    
    cust_name = customer.name
    cust_code = customer.code
    db.delete(customer)

    if current_user:
        audit = AuditLog(
            entity_type="CUSTOMER",
            entity_id=customer_id,
            entity_name=cust_name,
            action="DELETE",
            change_summary=f"Xóa hồ sơ đại lý '{cust_name}' ({cust_code})",
            user_id=current_user.id,
            username=current_user.username,
            user_fullname=current_user.full_name,
            user_role=current_user.role,
            reason="Xóa đại lý chưa phát sinh giao dịch"
        )
        db.add(audit)

    db.commit()
    return True


def get_applied_price_list_for_customer(
    db: Session,
    customer_id: str,
    current_user: Optional[User] = None
) -> dict:
    """
    Liên kết nhóm khách hàng với bảng giá áp dụng cho đại lý (SCRUM-434).
    Chọn bảng giá hiệu lực (APPROVED, is_active=True, valid_from <= now <= valid_to) 
    khớp nhóm khách hàng có valid_from mới nhất.
    """
    customer = db.query(Customer).filter(
        or_(Customer.id == customer_id, Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy thông tin đại lý với mã '{customer_id}'."
        )

    check_sales_rep_scope(db, customer.id, current_user)

    target_group = customer.customer_group or "RETAIL"
    
    # Tìm bảng giá hiệu lực của nhóm khách hàng này
    all_lists = db.query(PriceList).filter(
        PriceList.customer_group == target_group,
        PriceList.status == "APPROVED",
        PriceList.is_active == True
    ).order_by(PriceList.valid_from.desc()).all()

    effective_list = None
    for pl in all_lists:
        if pl.is_effective:
            effective_list = pl
            break

    if not effective_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chưa có bảng giá phân phối hiệu lực cho nhóm khách hàng '{target_group}' của đại lý này."
        )

    return {
        "customer_id": customer.id,
        "customer_name": customer.name,
        "customer_group": target_group,
        "price_list_id": effective_list.id,
        "price_list_code": effective_list.code,
        "price_list_name": effective_list.name,
        "valid_from": effective_list.valid_from,
        "valid_to": effective_list.valid_to,
        "items_count": len(effective_list.items)
    }
