from typing import List, Optional, Any, Dict
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.models.product import Product
from app.models.warehouse_stock import WarehouseStock
from app.models.inventory_adjustment import InventoryAdjustment
from app.schemas.stock_adjustment import (
    StockAdjustCreateSchema,
    StockAdjustRejectSchema,
    StockAdjustResponseSchema,
    StockAdjustItemSchema,
)

router = APIRouter(prefix="/stock-adjustments", tags=["Stock Adjustments"])


def _to_response_dict(adj: InventoryAdjustment) -> Dict[str, Any]:
    details: Dict[str, Any] = {}
    if adj.details:
        try:
            details = json.loads(adj.details)
        except Exception:
            details = {}

    items_data = details.get("items", [])
    if not items_data and adj.product_id:
        items_data = [
            {
                "productId": adj.product_id,
                "sku": details.get("sku", adj.product_id),
                "name": details.get("product_name", f"Sản phẩm {adj.product_id}"),
                "currentStock": details.get("currentStock", 0),
                "adjustQty": adj.quantity_adjusted,
                "costPrice": details.get("costPrice", 0.0),
                "lossValue": adj.loss_value,
                "note": adj.reason,
            }
        ]

    created_at_str = adj.created_at.isoformat() if adj.created_at else datetime.now().isoformat()
    adjust_date_str = details.get("adjustDate", created_at_str[:10])

    return {
        "id": str(adj.id),
        "code": adj.code,
        "warehouse": details.get("warehouse", f"Kho #{adj.warehouse_id}"),
        "adjustType": adj.adjustment_type.lower(),
        "adjustDate": adjust_date_str,
        "reason": adj.reason,
        "items": items_data,
        "status": adj.status.lower(),
        "totalLossQty": adj.quantity_adjusted,
        "totalLossValue": adj.loss_value,
        "createdBy": adj.created_by,
        "createdByName": details.get("createdByName", adj.created_by),
        "createdAt": created_at_str,
        "reviewedBy": adj.approved_by,
        "reviewedByName": details.get("reviewedByName", adj.approved_by),
        "reviewedAt": details.get("reviewedAt"),
        "rejectReason": details.get("rejectReason"),
        "attachmentUrl": details.get("attachmentUrl"),
        "note": details.get("note"),
    }


def _seed_initial_adjustments(db: Session):
    count = db.query(InventoryAdjustment).count()
    if count > 0:
        return

    # Lấy sản phẩm có sẵn
    prod = db.query(Product).first()
    p_id = prod.id if prod else "PRD-AE9B9D8E"
    p_name = prod.name if prod else "Samsung Galaxy S24 Ultra 256GB"
    p_sku = prod.sku if prod else "SS-S24U-256"

    # Tạo 1 phiếu đã duyệt
    items_1 = [
        {
            "productId": p_id,
            "sku": p_sku,
            "name": p_name,
            "currentStock": 25,
            "adjustQty": 1,
            "costPrice": 24000000,
            "lossValue": 24000000,
            "note": "Rơi vỡ móp góc khi dỡ kiện hàng",
        }
    ]
    adj_1 = InventoryAdjustment(
        code="DCXK-20261015-001",
        warehouse_id="1",
        product_id=p_id,
        adjustment_type="DAMAGED",
        quantity_adjusted=1,
        loss_value=24000000.0,
        reason="Hàng bị rơi vỡ móp cạnh trong quá trình bốc dỡ hàng tại sàn kho",
        created_by="wh_mgr",
        approved_by="admin",
        status="APPROVED",
        details=json.dumps({
            "warehouse": "Kho Tổng Hà Nội (WH-01)",
            "adjustDate": "2026-10-15",
            "createdByName": "Phạm Văn Trưởng Kho",
            "reviewedByName": "Trần Quản Trị Hệ Thống",
            "reviewedAt": "2026-10-15T14:30:00Z",
            "items": items_1,
        }, ensure_ascii=False)
    )

    # Tạo 1 phiếu chờ duyệt
    items_2 = [
        {
            "productId": p_id,
            "sku": p_sku,
            "name": p_name,
            "currentStock": 24,
            "adjustQty": 2,
            "costPrice": 24000000,
            "lossValue": 48000000,
            "note": "Bao bì rách, tem niêm phong bong tróc",
        }
    ]
    adj_2 = InventoryAdjustment(
        code="DCXK-20261017-002",
        warehouse_id="1",
        product_id=p_id,
        adjustment_type="LOST",
        quantity_adjusted=2,
        loss_value=48000000.0,
        reason="Phát hiện chênh lệch thiếu 2 đơn vị sau đợt kiểm kê định kỳ",
        created_by="warehouse",
        approved_by=None,
        status="PENDING",
        details=json.dumps({
            "warehouse": "Kho Tổng Hà Nội (WH-01)",
            "adjustDate": "2026-10-17",
            "createdByName": "Hoàng Văn Thủ Kho",
            "items": items_2,
        }, ensure_ascii=False)
    )

    db.add(adj_1)
    db.add(adj_2)
    db.commit()


