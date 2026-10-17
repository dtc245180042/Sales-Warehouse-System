# backend/app/api/inventory_report_s8.py
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
import pandas as pd
import io
from datetime import datetime

router = APIRouter(prefix="/reports/inventory-s8", tags=["Inventory Reports S8"])

@router.get("/export-excel")
def export_inventory_report_excel(
    warehouse_id: Optional[str] = None,
    category_id: Optional[str] = None,
    sku: Optional[str] = None,
    is_slow_moving: Optional[bool] = None,
    threshold_days: int = 30
):
    mock_data = [
        {
            "sku": "SKU001",
            "product_name": "Sản phẩm A",
            "category_name": "Điện tử",
            "warehouse_id": "WH01",
            "warehouse_name": "Kho 1",
            "current_stock": 150,
            "unit_price": 100000.0,
            "avg_daily_sales": 2.5
        },
        {
            "sku": "SKU002",
            "product_name": "Sản phẩm B",
            "category_name": "Gia dụng",
            "warehouse_id": "WH01",
            "warehouse_name": "Kho 1",
            "current_stock": 50,
            "unit_price": 50000.0,
            "avg_daily_sales": 10.0
        }
    ]

    # Ép kiểu số nguyên an toàn nếu tham số truyền vào là Query object từ FastAPI
    try:
        t_days = int(threshold_days)
    except (ValueError, TypeError):
        t_days = 30

    export_data = []
    w_id = str(warehouse_id) if warehouse_id and isinstance(warehouse_id, str) else None

    for item in mock_data:
        if w_id and item["warehouse_id"] != w_id:
            continue
            
        avg_days = item["current_stock"] / item["avg_daily_sales"] if item["avg_daily_sales"] > 0 else 999.0
        is_slow = avg_days >= t_days
        
        if is_slow_moving is not None and is_slow != is_slow_moving:
            continue

        export_data.append({
            "Mã SKU": item["sku"],
            "Tên sản phẩm": item["product_name"],
            "Nhóm hàng": item["category_name"],
            "Tên kho": item["warehouse_name"],
            "Số lượng tồn": item["current_stock"],
            "Giá trị tồn (VNĐ)": item["current_stock"] * item["unit_price"],
            "Số ngày tồn BQ": round(avg_days, 1),
            "Chậm luân chuyển": "Có" if is_slow else "Không"
        })

    if not export_data:
        raise HTTPException(status_code=404, detail="Không có dữ liệu tồn kho phù hợp")

    df = pd.DataFrame(export_data)
    output = io.BytesIO()

    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Báo cáo tồn kho')

    output.seek(0)
    wh_code = w_id if w_id else "ALL"
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"Bao Cao Ton Kho {wh_code} {date_str}.xlsx"

    headers = {'Content-Disposition': f'attachment; filename="{filename}"'}

    return StreamingResponse(
        output,
        headers=headers,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )