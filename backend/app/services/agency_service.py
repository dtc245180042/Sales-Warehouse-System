from __future__ import annotations
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.customer import Customer

def get_agencies_service(
    db: Session,
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,          # SCRUM-472
    region: Optional[str] = None,          # SCRUM-471
    customer_group: Optional[str] = None,  # SCRUM-471
    assigned_person: Optional[str] = None, # SCRUM-471
    status: Optional[str] = None           # SCRUM-471
) -> Dict[str, Any]:
    query = db.query(Customer)

    # 1. Tìm kiếm nhanh (SCRUM-472)
    if search and search.strip():
        search_fmt = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Customer.code.ilike(search_fmt),
                Customer.name.ilike(search_fmt),
                Customer.phone.ilike(search_fmt)
            )
        )

    # 2. Lọc theo tiêu chí (SCRUM-471)
    if region and region.strip():
        query = query.filter(Customer.region.ilike(f"%{region.strip()}%"))
    if customer_group and customer_group.strip():
        query = query.filter(Customer.customer_group.ilike(f"%{customer_group.strip()}%"))
    if assigned_person and assigned_person.strip():
        query = query.filter(Customer.assigned_sales_rep.ilike(f"%{assigned_person.strip()}%"))
    if status and status.strip():
        query = query.filter(Customer.status == status.strip())

    total = query.count()
    offset = (page - 1) * limit
    customers = query.order_by(Customer.id.desc()).offset(offset).limit(limit).all()

    items = []
    for c in customers:
        items.append({
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "phone": c.phone,
            "email": c.email,
            "address": c.address,
            "region": c.region or "MienBac",
            "customer_group": c.customer_group or "TIER_1",
            "assigned_person": c.assigned_sales_rep or "sales_rep",
            "status": c.status or "active",
            "created_at": c.created_at,
            "updated_at": c.updated_at
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit
    }