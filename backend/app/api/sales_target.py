from fastapi import APIRouter, HTTPException, Query, Header
from typing import List, Optional
from app.schemas.sales_target import (
    SalesTargetCreate, SalesTargetUpdate, 
    SalesTargetResponse, SalesProgressDashboard
)

router = APIRouter(prefix="/sales-targets", tags=["Sales Targets"])

# Giả lập database lưu trữ trong bộ nhớ tạm
db_targets = {}
db_audit_logs = []

@router.post("", response_model=SalesTargetResponse)
def create_sales_target(
    payload: SalesTargetCreate,
    user_role: str = Header(default="MANAGER") # SCRUM-801: Phân quyền
):
    if user_role != "MANAGER":
        raise HTTPException(status_code=403, detail="Chỉ quản lý kinh doanh mới có quyền lập chỉ tiêu")
    
    target_id = len(db_targets) + 1
    target = {
        "id": target_id,
        "employee_id": payload.employee_id,
        "region_code": payload.region_code,
        "month_year": payload.month_year,
        "target_amount": payload.target_amount,
        "is_locked": False
    }
    db_targets[target_id] = target
    return target

@router.put("/{target_id}", response_model=SalesTargetResponse)
def update_sales_target(
    target_id: int,
    payload: SalesTargetUpdate,
    user_role: str = Header(default="MANAGER"),
    user_id: str = Header(default="ADMIN")
):
    if user_role != "MANAGER":
        raise HTTPException(status_code=403, detail="Không có quyền chỉnh sửa chỉ tiêu")
    
    if target_id not in db_targets:
        raise HTTPException(status_code=404, detail="Không tìm thấy chỉ tiêu")
        
    target = db_targets[target_id]
    
    # SCRUM-798: Cơ chế khóa chỉ tiêu
    if target["is_locked"]:
        if not payload.reason:
            raise HTTPException(
                status_code=400, 
                detail="Chỉ tiêu đã bị khóa qua kỳ. Phải nhập lý do thay đổi để ghi nhật ký."
            )
        db_audit_logs.append({
            "target_id": target_id,
            "modified_by": user_id,
            "reason": payload.reason,
            "old_amount": target["target_amount"],
            "new_amount": payload.target_amount
        })
        
    target["target_amount"] = payload.target_amount
    return target

@router.get("/progress", response_model=List[SalesProgressDashboard])
def get_sales_progress(
    month_year: Optional[str] = None,
    year: Optional[int] = Query(default=None),
    month: Optional[int] = Query(default=None),
    region_code: Optional[str] = None,
    employee_id: Optional[str] = None,
    user_role: str = Header(default="EMPLOYEE"), # SCRUM-801
    current_user_id: str = Header(default="EMP001")
):
    results = []
    
    if not month_year and year and month:
        month_year = f"{year}-{month:02d}"
    
    # SCRUM-801: Quy tắc phân quyền xem tiến độ
    search_emp = employee_id
    if user_role == "EMPLOYEE":
        search_emp = current_user_id # Nhân viên chỉ xem tiến độ chính mình
        
    # Giả lập tính toán doanh số thực tế (SCRUM-800)
    mock_targets = [
        {"id": 1, "employee_id": "EMP001", "name": "Nguyễn Văn Bán Hàng", "region_code": "NORTH", "territory": "Khu vực Miền Bắc", "month_year": "2026-10", "target_amount": 100000000.0, "actual": 85000000.0},
        {"id": 2, "employee_id": "EMP002", "name": "Lê Thị Thu Thảo", "region_code": "SOUTH", "territory": "Khu vực Miền Nam", "month_year": "2026-10", "target_amount": 150000000.0, "actual": 160000000.0}
    ]
    
    for item in mock_targets:
        if month_year and item["month_year"] != month_year:
            continue
        if region_code and item["region_code"] != region_code:
            continue
        if search_emp and item["employee_id"] != search_emp:
            continue
            
        actual = item["actual"]
        target_amt = item["target_amount"]
        rate = round((actual / target_amt) * 100, 2) if target_amt > 0 else 0.0
        shortfall = max(0.0, target_amt - actual)
        
        results.append(SalesProgressDashboard(
            employee_id=item["employee_id"],
            region_code=item["region_code"],
            month_year=item["month_year"],
            target_amount=target_amt,
            actual_sales=actual,
            completion_rate=rate,
            shortfall_amount=shortfall,
            targetId=f"TGT-{item['id']}",
            scope="individual",
            userId=item["employee_id"],
            userName=item.get("name", item["employee_id"]),
            territory=item.get("territory", item["region_code"]),
            targetRevenue=target_amt,
            currentRevenue=actual,
            remainingRevenue=shortfall,
            revenuePercentage=rate,
            targetOrders=100,
            currentOrders=int(rate),
            ordersPercentage=rate,
            status="active"
        ))
        
    return results