from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone
import random
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.auth import User
from app.models.order import Order, OrderItem
from app.models.order_status import OrderStatus, OrderStatusHistory
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.stock_reservation import StockReservation
from app.models.stock_dispatch import (
    StockDispatch,
    StockDispatchItem,
    StockDispatchLot,
    DispatchStatus,
)
from app.schemas.dispatch import (
    StockDispatchCreate,
    PendingOrderResponse,
    PendingShortfallItem,
)
from app.services.stock_ledger import (
    resolve_warehouse,
    record_stock_movement,
    StockMovementType,
    map_warehouse_name_to_id,
)
from app.services.lot_service import LotService
from app.services.fefo_service import FEFOService


class DispatchService:
    """
    Service quản lý toàn bộ nghiệp vụ Phiếu xuất kho (Stock Dispatch - S6-05).
    Đặc tả cốt lõi:
    - Trạng thái duy nhất: CONFIRMED (tạo và xác nhận atomic).
    - Toàn bộ thao tác (tạo phiếu, trừ lô, trừ tồn vật lý OUT_SALE, chuyển giữ chỗ, cập nhật đơn)
      phải nằm trong 1 transaction, nếu lỗi rollback sạch sẽ.
    - Chống bấm hai lần qua client_request_id.
    - Sinh mã phiếu PXK-YYYYMMDD-XXXX chống trùng với cơ chế retry loop.
    - Nợ hàng tính ở cấp ĐƠN. Cho phép xuất nhiều đợt nhưng chặn xuất vượt.
    - Tự động FEFO khi không truyền lô (chặn 400 nếu FEFO không đủ hàng).
    """

    @staticmethod
    def _generate_dispatch_id(db: Session) -> str:
        """
        Sinh mã phiếu xuất kho chuẩn: PXK-YYYYMMDD-XXXX.
        Sử dụng cơ chế Retry Loop (thử lại khi trùng khóa chính) thay vì count(*) + 1.
        """
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        for _ in range(10):
            # Tạo hậu tố 4 chữ số ngẫu nhiên / tuần tự
            rand_suffix = f"{random.randint(1, 9999):04d}"
            candidate_id = f"PXK-{date_str}-{rand_suffix}"
            exists = db.query(StockDispatch.id).filter(StockDispatch.id == candidate_id).first()
            if not exists:
                return candidate_id
        # Fallback an toàn nếu quá nhiều phiếu trong ngày
        fallback_suffix = f"{int(datetime.now(timezone.utc).timestamp()) % 1000000:06d}"
        return f"PXK-{date_str}-{fallback_suffix}"

    @classmethod
    def create_and_confirm_dispatch(
        cls,
        db: Session,
        payload: StockDispatchCreate,
        current_user: User,
    ) -> StockDispatch:
        """
        Tạo và xác nhận Phiếu xuất kho trong 1 transaction duy nhất (AC-1).
        """
        # 1. Chống bấm 2 lần qua client_request_id (AC-3)
        if payload.client_request_id:
            clean_client_id = payload.client_request_id.strip()
            existing_req = db.query(StockDispatch).filter(
                StockDispatch.client_request_id == clean_client_id
            ).first()
            if existing_req:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Yêu cầu xuất kho trùng lặp với client_request_id='{clean_client_id}' (Phiếu đã tạo: {existing_req.id}).",
                )

        # 2. Kiểm tra kho hàng hợp lệ
        wh_code, wh_name = resolve_warehouse(db, payload.warehouse_id)

        # 3. Kiểm tra đơn hàng tồn tại & hợp lệ
        order = db.query(Order).filter(
            or_(Order.id == payload.order_id, Order.code == payload.order_id)
        ).first()
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy đơn hàng với mã '{payload.order_id}'.",
            )

        order_status_clean = (order.status or "").upper()
        if order_status_clean == OrderStatus.CANCELLED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Đơn hàng '{order.id}' đã bị hủy, không thể xuất kho.",
            )

        # 4. Tính toán số lượng đã xuất trước đó của đơn hàng từ các phiếu CONFIRMED
        existing_dispatches = db.query(StockDispatch).filter(
            StockDispatch.order_id == str(order.id),
            StockDispatch.status == DispatchStatus.CONFIRMED.value
        ).all()

        prev_dispatched_map: Dict[str, int] = defaultdict(int)
        for d in existing_dispatches:
            for itm in d.items:
                prev_dispatched_map[str(itm.product_id)] += itm.dispatched_quantity

        # Lập map các dòng mặt hàng trong đơn
        order_items_by_prod: Dict[str, OrderItem] = {}
        for oi in order.items:
            order_items_by_prod[str(oi.product_id)] = oi
            if oi.sku:
                order_items_by_prod[oi.sku] = oi

        # Kiểm tra điều kiện trạng thái đơn: Phải là APPROVED, PACKING hoặc EXPORTED còn nợ
        total_ordered_in_order = sum(oi.quantity for oi in order.items)
        total_already_dispatched = sum(prev_dispatched_map[str(oi.product_id)] for oi in order.items)
        remaining_shortfall_total = max(0, total_ordered_in_order - total_already_dispatched)

        if remaining_shortfall_total == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Đơn hàng '{order.id}' đã được xuất kho đủ 100% ({total_already_dispatched}/{total_ordered_in_order}), không thể xuất thêm.",
            )

        valid_statuses = [
            OrderStatus.APPROVED.value,
            OrderStatus.PACKING.value,
            OrderStatus.EXPORTED.value,
            "APPROVED", "PACKING", "EXPORTED",
            "confirmed", "approved", "packing", "exported"
        ]
        if order_status_clean not in [s.upper() for s in valid_statuses]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Đơn hàng đang ở trạng thái '{order.status}'. Chỉ đơn hàng đã duyệt (APPROVED/PACKING/EXPORTED còn nợ) mới được xuất kho.",
            )

        # 5. Khởi tạo đối tượng phiếu xuất kho
        dispatch_id = cls._generate_dispatch_id(db)
        dispatch = StockDispatch(
            id=dispatch_id,
            client_request_id=payload.client_request_id.strip() if payload.client_request_id else None,
            order_id=str(order.id),
            customer_id=str(order.customer_id),
            customer_name=order.customer_name,
            customer_address=getattr(order, "customer_address", None) or getattr(order, "delivery_address", None),
            warehouse_id=payload.warehouse_id,
            warehouse_name=wh_name,
            status=DispatchStatus.CONFIRMED.value,
            delivery_type=payload.delivery_type,
            total_items=len(payload.items),
            total_dispatched_quantity=0,
            is_partial=False,
            has_shortfall=False,
            dispatched_by=current_user.id,
            dispatched_at=datetime.now(timezone.utc),
            notes=payload.notes,
            created_at=datetime.now(timezone.utc),
        )
        db.add(dispatch)
        db.flush()

        total_dispatch_qty = 0
        current_dispatch_qty_map: Dict[str, int] = defaultdict(int)

        # 6. Duyệt và xử lý từng dòng sản phẩm trong phiếu xuất
        for idx, item_req in enumerate(payload.items, start=1):
            target_prod = db.query(Product).filter(
                or_(Product.id == item_req.product_id, Product.sku == item_req.product_id)
            ).first()
            if not target_prod:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy sản phẩm có mã '{item_req.product_id}'.",
                )

            # Khớp sản phẩm với đơn hàng
            matched_oi = order_items_by_prod.get(str(target_prod.id)) or order_items_by_prod.get(target_prod.sku)
            if not matched_oi:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sản phẩm '{target_prod.name}' (SKU: {target_prod.sku}) không thuộc đơn hàng '{order.id}'.",
                )

            prod_id_str = str(target_prod.id)
            ordered_qty = matched_oi.quantity
            prev_dispatched_qty = prev_dispatched_map[prod_id_str]
            remaining_to_dispatch = max(0, ordered_qty - prev_dispatched_qty)

            if item_req.dispatched_quantity > remaining_to_dispatch:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Sản phẩm '{target_prod.name}' yêu cầu xuất {item_req.dispatched_quantity} "
                        f"vượt quá số lượng còn lại chưa giao ({remaining_to_dispatch} cái). "
                        f"(Đã đặt: {ordered_qty}, đã xuất các đợt trước: {prev_dispatched_qty})."
                    ),
                )

            shortfall_qty = remaining_to_dispatch - item_req.dispatched_quantity
            current_dispatch_qty_map[prod_id_str] += item_req.dispatched_quantity
            total_dispatch_qty += item_req.dispatched_quantity

            # Tạo bản ghi dòng phiếu xuất
            dispatch_item = StockDispatchItem(
                dispatch_id=dispatch.id,
                product_id=prod_id_str,
                sku=target_prod.sku,
                product_name=target_prod.name,
                ordered_quantity=ordered_qty,
                dispatched_quantity=item_req.dispatched_quantity,
                shortfall_quantity=shortfall_qty,
                lot_override_reason=item_req.lot_override_reason,
            )
            db.add(dispatch_item)
            db.flush()

            # 7. Xử lý Lô & FEFO cho sản phẩm
            if getattr(target_prod, "manage_by_lot", False):
                lots_to_deduct: List[Tuple[int, str, int, Optional[str], Optional[str]]] = []

                if item_req.lots and len(item_req.lots) > 0:
                    # A. Người dùng truyền danh sách lô chỉ định
                    sum_lots_qty = sum(l.quantity for l in item_req.lots)
                    if sum_lots_qty != item_req.dispatched_quantity:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Tổng số lượng các lô ({sum_lots_qty}) không bằng số lượng xuất "
                                f"({item_req.dispatched_quantity}) của sản phẩm '{target_prod.name}'."
                            ),
                        )

                    # Kiểm tra FEFO suggestion để xác định có override không
                    fefo_suggestion = FEFOService.suggest_lots_fefo(
                        db=db,
                        product_id=target_prod.id,
                        warehouse_id=payload.warehouse_id,
                        requested_quantity=item_req.dispatched_quantity,
                    )
                    suggested_lot_ids = set(item.lot_id for item in fefo_suggestion.suggested_lots)
                    selected_lot_ids = set(l.lot_id for l in item_req.lots)

                    is_overridden = (selected_lot_ids != suggested_lot_ids)
                    if is_overridden and not (item_req.lot_override_reason and item_req.lot_override_reason.strip()):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Bắt buộc nhập lý do ghi đè (lot_override_reason) khi chọn tập lô khác gợi ý FEFO cho sản phẩm '{target_prod.name}'.",
                        )

                    # Kiểm tra hợp lệ từng lô được chỉ định
                    for l_in in item_req.lots:
                        lot_db = db.query(ProductLot).filter(ProductLot.id == l_in.lot_id).first()
                        if not lot_db:
                            raise HTTPException(
                                status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Không tìm thấy lô hàng với ID={l_in.lot_id}.",
                            )
                        # Kiểm tra hạn dùng & vai trò
                        LotService.check_lot_dispatch_validity(
                            db=db,
                            lot_id=l_in.lot_id,
                            current_user=current_user,
                            override_reason=l_in.expiry_override_reason,
                        )
                        lots_to_deduct.append((
                            lot_db.id,
                            lot_db.lot_number,
                            l_in.quantity,
                            l_in.expiry_override_reason,
                            l_in.lot_override_reason or item_req.lot_override_reason
                        ))
                else:
                    # B. Không truyền danh sách lô -> Tự động gợi ý FEFO
                    fefo_suggestion = FEFOService.suggest_lots_fefo(
                        db=db,
                        product_id=target_prod.id,
                        warehouse_id=payload.warehouse_id,
                        requested_quantity=item_req.dispatched_quantity,
                    )
                    if fefo_suggestion.shortfall > 0:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Kho '{wh_name}' không đủ tồn các lô còn hạn để xuất đủ {item_req.dispatched_quantity} "
                                f"sản phẩm '{target_prod.name}' theo FEFO (Thiếu {fefo_suggestion.shortfall} cái). "
                                f"Hệ thống không tự ý xuất thiếu khi chạy tự động FEFO."
                            ),
                        )

                    for s_lot in fefo_suggestion.suggested_lots:
                        lots_to_deduct.append((
                            s_lot.lot_id,
                            s_lot.lot_number,
                            s_lot.allocated_quantity,
                            None,
                            None
                        ))

                # Thực hiện trừ tồn lô nguyên tử và ghi nhận chi tiết lô
                for lot_id, lot_num, lot_qty, exp_override, lot_override in lots_to_deduct:
                    FEFOService.deduct_lot_stock_atomic(db=db, lot_id=lot_id, quantity=lot_qty)

                    dispatch_lot = StockDispatchLot(
                        dispatch_item_id=dispatch_item.id,
                        lot_id=lot_id,
                        lot_number=lot_num,
                        quantity=lot_qty,
                        expiry_override_reason=exp_override,
                        lot_override_reason=lot_override,
                    )
                    db.add(dispatch_lot)

                    # Ghi bút toán sổ cái OUT_SALE cho từng lô
                    record_stock_movement(
                        db,
                        product_id=target_prod.id,
                        warehouse_id=payload.warehouse_id,
                        quantity_base=lot_qty,
                        movement_type=StockMovementType.OUT_SALE,
                        reference_code=dispatch.id,
                        line_ref=f"ITEM-{idx}-LOT-{lot_id}",
                        performer_id=current_user.id,
                        note=f"Xuất kho đơn hàng {order.id}",
                        lot_id=lot_id,
                        auto_commit=False,
                    )
            else:
                # C. Sản phẩm KHÔNG quản lý theo lô
                if item_req.lots and len(item_req.lots) > 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Sản phẩm '{target_prod.name}' không quản lý theo lô, không được truyền danh sách lô.",
                    )
                # Ghi bút toán sổ cái OUT_SALE trực tiếp
                record_stock_movement(
                    db,
                    product_id=target_prod.id,
                    warehouse_id=payload.warehouse_id,
                    quantity_base=item_req.dispatched_quantity,
                    movement_type=StockMovementType.OUT_SALE,
                    reference_code=dispatch.id,
                    line_ref=f"ITEM-{idx}",
                    performer_id=current_user.id,
                    note=f"Xuất kho đơn hàng {order.id}",
                    auto_commit=False,
                )

            # 8. Xử lý giữ chỗ StockReservation (Chống trừ trùng tồn khả dụng)
            active_res = db.query(StockReservation).filter(
                StockReservation.order_id == str(order.id),
                StockReservation.status == "active",
                or_(StockReservation.product_id == prod_id_str, StockReservation.sku == target_prod.sku)
            ).all()

            remaining_qty_to_fulfill = item_req.dispatched_quantity
            for res_row in active_res:
                if remaining_qty_to_fulfill <= 0:
                    break

                res_wh_id = map_warehouse_name_to_id(db, res_row.warehouse)
                if res_wh_id == payload.warehouse_id or res_row.warehouse == wh_name:
                    # Giữ chỗ đúng kho xuất: Hoàn tất phần đã xuất
                    if res_row.reserved_quantity <= remaining_qty_to_fulfill:
                        remaining_qty_to_fulfill -= res_row.reserved_quantity
                        res_row.status = "fulfilled"
                        res_row.updated_at = datetime.now(timezone.utc)
                    else:
                        # Xuất 1 phần của bản ghi giữ chỗ: giảm reserved_quantity phần còn lại, tạo fulfilled cho phần xuất
                        deducted_portion = remaining_qty_to_fulfill
                        res_row.reserved_quantity -= deducted_portion
                        res_row.updated_at = datetime.now(timezone.utc)
                        remaining_qty_to_fulfill = 0

                        partially_fulfilled_res = StockReservation(
                            order_id=str(order.id),
                            order_code=order.code,
                            product_id=res_row.product_id,
                            sku=res_row.sku,
                            warehouse=res_row.warehouse,
                            reserved_quantity=deducted_portion,
                            status="fulfilled",
                            note=f"Xuất kho một phần theo phiếu {dispatch.id}"
                        )
                        db.add(partially_fulfilled_res)
                else:
                    # Kho xuất khác kho giữ chỗ: Nhả giữ chỗ ở kho cũ để phục hồi khả dụng cho kho đó
                    res_row.status = "released"
                    res_row.note = (res_row.note or "") + f" [Nhả giữ chỗ do xuất từ kho ID {payload.warehouse_id}]"
                    res_row.updated_at = datetime.now(timezone.utc)

        # 9. Cập nhật tổng số lượng và cờ nợ hàng của phiếu xuất
        dispatch.total_dispatched_quantity = total_dispatch_qty

        # Kiểm tra xem đơn hàng còn dòng nào nợ hàng không
        is_order_fully_dispatched = True
        for oi in order.items:
            prod_id_k = str(oi.product_id)
            total_after_this = prev_dispatched_map[prod_id_k] + current_dispatch_qty_map[prod_id_k]
            if total_after_this < oi.quantity:
                is_order_fully_dispatched = False
                break

        dispatch.is_partial = not is_order_fully_dispatched
        dispatch.has_shortfall = not is_order_fully_dispatched

        # 10. Cập nhật trạng thái đơn hàng sang EXPORTED
        old_order_status = order.status
        order.status = OrderStatus.EXPORTED.value
        order.updated_at = datetime.now(timezone.utc)

        # Ghi nhật ký trạng thái đơn hàng
        history_log = OrderStatusHistory(
            order_id=order.id,
            from_status=old_order_status,
            to_status=OrderStatus.EXPORTED.value,
            changed_by=f"User #{current_user.id} ({getattr(current_user, 'full_name', '') or current_user.username})",
            changed_at=datetime.now(timezone.utc),
            note=f"Xuất kho phiếu {dispatch.id} ({'Xuất đủ' if is_order_fully_dispatched else 'Xuất một phần - Còn nợ hàng'})"
        )
        db.add(history_log)

        # 11. Cam kết Transaction
        try:
            db.commit()
            db.refresh(dispatch)
            return dispatch
        except IntegrityError as ie:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Xảy ra xung đột dữ liệu hoặc trùng lặp mã phiếu/request: {str(ie)}",
            )
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi hệ thống khi tạo phiếu xuất kho: {str(e)}",
            )

    @classmethod
    def get_dispatch_by_id(cls, db: Session, dispatch_id: str) -> StockDispatch:
        """Tra cứu chi tiết một phiếu xuất kho."""
        dispatch = db.query(StockDispatch).filter(StockDispatch.id == dispatch_id).first()
        if not dispatch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiếu xuất kho với mã '{dispatch_id}'.",
            )
        return dispatch

    @classmethod
    def list_dispatches(
        cls,
        db: Session,
        status_filter: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        order_id: Optional[str] = None,
        customer_id: Optional[str] = None,
        is_partial: Optional[bool] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[StockDispatch], int]:
        """Danh sách phiếu xuất kho có phân trang và bộ lọc."""
        query = db.query(StockDispatch)
        if status_filter:
            query = query.filter(StockDispatch.status == status_filter.upper())
        if warehouse_id:
            query = query.filter(StockDispatch.warehouse_id == warehouse_id)
        if order_id:
            query = query.filter(StockDispatch.order_id == order_id)
        if customer_id:
            query = query.filter(StockDispatch.customer_id == customer_id)
        if is_partial is not None:
            query = query.filter(StockDispatch.is_partial == is_partial)

        total = query.count()
        items = query.order_by(StockDispatch.created_at.desc()).offset(skip).limit(limit).all()
        return items, total

    @classmethod
    def get_pending_shortfall_orders(
        cls,
        db: Session,
        warehouse_id: Optional[int] = None,
    ) -> List[PendingOrderResponse]:
        """
        Tra cứu danh sách các đơn hàng còn nợ hàng (Shortfall > 0) cấp đơn (AC-2).
        Đơn hàng thỏa mãn:
        - Trạng thái trong (APPROVED, PACKING, EXPORTED).
        - Tổng số lượng đã xuất của các phiếu CONFIRMED < Tổng số lượng đặt.
        """
        eligible_statuses = [
            OrderStatus.APPROVED.value,
            OrderStatus.PACKING.value,
            OrderStatus.EXPORTED.value,
            "APPROVED", "PACKING", "EXPORTED",
            "approved", "packing", "exported", "confirmed"
        ]
        orders = db.query(Order).filter(
            func.upper(Order.status).in_([s.upper() for s in eligible_statuses])
        ).all()

        results: List[PendingOrderResponse] = []

        for ord_obj in orders:
            # Lấy tất cả phiếu CONFIRMED của đơn
            conf_dispatches = db.query(StockDispatch).filter(
                StockDispatch.order_id == str(ord_obj.id),
                StockDispatch.status == DispatchStatus.CONFIRMED.value
            ).all()

            if warehouse_id:
                # Nếu có lọc kho, chỉ xét các phiếu thuộc kho hoặc đơn phục vụ tại kho đó
                pass

            dispatched_map: Dict[str, int] = defaultdict(int)
            for d in conf_dispatches:
                for itm in d.items:
                    dispatched_map[str(itm.product_id)] += itm.dispatched_quantity

            shortfall_items: List[PendingShortfallItem] = []
            total_ordered = 0
            total_dispatched = 0

            for oi in ord_obj.items:
                pid = str(oi.product_id)
                o_qty = oi.quantity
                d_qty = dispatched_map[pid]
                total_ordered += o_qty
                total_dispatched += d_qty

                if d_qty < o_qty:
                    shortfall_items.append(PendingShortfallItem(
                        product_id=pid,
                        sku=oi.sku or "",
                        product_name=oi.name or "",
                        ordered_quantity=o_qty,
                        dispatched_quantity=d_qty,
                        remaining_shortfall=o_qty - d_qty,
                    ))

            if len(shortfall_items) > 0:
                results.append(PendingOrderResponse(
                    order_id=str(ord_obj.id),
                    order_code=ord_obj.code,
                    customer_id=str(ord_obj.customer_id),
                    customer_name=ord_obj.customer_name,
                    order_status=ord_obj.status,
                    total_ordered=total_ordered,
                    total_dispatched=total_dispatched,
                    total_shortfall=total_ordered - total_dispatched,
                    shortfall_items=shortfall_items,
                ))

        return results
