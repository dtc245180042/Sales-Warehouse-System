import re
from typing import List, Optional, Tuple, Dict
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc

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
)


class DeliveryTripService:
    """
    Dịch vụ quản lý Phân tuyến giao hàng và Điều phối tài xế (S6-06 / SC-257).
    """

    # --------------------------------------------------------------------------
    # THUẬT TOÁN NHẬN DIỆN KHU VỰC TỪ ĐỊA CHỈ
    # --------------------------------------------------------------------------
    @staticmethod
    def detect_area_from_address(address: Optional[str]) -> str:
        """
        Tự động bóc tách và phân cụm khu vực giao hàng từ chuỗi địa chỉ khách hàng.
        """
        if not address or not address.strip():
            return "Khu vực Chưa xác định"

        addr_lower = address.lower()

        # Danh mục từ khóa các quận/huyện chính tại Hà Nội
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

        # Danh mục các tỉnh lân cận hoặc TP.HCM
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

    # --------------------------------------------------------------------------
    # 1. GỢI Ý GOM PHIẾU XUẤT THEO KHU VỰC (S6-06 SUBTASK 10)
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

        # Cache đơn hàng để lấy giá trị tiền hàng
        order_ids = list(set(d.order_id for d in dispatches if d.order_id))
        orders_map = {}
        if order_ids:
            ords = db.query(Order).filter(Order.id.in_(order_ids)).all()
            orders_map = {o.id: o for o in ords}

        # Nhóm theo khu vực
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

        # Đóng gói kết quả AreaGroupingSuggestion
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

        # Sắp xếp tuyến có nhiều phiếu xuất nhất lên đầu
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
    # 3. TẠO CHUYẾN GIAO HÀNG GOM NHIỀU PHIẾU XUẤT (S6-06 SUBTASK 8)
    # --------------------------------------------------------------------------
    @classmethod
    def create_trip(
        cls,
        db: Session,
        payload: DeliveryTripCreate,
        current_user: User,
    ) -> DeliveryTrip:
        """
        Tạo chuyến giao hàng mới, gom danh sách phiếu xuất kho theo khu vực,
        phân công tài xế và phương tiện vận chuyển.
        """
        if not payload.dispatch_ids or len(payload.dispatch_ids) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phải chọn ít nhất 1 phiếu xuất kho để tạo chuyến giao hàng.",
            )

        # 1. Kiểm tra tính hợp lệ của tất cả phiếu xuất
        dispatches = db.query(StockDispatch).filter(
            StockDispatch.id.in_(payload.dispatch_ids)
        ).all()

        found_ids = {d.id for d in dispatches}
        missing_ids = [did for did in payload.dispatch_ids if did not in found_ids]
        if missing_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy các phiếu xuất kho: {', '.join(missing_ids)}",
            )

        # Kiểm tra ràng buộc: Phiếu xuất chưa bị gán vào chuyến khác
        already_assigned = [d.id for d in dispatches if d.trip_id]
        if already_assigned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Các phiếu xuất sau đã được gán vào chuyến khác: {', '.join(already_assigned)}",
            )

        # Kiểm tra trạng thái: Phải là CONFIRMED (đã xuất kho, chờ giao)
        not_confirmed = [d.id for d in dispatches if d.status != DispatchStatus.CONFIRMED.value]
        if not_confirmed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chỉ phiếu xuất ở trạng thái CONFIRMED mới được gom chuyến. Các phiếu không hợp lệ: {', '.join(not_confirmed)}",
            )

        # 2. Khởi tạo Chuyến giao hàng
        trip_id = cls._generate_trip_id(db)
        wh_name = dispatches[0].warehouse_name if dispatches else f"Kho #{payload.warehouse_id}"

        # Xác định khu vực chuyến
        trip_area = payload.area
        if not trip_area and dispatches:
            trip_area = cls.detect_area_from_address(dispatches[0].customer_address)

        # Thời gian hoàn thành dự kiến
        exp_time = payload.expected_completion_time
        if not exp_time:
            exp_time = datetime.now(timezone.utc) + timedelta(hours=4)

        # Trạng thái khởi tạo: Nếu đã gán đủ tài xế & xe -> READY, ngược lại PLANNED
        initial_status = TripStatus.PLANNED.value
        if (payload.driver_name and payload.driver_name.strip()) and (payload.license_plate and payload.license_plate.strip()):
            initial_status = TripStatus.READY.value

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
            expected_completion_time=exp_time,
            notes=payload.notes,
            created_by=current_user.id if current_user else None,
            created_at=datetime.now(timezone.utc),
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

        # Lấy giá bán sản phẩm
        prod_ids = []
        for d in dispatches:
            for it in d.items:
                prod_ids.append(it.product_id)
        products_map = {}
        if prod_ids:
            prods = db.query(Product).filter(Product.id.in_(list(set(prod_ids)))).all()
            products_map = {p.id: p for p in prods}

        # Sắp xếp các phiếu xuất theo thứ tự truyền vào từ payload
        dispatch_dict = {d.id: d for d in dispatches}
        ordered_dispatches = [dispatch_dict[did] for did in payload.dispatch_ids]

        total_packages = 0
        total_trip_value = 0.0

        # 4. Tạo các điểm giao hàng (DeliveryTripPoint)
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
                customer_name=d.customer_name,
                delivery_address=d.customer_address,
                area=cls.detect_area_from_address(d.customer_address),
                contact_phone=phone,
                contact_person=person,
                status=PointStatus.PENDING.value,
                created_at=datetime.now(timezone.utc),
            )
            db.add(point)
            db.flush()

            # Tạo chi tiết mặt hàng tại điểm giao
            point_items_count = 0
            point_val = 0.0

            for it in d.items:
                qty = it.dispatched_quantity
                prod = products_map.get(it.product_id)
                oi = order_items_map.get((d.order_id, it.product_id)) or order_items_map.get((d.order_id, it.sku))

                unit_price = 0.0
                if oi and hasattr(oi, "unit_price") and oi.unit_price:
                    unit_price = float(oi.unit_price)
                elif oi and hasattr(oi, "price") and oi.price:
                    unit_price = float(oi.price)
                elif prod and hasattr(prod, "price") and prod.price:
                    unit_price = float(prod.price)
                else:
                    unit_price = 100000.0

                item_total = qty * unit_price
                point_val += item_total
                point_items_count += qty

                trip_item = DeliveryTripPointItem(
                    point_id=point.id,
                    product_id=it.product_id,
                    sku=it.sku,
                    product_name=it.product_name or getattr(prod, "name", it.sku),
                    unit="cái",
                    dispatched_quantity=qty,
                    delivered_quantity=0,
                    undelivered_quantity=qty,
                    unit_price=unit_price,
                    total_price=item_total,
                    delivered_amount=0.0,
                    in_transit_amount=item_total,
                    status=ItemTransitStatus.IN_TRANSIT.value,
                )
                db.add(trip_item)

            # Cập nhật giá trị điểm
            point.total_items_count = point_items_count
            point.undelivered_items_count = point_items_count
            point.point_value = point_val
            point.remaining_value = point_val

            total_packages += point_items_count
            total_trip_value += point_val

            # Gán mã chuyến cho phiếu xuất kho
            d.trip_id = trip.id

        # 5. Cập nhật tổng thể chuyến
        trip.total_points = len(ordered_dispatches)
        trip.remaining_points = len(ordered_dispatches)
        trip.total_packages = total_packages
        trip.initial_total_value = total_trip_value
        trip.in_transit_value = total_trip_value

        db.commit()
        db.refresh(trip)
        return trip

    # --------------------------------------------------------------------------
    # 4. GÁN / ĐỔI TÀI XẾ VÀ PHƯƠNG TIỆN (S6-06 SUBTASK 14)
    # --------------------------------------------------------------------------
    @classmethod
    def assign_driver_and_vehicle(
        cls,
        db: Session,
        trip_id: str,
        payload: TripDriverVehicleAssign,
        current_user: User,
    ) -> DeliveryTrip:
        """
        Cập nhật, gán, đổi hoặc bỏ gán tài xế và phương tiện cho chuyến giao hàng.
        Kiểm tra trạng thái chuyến trước khi cập nhật.
        """
        trip = db.query(DeliveryTrip).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chuyến giao hàng với mã '{trip_id}'.",
            )

        # Chặn sửa nếu chuyến đã hoàn thành hoặc đã bị hủy
        if trip.status in [TripStatus.COMPLETED.value, TripStatus.CANCELLED.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chuyến giao hàng '{trip.id}' đã ở trạng thái '{trip.status}', không thể gán hoặc đổi tài xế/xe.",
            )

        # Cập nhật thông tin tài xế
        if payload.driver_name is not None:
            trip.driver_name = payload.driver_name.strip() if payload.driver_name else None
        if payload.driver_phone is not None:
            trip.driver_phone = payload.driver_phone.strip() if payload.driver_phone else None
        if payload.driver_id is not None:
            trip.driver_id = payload.driver_id

        # Cập nhật thông tin phương tiện
        if payload.license_plate is not None:
            trip.license_plate = payload.license_plate.strip() if payload.license_plate else None
        if payload.vehicle_type is not None:
            trip.vehicle_type = payload.vehicle_type.strip() if payload.vehicle_type else None
        if payload.vehicle_id is not None:
            trip.vehicle_id = payload.vehicle_id.strip() if payload.vehicle_id else None

        if payload.notes:
            trip.notes = (trip.notes or "") + f" | Ghi chú điều xe: {payload.notes}"

        # Chuyển đổi trạng thái tương ứng
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
    # 5. LẤY DANH SÁCH ĐIỂM GIAO ĐỂ IN ẤN (MANIFEST) (S6-06 SUBTASK 18)
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

        # Sắp xếp theo đúng thứ tự điểm dừng
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
    # 6. KHỞI HÀNH XUẤT BẾN & HỦY CHUYẾN
    # --------------------------------------------------------------------------
    @classmethod
    def start_trip(cls, db: Session, trip_id: str, current_user: User) -> DeliveryTrip:
        """Xuất bến bắt đầu chuyến giao hàng (READY -> IN_TRANSIT)."""
        trip = db.query(DeliveryTrip).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(status_code=404, detail="Không tìm thấy chuyến.")

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

    @classmethod
    def cancel_trip(cls, db: Session, trip_id: str, current_user: User) -> DeliveryTrip:
        """Hủy chuyến giao hàng khi chưa xuất bến, nhả các phiếu xuất về hàng đợi."""
        trip = db.query(DeliveryTrip).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()

        if not trip:
            raise HTTPException(status_code=404, detail="Không tìm thấy chuyến.")

        if trip.status in [TripStatus.IN_TRANSIT.value, TripStatus.COMPLETED.value]:
            raise HTTPException(
                status_code=400,
                detail=f"Chuyến đang ở trạng thái '{trip.status}', không thể hủy chuyến.",
            )

        # Nhả các phiếu xuất kho
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
    # 7. TRUY VẤN DANH SÁCH & CHI TIẾT CHUYẾN GIAO HÀNG
    # --------------------------------------------------------------------------
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
        """Lấy danh sách các chuyến giao hàng kèm bộ lọc và phân trang."""
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
        return items, total

    @classmethod
    def get_trip(cls, db: Session, trip_id: str) -> DeliveryTrip:
        """Lấy chi tiết một chuyến giao hàng."""
        trip = db.query(DeliveryTrip).filter(
            or_(DeliveryTrip.id == trip_id, DeliveryTrip.trip_code == trip_id)
        ).first()
        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chuyến giao hàng với mã '{trip_id}'.",
            )
        return trip
