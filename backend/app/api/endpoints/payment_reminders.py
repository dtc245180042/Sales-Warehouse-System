from typing import Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.schemas.payment_reminder import (
    PaymentReminderCandidateListResponse,
    PaymentReminderJobRequest,
    PaymentReminderJobResponse,
    PaymentReminderLogListResponse,
)
from app.services import payment_reminder_service

router = APIRouter(prefix="/payment-reminders", tags=["Nhắc hạn thanh toán tự động (S7-08)"])


@router.post(
    "/run-daily-job",
    response_model=PaymentReminderJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Chạy tác vụ quét công nợ và gửi nhắc hạn thanh toán định kỳ mỗi ngày (SCRUM-761, SCRUM-762, SCRUM-763)",
)
def run_daily_payment_reminder_job(
    req: Optional[PaymentReminderJobRequest] = None,
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    Tác vụ batch / scheduler chạy định kỳ mỗi ngày 1 lần:
    - Quét toàn bộ hoá đơn chưa thanh toán hoặc thanh toán một phần.
    - Lọc các hoá đơn đến mốc trước hạn 3 ngày và khi quá hạn (SCRUM-760).
    - Tự động gửi email thông báo (SCRUM-762).
    - Tạo bản ghi thông báo trong ứng dụng cho đại lý (SCRUM-759).
    - Chống gửi trùng nhiều lần cho cùng một hoá đơn trong cùng một ngày (SCRUM-763).
    """
    target_date = req.target_date if req else None
    dry_run = req.dry_run if req else False
    customer_id = req.customer_id if req else None
    invoice_id = req.invoice_id if req else None

    return payment_reminder_service.run_daily_payment_reminder_job(
        db=db,
        target_date_str=target_date,
        dry_run=dry_run,
        customer_id=customer_id,
        invoice_id=invoice_id,
    )


@router.get(
    "/candidates",
    response_model=PaymentReminderCandidateListResponse,
    status_code=status.HTTP_200_OK,
    summary="Tra cứu danh sách hoá đơn cần nhắc hạn theo ngày (SCRUM-760)",
)
def get_payment_reminder_candidates(
    target_date: Optional[str] = Query(None, description="Ngày quét kiểm tra (YYYY-MM-DD), mặc định hôm nay UTC"),
    customer_id: Optional[str] = Query(None, description="Lọc theo mã đại lý"),
    invoice_id: Optional[str] = Query(None, description="Lọc theo mã hoá đơn"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """
    API xem trước danh sách hoá đơn sắp đến hạn (trước 3 ngày) hoặc đã quá hạn thanh toán.
    Hỗ trợ nhân viên kế toán kiểm tra danh sách trước khi chạy job hoặc kiểm soát tình hình công nợ.
    """
    target_d = payment_reminder_service._resolve_target_date(target_date)
    candidates = payment_reminder_service.get_candidates(
        db=db,
        target_date=target_d,
        customer_id=customer_id,
        invoice_id=invoice_id,
    )
    before_due_cnt = sum(1 for c in candidates if c.reminder_type == "BEFORE_DUE_3_DAYS")
    overdue_cnt = sum(1 for c in candidates if c.reminder_type == "OVERDUE")

    return PaymentReminderCandidateListResponse(
        target_date=target_d.strftime("%Y-%m-%d"),
        total=len(candidates),
        before_due_count=before_due_cnt,
        overdue_count=overdue_cnt,
        candidates=candidates,
    )


@router.get(
    "/logs",
    response_model=PaymentReminderLogListResponse,
    status_code=status.HTTP_200_OK,
    summary="Tra cứu lịch sử nhắc hạn đã gửi và kiểm tra chống gửi trùng (SCRUM-763)",
)
def get_payment_reminder_logs(
    customer_id: Optional[str] = Query(None, description="Lọc theo mã đại lý"),
    invoice_id: Optional[str] = Query(None, description="Lọc theo mã hoá đơn"),
    run_date: Optional[str] = Query(None, description="Lọc theo ngày chạy (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Số trang hiển thị"),
    limit: int = Query(50, ge=1, le=100, description="Số bản ghi mỗi trang"),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
    db: Session = Depends(lay_phien_db),
):
    """Xem nhật ký các lần gửi email và thông báo in-app cho hoá đơn."""
    return payment_reminder_service.get_reminder_logs(
        db=db,
        customer_id=customer_id,
        invoice_id=invoice_id,
        run_date=run_date,
        page=page,
        limit=limit,
    )
