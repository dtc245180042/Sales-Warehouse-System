from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.services.agency_service import get_agencies_service

router = APIRouter(prefix="/agencies", tags=["Đại lý (SCRUM-229)"])


@router.get("", summary="Lấy danh sách đại lý với tìm kiếm và lọc (SCRUM-229)")
@router.get("/", include_in_schema=False)
def get_agencies(
    page: int = Query(1, ge=1, description="Số trang"),
    limit: int = Query(10, ge=1, le=1000, description="Kích thước trang"),
    search: Optional[str] = Query(None, description="Tìm nhanh theo mã, tên hoặc SĐT"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực"),
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm khách hàng"),
    assigned_person: Optional[str] = Query(None, description="Lọc theo người phụ trách"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái"),
    db: Session = Depends(lay_phien_db),
) -> Dict[str, Any]:
    return get_agencies_service(
        db=db,
        page=page,
        limit=limit,
        search=search,
        region=region,
        customer_group=customer_group,
        assigned_person=assigned_person,
        status=status,
    )
