from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone, timedelta
import random
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_, and_, func
from fastapi import HTTPException, status

from app.models.auth import User
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.stock_dispatch import StockDispatch, StockDispatchItem, DispatchStatus
from app.models.delivery_trip import (
    DeliveryTrip,
    DeliveryTripPoint,
    DeliveryTripPointItem,
    TripStatus,
    PointStatus,
    ItemTransitStatus,
)
from app.schemas.delivery_trip import (
    DeliveryTripCreate,
    PointDeliveryResultRequest,
    InTransitSummaryResponse,
)
from app.services.stock_ledger import resolve_warehouse


class DeliveryTripService:
    """
    Service quản lý toàn bộ nghiệp vụ Theo dõi Chuyến giao hàng & Hàng trên đường (S6-07 - SC-258).
    Đặc tả nghiệp vụ cốt lõi:
    1. Theo dõi các chuyến giao đang chạy, số điểm đã giao, số điểm còn lại, thời gian dự kiến.
    2. Tính toán chính xác tổng tiền hàng đang nằm trên đường (in_transit_value).
    3. Cảnh báo chuyến giao quá thời gian dự kiến (is_delayed, delay_minutes, delay_warning, delay_level).
    4. Cập nhật kết quả giao từng điểm và tự động đồng bộ tiến độ toàn chuyến.
    5. QUY TẮC CỐT LÕI: Hàng chưa giao xong vẫn thuộc trách nhiệm của chuyến giao, KHÔNG tự động trả về kho vật lý.
    """

    @staticmethod
    def _generate_trip_id(db: Session) -> str:
        """Sinh mã chuyến giao hàng chuẩn: TRIP-YYYYMMDD-XXXX chống trùng với Retry Loop."""
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        for _ in range(10):
            rand_suffix = f"{random.randint(1, 9999):04d}"
            candidate_id = f"TRIP-{date_str}-{rand_suffix}"
            exists = db.query(DeliveryTrip.id).filter(DeliveryTrip.id == candidate_id).first()
            if not exists:
                return candidate_id
        fallback_suffix = f"{int(datetime.now(timezone.utc).timestamp()) % 1000000:06d}"
        return f"TRIP-{date_str}-{fallback_suffix}"

    @staticmethod
    def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
        """Đảm bảo datetime có timezone UTC để tính toán thời gian trễ an toàn."""
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    @classmethod
    def _enrich_trip_delay_status(cls, trip: DeliveryTrip) -> None:
        """
        Tính toán trạng thái trễ hạn động của chuyến giao (S6-07).
        Nếu thời gian hiện tại vượt quá thời gian dự kiến hoàn tất và chuyến chưa xong -> Bật cờ cảnh báo trễ hạn.
        """
        now = datetime.now(timezone.utc)
        expected_utc = cls._ensure_utc(trip.expected_completion_time)

        if trip.status in [TripStatus.IN_TRANSIT.value, TripStatus.PREPARING.value]:
            if expected_utc and now > expected_utc:
                delay_sec = (now - expected_utc).total_seconds()
                delay_min = max(1, int(delay_sec // 60))
                trip.is_delayed = True
                trip.delay_minutes = delay_min

                if delay_min > 60:
                    trip.delay_level = "CRITICAL"
                    trip.delay_warning = f"CẢNH BÁO NGUY CẤP: Chuyến giao đã quá hạn {delay_min} phút (Dự kiến xong lúc {expected_utc.strftime('%H:%M %d/%m/%Y')})!"
                elif delay_min > 15:
                    trip.delay_level = "WARNING"
                    trip.delay_warning = f"Cảnh báo: Chuyến giao chậm tiến độ {delay_min} phút so với kế hoạch."
                else:
                    trip.delay_level = "INFO"
                    trip.delay_warning = f"Chuyến giao vừa quá hạn dự kiến {delay_min} phút."
            else:
                trip.is_delayed = False
                trip.delay_minutes = 0
                trip.delay_warning = None
                trip.delay_level = "ON_TIME"
        else:
            # Chuyến đã hoàn tất
            trip.is_delayed = False
            trip.delay_minutes = 0
            trip.delay_warning = None
            trip.delay_level = "ON_TIME"

        # Cập nhật cờ trễ cho từng điểm giao nếu có expected_arrival_time
        if trip.points:
            for pt in trip.points:
                pt_exp_utc = cls._ensure_utc(pt.expected_arrival_time)
                if pt.status in [PointStatus.PENDING.value, PointStatus.DELIVERING.value]:
                    if pt_exp_utc and now > pt_exp_utc:
                        pt.is_delayed = True
                    else:
                        pt.is_delayed = False
                else:
                    pt.is_delayed = False

    @classmethod
    def create_delivery_trip(
        cls,
        db: Session,
        payload: DeliveryTripCreate,
        current_user: User,
    ) -> DeliveryTrip:
        """
        Tạo mới và khởi động chuyến giao hàng gom từ các Phiếu xuất kho đã CONFIRMED (S6-07).
        - Tính toán trước tổng tiền hàng ban đầu và tiền hàng trên đường.
        - Khởi tạo danh sách các điểm giao tương ứng với phiếu xuất.
        """
        # 1. Kiểm tra kho hàng hợp lệ
        wh_code, wh_name = resolve_warehouse(db, payload.warehouse_id)

        # 2. Kiểm tra danh sách phiếu xuất kho
        clean_dispatch_ids = [d.strip() for d in payload.dispatch_ids if d.strip()]
        if not clean_dispatch_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Danh sách phiếu xuất kho (dispatch_ids) không được để trống.",
            )

        dispatches = db.query(StockDispatch).options(
            joinedload(StockDispatch.items)
        ).filter(
            StockDispatch.id.in_(clean_dispatch_ids)
        ).all()

        found_ids = {d.id for d in dispatches}
        missing_ids = set(clean_dispatch_ids) - found_ids
        if missing_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy các phiếu xuất kho sau: {', '.join(sorted(missing_ids))}.",
            )

        # 3. Kiểm tra tính hợp lệ của từng phiếu xuất:
        for disp in dispatches:
            if disp.status != DispatchStatus.CONFIRMED.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Phiếu xuất '{disp.id}' chưa được xác nhận (trạng thái: {disp.status}). Chỉ phiếu CONFIRMED mới được giao.",
                )
            if disp.warehouse_id != payload.warehouse_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Phiếu xuất '{disp.id}' thuộc kho ID {disp.warehouse_id}, không khớp với kho xuất phát ID {payload.warehouse_id}.",
                )

        # Kiểm tra xem phiếu đã nằm trong chuyến giao nào đang chạy không
        existing_active_point = db.query(DeliveryTripPoint).join(
            DeliveryTrip, DeliveryTripPoint.trip_id == DeliveryTrip.id
        ).filter(
            DeliveryTripPoint.dispatch_id.in_(clean_dispatch_ids),
            DeliveryTrip.status.in_([TripStatus.IN_TRANSIT.value, TripStatus.PREPARING.value])
        ).first()

        if existing_active_point:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Phiếu xuất '{existing_active_point.dispatch_id}' đã thuộc chuyến giao '{existing_active_point.trip_id}' đang chạy.",
            )

        # 4. Xác định thời gian hoàn tất dự kiến
        now_utc = datetime.now(timezone.utc)
        if payload.expected_completion_time:
            expected_time = cls._ensure_utc(payload.expected_completion_time)
        elif payload.estimated_duration_hours and payload.estimated_duration_hours > 0:
            expected_time = now_utc + timedelta(hours=payload.estimated_duration_hours)
        else:
            # Mặc định 4 giờ làm việc
            expected_time = now_utc + timedelta(hours=4)

        trip_id = cls._generate_trip_id(db)

        # 5. Khởi tạo đối tượng Chuyến giao hàng
        trip = DeliveryTrip(
            id=trip_id,
            trip_code=trip_id,
            warehouse_id=payload.warehouse_id,
            warehouse_name=wh_name,
            driver_name=payload.driver_name,
            driver_phone=payload.driver_phone,
            license_plate=payload.license_plate,
            status=TripStatus.IN_TRANSIT.value,
            started_at=now_utc,
            expected_completion_time=expected_time,
            notes=payload.notes,
            created_by=current_user.id if current_user else None,
        )

        # 6. Gom giá bán và thông tin liên hệ từ các đơn hàng liên quan
        order_ids = [d.order_id for d in dispatches if d.order_id]
        order_items_map: Dict[Tuple[str, str], float] = {}  # (order_id, product_id) -> unit_price
        order_phone_map: Dict[str, str] = {}
        order_receiver_map: Dict[str, str] = {}

        if order_ids:
            orders = db.query(Order).filter(Order.id.in_(order_ids)).all()
            for o in orders:
                if o.customer_phone:
                    order_phone_map[o.id] = o.customer_phone
                if o.customer_name:
                    order_receiver_map[o.id] = o.customer_name
                for oi in o.items:
                    order_items_map[(oi.order_id, oi.product_id)] = float(oi.price or 0.0)

            # Lấy thêm thông tin giao nhận từ OrderDeliveryProfile nếu có
            try:
                from app.models.order_delivery_profile import OrderDeliveryProfile
                od_profiles = db.query(OrderDeliveryProfile).filter(OrderDeliveryProfile.order_id.in_(order_ids)).all()
                for odp in od_profiles:
                    if odp.delivery_phone:
                        order_phone_map[odp.order_id] = odp.delivery_phone
                    if odp.delivery_receiver_name:
                        order_receiver_map[odp.order_id] = odp.delivery_receiver_name
            except Exception:
                pass

        # Fallback giá bán & đơn vị tính từ Product
        product_ids = {item.product_id for d in dispatches for item in d.items}
        product_price_map: Dict[str, float] = {}
        product_unit_map: Dict[str, str] = {}
        if product_ids:
            prods = db.query(Product).filter(Product.id.in_(product_ids)).all()
            for p in prods:
                product_price_map[p.id] = float(p.price or p.sale_price or 0.0)
                product_unit_map[p.id] = p.unit or "cái"

        total_packages = 0
        initial_total_value = 0.0
        points_list: List[DeliveryTripPoint] = []

        # 7. Xây dựng từng điểm giao trong chuyến
        for idx, disp in enumerate(dispatches, start=1):
            point_items: List[DeliveryTripPointItem] = []
            pt_items_count = 0
            pt_value = 0.0

            for d_item in disp.items:
                # Tìm đơn giá
                unit_price = float(
                    order_items_map.get((disp.order_id, d_item.product_id))
                    or product_price_map.get(d_item.product_id)
                    or 0.0
                )
                line_total = float(d_item.dispatched_quantity) * unit_price
                pt_items_count += d_item.dispatched_quantity
                pt_value += line_total
                item_unit = product_unit_map.get(d_item.product_id, "cái")

                point_item = DeliveryTripPointItem(
                    product_id=d_item.product_id,
                    sku=d_item.sku,
                    product_name=d_item.product_name,
                    unit=item_unit,
                    dispatched_quantity=d_item.dispatched_quantity,
                    delivered_quantity=0,
                    undelivered_quantity=d_item.dispatched_quantity,
                    unit_price=unit_price,
                    total_price=line_total,
                    delivered_amount=0.0,
                    in_transit_amount=line_total,
                    status=ItemTransitStatus.IN_TRANSIT.value,
                )
                point_items.append(point_item)

            total_packages += pt_items_count
            initial_total_value += pt_value

            contact_phone = order_phone_map.get(disp.order_id)
            contact_person = order_receiver_map.get(disp.order_id) or disp.customer_name

            point = DeliveryTripPoint(
                trip_id=trip_id,
                stop_order=idx,
                dispatch_id=disp.id,
                order_id=disp.order_id,
                customer_id=disp.customer_id,
                customer_name=disp.customer_name,
                delivery_address=disp.customer_address,
                contact_phone=contact_phone,
                contact_person=contact_person,
                expected_arrival_time=expected_time,
                status=PointStatus.PENDING.value,
                total_items_count=pt_items_count,
                delivered_items_count=0,
                undelivered_items_count=pt_items_count,
                point_value=pt_value,
                delivered_value=0.0,
                remaining_value=pt_value,
                hold_on_trip=True,  # Luôn giữ hàng thuộc trách nhiệm chuyến
                items=point_items,
            )
            points_list.append(point)

        # 8. Cập nhật các chỉ số tổng hợp của chuyến
        trip.total_points = len(points_list)
        trip.delivered_points = 0
        trip.remaining_points = len(points_list)
        trip.failed_points = 0
        trip.total_packages = total_packages
        trip.initial_total_value = initial_total_value
        trip.delivered_value = 0.0
        trip.in_transit_value = initial_total_value  # Ban đầu toàn bộ tiền hàng nằm trên đường
        trip.points = points_list

        cls._enrich_trip_delay_status(trip)

        try:
            db.add(trip)
            db.commit()
            db.refresh(trip)
            return trip
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi hệ thống khi tạo chuyến giao hàng: {str(e)}",
            )

    @classmethod
    def start_delivery_trip(cls, db: Session, trip_id: str, current_user: User) -> DeliveryTrip:
        """Khởi động chuyến giao hàng (chuyển sang IN_TRANSIT)."""
        trip = cls.get_delivery_trip_by_id(db, trip_id)
        if trip.status not in [TripStatus.PREPARING.value, TripStatus.IN_TRANSIT.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể khởi động chuyến giao hàng ở trạng thái '{trip.status}'.",
            )
        trip.status = TripStatus.IN_TRANSIT.value
        trip.started_at = datetime.now(timezone.utc)
        cls._enrich_trip_delay_status(trip)
        try:
            db.commit()
            db.refresh(trip)
            return trip
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi khi bắt đầu chuyến giao: {str(e)}",
            )

    @classmethod
    def record_point_delivery_result(
        cls,
        db: Session,
        trip_id: str,
        point_id: int,
        payload: PointDeliveryResultRequest,
        current_user: User,
    ) -> DeliveryTripPoint:
        """
        Cập nhật kết quả giao từng điểm và đồng bộ số điểm còn lại của chuyến (S6-07).
        - Cho phép ghi nhận: DELIVERED (Đã giao), PARTIAL (Giao một phần), FAILED (Thất bại).
        - LOGIC BẮT BUỘC S6-07: Hàng chưa giao được vẫn thuộc trách nhiệm của chuyến, KHÔNG tự về kho!
        - Tự động tính lại tổng tiền hàng còn trên đường và số điểm còn lại.
        """
        trip = db.query(DeliveryTrip).options(
            selectinload(DeliveryTrip.points).selectinload(DeliveryTripPoint.items)
        ).filter(DeliveryTrip.id == trip_id).first()

        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chuyến giao hàng với mã '{trip_id}'.",
            )

        point: Optional[DeliveryTripPoint] = None
        for p in trip.points:
            if p.id == point_id:
                point = p
                break

        if not point:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy điểm giao hàng ID {point_id} trong chuyến '{trip_id}'.",
            )

        clean_status = payload.status.upper().strip()
        if clean_status not in [PointStatus.DELIVERED.value, PointStatus.PARTIAL.value, PointStatus.FAILED.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Trạng thái giao '{payload.status}' không hợp lệ. Chỉ chấp nhận DELIVERED, PARTIAL hoặc FAILED.",
            )

        if clean_status in [PointStatus.PARTIAL.value, PointStatus.FAILED.value] and not payload.failure_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bắt buộc phải nhập lý do (failure_reason) khi giao thất bại hoặc giao một phần.",
            )

        # Kiểm tra chi tiết khi giao một phần (PARTIAL)
        valid_product_ids = {item.product_id for item in point.items}
        if payload.delivered_items:
            for itm in payload.delivered_items:
                if itm.product_id not in valid_product_ids:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Sản phẩm '{itm.product_id}' không tồn tại trong danh sách hàng của điểm giao này.",
                    )

        if clean_status == PointStatus.PARTIAL.value:
            if not payload.delivered_items:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bắt buộc phải truyền danh sách sản phẩm và số lượng giao (delivered_items) khi cập nhật trạng thái PARTIAL (giao một phần).",
                )

        # Xử lý cập nhật hàng hóa từng dòng
        delivered_items_map: Dict[str, int] = {}
        if payload.delivered_items:
            for itm in payload.delivered_items:
                delivered_items_map[itm.product_id] = itm.delivered_quantity

        # Kiểm tra tính hợp lệ của tổng số lượng giao cho PARTIAL
        if clean_status == PointStatus.PARTIAL.value:
            total_dispatched_at_point = sum(itm.dispatched_quantity for itm in point.items)
            total_delivered_at_point = sum(delivered_items_map.get(itm.product_id, 0) for itm in point.items)
            if total_delivered_at_point == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Số lượng giao thực tế bằng 0. Vui lòng chọn trạng thái FAILED (thất bại) thay vì PARTIAL.",
                )
            if total_delivered_at_point == total_dispatched_at_point:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tất cả sản phẩm đã được giao đủ 100%. Vui lòng chọn trạng thái DELIVERED (đã giao) thay vì PARTIAL.",
                )

        for item in point.items:
            if clean_status == PointStatus.DELIVERED.value and not payload.delivered_items:
                # Giao đủ toàn bộ
                item.delivered_quantity = item.dispatched_quantity
                item.undelivered_quantity = 0
                item.delivered_amount = item.total_price
                item.in_transit_amount = 0.0
                item.status = ItemTransitStatus.DELIVERED.value
                item.notes = None
            elif clean_status == PointStatus.FAILED.value and not payload.delivered_items:
                # Thất bại toàn bộ - HÀNG VẪN TREO TRÊN CHUYẾN
                item.delivered_quantity = 0
                item.undelivered_quantity = item.dispatched_quantity
                item.delivered_amount = 0.0
                item.in_transit_amount = item.total_price
                item.status = ItemTransitStatus.UNDELIVERED_HELD_ON_TRIP.value
                item.notes = payload.failure_reason
            else:
                # Giao một phần hoặc chỉ định cụ thể từng mặt hàng
                qty_delivered = delivered_items_map.get(
                    item.product_id,
                    item.dispatched_quantity if clean_status == PointStatus.DELIVERED.value else 0
                )
                if qty_delivered > item.dispatched_quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Số lượng giao ({qty_delivered}) của sản phẩm '{item.product_id}' không được vượt quá số lượng xuất bốc ({item.dispatched_quantity}).",
                    )
                item.delivered_quantity = qty_delivered
                item.undelivered_quantity = item.dispatched_quantity - qty_delivered
                item.delivered_amount = float(item.delivered_quantity) * item.unit_price
                item.in_transit_amount = float(item.undelivered_quantity) * item.unit_price

                if item.undelivered_quantity > 0:
                    item.status = ItemTransitStatus.UNDELIVERED_HELD_ON_TRIP.value
                    if payload.failure_reason:
                        item.notes = payload.failure_reason
                else:
                    item.status = ItemTransitStatus.DELIVERED.value
                    item.notes = None

        # Cập nhật thông tin điểm giao
        point.status = clean_status
        point.actual_arrival_time = datetime.now(timezone.utc)
        point.completion_notes = payload.completion_notes
        point.failure_reason = payload.failure_reason if clean_status != PointStatus.DELIVERED.value else None
        point.hold_on_trip = True  # Giữ hàng chưa giao thuộc trách nhiệm chuyến, KHÔNG tự về kho

        point.delivered_items_count = sum(itm.delivered_quantity for itm in point.items)
        point.undelivered_items_count = sum(itm.undelivered_quantity for itm in point.items)
        point.delivered_value = sum(itm.delivered_amount for itm in point.items)
        point.remaining_value = sum(itm.in_transit_amount for itm in point.items)

        # ĐỒNG BỘ TIẾN ĐỘ VÀ SỐ ĐIỂM CỦA TOÀN BỘ CHUYẾN
        delivered_pts = 0
        failed_pts = 0
        remaining_pts = 0
        trip_delivered_val = 0.0
        trip_in_transit_val = 0.0

        for pt in trip.points:
            trip_delivered_val += pt.delivered_value
            trip_in_transit_val += pt.remaining_value

            if pt.status == PointStatus.DELIVERED.value:
                delivered_pts += 1
            elif pt.status in [PointStatus.FAILED.value, PointStatus.PARTIAL.value]:
                failed_pts += 1
            else:
                remaining_pts += 1

        trip.delivered_points = delivered_pts
        trip.failed_points = failed_pts
        trip.remaining_points = remaining_pts
        trip.delivered_value = trip_delivered_val
        trip.in_transit_value = trip_in_transit_val

        # Cập nhật trạng thái chuyến và xử lý cảnh báo notes không trùng lặp
        if remaining_pts == 0:
            trip.actual_completion_time = datetime.now(timezone.utc)
            clean_notes_lines = [
                line for line in (trip.notes or "").splitlines()
                if not line.startswith("[LƯU Ý] Chuyến giao hoàn tất")
            ]
            if failed_pts > 0:
                trip.status = TripStatus.COMPLETED_WITH_ISSUES.value
                note_warning = f"[LƯU Ý] Chuyến giao hoàn tất nhưng còn {failed_pts} điểm chưa giao xong. Tổng tiền hàng còn treo trên xe: {trip_in_transit_val:,.0f} đ. Hàng giữ nguyên trên xe, chờ thủ kho tiếp nhận."
                clean_notes_lines.append(note_warning)
            else:
                trip.status = TripStatus.COMPLETED.value
            trip.notes = "\n".join(clean_notes_lines).strip()
        else:
            trip.status = TripStatus.IN_TRANSIT.value
            trip.actual_completion_time = None

        cls._enrich_trip_delay_status(trip)

        try:
            db.commit()
            db.refresh(point)
            db.refresh(trip)
            return point
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi hệ thống khi cập nhật kết quả điểm giao: {str(e)}",
            )

    @classmethod
    def list_delivery_trips(
        cls,
        db: Session,
        status_filter: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        is_delayed: Optional[bool] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[DeliveryTrip], int, float, int, int]:
        """
        Truy vấn danh sách chuyến giao hàng có bộ lọc và phân trang (S6-07).
        Sử dụng query tối ưu hiệu năng theo AGENTS.md:
        - Phân trang ở cấp CSDL với count(), offset(), limit().
        - Không quét toàn bảng bằng .all().
        """
        now = datetime.now(timezone.utc)
        query = db.query(DeliveryTrip).options(
            selectinload(DeliveryTrip.points).selectinload(DeliveryTripPoint.items)
        )

        if warehouse_id is not None:
            query = query.filter(DeliveryTrip.warehouse_id == warehouse_id)

        if status_filter and status_filter.lower() != "all":
            query = query.filter(DeliveryTrip.status == status_filter.upper())

        if search:
            search_pattern = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    DeliveryTrip.id.ilike(search_pattern),
                    DeliveryTrip.trip_code.ilike(search_pattern),
                    DeliveryTrip.driver_name.ilike(search_pattern),
                    DeliveryTrip.license_plate.ilike(search_pattern),
                    DeliveryTrip.warehouse_name.ilike(search_pattern),
                )
            )

        # Lọc trễ hạn ở cấp query
        if is_delayed is True:
            query = query.filter(
                DeliveryTrip.status.in_([TripStatus.IN_TRANSIT.value, TripStatus.PREPARING.value]),
                DeliveryTrip.expected_completion_time < now
            )
        elif is_delayed is False:
            query = query.filter(
                or_(
                    DeliveryTrip.status.notin_([TripStatus.IN_TRANSIT.value, TripStatus.PREPARING.value]),
                    DeliveryTrip.expected_completion_time >= now
                )
            )

        total = query.count()
        paged_items = query.order_by(DeliveryTrip.started_at.desc()).offset(skip).limit(limit).all()

        for t in paged_items:
            cls._enrich_trip_delay_status(t)

        # Thống kê nhanh cấp DB (hiệu năng cao, không quét memory)
        active_trips_count = db.query(func.count(DeliveryTrip.id)).filter(
            DeliveryTrip.status == TripStatus.IN_TRANSIT.value
        ).scalar() or 0

        delayed_trips_count = db.query(func.count(DeliveryTrip.id)).filter(
            DeliveryTrip.status.in_([TripStatus.IN_TRANSIT.value, TripStatus.PREPARING.value]),
            DeliveryTrip.expected_completion_time < now
        ).scalar() or 0

        total_in_transit_value = db.query(
            func.coalesce(func.sum(DeliveryTrip.in_transit_value), 0.0)
        ).filter(
            DeliveryTrip.status.in_([
                TripStatus.IN_TRANSIT.value,
                TripStatus.PREPARING.value,
                TripStatus.COMPLETED_WITH_ISSUES.value,
            ])
        ).scalar() or 0.0

        return paged_items, total, float(total_in_transit_value), active_trips_count, delayed_trips_count

    @classmethod
    def get_delivery_trip_by_id(cls, db: Session, trip_id: str) -> DeliveryTrip:
        """Tra cứu chi tiết một chuyến giao hàng kèm toàn bộ điểm giao và sản phẩm."""
        trip = db.query(DeliveryTrip).options(
            selectinload(DeliveryTrip.points).selectinload(DeliveryTripPoint.items)
        ).filter(DeliveryTrip.id == trip_id).first()

        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chuyến giao hàng với mã '{trip_id}'.",
            )

        cls._enrich_trip_delay_status(trip)
        return trip

    @classmethod
    def get_in_transit_summary(
        cls, db: Session, warehouse_id: Optional[int] = None
    ) -> InTransitSummaryResponse:
        """
        Báo cáo tổng quan tiền hàng nằm trên đường dành cho Quản lý kho (S6-07).
        """
        now = datetime.now(timezone.utc)
        query = db.query(DeliveryTrip).options(
            selectinload(DeliveryTrip.points)
        )
        if warehouse_id:
            query = query.filter(DeliveryTrip.warehouse_id == warehouse_id)

        trips = query.all()
        for t in trips:
            cls._enrich_trip_delay_status(t)

        active_trips = [t for t in trips if t.status == TripStatus.IN_TRANSIT.value]
        total_in_transit_value = sum(
            t.in_transit_value for t in trips
            if t.status in [TripStatus.IN_TRANSIT.value, TripStatus.PREPARING.value, TripStatus.COMPLETED_WITH_ISSUES.value]
        )
        delayed_trips = [t for t in trips if t.is_delayed]
        total_remaining = sum(t.remaining_points for t in trips)
        total_delivered = sum(t.delivered_points for t in trips)

        # Thống kê theo kho
        wh_map: Dict[int, Dict[str, Any]] = {}
        for t in trips:
            if t.warehouse_id not in wh_map:
                wh_map[t.warehouse_id] = {
                    "warehouse_id": t.warehouse_id,
                    "warehouse_name": t.warehouse_name or f"Kho {t.warehouse_id}",
                    "active_trips": 0,
                    "in_transit_value": 0.0,
                    "delayed_trips": 0,
                }
            if t.status == TripStatus.IN_TRANSIT.value:
                wh_map[t.warehouse_id]["active_trips"] += 1
            if t.status in [TripStatus.IN_TRANSIT.value, TripStatus.PREPARING.value, TripStatus.COMPLETED_WITH_ISSUES.value]:
                wh_map[t.warehouse_id]["in_transit_value"] += t.in_transit_value
            if t.is_delayed:
                wh_map[t.warehouse_id]["delayed_trips"] += 1

        return InTransitSummaryResponse(
            total_active_trips=len(active_trips),
            total_in_transit_value=total_in_transit_value,
            total_delayed_trips=len(delayed_trips),
            total_remaining_points=total_remaining,
            total_delivered_points=total_delivered,
            by_warehouse=list(wh_map.values()),
        )
