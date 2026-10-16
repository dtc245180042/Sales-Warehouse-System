# backend/app/api/multi_dimension_sales.py
from fastapi import APIRouter, Query, HTTPException, Header
from fastapi.responses import StreamingResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import pandas as pd
import io

router = APIRouter(prefix="/reports/multi-dimension-sales", tags=["Multi Dimension Sales Reports"])

class MultiDimensionSalesItem(BaseModel):
    dimension_type: str
    dimension_value: str
    revenue: float
    quantity: int
    cogs: float
    gross_profit: Optional[float] = None  # Chỉ hiện khi là MANAGER
    gross_margin_pct: Optional[float] = None # Chỉ hiện khi là MANAGER
    
    # So sánh cùng kỳ
    prev_revenue: float
    revenue_growth_amount: float
    revenue_growth_pct: float

mock_sales_data = [
    {
        "employee_id": "EMP001",
        "region_code": "NORTH",
        "agency_id": "AG01",
        "category_name": "Điện tử",
        "sku": "SKU001",
        "quantity": 100,
        "revenue": 100000000.0,
        "cogs": 70000000.0,
        "prev_revenue": 80000000.0
    },
    {
        "employee_id": "EMP002",
        "region_code": "SOUTH",
        "agency_id": "AG02",
        "category_name": "Gia dụng",
        "sku": "SKU002",
        "quantity": 50,
        "revenue": 50000000.0,
        "cogs": 30000000.0,
        "prev_revenue": 60000000.0
    }
]

@router.get("", response_model=List[MultiDimensionSalesItem])
def get_multi_dimension_sales_report(
    dimension: str = Query("employee", description="Chiều nhóm: employee, region, agency, category, sku"),
    user_role: str = Header(default="STAFF")
):
    dim_key_map = {
        "employee": "employee_id",
        "region": "region_code",
        "agency": "agency_id",
        "category": "category_name",
        "sku": "sku"
    }

    if dimension not in dim_key_map:
        raise HTTPException(status_code=400, detail="Chiều nhóm không hợp lệ")

    key = dim_key_map[dimension]
    is_manager = str(user_role).upper() == "MANAGER"

    grouped: Dict[str, Dict[str, Any]] = {}
    for item in mock_sales_data:
        val = item[key]
        if val not in grouped:
            grouped[val] = {"quantity": 0, "revenue": 0.0, "cogs": 0.0, "prev_revenue": 0.0}
        grouped[val]["quantity"] += item["quantity"]
        grouped[val]["revenue"] += item["revenue"]
        grouped[val]["cogs"] += item["cogs"]
        grouped[val]["prev_revenue"] += item["prev_revenue"]

    results = []
    for val, d in grouped.items():
        rev = d["revenue"]
        prev_rev = d["prev_revenue"]
        diff = rev - prev_rev
        growth_pct = round((diff / prev_rev) * 100, 1) if prev_rev > 0 else 0.0

        gp = None
        gm_pct = None
        if is_manager:
            gp = rev - d["cogs"]
            gm_pct = round((gp / rev) * 100, 1) if rev > 0 else 0.0

        results.append(MultiDimensionSalesItem(
            dimension_type=dimension,
            dimension_value=val,
            revenue=rev,
            quantity=d["quantity"],
            cogs=d["cogs"],
            gross_profit=gp,
            gross_margin_pct=gm_pct,
            prev_revenue=prev_rev,
            revenue_growth_amount=diff,
            revenue_growth_pct=growth_pct
        ))

    return results

@router.get("/export-excel")
def export_multi_dimension_sales_excel(
    dimension: str = Query("employee", description="Chiều nhóm"),
    user_role: str = Header(default="STAFF")
):
    data = get_multi_dimension_sales_report(dimension=dimension, user_role=user_role)
    is_manager = str(user_role).upper() == "MANAGER"

    rows = []
    for item in data:
        row = {
            "Chiều nhóm": item.dimension_type,
            "Giá trị": item.dimension_value,
            "Sản lượng": item.quantity,
            "Doanh số": item.revenue,
            "Doanh số cùng kỳ": item.prev_revenue,
            "Chênh lệch (+/-)": item.revenue_growth_amount,
            "Tăng trưởng (%)": item.revenue_growth_pct
        }
        if is_manager:
            row["Lợi nhuận gộp"] = item.gross_profit
            row["Biên lợi nhuận (%)"] = item.gross_margin_pct
        rows.append(row)

    df = pd.DataFrame(rows)
    output = io.BytesIO()

    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Doanh_So_Da_Chieu')

    output.seek(0)
    filename = f"Bao_Cao_Doanh_So_{dimension}.xlsx"
    headers = {'Content-Disposition': f'attachment; filename="{filename}"'}

    return StreamingResponse(
        output,
        headers=headers,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )