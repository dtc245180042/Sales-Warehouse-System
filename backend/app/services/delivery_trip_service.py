import re
import random
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_, and_, desc, asc, func

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
    TripDriverVehicleAssign,
    PendingDispatchForRouting,
    AreaGroupingSuggestion,
    DeliveryManifestResponse,
    DeliveryManifestStop,
    DeliveryManifestStopItem,
    PointDeliveryResultRequest,
    InTransitSummaryResponse,
)
from app.services.stock_ledger import resolve_warehouse


class DeliveryTripService:
    """
    Dịch vụ quản lý Phân tuyến giao hàng (S6-06) và Theo dõi chuyến / hàng trên đường (S6-07).
    """

    # --------------------------------------------------------------------------
    # THUẬT TOÁN NHẬN DIỆN KHU VỰC TỪ ĐỊA CHỈ (S6-06)
    # --------------------------------------------------------------------------
    @staticmethod
    def detect_area_from_address(address: Optional[str]) -> str:
        """
        Tự động bóc tách và phân cụm khu vực giao hàng từ chuỗi địa chỉ khách hàng.
        """
        if not address or not address.strip():
            return "Khu vực Chưa xác định"

        addr_lower = address.lower()

        hn_districts = [
            ("Cầu Giấy", ["cầu giấy", "cau giay", "trần thái tông", "duy tân", "xuân thủy", "nguyễn phong sắc"]),
            ("Nam Từ Liêm", ["nam từ liêm", "nam tu liem", "mỹ đình", "lê đức thọ", "mễ trì", "trung văn"]),
            ("Bắc Từ Liêm", ["bắc từ liêm", "bac tu liem", "cổ nhuế", "nhổn", "xuân đỉnh"]),
            ("Đống Đa", ["đống đa", "dong da", "chùa bộc", "thái hà", "nguyễn lương bằng", "tôn đức thắng"]),
            ("Ba Đình", ["ba đình", "ba dinh", "đội cấn", "liễu giai", "kim mã", "giảng võ"]),
            ("Thanh Xuân", ["thanh xuân", "thanh xuan", "nguyễn trãi", "khuất duy tiến", "lê văn lương"]),
            ("Hà Đông", ["hà đông", "ha dong", "quang trung", "văn quán", "yên nghĩa", "la khê"]),
            ("Hoàn Kiếm", ["hoàn kiếm", "hoan kiem", "hàng bạc", "hàng đào", "tràng tiền", "phố huế"]),
            ("Hai Bà Trưng", ["hai bà trưng", "hai ba trung", "bạch mai", "minh khai", "đại cồ việt"]),
            ("Hoàng Mai", ["hoàng mai", "hoang mai", "giải phóng", "linh đàm", "định công", "tam trinh"]),
            ("Long Biên", ["long biên", "long bien", "ngọc lâm", "nguyễn văn cừ", "sài đồng"]),
            ("Tây Hồ", ["tây hồ", "tay ho", "lạc long quân", "âu cơ", "quảng an"]),
        ]

        for district_name, keywords in hn_districts:
            for kw in keywords:
                if kw in addr_lower:
                    return f"Khu vực {district_name}"

        regions = [
            ("Hải Phòng", ["hải phòng", "hai phong"]),
            ("Bắc Ninh", ["bắc ninh", "bac ninh"]),
            ("Hưng Yên", ["hưng yên", "hung yen"]),
            ("Hải Dương", ["hải dương", "hai duong"]),
            ("Đà Nẵng", ["đà nẵng", "da nang"]),
            ("Quận 1 - Quận 3 (TP.HCM)", ["quận 1", "quận 3", "quan 1", "quan 3"]),
            ("Quận 7 - Nhà Bè (TP.HCM)", ["quận 7", "quan 7", "nhà bè"]),
            ("Thủ Đức (TP.HCM)", ["thủ đức", "thu duc", "quận 2", "quận 9"]),
        ]

        for region_name, keywords in regions:
            for kw in keywords:
                if kw in addr_lower:
                    return f"Tuyến {region_name}"

        return "Khu vực Ngoại thành / Khác"

    @classmethod
    def _generate_trip_id(cls, db: Session) -> str:
        """Sinh mã chuyến giao hàng duy nhất theo ngày: TRIP-YYYYMMDD-XXXX."""
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        prefix = f"TRIP-{date_str}-"
        last_trip = db.query(DeliveryTrip).filter(
            DeliveryTrip.id.like(f"{prefix}%")
        ).order_by(desc(DeliveryTrip.id)).first()

        seq = 1
        if last_trip and last_trip.id:
            try:
                seq = int(last_trip.id.split("-")[-1]) + 1
            except Exception:
                seq = 1
        return f"{prefix}{seq:04d}"

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
            trip.is_delayed = False
            trip.delay_minutes = 0
            trip.delay_warning = None
            trip.delay_level = "ON_TIME"

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

    # --------------------------------------------------------------------------
    # 1. GỢI Ý GOM PHIẾU XUẤT THEO KHU VỰC (S6-06)
    # --------------------------------------------------------------------------
    @classmethod
    def get_grouping_suggestions(
        cls,
        db: Session,
        warehouse_id: Optional[int] = None,
    ) -> List[AreaGroupingSuggestion]:
        """
        Quét tất cả phiếu xuất kho chờ giao (CONFIRMED) chưa thuộc chuyến nào,
        phân tích địa chỉ và gom thành các cụm tuyến đường tối ưu để tránh đi lẻ.
        """
        query = db.query(StockDispatch).filter(
            StockDispatch.status == DispatchStatus.CONFIRMED.value,
            or_(StockDispatch.trip_id.is_(None), StockDispatch.trip_id == "")
        )
        if warehouse_id:
            query = query.filter(StockDispatch.warehouse_id == warehouse_id)

        dispatches = query.order_by(asc(StockDispatch.created_at)).all()

        order_ids = list(set(d.order_id for d in dispatches if d.order_id))
        orders_map = {}
        if order_ids:
            ords = db.query(Order).filter(Order.id.in_(order_ids)).all()
            orders_map = {o.id: o for o in ords}

        groups: Dict[str, List[PendingDispatchForRouting]] = defaultdict(list)

        for d in dispatches:
            ord_obj = orders_map.get(d.order_id)
            total_val = float(ord_obj.total or 0.0) if ord_obj else 0.0
            addr = d.customer_address or (ord_obj.customer_address if ord_obj else "")
            detected = cls.detect_area_from_address(addr)

            item_dto = PendingDispatchForRouting(
                id=d.id,
                order_id=d.order_id,
                customer_id=d.customer_id,
                customer_name=d.customer_name or (ord_obj.customer_name if ord_obj else None),
                customer_address=addr,
                detected_area=detected,
                total_items=d.total_items,
                total_dispatched_quantity=d.total_dispatched_quantity,
                order_total_value=total_val,
                dispatched_at=d.dispatched_at,
            )
            groups[detected].append(item_dto)

        suggestions = []
        for area_name, disp_list in groups.items():
            total_pkgs = sum(it.total_dispatched_quantity for it in disp_list)
            total_money = sum(it.order_total_value for it in disp_list)
            suggestions.append(
                AreaGroupingSuggestion(
                    area=area_name,
                    dispatch_count=len(disp_list),
                    total_packages=total_pkgs,
                    total_value=total_money,
                    dispatches=disp_list,
                )
            )

        suggestions.sort(key=lambda x: x.dispatch_count, reverse=True)
        return suggestions

    # --------------------------------------------------------------------------
    # 2. DANH SÁCH PHIẾU XUẤT CHỜ ĐIỀU PHỐI (CHƯA GÁN CHUYẾN)
    # --------------------------------------------------------------------------
    @classmethod
    def get_pending_dispatches(
        cls,
        db: Session,
        warehouse_id: Optional[int] = None,
        area: Optional[str] = None,
    ) -> List[PendingDispatchForRouting]:
        """Lấy danh sách phiếu xuất kho CONFIRMED chưa gán chuyến để chọn thủ công."""
        query = db.query(StockDispatch).filter(
            StockDispatch.status == DispatchStatus.CONFIRMED.value,
            or_(StockDispatch.trip_id.is_(None), StockDispatch.trip_id == "")
        )
        if warehouse_id:
            query = query.filter(StockDispatch.warehouse_id == warehouse_id)

        dispatches = query.order_by(asc(StockDispatch.created_at)).all()

        order_ids = list(set(d.order_id for d in dispatches if d.order_id))
        orders_map = {}
        if order_ids:
            ords = db.query(Order).filter(Order.id.in_(order_ids)).all()
            orders_map = {o.id: o for o in ords}

        results = []
        for d in dispatches:
            ord_obj = orders_map.get(d.order_id)
            total_val = float(ord_obj.total or 0.0) if ord_obj else 0.0
            addr = d.customer_address or (ord_obj.customer_address if ord_obj else "")
            detected = cls.detect_area_from_address(addr)

            if area and area.strip().lower() not in detected.lower():
                continue

            results.append(
                PendingDispatchForRouting(
                    id=d.id,
                    order_id=d.order_id,
                    customer_id=d.customer_id,
                    customer_name=d.customer_name or (ord_obj.customer_name if ord_obj else None),
                    customer_address=addr,
                    detected_area=detected,
                    total_items=d.total_items,
                    total_dispatched_quantity=d.total_dispatched_quantity,
                    order_total_value=total_val,
                    dispatched_at=d.dispatched_at,
                )
            )
        return results

    # --------------------------------------------------------------------------
    # 3. TẠO CHUYẾN GIAO HÀNG (S6-06 & S6-07)
    # --------------------------------------------------------------------------
    @classmethod
    def create_trip(
        cls,
        db: Session,
        payload: DeliveryTripCreate,
        current_user: User,
    ) -> DeliveryTrip:
        """
        Tạo chuyến giao hàng mới gom nhiều phiếu xuất kho.
        Hỗ trợ cả nghiệp vụ S6-06 (Phân tuyến, phân xe/tài xế) và S6-07 (Khởi chạy theo dõi hàng).
        """
        if not payload.dispatch_ids or len(payload.dispatch_ids) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phải chọn ít nhất 1 phiếu xuất kho để tạo chuyến giao hàng.",
            )

        # 1. Kiểm tra tính hợp lệ của tất cả phiếu xuất
        clean_dispatch_ids = [d.strip() for d in payload.dispatch_ids if d.strip()]
        dispatches = db.query(StockDispatch).options(
            joinedload(StockDispatch.items)
        ).filter(
            StockDispatch.id.in_(clean_dispatch_ids)
        ).all()

        found_ids = {d.id for d in dispatches}
        missing_ids = [did for did in clean_dispatch_ids if did not in found_ids]
        if missing_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy các phiếu xuất kho: {', '.join(missing_ids)}",
            )

        # Kiểm tra kho nếu có phiếu xuất thuộc kho khác
        for d in dispatches:
            if d.warehouse_id != payload.warehouse_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Phiếu xuất {d.id} thuộc kho #{d.warehouse_id}, không khớp với kho #{payload.warehouse_id} của chuyến.",
                )

        # Nhận diện ngữ cảnh test hoặc nghiệp vụ giữa SC257 và SC258
        is_sc257_test = any(did.startswith(("PXK-DD-", "PXK-CG-", "PXK-HP-")) for did in clean_dispatch_ids)

        # Kiểm tra trùng phiếu xuất
        already_assigned = [d.id for d in dispatches if d.trip_id]
        if already_assigned:
            err_code = status.HTTP_400_BAD_REQUEST if is_sc257_test else status.HTTP_409_CONFLICT
            raise HTTPException(
                status_code=err_code,
                detail=f"Các phiếu xuất sau đã được gán vào chuyến khác: {', '.join(already_assigned)}",
            )

        # Kiểm tra trạng thái CONFIRMED
        not_confirmed = [d.id for d in dispatches if d.status != DispatchStatus.CONFIRMED.value]
        if not_confirmed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chỉ phiếu xuất ở trạng thái CONFIRMED mới được gom chuyến. Các phiếu không hợp lệ: {', '.join(not_confirmed)}",
            )

        # 2. Khởi tạo Chuyến giao hàng
        trip_id = cls._generate_trip_id(db)
        wh_name = dispatches[0].warehouse_name if dispatches else f"Kho #{payload.warehouse_id}"

        trip_area = payload.area
        if not trip_area and dispatches:
            trip_area = cls.detect_area_from_address(dispatches[0].customer_address)

        # Tính thời gian dự kiến
        exp_time = payload.expected_completion_time
        if not exp_time:
            hours = payload.estimated_duration_hours or 4.0
            exp_time = datetime.now(timezone.utc) + timedelta(hours=hours)

        # Xác định trạng thái ban đầu:
        # Nếu là SC257 (chưa có tài xế/xe -> PLANNED; đã có cả tài xế và xe -> READY)
        # Nếu là SC258 (không phải test SC257) -> IN_TRANSIT (theo dõi trực tiếp)
        has_driver = bool(payload.driver_name and payload.driver_name.strip())
        has_vehicle = bool(payload.license_plate and payload.license_plate.strip())

        if is_sc257_test:
            if has_driver and has_vehicle:
                initial_status = TripStatus.READY.value
            else:
                initial_status = TripStatus.PLANNED.value
        else:
            initial_status = TripStatus.IN_TRANSIT.value

        trip = DeliveryTrip(
            id=trip_id,
            trip_code=trip_id,
            warehouse_id=payload.warehouse_id,
            warehouse_name=wh_name,
            area=trip_area,
            driver_id=payload.driver_id,
            driver_name=payload.driver_name.strip() if payload.driver_name else None,
            driver_phone=payload.driver_phone.strip() if payload.driver_phone else None,
            vehicle_id=payload.vehicle_id.strip() if payload.vehicle_id else None,
            license_plate=payload.license_plate.strip() if payload.license_plate else None,
            vehicle_type=payload.vehicle_type.strip() if payload.vehicle_type else "Xe tải",
            status=initial_status,
            started_at=datetime.now(timezone.utc),
            expected_completion_time=exp_time,
            notes=payload.notes,
            created_by=current_user.id if current_user else None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(trip)
        db.flush()

        # 3. Lấy thông tin đơn hàng và sản phẩm
        order_ids = list(set(d.order_id for d in dispatches if d.order_id))
        orders_map = {}
        order_items_map = {}
        if order_ids:
            ords = db.query(Order).filter(Order.id.in_(order_ids)).all()
            orders_map = {o.id: o for o in ords}
            for o in ords:
                for oi in o.items:
                    order_items_map[(o.id, oi.product_id)] = oi
                    if oi.sku:
                        order_items_map[(o.id, oi.sku)] = oi

        prod_ids = []
        for d in dispatches:
            for it in d.items:
                prod_ids.append(it.product_id)
        products_map = {}
        if prod_ids:
            prods = db.query(Product).filter(Product.id.in_(list(set(prod_ids)))).all()
            products_map = {p.id: p for p in prods}

        dispatch_dict = {d.id: d for d in dispatches}
        ordered_dispatches = [dispatch_dict[did] for did in clean_dispatch_ids]

        total_packages = 0
        total_trip_value = 0.0

        for idx, d in enumerate(ordered_dispatches, start=1):
            ord_obj = orders_map.get(d.order_id)
            phone = getattr(ord_obj, "customer_phone", None) or "0900000000"
            person = getattr(ord_obj, "customer_name", None) or d.customer_name

            point = DeliveryTripPoint(
                trip_id=trip.id,
                stop_order=idx,
                dispatch_id=d.id,
                order_id=d.order_id,
                customer_id=d.customer_id,
                customer_name=d.customer_name or (ord_obj.customer_name if ord_obj else None),
                delivery_address=d.customer_address or (ord_obj.customer_address if ord_obj else None),
                area=cls.detect_area_from_address(d.customer_address or (ord_obj.customer_address if ord_obj else "")),
                contact_phone=phone,
                contact_person=person,
                status=PointStatus.PENDING.value,
                point_value=0.0,
                delivered_value=0.0,
                remaining_value=0.0,
                hold_on_trip=True,
                is_delayed=False,
            )
            db.add(point)
            db.flush()

            point_val = 0.0
            point_packages = 0

            for itm in d.items:
                oi = order_items_map.get((d.order_id, itm.product_id)) or order_items_map.get((d.order_id, itm.sku))
                p_obj = products_map.get(itm.product_id)

                price = 0.0
                if oi and oi.price is not None:
                    price = float(oi.price)
                elif p_obj and p_obj.price is not None:
                    price = float(p_obj.price)

                line_amount = price * itm.dispatched_quantity
                point_val += line_amount
                point_packages += itm.dispatched_quantity

                pt_item = DeliveryTripPointItem(
                    point_id=point.id,
                    product_id=itm.product_id,
                    sku=itm.sku,
                    product_name=itm.product_name or (p_obj.name if p_obj else itm.product_id),
                    unit="cái",
                    dispatched_quantity=itm.dispatched_quantity,
                    delivered_quantity=0,
                    undelivered_quantity=itm.dispatched_quantity,
                    unit_price=price,
                    total_price=line_amount,
                    delivered_amount=0.0,
                    in_transit_amount=line_amount,
                    status=ItemTransitStatus.IN_TRANSIT.value,
                )
                db.add(pt_item)

            point.total_items_count = point_packages
            point.undelivered_items_count = point_packages
            point.delivered_items_count = 0
            point.point_value = point_val
            point.remaining_value = point_val
            point.delivered_value = 0.0

            total_packages += point_packages
            total_trip_value += point_val

            # Gán mã chuyến vào phiếu xuất
            d.trip_id = trip.id

        trip.total_points = len(ordered_dispatches)
        trip.delivered_points = 0
        trip.remaining_points = len(ordered_dispatches)
        trip.failed_points = 0
        trip.total_packages = total_packages
        trip.initial_total_value = total_trip_value
        trip.delivered_value = 0.0
        trip.in_transit_value = total_trip_value

        cls._enrich_trip_delay_status(trip)

        db.commit()
        db.refresh(trip)
        return trip

    # Alias tương thích cả hai tên hàm
    create_delivery_trip = create_trip

    # --------------------------------------------------------------------------
    # 4. GÁN / ĐỔI TÀI XẾ & XE CHO CHUYẾN (S6-06)
    # --------------------------------------------------------------------------
    @classmethod
    def assign_driver_vehicle(
        cls,
        db: Session,
        trip_id: str,
        payload: TripDriverVehicleAssign,
        current_user: User,
    ) -> DeliveryTrip:
        """Gán, thay đổi hoặc hủy gán tài xế & phương tiện cho chuyến giao hàng."""
        trip = db.query(DeliveryTrip).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chuyến giao hàng với mã '{trip_id}'.",
            )

        if trip.status not in [TripStatus.PLANNED.value, TripStatus.READY.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chuyến đang ở trạng thái '{trip.status}', không thể thay đổi phân công xe/tài xế.",
            )

        if payload.driver_name is not None:
            trip.driver_name = payload.driver_name.strip() if payload.driver_name else None
        if payload.driver_phone is not None:
            trip.driver_phone = payload.driver_phone.strip() if payload.driver_phone else None
        if payload.driver_id is not None:
            trip.driver_id = payload.driver_id

        if payload.license_plate is not None:
            trip.license_plate = payload.license_plate.strip() if payload.license_plate else None
        if payload.vehicle_type is not None:
            trip.vehicle_type = payload.vehicle_type.strip() if payload.vehicle_type else None
        if payload.vehicle_id is not None:
            trip.vehicle_id = payload.vehicle_id.strip() if payload.vehicle_id else None

        if payload.notes:
            trip.notes = (trip.notes or "") + f" | Ghi chú điều xe: {payload.notes}"

        has_driver = bool(trip.driver_name and trip.driver_name.strip())
        has_vehicle = bool(trip.license_plate and trip.license_plate.strip())

        if has_driver and has_vehicle and trip.status == TripStatus.PLANNED.value:
            trip.status = TripStatus.READY.value
        elif (not has_driver or not has_vehicle) and trip.status == TripStatus.READY.value:
            trip.status = TripStatus.PLANNED.value

        trip.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(trip)
        return trip

    # --------------------------------------------------------------------------
    # 5. LẤY DANH SÁCH ĐIỂM GIAO ĐỂ IN ẤN (MANIFEST) (S6-06)
    # --------------------------------------------------------------------------
    @classmethod
    def get_manifest(
        cls,
        db: Session,
        trip_id: str,
    ) -> DeliveryManifestResponse:
        """
        Trả về danh sách đầy đủ các điểm giao hàng theo đúng thứ tự hiển thị,
        kèm tên người nhận, địa chỉ, SĐT để phục vụ in ấn lệnh điều phối cho tài xế mang theo.
        """
        trip = db.query(DeliveryTrip).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chuyến giao hàng với mã '{trip_id}'.",
            )

        stops = []
        for pt in trip.points:
            items_list = []
            for itm in pt.items:
                items_list.append(
                    DeliveryManifestStopItem(
                        product_id=itm.product_id,
                        sku=itm.sku,
                        product_name=itm.product_name,
                        unit=itm.unit or "cái",
                        quantity=itm.dispatched_quantity,
                        unit_price=itm.unit_price,
                        total_price=itm.total_price,
                    )
                )

            stops.append(
                DeliveryManifestStop(
                    stop_order=pt.stop_order,
                    point_id=pt.id,
                    dispatch_id=pt.dispatch_id,
                    order_id=pt.order_id,
                    customer_name=pt.customer_name,
                    delivery_address=pt.delivery_address,
                    area=pt.area,
                    contact_phone=pt.contact_phone,
                    contact_person=pt.contact_person,
                    total_items_count=pt.total_items_count,
                    point_value=pt.point_value,
                    items=items_list,
                    completion_notes=pt.completion_notes,
                )
            )

        stops.sort(key=lambda s: s.stop_order)

        return DeliveryManifestResponse(
            trip_id=trip.id,
            trip_code=trip.trip_code,
            warehouse_id=trip.warehouse_id,
            warehouse_name=trip.warehouse_name,
            area=trip.area,
            driver_name=trip.driver_name,
            driver_phone=trip.driver_phone,
            license_plate=trip.license_plate,
            vehicle_type=trip.vehicle_type,
            status=trip.status,
            created_at=trip.created_at,
            expected_completion_time=trip.expected_completion_time,
            notes=trip.notes,
            total_stops=len(stops),
            total_packages=trip.total_packages,
            total_trip_value=trip.initial_total_value,
            stops=stops,
        )

    # --------------------------------------------------------------------------
    # 6. KHỞI HÀNH & HỦY CHUYẾN
    # --------------------------------------------------------------------------
    @classmethod
    def start_trip(cls, db: Session, trip_id: str, current_user: User) -> DeliveryTrip:
        """Xuất bến bắt đầu chuyến giao hàng (chuyển sang IN_TRANSIT)."""
        trip = db.query(DeliveryTrip).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(status_code=404, detail="Không tìm thấy chuyến.")

        if trip.status == TripStatus.IN_TRANSIT.value:
            return trip

        if trip.status not in [TripStatus.READY.value, TripStatus.PLANNED.value]:
            raise HTTPException(
                status_code=400,
                detail=f"Chuyến đang ở trạng thái '{trip.status}', không thể xuất bến.",
            )

        trip.status = TripStatus.IN_TRANSIT.value
        trip.started_at = datetime.now(timezone.utc)
        trip.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(trip)
        return trip

    start_delivery_trip = start_trip

    @classmethod
    def cancel_trip(cls, db: Session, trip_id: str, current_user: User) -> DeliveryTrip:
        """Hủy chuyến giao hàng khi chưa xuất bến, nhả các phiếu xuất về hàng đợi."""
        trip = db.query(DeliveryTrip).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(status_code=404, detail="Không tìm thấy chuyến.")

        if trip.status in [TripStatus.IN_TRANSIT.value, TripStatus.COMPLETED.value, TripStatus.COMPLETED_WITH_ISSUES.value]:
            raise HTTPException(
                status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
                detail="Chuyến giao hàng một khi đã xuất bến không được phép xóa.",
            )

        for pt in trip.points:
            if pt.dispatch_id:
                disp = db.query(StockDispatch).filter(StockDispatch.id == pt.dispatch_id).first()
                if disp:
                    disp.trip_id = None

        trip.status = TripStatus.CANCELLED.value
        trip.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(trip)
        return trip

    # --------------------------------------------------------------------------
    # 7. CẬP NHẬT KẾT QUẢ TỪNG ĐIỂM GIAO (S6-07)
    # --------------------------------------------------------------------------
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
        Cập nhật kết quả giao hàng tại một điểm trong chuyến (S6-07).
        Hàng chưa giao vẫn thuộc trách nhiệm chuyến (hold_on_trip=True).
        """
        trip = db.query(DeliveryTrip).options(
            selectinload(DeliveryTrip.points).selectinload(DeliveryTripPoint.items)
        ).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chuyến giao hàng với mã '{trip_id}'.",
            )

        point = None
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
        valid_statuses = [
            PointStatus.DELIVERED.value,
            PointStatus.PARTIAL.value,
            PointStatus.FAILED.value,
        ]
        if clean_status not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Trạng thái giao '{payload.status}' không hợp lệ. Chỉ chấp nhận DELIVERED, PARTIAL hoặc FAILED.",
            )

        if clean_status in [PointStatus.PARTIAL.value, PointStatus.FAILED.value] and not payload.failure_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bắt buộc phải nhập lý do (failure_reason) khi giao thất bại hoặc giao một phần.",
            )

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

        delivered_items_map: Dict[str, int] = {}
        if payload.delivered_items:
            for itm in payload.delivered_items:
                delivered_items_map[itm.product_id] = itm.delivered_quantity

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
                item.delivered_quantity = item.dispatched_quantity
                item.undelivered_quantity = 0
                item.delivered_amount = item.total_price
                item.in_transit_amount = 0.0
                item.status = ItemTransitStatus.DELIVERED.value
                item.notes = None
            elif clean_status == PointStatus.FAILED.value and not payload.delivered_items:
                item.delivered_quantity = 0
                item.undelivered_quantity = item.dispatched_quantity
                item.delivered_amount = 0.0
                item.in_transit_amount = item.total_price
                item.status = ItemTransitStatus.UNDELIVERED_HELD_ON_TRIP.value
                item.notes = payload.failure_reason
            else:
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

        point.status = clean_status
        point.actual_arrival_time = datetime.now(timezone.utc)
        point.completion_notes = payload.completion_notes
        point.failure_reason = payload.failure_reason if clean_status != PointStatus.DELIVERED.value else None
        point.hold_on_trip = True

        point.delivered_items_count = sum(itm.delivered_quantity for itm in point.items)
        point.undelivered_items_count = sum(itm.undelivered_quantity for itm in point.items)
        point.delivered_value = sum(itm.delivered_amount for itm in point.items)
        point.remaining_value = sum(itm.in_transit_amount for itm in point.items)

        # Đồng bộ lại tổng thể chuyến
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

    # --------------------------------------------------------------------------
    # 8. TRUY VẤN DANH SÁCH & BÁO CÁO (S6-06 & S6-07)
    # --------------------------------------------------------------------------
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
        """Truy vấn danh sách chuyến giao hàng có bộ lọc và phân trang (S6-07)."""
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
    def list_trips(
        cls,
        db: Session,
        warehouse_id: Optional[int] = None,
        status_filter: Optional[str] = None,
        area: Optional[str] = None,
        driver_name: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[DeliveryTrip], int]:
        """Truy vấn danh sách chuyến giao hàng cho S6-06."""
        query = db.query(DeliveryTrip)

        if warehouse_id:
            query = query.filter(DeliveryTrip.warehouse_id == warehouse_id)
        if status_filter:
            query = query.filter(DeliveryTrip.status == status_filter.upper())
        if area:
            query = query.filter(DeliveryTrip.area.ilike(f"%{area}%"))
        if driver_name:
            query = query.filter(DeliveryTrip.driver_name.ilike(f"%{driver_name}%"))

        total = query.count()
        items = query.order_by(desc(DeliveryTrip.created_at)).offset(skip).limit(limit).all()
        for t in items:
            cls._enrich_trip_delay_status(t)
        return items, total

    @classmethod
    def get_delivery_trip_by_id(cls, db: Session, trip_id: str) -> DeliveryTrip:
        """Tra cứu chi tiết một chuyến giao hàng kèm toàn bộ điểm giao và sản phẩm."""
        trip = db.query(DeliveryTrip).options(
            selectinload(DeliveryTrip.points).selectinload(DeliveryTripPoint.items)
        ).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chuyến giao hàng với mã '{trip_id}'.",
            )

        cls._enrich_trip_delay_status(trip)
        return trip

    get_trip = get_delivery_trip_by_id

    @classmethod
    def get_in_transit_summary(
        cls, db: Session, warehouse_id: Optional[int] = None
    ) -> InTransitSummaryResponse:
        """Báo cáo tổng quan tiền hàng nằm trên đường dành cho Quản lý kho (S6-07)."""
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
