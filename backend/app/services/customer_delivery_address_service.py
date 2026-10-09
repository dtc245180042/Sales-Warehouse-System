from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.customer import Customer
from app.models.customer_delivery_address import CustomerDeliveryAddress
from app.models.audit_log import AuditLog
from app.schemas.customer_delivery_address import DeliveryAddressCreate, DeliveryAddressUpdate


def _get_customer(db: Session, customer_id: str) -> Customer:
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khách hàng với mã '{customer_id}'."
        )
    return customer


def get_delivery_addresses(db: Session, customer_id: str) -> List[CustomerDeliveryAddress]:
    customer = _get_customer(db, customer_id)
    addresses = db.query(CustomerDeliveryAddress).filter(
        CustomerDeliveryAddress.customer_id == customer.id
    ).order_by(
        CustomerDeliveryAddress.is_default.desc(),
        CustomerDeliveryAddress.id.asc()
    ).all()

    # Nếu khách hàng chưa có điểm giao hàng nào trong bảng phụ, tự động tạo điểm mặc định từ thông tin khách
    if not addresses and customer.address:
        default_addr = CustomerDeliveryAddress(
            customer_id=customer.id,
            name="Trụ sở / Địa chỉ chính",
            receiver_name=customer.name,
            phone=customer.phone or "0900000000",
            address=customer.address,
            directions_note="Địa chỉ đăng ký doanh nghiệp ban đầu",
            is_default=True,
            status="active"
        )
        db.add(default_addr)
        db.commit()
        db.refresh(default_addr)
        addresses = [default_addr]

    return addresses


def get_address_by_id(db: Session, address_id: int) -> CustomerDeliveryAddress:
    addr = db.query(CustomerDeliveryAddress).filter(
        CustomerDeliveryAddress.id == address_id
    ).first()
    if not addr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy điểm giao hàng với ID #{address_id}."
        )
    return addr


def create_delivery_address(
    db: Session,
    customer_id: str,
    address_in: DeliveryAddressCreate,
    current_username: Optional[str] = None
) -> CustomerDeliveryAddress:
    customer = _get_customer(db, customer_id)
    existing_count = db.query(CustomerDeliveryAddress).filter(
        CustomerDeliveryAddress.customer_id == customer.id
    ).count()

    is_default = address_in.is_default
    if existing_count == 0:
        is_default = True
    elif is_default:
        # Hủy mặc định của các địa chỉ hiện có
        db.query(CustomerDeliveryAddress).filter(
            CustomerDeliveryAddress.customer_id == customer.id
        ).update({"is_default": False})

    data = address_in.model_dump(exclude_unset=True)
    data["customer_id"] = customer.id
    data["is_default"] = is_default

    new_addr = CustomerDeliveryAddress(**data)
    db.add(new_addr)
    db.commit()
    db.refresh(new_addr)

    # Ghi nhật ký hệ thống (SCRUM-442)
    try:
        log = AuditLog(
            entity_type="DELIVERY_ADDRESS",
            entity_id=str(new_addr.id),
            entity_name=f"{customer.name} - {new_addr.name}",
            action="CREATE",
            change_summary=f"Thêm điểm giao hàng '{new_addr.name}' cho đại lý {customer.name}",
            username=current_username or "system",
            new_values={
                "address": new_addr.address,
                "receiver": new_addr.receiver_name,
                "phone": new_addr.phone,
                "is_default": new_addr.is_default
            }
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    return new_addr


def update_delivery_address(
    db: Session,
    address_id: int,
    address_in: DeliveryAddressUpdate,
    current_username: Optional[str] = None
) -> CustomerDeliveryAddress:
    addr = get_address_by_id(db, address_id)
    update_data = address_in.model_dump(exclude_unset=True)

    if update_data.get("is_default") is True:
        # Bỏ mặc định các điểm khác của cùng khách hàng
        db.query(CustomerDeliveryAddress).filter(
            CustomerDeliveryAddress.customer_id == addr.customer_id,
            CustomerDeliveryAddress.id != addr.id
        ).update({"is_default": False})

    for key, value in update_data.items():
        setattr(addr, key, value)

    db.commit()
    db.refresh(addr)

    # Ghi audit log
    try:
        log = AuditLog(
            entity_type="DELIVERY_ADDRESS",
            entity_id=str(addr.id),
            entity_name=addr.name,
            action="UPDATE",
            change_summary=f"Cập nhật điểm giao hàng #{addr.id} ({addr.name})",
            username=current_username or "system",
            new_values=update_data
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    return addr


def set_default_address(
    db: Session,
    address_id: int,
    current_username: Optional[str] = None
) -> CustomerDeliveryAddress:
    addr = get_address_by_id(db, address_id)

    # Chuyển tất cả điểm của khách hàng này về False
    db.query(CustomerDeliveryAddress).filter(
        CustomerDeliveryAddress.customer_id == addr.customer_id
    ).update({"is_default": False})

    addr.is_default = True
    db.commit()
    db.refresh(addr)

    # Ghi audit log
    try:
        log = AuditLog(
            entity_type="DELIVERY_ADDRESS",
            entity_id=str(addr.id),
            entity_name=addr.name,
            action="SET_DEFAULT",
            change_summary=f"Đặt điểm giao hàng '{addr.name}' làm mặc định cho khách {addr.customer_id}",
            username=current_username or "system"
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    return addr


def delete_delivery_address(
    db: Session,
    address_id: int,
    current_username: Optional[str] = None
) -> bool:
    addr = get_address_by_id(db, address_id)
    customer_id = addr.customer_id
    was_default = addr.is_default

    db.delete(addr)
    db.commit()

    # Nếu điểm bị xóa đang là mặc định, chuyển điểm còn lại đầu tiên làm mặc định
    if was_default:
        remaining = db.query(CustomerDeliveryAddress).filter(
            CustomerDeliveryAddress.customer_id == customer_id
        ).first()
        if remaining:
            remaining.is_default = True
            db.commit()

    # Ghi audit log
    try:
        log = AuditLog(
            entity_type="DELIVERY_ADDRESS",
            entity_id=str(address_id),
            entity_name=f"Address #{address_id}",
            action="DELETE",
            change_summary=f"Xóa điểm giao hàng #{address_id} của khách {customer_id}",
            username=current_username or "system"
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    return True


def validate_delivery_address_for_customer(
    db: Session,
    customer_id: str,
    address_id: int
) -> CustomerDeliveryAddress:
    customer = _get_customer(db, customer_id)
    addr = db.query(CustomerDeliveryAddress).filter(
        CustomerDeliveryAddress.id == address_id,
        CustomerDeliveryAddress.customer_id == customer.id
    ).first()
    if not addr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Điểm giao hàng #{address_id} không thuộc về đại lý '{customer.name}' hoặc không tồn tại."
        )
    return addr
