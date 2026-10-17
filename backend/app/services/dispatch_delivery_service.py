import os
import uuid
from pathlib import Path
from typing import Optional, Tuple, List
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from fastapi import HTTPException, status

from app.models.auth import User
from app.models.order import Order
from app.models.product_lot import ProductLot
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, StockDispatchLot, DispatchStatus
from app.models.dispatch_delivery import (
    DispatchDelivery,
    DeliveryStatus,
    DeliveryFailureReason,
)
from app.schemas.dispatch_delivery import (
    DeliveryConfirmRequest,
    DeliveryFailedRequest,
)
from app.services.stock_ledger import record_stock_movement, StockMovementType

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROOF_UPLOAD_DIR = BASE_DIR / "uploads" / "delivery_proofs"
PROOF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_PROOF_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_PROOF_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


class DispatchDeliveryService:
    """
    Service quản lý xác nhận giao hàng & chứng từ POD (Proof of Delivery - S6-08 / SC-259).
    Nghiệp vụ cốt lõi:
    1. Xác nhận giao thành công kèm người nhận, thời điểm giao và ảnh biên bản có chữ ký (POD).
    2. Cập nhật số lượng thực giao (delivered_quantity) để liên kết điều kiện phát hành hóa đơn Sprint 7.
    3. Giao không thành công: chọn lý do thất bại, tự động hoàn trả hàng về kho và tồn lô.
    4. Cập nhật trạng thái đơn hàng tương ứng.
    """

    @classmethod
    def save_proof_file(
        cls,
        file_bytes: bytes,
        filename: str,
        content_type: Optional[str] = None
    ) -> Tuple[str, str, int]:
        """Lưu tệp ảnh biên bản giao nhận có chữ ký (POD)."""
        file_size = len(file_bytes)
        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tệp ảnh tải lên rỗng không có dữ liệu.",
            )
        if file_size > MAX_PROOF_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Kích thước tệp vượt quá giới hạn 5MB (hiện tại: {file_size:,} bytes).",
            )

        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_PROOF_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Định dạng tệp '{ext}' không hợp lệ. Chỉ chấp nhận các định dạng: JPG, PNG, WEBP, PDF.",
            )

        unique_id = uuid.uuid4().hex[:12]
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        saved_name = f"POD_{date_str}_{unique_id}{ext}"
        save_path = PROOF_UPLOAD_DIR / saved_name

        with open(save_path, "wb") as f:
            f.write(file_bytes)

        proof_image_url = f"/api/v1/dispatch-deliveries/proof-file/{saved_name}"
        return proof_image_url, str(save_path), file_size

    @classmethod
    def confirm_delivery_success(
        cls,
        db: Session,
        dispatch_id: str,
        payload: DeliveryConfirmRequest,
        current_user: User,
    ) -> DispatchDelivery:
        """
        Xác nhận giao hàng thành công kèm người nhận, thời điểm giao và ảnh chứng từ có chữ ký (S6-08).
        - Phiếu xuất chuyển trạng thái DELIVERED.
        - Kích hoạt điều kiện để Sprint 7 phát hành hóa đơn.
        """
        dispatch = db.query(StockDispatch).filter(StockDispatch.id == dispatch_id).first()
        if not dispatch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiếu xuất kho với mã '{dispatch_id}'.",
            )

        if dispatch.status == DeliveryStatus.DELIVERY_FAILED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Phiếu xuất kho '{dispatch_id}' đã bị ghi nhận giao thất bại và hoàn về kho. Không thể xác nhận giao thành công.",
            )

        clean_receiver = payload.receiver_name.strip()
        if not clean_receiver:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bắt buộc phải nhập họ tên người nhận hàng thực tế.",
            )

        if not payload.proof_image_url or not payload.proof_image_url.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bắt buộc phải tải lên ảnh biên bản giao nhận có chữ ký (chứng từ POD) để làm căn cứ đối soát.",
            )

        now_utc = datetime.now(timezone.utc)
        delivered_time = payload.delivered_at or now_utc

        delivery = db.query(DispatchDelivery).filter(DispatchDelivery.dispatch_id == dispatch_id).first()
        if not delivery:
            delivery = DispatchDelivery(
                dispatch_id=dispatch.id,
                order_id=dispatch.order_id,
                customer_id=dispatch.customer_id,
                customer_name=dispatch.customer_name,
                warehouse_id=dispatch.warehouse_id,
                warehouse_name=dispatch.warehouse_name,
                status=DeliveryStatus.DELIVERED.value,
                receiver_name=clean_receiver,
                receiver_phone=payload.receiver_phone,
                delivered_at=delivered_time,
                proof_image_url=payload.proof_image_url.strip(),
                confirmed_by=current_user.id if current_user else 1,
                confirmed_by_name=getattr(current_user, "full_name", None) or getattr(current_user, "username", "Admin"),
                notes=payload.notes,
            )
            db.add(delivery)
        else:
            delivery.status = DeliveryStatus.DELIVERED.value
            delivery.receiver_name = clean_receiver
            delivery.receiver_phone = payload.receiver_phone
            delivery.delivered_at = delivered_time
            delivery.proof_image_url = payload.proof_image_url.strip()
            delivery.confirmed_by = current_user.id if current_user else 1
            delivery.confirmed_by_name = getattr(current_user, "full_name", None) or getattr(current_user, "username", "Admin")
            delivery.notes = payload.notes
            delivery.updated_at = now_utc

        # Cập nhật trạng thái phiếu xuất kho sang DELIVERED (S6-08)
        dispatch.status = DeliveryStatus.DELIVERED.value

        # Ghi nhận số lượng thực giao trên từng dòng mặt hàng để Sprint 7 tính tiền đúng
        for itm in dispatch.items:
            itm.delivered_quantity = itm.dispatched_quantity

        # Cập nhật trạng thái đơn hàng
        order = db.query(Order).filter(Order.id == dispatch.order_id).first()
        if order:
            order.status = "DELIVERED"

        db.commit()
        db.refresh(delivery)
        return delivery

    @classmethod
    def record_delivery_failure(
        cls,
        db: Session,
        dispatch_id: str,
        payload: DeliveryFailedRequest,
        current_user: User,
    ) -> DispatchDelivery:
        """
        Xác nhận giao hàng thất bại, ghi nhận lý do và TỰ ĐỘNG HOÀN HÀNG VỀ KHO (S6-08).
        - Cộng lại tồn kho vật lý và ghi nhận sổ cái kho (IN_RETURN).
        - Cộng lại tồn của các lô đã xuất (ProductLot.remaining_quantity).
        - Phiếu xuất chuyển sang trạng thái DELIVERY_FAILED (chặn lập hóa đơn ở Sprint 7).
        """
        dispatch = db.query(StockDispatch).filter(StockDispatch.id == dispatch_id).first()
        if not dispatch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiếu xuất kho với mã '{dispatch_id}'.",
            )

        if dispatch.status == DeliveryStatus.DELIVERED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Phiếu xuất '{dispatch_id}' đã xác nhận giao thành công, không thể báo thất bại.",
            )

        if dispatch.status == DeliveryStatus.DELIVERY_FAILED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Phiếu xuất '{dispatch_id}' đã được xử lý giao thất bại và hoàn về kho trước đó.",
            )

        clean_reason = payload.failure_reason.strip()
        if not clean_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bắt buộc phải chọn hoặc nhập lý do giao hàng thất bại.",
            )

        now_utc = datetime.now(timezone.utc)
        user_id = current_user.id if current_user else 1
        user_name = getattr(current_user, "full_name", None) or getattr(current_user, "username", "Admin")

        # 1. TỰ ĐỘNG HOÀN TRẢ TOÀN BỘ HÀNG VỀ LẠI KHO XUẤT VÀ SỔ CÁI
        for d_item in dispatch.items:
            qty_to_return = d_item.dispatched_quantity
            if qty_to_return > 0:
                # Ghi nhận sổ cái kho IN_RETURN
                record_stock_movement(
                    db=db,
                    product_id=d_item.product_id,
                    warehouse_id=dispatch.warehouse_id,
                    quantity_base=qty_to_return,
                    movement_type=StockMovementType.IN_RETURN,
                    reference_code=dispatch.id,
                    line_ref=f"RETURN-{d_item.id}",
                    performer_id=user_id,
                    note=f"Hoàn kho do giao thất bại phiếu {dispatch.id}: {clean_reason}",
                    auto_commit=False,
                )

                # Hoàn lại số lượng tồn của từng lô đã xuất
                if hasattr(d_item, "lots") and d_item.lots:
                    for lot_entry in d_item.lots:
                        lot = db.query(ProductLot).filter(ProductLot.id == lot_entry.lot_id).first()
                        if lot:
                            lot.remaining_quantity += lot_entry.quantity
                            lot.updated_at = now_utc

        # 2. Tạo bản ghi DispatchDelivery
        delivery = db.query(DispatchDelivery).filter(DispatchDelivery.dispatch_id == dispatch_id).first()
        if not delivery:
            delivery = DispatchDelivery(
                dispatch_id=dispatch.id,
                order_id=dispatch.order_id,
                customer_id=dispatch.customer_id,
                customer_name=dispatch.customer_name,
                warehouse_id=dispatch.warehouse_id,
                warehouse_name=dispatch.warehouse_name,
                status=DeliveryStatus.DELIVERY_FAILED.value,
                failure_reason=clean_reason,
                failure_notes=payload.failure_notes,
                returned_to_warehouse=True,
                returned_warehouse_id=dispatch.warehouse_id,
                returned_at=now_utc,
                confirmed_by=user_id,
                confirmed_by_name=user_name,
                notes=payload.notes,
            )
            db.add(delivery)
        else:
            delivery.status = DeliveryStatus.DELIVERY_FAILED.value
            delivery.failure_reason = clean_reason
            delivery.failure_notes = payload.failure_notes
            delivery.returned_to_warehouse = True
            delivery.returned_warehouse_id = dispatch.warehouse_id
            delivery.returned_at = now_utc
            delivery.confirmed_by = user_id
            delivery.confirmed_by_name = user_name
            delivery.notes = payload.notes
            delivery.updated_at = now_utc

        # 3. Cập nhật trạng thái phiếu xuất kho
        dispatch.status = DeliveryStatus.DELIVERY_FAILED.value

        # 4. Cập nhật trạng thái đơn hàng
        order = db.query(Order).filter(Order.id == dispatch.order_id).first()
        if order:
            order.status = "DELIVERY_FAILED"

        db.commit()
        db.refresh(delivery)
        return delivery

    @classmethod
    def get_delivery_by_dispatch_id(
        cls,
        db: Session,
        dispatch_id: str,
    ) -> Optional[DispatchDelivery]:
        """Tra cứu thông tin xác nhận giao hàng và chứng từ POD của phiếu xuất."""
        return db.query(DispatchDelivery).filter(DispatchDelivery.dispatch_id == dispatch_id).first()
