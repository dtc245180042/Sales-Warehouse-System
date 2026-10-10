from __future__ import annotations
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_

# Lưu ý: Nhớ import model Agency từ app.models của bạn
# from app.models.agency import Agency

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
    query = db.query(Agency)

    # 1. Tìm kiếm nhanh (SCRUM-472)
    if search:
        search_fmt = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Agency.code.ilike(search_fmt),
                Agency.name.ilike(search_fmt),
                Agency.phone.ilike(search_fmt)
            )
        )

    # 2. Lọc theo tiêu chí (SCRUM-471)
    if region:
        query = query.filter(Agency.region == region)
    if customer_group:
        query = query.filter(Agency.customer_group == customer_group)
    if assigned_person:
        query = query.filter(Agency.assigned_person == assigned_person)
    if status:
        query = query.filter(Agency.status == status)

    total = query.count()
    offset = (page - 1) * limit
    agencies = query.offset(offset).limit(limit).all()

    return {
        "items": agencies,
        "total": total,
        "page": page,
        "limit": limit
    }