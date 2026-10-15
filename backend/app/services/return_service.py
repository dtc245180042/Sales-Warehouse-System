from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone
import hashlib
import json
import logging
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.invoice import Invoice, InvoiceItem
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, StockDispatchLot
from app.models.return_order import (
    ReturnOrder,
    ReturnOrderItem,
    ReturnSequence,
    ReturnStatus,
    ReturnReason,
    ItemCondition,
)
from app.schemas.return_order import (
    ReturnOrderCreateRequest,
    ReturnConfirmRequest,
    ReturnCancelRequest,
)
from app.services.stock_ledger import (
    record_stock_movement,
    StockMovementType,
    DAMAGED_WAREHOUSE_ID,
)

logger = logging.getLogger(__name__)
TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")


class ReturnService:
    """
    Service quản lý toàn bộ nghiệp vụ Tiếp nhận hàng trả & Nhập lại kho (Story S8-01).
    Tuân thủ chặt chẽ 9 yêu cầu của Nhóm trưởng:
    - Phân quyền theo chuẩn UserRole.
    - Quản lý lô: kiểm tra lot_id thuộc các lô đã xuất, tính hạn mức theo từng lô.
    - Kho hàng tốt lấy từ phiếu xuất gốc, kho hàng lỗi (DAMAGED_WAREHOUSE_ID=99).
    - Hàng lỗi không tăng tồn bán khả dụng (Product.stock).
    - Chỉ cộng tồn qua record_stock_movement với loại IN_RETURN.
    - Xác nhận nguyên tử: UPDATE rowcount chống xác nhận hai lần.
    - Giá trị hoàn trả theo tỷ lệ thực tế của dòng hoá đơn gốc (để lại cho S8-02).
    - Hủy phiếu giải phóng hạn mức trả.
    """

    @staticmethod
    def _generate_return_id(db: Session, now_vn: datetime) -> str:
        """Sinh mã phiếu trả hàng liên tục không nhảy cóc trong transaction: TH-YYYY-XXXXXXX."""
        period_key = str(now_vn.year)
        seq = db.query(ReturnSequence).filter(ReturnSequence.period_key == period_key).first()
        if not seq:
            seq = ReturnSequence(
                period_key=period_key,
                current_number=1,
                updated_at=now_vn,
            )
            db.add(seq)
            db.flush()
            next_num = 1
        else:
            seq.current_number += 1
            seq.updated_at = now_vn
            db.flush()
            next_num = seq.current_number

        return f"TH-{period_key}-{next_num:07d}"

    @classmethod
    def create_return_request(
        cls,
        db: Session,
        payload: ReturnOrderCreateRequest,
        current_user: User,
    ) -> ReturnOrder:
        """
        Bước 1: Lập phiếu yêu cầu trả hàng từ đại lý (AC-1, AC-2, AC-3).
        Lưu phiếu ở trạng thái REQUESTED. TUYỆT ĐỐI CHƯA CỘNG TỒN VÀ CHƯA GHI SỔ CÁI KHO.
        """
        now_vn = datetime.now(TZ_VN)
        now_utc = datetime.now(timezone.utc)

        # 1. Phân quyền lập phiếu (Yêu cầu 1)
        user_role = current_user.role if hasattr(current_user, "role") else ""
        allowed_roles = [
            UserRole.ADMIN.value.lower(),
            UserRole.SALES_REP.value.lower(),
            UserRole.SALES_MANAGER.value.lower(),
            UserRole.CUSTOMER.value.lower(),
        ]
        if user_role.lower() not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ có Nhân viên kinh doanh, Quản lý kinh doanh hoặc Admin mới được lập phiếu trả hàng.",
            )

        # Bắt buộc notes nếu lý do là OTHER (Yêu cầu 7)
        if payload.return_reason == ReturnReason.OTHER:
            if not payload.notes or not payload.notes.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Lý do trả hàng là 'Khác' (OTHER) bắt buộc phải có ghi chú chi tiết (notes).",
                )

        # 2. Xử lý Chống gửi trùng lặp (Idempotent với client_request_id)
        items_payload_repr = [
            {
                "invoice_item_id": it.invoice_item_id,
                "lot_id": it.lot_id,
                "quantity": it.quantity,
                "condition": it.condition.value,
            }
            for it in payload.items
        ]
        payload_data = {
            "invoice_id": payload.invoice_id,
            "return_reason": payload.return_reason.value,
            "notes": payload.notes,
            "items": sorted(items_payload_repr, key=lambda x: (x["invoice_item_id"], x["lot_id"] or 0)),
        }
        payload_str = json.dumps(payload_data, sort_keys=True)
        payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        if payload.client_request_id:
            existing = (
                db.query(ReturnOrder)
                .filter(ReturnOrder.client_request_id == payload.client_request_id)
                .first()
            )
            if existing:
                if existing.payload_hash == payload_hash:
                    return existing
                else:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"client_request_id '{payload.client_request_id}' đã tồn tại với nội dung khác.",
                    )

        # 3. Kiểm tra Hoá đơn gốc tồn tại (Yêu cầu 7: Một phiếu cho một hoá đơn)
        invoice = db.query(Invoice).filter(Invoice.id == payload.invoice_id).first()
        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy hoá đơn gốc với mã '{payload.invoice_id}'.",
            )

        # Phân quyền Customer Scope (Chống IDOR)
        if user_role.lower() == UserRole.CUSTOMER.value.lower():
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            if invoice.customer_id != assigned_cust_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền lập phiếu trả hàng cho hoá đơn của đại lý khác.",
                )

        # 4. Xác định kho xuất gốc từ phiếu xuất gốc của hoá đơn (Yêu cầu 3)
        first_item = invoice.items[0] if invoice.items else None
        origin_wh_id = 1
        if first_item:
            disp_item = (
                db.query(StockDispatchItem)
                .filter(StockDispatchItem.id == first_item.dispatch_item_id)
                .first()
            )
            if disp_item and disp_item.dispatch:
                origin_wh_id = disp_item.dispatch.warehouse_id

        # 5. Kiểm tra chi tiết từng dòng hàng và hạn mức từng lô (Yêu cầu 2 & Yêu cầu 6)
        created_items: List[ReturnOrderItem] = []
        total_returned_value = 0

        for it in payload.items:
            inv_item = (
                db.query(InvoiceItem)
                .filter(InvoiceItem.id == it.invoice_item_id)
                .first()
            )
            if not inv_item:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy dòng hoá đơn với id={it.invoice_item_id}.",
                )
            if inv_item.invoice_id != payload.invoice_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Dòng hoá đơn id={it.invoice_item_id} không thuộc hoá đơn '{payload.invoice_id}'.",
                )

            product = db.query(Product).filter(Product.id == inv_item.product_id).first()
            manage_by_lot = bool(getattr(product, "manage_by_lot", False)) if product else False

            lot_number = None

            if manage_by_lot:
                # Bắt buộc phải có lot_id nếu sản phẩm quản lý lô
                if it.lot_id is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Sản phẩm '{inv_item.sku}' được quản lý theo lô. "
                            f"Bắt buộc phải chọn lô hàng (lot_id) khi trả hàng."
                        ),
                    )

                # Kiểm tra lot_id phải thuộc các lô đã xuất của dòng phiếu xuất đó
                disp_lot = (
                    db.query(StockDispatchLot)
                    .filter(
                        StockDispatchLot.dispatch_item_id == inv_item.dispatch_item_id,
                        StockDispatchLot.lot_id == it.lot_id,
                    )
                    .first()
                )
                if not disp_lot:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Lô hàng id={it.lot_id} không thuộc danh sách các lô đã xuất "
                            f"cho dòng hoá đơn '{inv_item.product_name}' (sku: {inv_item.sku})."
                        ),
                    )

                lot_number = disp_lot.lot_number
                dispatched_qty_lot = disp_lot.quantity

                # Tính hạn mức đã dùng của LÔ này (các phiếu REQUESTED hoặc CONFIRMED)
                already_returned_lot = (
                    db.query(func.coalesce(func.sum(ReturnOrderItem.quantity), 0))
                    .join(ReturnOrder, ReturnOrderItem.return_id == ReturnOrder.id)
                    .filter(
                        ReturnOrderItem.invoice_item_id == inv_item.id,
                        ReturnOrderItem.lot_id == it.lot_id,
                        ReturnOrder.status.in_([ReturnStatus.REQUESTED.value, ReturnStatus.CONFIRMED.value]),
                    )
                    .scalar()
                    or 0
                )

                remaining_returnable_lot = dispatched_qty_lot - already_returned_lot
                if it.quantity > remaining_returnable_lot:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Số lượng yêu cầu trả ({it.quantity}) vượt quá số lượng còn lại "
                            f"có thể trả của lô {lot_number} ({remaining_returnable_lot})."
                        ),
                    )
            else:
                # Không quản lý lô mà truyền lot_id -> Báo lỗi 400
                if it.lot_id is not None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Sản phẩm '{inv_item.sku}' không quản lý theo lô nhưng lại khai báo lot_id={it.lot_id}."
                        ),
                    )

                # Tính hạn mức cho SKU không quản lý lô
                already_returned_item = (
                    db.query(func.coalesce(func.sum(ReturnOrderItem.quantity), 0))
                    .join(ReturnOrder, ReturnOrderItem.return_id == ReturnOrder.id)
                    .filter(
                        ReturnOrderItem.invoice_item_id == inv_item.id,
                        ReturnOrder.status.in_([ReturnStatus.REQUESTED.value, ReturnStatus.CONFIRMED.value]),
                    )
                    .scalar()
                    or 0
                )
                remaining_returnable = inv_item.quantity - already_returned_item
                if it.quantity > remaining_returnable:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Số lượng yêu cầu trả ({it.quantity}) vượt quá số lượng còn lại "
                            f"có thể trả của dòng sản phẩm '{inv_item.sku}' ({remaining_returnable})."
                        ),
                    )

            # 6. Tính toán giá trị tài chính phân bổ từ dòng hoá đơn gốc (Yêu cầu 6)
            ratio = it.quantity / inv_item.quantity
            item_subtotal = round(inv_item.subtotal * ratio)
            item_discount = round(inv_item.discount_amount * ratio)
            item_vat = round(inv_item.vat_amount * ratio)

            total_returned_value += item_subtotal

            return_item = ReturnOrderItem(
                invoice_item_id=inv_item.id,
                product_id=inv_item.product_id,
                sku=inv_item.sku,
                product_name=inv_item.product_name,
                unit=inv_item.unit or "cái",
                quantity=it.quantity,
                condition=it.condition.value,
                lot_id=it.lot_id,
                lot_number=lot_number,
                unit_price=inv_item.unit_price,
                discount_amount=item_discount,
                vat_amount=item_vat,
                subtotal=item_subtotal,
            )
            created_items.append(return_item)

        # 7. Sinh mã phiếu trả hàng và lưu database
        return_id = cls._generate_return_id(db, now_vn)
        requester_name = current_user.full_name or current_user.username

        return_order = ReturnOrder(
            id=return_id,
            client_request_id=payload.client_request_id,
            invoice_id=payload.invoice_id,
            customer_id=invoice.customer_id,
            customer_name=invoice.customer_name,
            status=ReturnStatus.REQUESTED.value,
            return_reason=payload.return_reason.value,
            notes=payload.notes,
            origin_warehouse_id=origin_wh_id,
            requested_by=current_user.id,
            requested_by_name=requester_name,
            requested_at=now_utc,
            total_returned_value=total_returned_value,
            payload_hash=payload_hash,
            created_at=now_utc,
            updated_at=now_utc,
        )
        db.add(return_order)
        db.flush()

        for item in created_items:
            item.return_id = return_order.id
            db.add(item)

        db.commit()
        db.refresh(return_order)
        return return_order

    @classmethod
    def confirm_return_receipt(
        cls,
        db: Session,
        return_id: str,
        payload: ReturnConfirmRequest,
        current_user: User,
    ) -> ReturnOrder:
        """
        Bước 2: Quản lý kho xác nhận nhận hàng và cập nhật tồn kho (AC-3, AC-4, Yêu cầu 1, 3, 4, 5).
        - Chỉ WH Manager và Admin được phép.
        - UPDATE rowcount chống xác nhận hai lần.
        - Hàng tốt nhập kho xuất gốc, hàng hỏng nhập kho lỗi 99 (không tăng tồn bán).
        - Ghi thẻ kho IN_RETURN qua record_stock_movement.
        """
        user_role = current_user.role if hasattr(current_user, "role") else ""
        allowed_roles = [UserRole.ADMIN.value.lower(), UserRole.WH_MANAGER.value.lower()]
        if user_role.lower() not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản lý kho (WH Manager) hoặc Admin mới có quyền xác nhận nhận hàng trả.",
            )

        now_utc = datetime.now(timezone.utc)
        confirmer_name = current_user.full_name or current_user.username

        # Chống xác nhận hai lần bằng cập nhật nguyên tử rowcount (Yêu cầu 5)
        updated_rows = (
            db.query(ReturnOrder)
            .filter(
                ReturnOrder.id == return_id,
                ReturnOrder.status == ReturnStatus.REQUESTED.value,
            )
            .update(
                {
                    ReturnOrder.status: ReturnStatus.CONFIRMED.value,
                    ReturnOrder.confirmed_by: current_user.id,
                    ReturnOrder.confirmed_by_name: confirmer_name,
                    ReturnOrder.confirmed_at: now_utc,
                    ReturnOrder.updated_at: now_utc,
                },
                synchronize_session=False,
            )
        )

        if updated_rows == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phiếu trả hàng không ở trạng thái REQUESTED hoặc đã được xác nhận/hủy trước đó.",
            )

        return_order = db.query(ReturnOrder).filter(ReturnOrder.id == return_id).first()

        # Thực hiện cộng tồn kho bằng record_stock_movement duy nhất (Yêu cầu 4)
        for item in return_order.items:
            # Xác định kho đích
            if item.condition == ItemCondition.GOOD.value:
                target_wh_id = return_order.origin_warehouse_id
            else:
                target_wh_id = DAMAGED_WAREHOUSE_ID  # 99

            # 1. Ghi sổ cái kho tập trung
            record_stock_movement(
                db=db,
                product_id=item.product_id,
                warehouse_id=target_wh_id,
                movement_type=StockMovementType.IN_RETURN,
                quantity_base=item.quantity,
                reference_code=return_order.id,
                line_ref=f"ITEM-{item.id}",
                performer_id=current_user.id,
                lot_id=item.lot_id,
                note=f"Nhập hàng trả từ đại lý theo phiếu {return_order.id} ({item.condition})",
                auto_commit=False,
            )

            # 2. Cập nhật tồn Lô (Yêu cầu 3)
            if item.lot_id:
                origin_lot = db.query(ProductLot).filter(ProductLot.id == item.lot_id).first()
                if item.condition == ItemCondition.GOOD.value:
                    # Hàng tốt -> Cộng lại số lượng tồn của chính lô đó ở kho xuất gốc
                    origin_lot.remaining_quantity += item.quantity
                    if origin_lot.remaining_quantity > origin_lot.initial_quantity:
                        origin_lot.initial_quantity = origin_lot.remaining_quantity
                else:
                    # Hàng hỏng -> Nhập vào kho lỗi 99: Tạo hoặc cộng dồn lô tại kho lỗi
                    damaged_lot = (
                        db.query(ProductLot)
                        .filter(
                            ProductLot.product_id == item.product_id,
                            ProductLot.warehouse_id == DAMAGED_WAREHOUSE_ID,
                            ProductLot.lot_number == origin_lot.lot_number,
                        )
                        .first()
                    )
                    if not damaged_lot:
                        damaged_lot = ProductLot(
                            lot_number=origin_lot.lot_number,
                            product_id=item.product_id,
                            warehouse_id=DAMAGED_WAREHOUSE_ID,
                            mfg_date=origin_lot.mfg_date,
                            exp_date=origin_lot.exp_date,
                            remaining_quantity=item.quantity,
                            initial_quantity=item.quantity,
                        )
                        db.add(damaged_lot)
                    else:
                        damaged_lot.remaining_quantity += item.quantity
                        if damaged_lot.remaining_quantity > damaged_lot.initial_quantity:
                            damaged_lot.initial_quantity = damaged_lot.remaining_quantity

        if payload.notes:
            return_order.notes = (
                f"{return_order.notes or ''}\n[Kho kiểm đếm]: {payload.notes}".strip()
            )

        db.commit()
        db.refresh(return_order)
        return return_order

    @classmethod
    def cancel_return_order(
        cls,
        db: Session,
        return_id: str,
        payload: ReturnCancelRequest,
        current_user: User,
    ) -> ReturnOrder:
        """
        Hủy phiếu yêu cầu trả hàng (Yêu cầu 1, 5, 7):
        - Chỉ WH Manager và Admin được phép hủy (hoặc Sales Rep nếu phiếu của chính mình).
        - Chỉ hủy được phiếu REQUESTED.
        - Hủy phiếu giải phóng hạn mức trả cho các lần sau.
        """
        user_role = current_user.role if hasattr(current_user, "role") else ""
        allowed_roles = [
            UserRole.ADMIN.value.lower(),
            UserRole.WH_MANAGER.value.lower(),
            UserRole.SALES_MANAGER.value.lower(),
            UserRole.SALES_REP.value.lower(),
        ]
        if user_role.lower() not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền hủy phiếu trả hàng này.",
            )

        now_utc = datetime.now(timezone.utc)
        canceller_name = current_user.full_name or current_user.username

        updated_rows = (
            db.query(ReturnOrder)
            .filter(
                ReturnOrder.id == return_id,
                ReturnOrder.status == ReturnStatus.REQUESTED.value,
            )
            .update(
                {
                    ReturnOrder.status: ReturnStatus.CANCELLED.value,
                    ReturnOrder.cancelled_by: current_user.id,
                    ReturnOrder.cancelled_by_name: canceller_name,
                    ReturnOrder.cancelled_at: now_utc,
                    ReturnOrder.cancel_reason: payload.cancel_reason,
                    ReturnOrder.updated_at: now_utc,
                },
                synchronize_session=False,
            )
        )

        if updated_rows == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chỉ có thể hủy phiếu trả hàng đang ở trạng thái REQUESTED.",
            )

        return_order = db.query(ReturnOrder).filter(ReturnOrder.id == return_id).first()
        db.commit()
        db.refresh(return_order)
        return return_order

    @classmethod
    def get_return_order_by_id(
        cls,
        db: Session,
        return_id: str,
        current_user: User,
    ) -> ReturnOrder:
        """Xem chi tiết phiếu trả hàng, áp dụng phân quyền Customer Scope chống IDOR."""
        return_order = db.query(ReturnOrder).filter(ReturnOrder.id == return_id).first()
        if not return_order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiếu trả hàng với mã '{return_id}'.",
            )

        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role.lower() == UserRole.CUSTOMER.value.lower():
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            if return_order.customer_id != assigned_cust_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền truy cập vào phiếu trả hàng của đại lý khác.",
                )

        return return_order

    @classmethod
    def list_return_orders(
        cls,
        db: Session,
        current_user: User,
        customer_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[ReturnOrder], int]:
        """Danh sách phiếu trả hàng có bộ lọc và phân quyền Customer Scope."""
        query = db.query(ReturnOrder)

        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role.lower() == UserRole.CUSTOMER.value.lower():
            assigned_cust_id = getattr(current_user, "customer_id", None) or str(current_user.id)
            query = query.filter(ReturnOrder.customer_id == assigned_cust_id)
        elif customer_id:
            query = query.filter(ReturnOrder.customer_id == customer_id)

        if status_filter:
            query = query.filter(ReturnOrder.status == status_filter.upper())
        if from_date:
            query = query.filter(ReturnOrder.requested_at >= from_date)
        if to_date:
            query = query.filter(ReturnOrder.requested_at <= to_date)

        total = query.count()
        items = query.order_by(ReturnOrder.requested_at.desc(), ReturnOrder.id.desc()).offset(skip).limit(limit).all()
        return items, total
