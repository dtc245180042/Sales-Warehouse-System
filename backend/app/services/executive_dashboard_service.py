from typing import List, Optional, Tuple, Dict, Any
import time
from datetime import datetime, date, timezone, timedelta
from calendar import monthrange
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, desc

from app.models.order import Order
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.warehouse_stock import WarehouseStock
from app.models.product_stock_profile import ProductStockProfile
from app.models.product import Product
from app.models.customer_credit_profile import CustomerCreditProfile
from app.models.customer_debt_profile import CustomerDebtProfile
from app.schemas.executive_dashboard import (
    DashboardKPISummary,
    DailySalesPoint,
    RegionalSalesPoint,
    OverdueAgencyItem,
    ExecutiveDashboardResponse,
)


class ExecutiveDashboardService:
    """
    Dịch vụ xử lý số liệu Dashboard điều hành bán hàng và kho (Story S8-05 / SC-276).
    Đảm bảo thời gian phản hồi toàn bộ dữ liệu dưới 2 giây với cơ chế TTL Cache thông minh.
    """

    # In-memory TTL Cache: {cache_key: (data_dict, expire_timestamp)}
    _CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
    CACHE_TTL_SECONDS = 60.0  # Thời gian sống của cache: 60 giây

    @classmethod
    def clear_cache(cls) -> None:
        """Xóa toàn bộ bộ nhớ đệm cache."""
        cls._CACHE.clear()

    @classmethod
    def _get_date_range(
        cls,
        period_type: str = "this_month",
        custom_start: Optional[date] = None,
        custom_end: Optional[date] = None,
    ) -> Tuple[datetime, datetime, date, date]:
        """Xác định khoảng thời gian bắt đầu và kết thúc (UTC và Date)."""
        now = datetime.now(timezone.utc)
        today = now.date()

        if period_type == "today":
            d_start = today
            d_end = today
        elif period_type == "last_month":
            first_of_this_month = today.replace(day=1)
            last_day_prev_month = first_of_this_month - timedelta(days=1)
            d_start = last_day_prev_month.replace(day=1)
            d_end = last_day_prev_month
        elif period_type == "custom" and custom_start and custom_end:
            d_start = custom_start
            d_end = custom_end
        else:  # "this_month" mặc định
            d_start = today.replace(day=1)
            _, last_day = monthrange(today.year, today.month)
            d_end = today.replace(day=last_day)

        dt_start = datetime(d_start.year, d_start.month, d_start.day, 0, 0, 0, tzinfo=timezone.utc)
        dt_end = datetime(d_end.year, d_end.month, d_end.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
        return dt_start, dt_end, d_start, d_end

    @classmethod
    def get_dashboard_data(
        cls,
        db: Session,
        period_type: str = "this_month",
        custom_start: Optional[date] = None,
        custom_end: Optional[date] = None,
        region: Optional[str] = None,
        refresh: bool = False,
    ) -> ExecutiveDashboardResponse:
        """
        Truy xuất toàn bộ số liệu tổng hợp điều hành:
        - 6 Thẻ chỉ số (Doanh số hôm nay/tháng này, đơn chờ duyệt/chờ xuất, công nợ quá hạn, SKU dưới tồn).
        - Biểu đồ doanh số theo ngày trong tháng.
        - Biểu đồ doanh số theo khu vực.
        - Danh sách đại lý nợ quá hạn xếp giảm dần theo số tiền.
        """
        start_bench = time.perf_counter()
        now_utc = datetime.now(timezone.utc)

        # 1. Kiểm tra cache nếu không yêu cầu refresh
        cache_key = f"{period_type}:{custom_start}:{custom_end}:{region}"
        if not refresh and cache_key in cls._CACHE:
            cached_data, expire_at = cls._CACHE[cache_key]
            if time.time() < expire_at:
                cached_data["cached"] = True
                cached_data["execution_time_ms"] = round((time.perf_counter() - start_bench) * 1000, 2)
                return ExecutiveDashboardResponse(**cached_data)

        dt_start, dt_end, d_start, d_end = cls._get_date_range(period_type, custom_start, custom_end)

        # Khung giờ 'hôm nay' (UTC ngày hôm nay)
        today_date = now_utc.date()
        dt_today_start = datetime(today_date.year, today_date.month, today_date.day, 0, 0, 0, tzinfo=timezone.utc)
        dt_today_end = datetime(today_date.year, today_date.month, today_date.day, 23, 59, 59, 999999, tzinfo=timezone.utc)

        # ----------------------------------------------------------------------
        # 1. TÍNH TOÁN CÁC CHỈ SỐ DOANH SỐ & ĐƠN HÀNG
        # ----------------------------------------------------------------------
        # Trạng thái không tính vào doanh thu (hủy / nháp)
        excluded_statuses = ["cancelled", "CANCELLED", "draft", "DRAFT"]

        order_base_query = db.query(Order).filter(~Order.status.in_(excluded_statuses))
        if region:
            # Lọc theo khu vực khách hàng
            order_base_query = order_base_query.join(Customer, Customer.id == Order.customer_id).filter(
                Customer.region == region
            )

        # A. Doanh số hôm nay
        orders_today = order_base_query.filter(
            Order.created_at >= dt_today_start,
            Order.created_at <= dt_today_end,
        ).all()
        rev_today = sum(int(o.total or 0) for o in orders_today)
        orders_today_count = len(orders_today)

        # B. Doanh số trong kỳ lọc (mặc định Tháng này)
        orders_period = order_base_query.filter(
            Order.created_at >= dt_start,
            Order.created_at <= dt_end,
        ).all()
        rev_period = sum(int(o.total or 0) for o in orders_period)
        orders_period_count = len(orders_period)

        # C. Đơn chờ duyệt
        # Các đơn đang ở trạng thái pending, pending_approval hoặc có cờ requires_approval=True
        pending_approval_statuses = ["pending", "pending_approval", "PENDING", "PENDING_APPROVAL", "draft", "DRAFT"]
        pending_approval_count = db.query(func.count(Order.id)).filter(
            or_(
                Order.status.in_(pending_approval_statuses),
                and_(Order.requires_approval == True, ~Order.status.in_(["approved", "APPROVED", "cancelled", "CANCELLED", "completed", "COMPLETED"]))
            )
        ).scalar() or 0

        # D. Đơn chờ xuất kho / đang đóng gói chuẩn bị giao
        pending_dispatch_statuses = ["approved", "APPROVED", "confirmed", "CONFIRMED", "processing", "packing", "PACKING", "preparing", "PREPARING"]
        pending_dispatch_count = db.query(func.count(Order.id)).filter(
            Order.status.in_(pending_dispatch_statuses)
        ).scalar() or 0

        # ----------------------------------------------------------------------
        # 2. CÔNG NỢ QUÁ HẠN & DANH SÁCH ĐẠI LÝ QUÁ HẠN (SUBTASK 12)
        # ----------------------------------------------------------------------
        # Tìm tất cả hóa đơn chưa thanh toán hết và đã qua ngày due_date
        # Invoice.due_date < now_utc VÀ (Invoice.remaining_amount > 0 hoặc Invoice.status != 'PAID')
        overdue_invoices_query = db.query(Invoice).filter(
            Invoice.due_date < now_utc,
            Invoice.status != "PAID",
        )
        if region:
            overdue_invoices_query = overdue_invoices_query.join(Customer, Customer.id == Invoice.customer_id).filter(
                Customer.region == region
            )

        overdue_invoices = overdue_invoices_query.all()

        total_overdue_debt = 0
        customer_overdue_map: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "customer_id": "",
            "overdue_amount": 0,
            "max_overdue_days": 0,
            "invoices_count": 0,
        })

        for inv in overdue_invoices:
            # Tính số nợ còn lại
            rem = int(inv.remaining_amount if inv.remaining_amount is not None else (inv.total_amount - (inv.paid_amount or 0)))
            if rem <= 0:
                continue

            total_overdue_debt += rem

            # Tính số ngày quá hạn
            inv_due = inv.due_date
            if inv_due.tzinfo is None:
                inv_due = inv_due.replace(tzinfo=timezone.utc)
            overdue_days = max(1, (now_utc - inv_due).days)

            cid = inv.customer_id
            agg = customer_overdue_map[cid]
            agg["customer_id"] = cid
            agg["overdue_amount"] += rem
            agg["invoices_count"] += 1
            if overdue_days > agg["max_overdue_days"]:
                agg["max_overdue_days"] = overdue_days

        # Lấy thông tin chi tiết các đại lý quá hạn
        overdue_agencies_list: List[OverdueAgencyItem] = []
        if customer_overdue_map:
            cids = list(customer_overdue_map.keys())
            customers = {c.id: c for c in db.query(Customer).filter(Customer.id.in_(cids)).all()}

            # Lấy hạn mức tín dụng từ CustomerCreditProfile hoặc CustomerDebtProfile
            credit_profiles = {cp.customer_id: cp for cp in db.query(CustomerCreditProfile).filter(CustomerCreditProfile.customer_id.in_(cids)).all()}
            debt_profiles = {dp.customer_id: dp for dp in db.query(CustomerDebtProfile).filter(CustomerDebtProfile.customer_id.in_(cids)).all()}

            for cid, agg in customer_overdue_map.items():
                cust = customers.get(cid)
                if not cust:
                    continue

                cred_limit = 0
                if cid in credit_profiles and credit_profiles[cid].credit_limit:
                    cred_limit = int(credit_profiles[cid].credit_limit)
                elif cid in debt_profiles and debt_profiles[cid].credit_limit:
                    cred_limit = int(debt_profiles[cid].credit_limit)

                item = OverdueAgencyItem(
                    customer_id=cust.id,
                    customer_code=cust.code or cust.id,
                    customer_name=cust.name,
                    customer_phone=cust.phone,
                    region=cust.region or "Chưa phân vùng",
                    credit_limit=cred_limit,
                    overdue_amount=agg["overdue_amount"],
                    max_overdue_days=agg["max_overdue_days"],
                    overdue_invoices_count=agg["invoices_count"],
                    status=cust.status or "active",
                )
                overdue_agencies_list.append(item)

            # Sắp xếp giảm dần theo số tiền nợ quá hạn (AC: Xếp theo số tiền nợ)
            overdue_agencies_list.sort(key=lambda x: x.overdue_amount, reverse=True)

        # ----------------------------------------------------------------------
        # 3. SỐ LƯỢNG SKU DƯỚI ĐỊNH MỨC TỒN TỐI THIỂU
        # ----------------------------------------------------------------------
        low_stock_skus = set()

        # Quét từ ProductStockProfile (nơi lưu min_stock theo sản phẩm)
        try:
            profiles = db.query(ProductStockProfile).filter(
                ProductStockProfile.min_stock > 0,
                ProductStockProfile.stock < ProductStockProfile.min_stock,
            ).all()
            for p in profiles:
                low_stock_skus.add(p.sku or str(p.product_id))
        except Exception:
            pass

        # Quét từ WarehouseStock
        try:
            wh_stocks = db.query(WarehouseStock).filter(
                WarehouseStock.min_stock > 0,
                WarehouseStock.stock < WarehouseStock.min_stock,
            ).all()
            for w in wh_stocks:
                low_stock_skus.add(w.sku or str(w.product_id))
        except Exception:
            pass

        # Quét từ Product (nếu có cột min_stock hoặc min_stock_level)
        try:
            prods = db.query(Product).all()
            for pr in prods:
                min_s = getattr(pr, "min_stock", None) or getattr(pr, "min_stock_level", None) or 0
                stk = getattr(pr, "stock", None) or 0
                if min_s > 0 and stk < min_s:
                    low_stock_skus.add(pr.sku or str(pr.id))
        except Exception:
            pass

        low_stock_count = len(low_stock_skus)

        # ----------------------------------------------------------------------
        # 4. BIỂU ĐỒ DOANH SỐ THEO NGÀY TRONG THÁNG (SUBTASK 16)
        # ----------------------------------------------------------------------
        daily_sales_map: Dict[str, Dict[str, Any]] = {}
        # Khởi tạo toàn bộ các ngày trong kỳ
        curr_d = d_start
        while curr_d <= d_end:
            ds_str = curr_d.strftime("%Y-%m-%d")
            lbl = curr_d.strftime("%d/%m")
            daily_sales_map[ds_str] = {
                "date": ds_str,
                "label": lbl,
                "sales_amount": 0,
                "order_count": 0,
            }
            curr_d += timedelta(days=1)

        # Phân bổ các đơn hàng vào từng ngày
        for o in orders_period:
            if not o.created_at:
                continue
            o_date = o.created_at.date() if isinstance(o.created_at, datetime) else o.created_at
            ds_str = o_date.strftime("%Y-%m-%d")
            if ds_str in daily_sales_map:
                daily_sales_map[ds_str]["sales_amount"] += int(o.total or 0)
                daily_sales_map[ds_str]["order_count"] += 1

        daily_sales_list = [DailySalesPoint(**val) for val in daily_sales_map.values()]

        # ----------------------------------------------------------------------
        # 5. BIỂU ĐỒ DOANH SỐ THEO KHU VỰC (SUBTASK 16)
        # ----------------------------------------------------------------------
        # Gom nhóm doanh số theo khu vực khách hàng
        region_sales_map: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "sales_amount": 0,
            "order_count": 0,
        })

        # Cache khu vực khách hàng để tránh N+1 query
        all_customers = {c.id: c.region for c in db.query(Customer.id, Customer.region).all()}

        for o in orders_period:
            reg = all_customers.get(o.customer_id) or "Chưa phân vùng"
            region_sales_map[reg]["sales_amount"] += int(o.total or 0)
            region_sales_map[reg]["order_count"] += 1

        total_reg_sales = sum(r["sales_amount"] for r in region_sales_map.values())
        regional_sales_list: List[RegionalSalesPoint] = []

        for reg_name, reg_data in region_sales_map.items():
            pct = round((reg_data["sales_amount"] / total_reg_sales * 100), 1) if total_reg_sales > 0 else 0.0
            regional_sales_list.append(
                RegionalSalesPoint(
                    region=reg_name,
                    sales_amount=reg_data["sales_amount"],
                    order_count=reg_data["order_count"],
                    percentage=pct,
                )
            )

        # Sắp xếp khu vực theo doanh số giảm dần
        regional_sales_list.sort(key=lambda x: x.sales_amount, reverse=True)

        # ----------------------------------------------------------------------
        # 6. ĐÓNG GÓI KẾT QUẢ VÀ LƯU CACHE
        # ----------------------------------------------------------------------
        elapsed_ms = round((time.perf_counter() - start_bench) * 1000, 2)

        kpis = DashboardKPISummary(
            revenue_today=rev_today,
            revenue_this_month=rev_period,
            pending_approval_orders=pending_approval_count,
            pending_dispatch_orders=pending_dispatch_count,
            overdue_debt_amount=total_overdue_debt,
            low_stock_sku_count=low_stock_count,
            total_orders_today=orders_today_count,
            total_orders_this_month=orders_period_count,
            overdue_agencies_count=len(overdue_agencies_list),
        )

        resp_dict = {
            "kpis": kpis.model_dump(),
            "daily_sales": [d.model_dump() for d in daily_sales_list],
            "regional_sales": [r.model_dump() for r in regional_sales_list],
            "overdue_agencies": [a.model_dump() for a in overdue_agencies_list],
            "filter_period": period_type,
            "selected_region": region,
            "cached": False,
            "execution_time_ms": elapsed_ms,
            "generated_at": now_utc,
        }

        # Lưu cache với TTL
        cls._CACHE[cache_key] = (resp_dict, time.time() + cls.CACHE_TTL_SECONDS)

        return ExecutiveDashboardResponse(**resp_dict)
