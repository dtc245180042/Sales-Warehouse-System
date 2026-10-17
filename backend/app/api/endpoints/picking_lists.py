"""API phiếu soạn S6-03; router được tự động nạp bởi hệ thống."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import yeu_cau_vai_tro
from app.models.auth import User
from app.schemas.picking_list import (
    PickingCreate, PickingItemUpdate, PickingLocationWrite, PickingPreviewRequest, PickingStatusUpdate,
)
from app.services import picking_list_service as service

router = APIRouter(prefix="/picking-lists", tags=["Phiếu soạn hàng S6-03"])
warehouse_user = yeu_cau_vai_tro("Admin", "WH Manager", "Warehouse")


@router.get("/warehouses")
def list_warehouses(db: Session = Depends(lay_phien_db), user: User = Depends(warehouse_user)):
    return service.list_warehouses(db, user)


@router.get("/locations")
def list_locations(warehouse_id: int = Query(..., gt=0), db: Session = Depends(lay_phien_db),
                   user: User = Depends(warehouse_user)):
    return service.get_locations(db, user, warehouse_id)


@router.put("/locations/{warehouse_id}/{product_id}")
def save_location(warehouse_id: int, product_id: str, data: PickingLocationWrite,
                  db: Session = Depends(lay_phien_db), user: User = Depends(warehouse_user)):
    return service.save_location(db, user, warehouse_id, product_id, data)


@router.get("/eligible-orders")
def list_eligible_orders(warehouse_id: int = Query(..., gt=0), search: str = Query("", max_length=100),
                         page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                         db: Session = Depends(lay_phien_db), user: User = Depends(warehouse_user)):
    return service.eligible_orders(db, user, warehouse_id, search, page, page_size)


@router.post("/previews")
def preview(data: PickingPreviewRequest, db: Session = Depends(lay_phien_db), user: User = Depends(warehouse_user)):
    return service.preview(db, user, data)


@router.get("")
def list_picking_lists(warehouse_id: int = Query(..., gt=0), status: str | None = None,
                       search: str = Query("", max_length=100), page: int = Query(1, ge=1),
                       page_size: int = Query(20, ge=1, le=100), db: Session = Depends(lay_phien_db),
                       user: User = Depends(warehouse_user)):
    return service.list_sheets(db, user, warehouse_id, status, search, page, page_size)


@router.post("", status_code=201)
def create_picking_list(data: PickingCreate, db: Session = Depends(lay_phien_db),
                        user: User = Depends(warehouse_user)):
    return service.create_list(db, user, data)


@router.get("/{sheet_id}")
def picking_detail(sheet_id: str, db: Session = Depends(lay_phien_db), user: User = Depends(warehouse_user)):
    return service.detail(db, user, sheet_id)


@router.patch("/{sheet_id}")
def cancel_picking_list(sheet_id: str, data: PickingStatusUpdate, db: Session = Depends(lay_phien_db),
                        user: User = Depends(warehouse_user)):
    return service.cancel_list(db, user, sheet_id, data)


@router.patch("/{sheet_id}/items/{item_id}")
def update_picking_item(sheet_id: str, item_id: int, data: PickingItemUpdate,
                        db: Session = Depends(lay_phien_db), user: User = Depends(warehouse_user)):
    return service.update_item(db, user, sheet_id, item_id, data)


@router.get("/{sheet_id}/history")
def picking_history(sheet_id: str, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                     db: Session = Depends(lay_phien_db), user: User = Depends(warehouse_user)):
    return service.history(db, user, sheet_id, page, page_size)
