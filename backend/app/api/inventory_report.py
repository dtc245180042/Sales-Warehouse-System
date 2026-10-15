# backend/app/api/inventory_report.py
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from typing import List, Optional
import io
from datetime import datetime
import pandas as pd

from app.schemas.reports import InventoryReportItem, SlowMovingThresholdConfig, InventoryReportFilter

router = APIRouter(prefix="/reports/inventory", tags=["Inventory Reports"])

def calculate_inventory_metrics(
    filters: InventoryReportFilter, 
    config: SlowMovingThresholdConfig
) -> List[InventoryReportItem]:
    raw_data = [
        {
            "sku": "SKU001", "product_name": "Sản phẩm A", "category_name": "Điện tử",
            "warehouse_id": "WH01", "warehouse_name": "Kho 1", "current_stock": 150,
            "unit_price": 100000.0, "avg_daily_sales": 2.5
        },
        {
            "sku": "SKU002", "product_name": "Sản phẩm B", "category_name": "Gia dụng",
            "warehouse_id": "WH01", "warehouse_name": "Kho 1", "current_stock": 50,
            "unit_price": 50000.0, "avg_daily_sales": 10.0
        }
    ]
    
    items = []
    for row in raw_data:
        avg_days = row["current_stock"] / row["avg_daily_sales"] if row["avg_daily_sales"] > 0 else 999.0
        is_slow = avg_days >= config.min_days
        stock_value = row["current_stock"] * row["unit_price"]
        
        priority = (1 if is_slow else 2) * 1000 + (100 - min(int(avg_days), 99))
        
        item = InventoryReportItem(
            sku=row["sku"],
            product_name=row["product_name"],
            category_name=row["category_name"],
            warehouse_id=row["warehouse_id"],
            warehouse_name=row["warehouse_name"],
            current_stock=row["current_stock"],
            stock_value=stock_value,
            avg_inventory_days=round(avg_days, 1),
            is_slow_moving=is_slow,
            priority_level=priority
        )
        items.append(item)

    if filters.warehouse_id:
        items = [i for i in items if i.warehouse_id == filters.warehouse_id]
    if filters.is_slow_moving is not None:
        items = [i for i in items if i.is_slow_moving == filters.is_slow_moving]
    if filters.sku:
        items = [i for i in items if filters.sku.lower() in i.sku.lower()]

    reverse = (filters.sort_order == "desc")
    if filters.sort_by == "avg_inventory_days":
        items.sort(key=lambda x: x.avg_inventory_days, reverse=reverse)
    elif filters.sort_by == "stock_value":
        items.sort(key=lambda x: x.stock_value, reverse=reverse)
        
    return items

@router.get("", response_model=List[InventoryReportItem])
def get_inventory_report(
    warehouse_id: Optional[str] = None,
    category_id: Optional[str] = None,
    sku: Optional[str] = None,
    is_slow_moving: Optional[bool] = None,
    threshold_days: int = Query(default=30, description="Ngưỡng ngày tính chậm luân chuyển"),
    sort_by: str = "avg_inventory_days",
    sort_order: str = "desc"
):
    filters = InventoryReportFilter(
        warehouse_id=warehouse_id, category_id=category_id, 
        sku=sku, is_slow_moving=is_slow_moving,
        sort_by=sort_by, sort_order=sort_order
    )
    config = SlowMovingThresholdConfig(min_days=threshold_days)
    return calculate_inventory_metrics(filters, config)

@router.get("/export-excel")
def export_inventory_report_excel(
    warehouse_id: Optional[str] = None,
    category_id: Optional[str] = None,
    sku: Optional[str] = None,
    is_slow_moving: Optional[bool] = None,
    threshold_days: int = 30
):
    # SCRUM-830: Áp dụng đúng các điều kiện lọc hiện tại
    filters = InventoryReportFilter(
        warehouse_id=warehouse_id,
        category_id=category_id,
        sku=sku,
        is_slow_moving=is_slow_moving
    )
    config = SlowMovingThresholdConfig(min_days=threshold_days)
    data = calculate_inventory_metrics(filters, config)
    
    # SCRUM-834: Định dạng mẫu Excel kế toán giữ các cột tồn kho tiêu chuẩn
    export_data = []
    for item in data:
        export_data.append({
            "Mã SKU": item.sku,
            "Tên sản phẩm": item.product_name,
            "Nhóm hàng": item.category_name,
            "Tên kho": item.warehouse_name,
            "Số lượng tồn": item.current_stock,
            "Giá trị tồn (VNĐ)": item.stock_value,
            "Số ngày tồn BQ": item.avg_inventory_days,
            "Chậm luân chuyển": "Có" if item.is_slow_moving else "Không"
        })
        
    df = pd.DataFrame(export_data)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Báo cáo tồn kho')
    output.seek(0)
    
    # SCRUM-831: Quy ước tên tệp chứa mã kho và ngày thực hiện xuất
    wh_code = warehouse_id if warehouse_id else "ALL"
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"Bao_Cao_Ton_Kho_{wh_code}_{date_str}.xlsx"
    
    headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
    return StreamingResponse(
        output, 
        headers=headers, 
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )