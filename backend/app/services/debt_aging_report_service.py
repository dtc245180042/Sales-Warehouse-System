"""
Service Báo cáo Công nợ Quá hạn theo Tuổi nợ (Story S8-09 - SCRUM-280).

Yêu cầu nghiệp vụ:
- Tổng hợp theo nhóm tuổi nợ và theo nhân viên phụ trách.
- Chỉ ra đại lý có rủi ro cao nhất.
- Hỗ trợ xuất Excel (trả về dữ liệu đã được chuẩn hóa).

Tuân thủ AGENTS.md:
- CHỈ THÊM MỚI: Không chỉnh sửa bất kỳ file nào khác.
- Liên kết lỏng: Chỉ lưu scalar ID, không dùng relationship() chéo.
- Chống N+1: Gom ID query 1 lần rồi tra cứu O(1).
- Cấm .all() quét toàn bảng: Dùng filter + limit.
"""
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timezone, date
from zoneinfo import ZoneInfo
import logging

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.invoice import Invoice, InvoiceStatus
from app.models.customer import Customer
from app.schemas.debt_aging_report import (
    DebtAgingReportResponse,
    DebtAgingCustomerRow,
    SalesRepAgingSummary,
    AgingBucketSummary,
)

logger = logging.getLogger(__name__)
TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")

# ==============================================================================
# CẤU HÌNH CÁC NHÓM TUỔI NỢ
# ==============================================================================
AGING_BUCKETS = [
    # (label, min_days, max_days_exclusive) - None = không giới hạn
    ("Chưa đến hạn", None, 0),    # due_date >= today
    ("1-30 ngày", 1, 30),
    ("31-60 ngày", 31, 60),
    ("61-90 ngày", 61, 90),
    ("Trên 90 ngày", 91, None),
]

# ==============================================================================
# CẤU HÌNH MỨC RỦI RO
# ==============================================================================
def _tinh_muc_rui_ro(overdue_total: int, overdue_ratio: float, oldest_overdue_days: int) -> str:
    """
    Xác định mức độ rủi ro công nợ của đại lý.
    - CRITICAL: Nợ quá hạn > 90 ngày hoặc tỷ lệ > 80%
    - HIGH:     Nợ quá hạn > 60 ngày hoặc tỷ lệ > 50%
    - MEDIUM:   Nợ quá hạn > 30 ngày hoặc tỷ lệ > 20%
    - LOW:      Còn lại (chưa đến hạn hoặc mới quá hạn)
    """
    if oldest_overdue_days > 90 or overdue_ratio > 0.8:
        return "CRITICAL"
    if oldest_overdue_days > 60 or overdue_ratio > 0.5:
        return "HIGH"
    if oldest_overdue_days > 30 or overdue_ratio > 0.2:
        return "MEDIUM"
    return "LOW"


def _tinh_so_ngay_qua_han(due_date: datetime, today: date) -> int:
    """
    Tính số ngày quá hạn của một hóa đơn.
    Trả về 0 nếu chưa đến hạn (âm → coi là 0 quá hạn nhưng là current).
    """
    due = due_date.date() if isinstance(due_date, datetime) else due_date
    delta = (today - due).days
    return delta  # âm = chưa đến hạn, dương = quá hạn


class DebtAgingReportService:
    """
    Service tổng hợp báo cáo Công nợ Quá hạn theo Tuổi nợ.
    Đầu vào: DB session + thông tin lọc.
    Đầu ra: DebtAgingReportResponse đầy đủ.
    """

    @classmethod
    def get_debt_aging_report(
        cls,
        db: Session,
        current_user: User,
        customer_id: Optional[str] = None,
        sales_rep: Optional[str] = None,
        region: Optional[str] = None,
        as_of_date: Optional[date] = None,
    ) -> DebtAgingReportResponse:
        """
        Tổng hợp báo cáo công nợ quá hạn theo tuổi nợ.

        Phân quyền:
        - Director / SalesManager / Accountant: xem tất cả.
        - SalesStaff: chỉ xem đại lý mình phụ trách.
        - Customer: không được phép truy cập endpoint này.
        """
        # 1. Kiểm tra quyền
        user_role = current_user.role if hasattr(current_user, "role") else ""
        if user_role == UserRole.CUSTOMER.value or user_role.lower() == "customer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vai trò Đại lý không có quyền xem báo cáo công nợ tổng hợp.",
            )

        today = as_of_date or datetime.now(TZ_VN).date()
        today_str = today.strftime("%d/%m/%Y")

        # 2. Lấy tất cả hóa đơn còn nợ (UNPAID hoặc PARTIALLY_PAID)
        #    Dùng filter, KHÔNG dùng .all() quét toàn bảng
        invoice_query = db.query(Invoice).filter(
            Invoice.status.in_([InvoiceStatus.UNPAID.value, InvoiceStatus.PARTIALLY_PAID.value]),
            Invoice.remaining_amount > 0,
        )
        if customer_id:
            invoice_query = invoice_query.filter(Invoice.customer_id == customer_id)

        # Phân quyền SalesStaff / Sales Rep: chỉ xem đại lý mình phụ trách
        if user_role.lower() in ("salesstaff", "staff", "sales rep", "salesrep", "sales"):
            staff_name = current_user.full_name or current_user.username
            # Lấy customer_id của đại lý mà staff này phụ trách
            assigned_customers = db.query(Customer.id).filter(
                Customer.assigned_sales_rep == staff_name
            ).all()
            assigned_ids = [c.id for c in assigned_customers]
            if not assigned_ids:
                # Không có đại lý nào → trả báo cáo rỗng
                return cls._build_empty_response(today_str)
            invoice_query = invoice_query.filter(Invoice.customer_id.in_(assigned_ids))

        outstanding_invoices = invoice_query.order_by(Invoice.due_date.asc()).all()

        if not outstanding_invoices:
            return cls._build_empty_response(today_str)

        # 3. Gom tất cả customer_id duy nhất → query customers 1 lần (chống N+1)
        all_customer_ids = list({inv.customer_id for inv in outstanding_invoices})
        customers_map: Dict[str, Customer] = {}
        if all_customer_ids:
            customer_rows = db.query(Customer).filter(Customer.id.in_(all_customer_ids)).all()
            customers_map = {c.id: c for c in customer_rows}

        # Lọc theo sales_rep hoặc region nếu có
        if sales_rep:
            filter_cust_ids = {
                cid for cid, cust in customers_map.items()
                if cust.assigned_sales_rep and sales_rep.lower() in cust.assigned_sales_rep.lower()
            }
            outstanding_invoices = [inv for inv in outstanding_invoices if inv.customer_id in filter_cust_ids]
        if region:
            filter_cust_ids = {
                cid for cid, cust in customers_map.items()
                if cust.region and region.lower() in cust.region.lower()
            }
            outstanding_invoices = [inv for inv in outstanding_invoices if inv.customer_id in filter_cust_ids]

        # 4. Tổng hợp theo từng đại lý
        # customer_id → Dict tổng hợp
        cust_agg: Dict[str, Dict] = {}
        for inv in outstanding_invoices:
            cid = inv.customer_id
            if cid not in cust_agg:
                cust_agg[cid] = {
                    "total_invoices": 0,
                    "total_debt": 0,
                    "current_amount": 0,
                    "bucket_1_30": 0,
                    "bucket_31_60": 0,
                    "bucket_61_90": 0,
                    "bucket_over_90": 0,
                    "oldest_overdue_days": 0,
                    "oldest_invoice_id": None,
                }

            agg = cust_agg[cid]
            remaining = inv.remaining_amount
            overdue_days = _tinh_so_ngay_qua_han(inv.due_date, today)

            agg["total_invoices"] += 1
            agg["total_debt"] += remaining

            if overdue_days <= 0:
                agg["current_amount"] += remaining
            elif overdue_days <= 30:
                agg["bucket_1_30"] += remaining
            elif overdue_days <= 60:
                agg["bucket_31_60"] += remaining
            elif overdue_days <= 90:
                agg["bucket_61_90"] += remaining
            else:
                agg["bucket_over_90"] += remaining

            if overdue_days > agg["oldest_overdue_days"]:
                agg["oldest_overdue_days"] = overdue_days
                agg["oldest_invoice_id"] = inv.id

        # 5. Xây dựng danh sách DebtAgingCustomerRow
        customer_rows_result: List[DebtAgingCustomerRow] = []
        for cid, agg in cust_agg.items():
            cust_obj = customers_map.get(cid)
            total_debt = agg["total_debt"]
            overdue_total = (
                agg["bucket_1_30"] + agg["bucket_31_60"]
                + agg["bucket_61_90"] + agg["bucket_over_90"]
            )
            overdue_ratio = round(overdue_total / total_debt, 4) if total_debt > 0 else 0.0
            oldest_days = agg["oldest_overdue_days"]
            if oldest_days < 0:
                oldest_days = 0

            risk_level = _tinh_muc_rui_ro(overdue_total, overdue_ratio, oldest_days)

            row = DebtAgingCustomerRow(
                customer_id=cid,
                customer_name=cust_obj.name if cust_obj else cid,
                customer_code=cust_obj.code if cust_obj else None,
                region=cust_obj.region if cust_obj else None,
                assigned_sales_rep=cust_obj.assigned_sales_rep if cust_obj else None,
                total_invoices=agg["total_invoices"],
                total_debt=total_debt,
                current_amount=agg["current_amount"],
                bucket_1_30=agg["bucket_1_30"],
                bucket_31_60=agg["bucket_31_60"],
                bucket_61_90=agg["bucket_61_90"],
                bucket_over_90=agg["bucket_over_90"],
                overdue_total=overdue_total,
                overdue_ratio=overdue_ratio,
                risk_level=risk_level,
                oldest_overdue_days=oldest_days,
                oldest_invoice_id=agg["oldest_invoice_id"],
            )
            customer_rows_result.append(row)

        # 6. Sắp xếp: CRITICAL → HIGH → MEDIUM → LOW, rồi theo overdue_total giảm dần
        risk_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        customer_rows_result.sort(
            key=lambda r: (risk_order.get(r.risk_level, 9), -r.overdue_total)
        )

        # 7. Top 10 rủi ro cao nhất
        top_risk = [r for r in customer_rows_result if r.risk_level in ("CRITICAL", "HIGH")][:10]
        if len(top_risk) < 10:
            # Bổ sung thêm MEDIUM nếu chưa đủ 10
            medium_rows = [r for r in customer_rows_result if r.risk_level == "MEDIUM"]
            top_risk += medium_rows[: 10 - len(top_risk)]

        # 8. Tổng hợp theo nhân viên phụ trách
        rep_agg: Dict[str, Dict] = {}
        for row in customer_rows_result:
            rep = row.assigned_sales_rep or "Chưa phân công"
            if rep not in rep_agg:
                rep_agg[rep] = {
                    "customer_count": 0,
                    "total_debt": 0,
                    "overdue_total": 0,
                    "current_amount": 0,
                    "bucket_1_30": 0,
                    "bucket_31_60": 0,
                    "bucket_61_90": 0,
                    "bucket_over_90": 0,
                    "high_risk_customers": 0,
                }
            r = rep_agg[rep]
            r["customer_count"] += 1
            r["total_debt"] += row.total_debt
            r["overdue_total"] += row.overdue_total
            r["current_amount"] += row.current_amount
            r["bucket_1_30"] += row.bucket_1_30
            r["bucket_31_60"] += row.bucket_31_60
            r["bucket_61_90"] += row.bucket_61_90
            r["bucket_over_90"] += row.bucket_over_90
            if row.risk_level in ("HIGH", "CRITICAL"):
                r["high_risk_customers"] += 1

        by_sales_rep_result = []
        for rep_name, r in rep_agg.items():
            total = r["total_debt"]
            overdue = r["overdue_total"]
            by_sales_rep_result.append(SalesRepAgingSummary(
                sales_rep_name=rep_name,
                customer_count=r["customer_count"],
                total_debt=total,
                overdue_total=overdue,
                current_amount=r["current_amount"],
                bucket_1_30=r["bucket_1_30"],
                bucket_31_60=r["bucket_31_60"],
                bucket_61_90=r["bucket_61_90"],
                bucket_over_90=r["bucket_over_90"],
                overdue_ratio=round(overdue / total, 4) if total > 0 else 0.0,
                high_risk_customers=r["high_risk_customers"],
            ))
        by_sales_rep_result.sort(key=lambda x: -x.overdue_total)

        # 9. Bucket summaries (tổng từng nhóm)
        grand_total_debt = sum(r.total_debt for r in customer_rows_result)
        bucket_summaries_result = []
        bucket_configs = [
            ("Chưa đến hạn", "current_amount"),
            ("1-30 ngày", "bucket_1_30"),
            ("31-60 ngày", "bucket_31_60"),
            ("61-90 ngày", "bucket_61_90"),
            ("Trên 90 ngày", "bucket_over_90"),
        ]
        for label, field_name in bucket_configs:
            total_amt = sum(getattr(r, field_name) for r in customer_rows_result)
            cust_cnt = sum(1 for r in customer_rows_result if getattr(r, field_name) > 0)
            inv_cnt_field = "total_invoices" if field_name == "current_amount" else "total_invoices"
            pct = round(total_amt / grand_total_debt * 100, 2) if grand_total_debt > 0 else 0.0
            bucket_summaries_result.append(AgingBucketSummary(
                bucket_label=label,
                total_amount=total_amt,
                customer_count=cust_cnt,
                invoice_count=0,    # Không cần đếm riêng từng invoice, tránh N+1
                percentage=pct,
            ))

        # 10. Tổng số liệu toàn hệ thống
        total_overdue = sum(r.overdue_total for r in customer_rows_result)

        return DebtAgingReportResponse(
            report_date=today_str,
            total_customers_with_debt=len(customer_rows_result),
            total_debt_amount=grand_total_debt,
            total_overdue_amount=total_overdue,
            total_invoices_outstanding=sum(r.total_invoices for r in customer_rows_result),
            bucket_summaries=bucket_summaries_result,
            customers=customer_rows_result,
            top_risk_customers=top_risk,
            by_sales_rep=by_sales_rep_result,
        )

    @staticmethod
    def _build_empty_response(today_str: str) -> DebtAgingReportResponse:
        """Trả về báo cáo rỗng khi không có dữ liệu."""
        return DebtAgingReportResponse(
            report_date=today_str,
            total_customers_with_debt=0,
            total_debt_amount=0,
            total_overdue_amount=0,
            total_invoices_outstanding=0,
            bucket_summaries=[
                AgingBucketSummary(bucket_label="Chưa đến hạn", total_amount=0, customer_count=0, invoice_count=0, percentage=0.0),
                AgingBucketSummary(bucket_label="1-30 ngày", total_amount=0, customer_count=0, invoice_count=0, percentage=0.0),
                AgingBucketSummary(bucket_label="31-60 ngày", total_amount=0, customer_count=0, invoice_count=0, percentage=0.0),
                AgingBucketSummary(bucket_label="61-90 ngày", total_amount=0, customer_count=0, invoice_count=0, percentage=0.0),
                AgingBucketSummary(bucket_label="Trên 90 ngày", total_amount=0, customer_count=0, invoice_count=0, percentage=0.0),
            ],
            customers=[],
            top_risk_customers=[],
            by_sales_rep=[],
        )