@router.get("", response_model=List[Dict[str, Any]], summary="Lấy danh sách phiếu điều chỉnh tồn kho")
def get_adjustments(
    type: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    warehouse: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    _seed_initial_adjustments(db)
    query = db.query(InventoryAdjustment)

    if status_filter and status_filter.lower() != "all":
        query = query.filter(InventoryAdjustment.status == status_filter.upper())

    if type and type.lower() != "all":
        query = query.filter(InventoryAdjustment.adjustment_type == type.upper())

    records = query.order_by(InventoryAdjustment.id.desc()).all()
    results = [_to_response_dict(r) for r in records]

    # Lọc warehouse và search ở mức in-memory cho các trường metadata
    if warehouse and warehouse.lower() != "all":
        wh_q = warehouse.lower()
        results = [r for r in results if wh_q in r["warehouse"].lower()]

    if search and search.strip():
        sq = search.lower().strip()
        results = [
            r for r in results
            if sq in r["code"].lower()
            or sq in r["reason"].lower()
            or sq in r["createdByName"].lower()
        ]

    return results


@router.get("/{adj_id}", response_model=Dict[str, Any], summary="Xem chi tiết phiếu điều chỉnh tồn kho")
def get_adjustment_detail(
    adj_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    adj = db.query(InventoryAdjustment).filter(
        (InventoryAdjustment.id == adj_id) | (InventoryAdjustment.code == adj_id)
    ).first()
    if not adj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiếu điều chỉnh tồn kho.")
    return _to_response_dict(adj)


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED, summary="Tạo phiếu điều chỉnh tồn kho mới")
def create_adjustment(
    data: StockAdjustCreateSchema,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    total_loss_qty = sum(it.adjustQty for it in data.items)
    total_loss_val = sum(it.lossValue or (it.adjustQty * (it.costPrice or 0.0)) for it in data.items)

    now = datetime.now()
    date_str = now.strftime("%Y%m%d")
    code = data.code or f"DCXK-{date_str}-{int(now.timestamp()) % 1000:03d}"

    first_product_id = data.items[0].productId if data.items else "PRD-UNKNOWN"

    details = {
        "warehouse": data.warehouse,
        "adjustDate": data.adjustDate or now.strftime("%Y-%m-%d"),
        "createdByName": current_user.full_name or current_user.username,
        "items": [it.dict() for it in data.items],
        "attachmentUrl": data.attachmentUrl,
        "note": data.note,
    }

    adj = InventoryAdjustment(
        code=code,
        warehouse_id="1",
        product_id=first_product_id,
        adjustment_type=data.adjustType.upper(),
        quantity_adjusted=total_loss_qty,
        loss_value=total_loss_val,
        reason=data.reason,
        created_by=current_user.username,
        approved_by=None,
        status="PENDING",
        details=json.dumps(details, ensure_ascii=False),
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    return _to_response_dict(adj)


@router.patch("/{adj_id}/approve", response_model=Dict[str, Any], summary="Phê duyệt phiếu điều chỉnh tồn kho")
def approve_adjustment(
    adj_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    adj = db.query(InventoryAdjustment).filter(
        (InventoryAdjustment.id == adj_id) | (InventoryAdjustment.code == adj_id)
    ).first()
    if not adj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiếu điều chỉnh.")

    if adj.status == "APPROVED":
        return _to_response_dict(adj)

    adj.status = "APPROVED"
    adj.approved_by = current_user.username

    details: Dict[str, Any] = {}
    if adj.details:
        try:
            details = json.loads(adj.details)
        except Exception:
            details = {}

    details["reviewedByName"] = current_user.full_name or current_user.username
    details["reviewedAt"] = datetime.now().isoformat()
    adj.details = json.dumps(details, ensure_ascii=False)

    # Trừ tồn kho tương ứng
    for it in details.get("items", []):
        p_id = it.get("productId")
        adjust_qty = int(it.get("adjustQty", 0))
        if p_id and adjust_qty > 0:
            prod = db.query(Product).filter(Product.id == p_id).first()
            if prod:
                prod.stock = max(0, (prod.stock or 0) - adjust_qty)
            ws = db.query(WarehouseStock).filter(
                WarehouseStock.product_id == p_id,
                WarehouseStock.warehouse_id == 1,
            ).first()
            if ws:
                ws.physical_stock = max(0, (ws.physical_stock or 0) - adjust_qty)
                ws.available_stock = max(0, (ws.available_stock or 0) - adjust_qty)

    db.commit()
    db.refresh(adj)
    return _to_response_dict(adj)


@router.patch("/{adj_id}/reject", response_model=Dict[str, Any], summary="Từ chối phiếu điều chỉnh tồn kho")
def reject_adjustment(
    adj_id: str,
    body: StockAdjustRejectSchema,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    adj = db.query(InventoryAdjustment).filter(
        (InventoryAdjustment.id == adj_id) | (InventoryAdjustment.code == adj_id)
    ).first()
    if not adj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiếu điều chỉnh.")

    adj.status = "REJECTED"
    adj.approved_by = current_user.username

    details: Dict[str, Any] = {}
    if adj.details:
        try:
            details = json.loads(adj.details)
        except Exception:
            details = {}

    details["reviewedByName"] = current_user.full_name or current_user.username
    details["reviewedAt"] = datetime.now().isoformat()
    details["rejectReason"] = body.reason
    adj.details = json.dumps(details, ensure_ascii=False)

    db.commit()
    db.refresh(adj)
    return _to_response_dict(adj)
