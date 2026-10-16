from typing import List, Optional, Tuple, Dict
from datetime import datetime, date, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from fastapi import HTTPException, status

from app.models.auth import User
from app.models.customer import Customer
from app.models.route_cash_collection import (
    RouteCashCollection,
    CollectionStatus,
    CollectionPaymentMethod,
    DiscrepancyType,
)
from app.schemas.route_cash_collection import (
    RouteCashCollectionCreate,
    RouteCashCollectionUpdate,
    RemittanceConfirmRequest,
    CollectionAdjustmentRequest,
    DailyReconciliationSummary,
    DailyReconciliationDiscrepancyWarning,
)


class RouteCashCollectionService:
    """
    Dịch vụ xử lý nghiệp vụ Thu tiền theo tuyến và Nộp về công ty (Story S7-05 / SC-263).
    """

    @classmethod
    def _generate_code(cls, db: Session, date_str: str) -> str:
        """Tạo mã chứng từ thu tuyến dạng TT-YYYYMMDD-XXXX."""
        prefix = f"TT-{date_str}-"
        last_rec = (
            db.query(RouteCashCollection)
            .filter(RouteCashCollection.id.like(f"{prefix}%"))
            .order_by(desc(RouteCashCollection.id))
            .first()
        )
        if not last_rec:
            seq = 1
        else:
            try:
                seq = int(last_rec.id.split("-")[-1]) + 1
            except (ValueError, IndexError):
                seq = 1
        return f"{prefix}{seq:04d}"

    # --------------------------------------------------------------------------
    # 1. GHI NHẬN KHOẢN THU THEO TUYẾN KÈM ẢNH BIÊN LAI (SUBTASK 16)
    # --------------------------------------------------------------------------
    @classmethod
    def record_collection(
        cls,
        db: Session,
        payload: RouteCashCollectionCreate,
        current_user: User,
    ) -> RouteCashCollection:
        """Ghi nhận khoản thu ngay tại cửa hàng kèm ảnh biên lai."""
        coll_date = payload.collection_date or datetime.now(timezone.utc)
        date_str = coll_date.strftime("%Y%m%d")
        new_id = cls._generate_code(db, date_str)

        cust_name = payload.customer_name
        cust_addr = payload.customer_address
        if not cust_name or not cust_addr:
            cust = db.query(Customer).filter(Customer.id == payload.customer_id).first()
            if cust:
                cust_name = cust_name or cust.name
                cust_addr = cust_addr or getattr(cust, "address", None)

        record = RouteCashCollection(
            id=new_id,
            collection_code=new_id,
            amount=payload.amount,
            payment_method=payload.payment_method or CollectionPaymentMethod.CASH.value,
            collection_date=coll_date,
            collector_id=current_user.id,
            collector_name=current_user.full_name or current_user.username,
            collector_phone=getattr(current_user, "phone_number", None),
            customer_id=payload.customer_id,
            customer_name=cust_name or payload.customer_id,
            customer_address=cust_addr,
            route_name=payload.route_name,
            order_id=payload.order_id,
            invoice_id=payload.invoice_id,
            receipt_image_url=payload.receipt_image_url,
            status=CollectionStatus.PENDING_REMITTANCE.value,
            is_locked=False,
            notes=payload.notes,
            created_at=datetime.now(timezone.utc),
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    # --------------------------------------------------------------------------
    # 2. XÁC NHẬN NỘP TIỀN VỀ CÔNG TY (CHỜ NỘP -> ĐÃ NỘP) (SUBTASK 12)
    # --------------------------------------------------------------------------
    @classmethod
    def confirm_remittance(
        cls,
        db: Session,
        collection_id: str,
        payload: RemittanceConfirmRequest,
        current_user: User,
    ) -> RouteCashCollection:
        """Kế toán xác nhận nhận tiền nộp về công ty, cập nhật trạng thái và khóa sửa xóa."""
        record = db.query(RouteCashCollection).filter(RouteCashCollection.id == collection_id).first()
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy khoản thu mã {collection_id}",
            )

        if record.status != CollectionStatus.PENDING_REMITTANCE.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Khoản thu hiện ở trạng thái '{record.status}', chỉ có thể xác nhận khi ở trạng thái 'Chờ nộp' (PENDING_REMITTANCE).",
            )

        remitted_val = payload.remitted_amount if payload.remitted_amount is not None else record.amount

        record.status = CollectionStatus.REMITTED.value
        record.is_locked = True  # Khóa dữ liệu bất biến
        record.remitted_amount = remitted_val
        record.confirmed_by_id = current_user.id
        record.confirmed_by_name = current_user.full_name or current_user.username
        record.confirmed_at = datetime.now(timezone.utc)
        record.remittance_notes = payload.remittance_notes
        record.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(record)
        return record

    # --------------------------------------------------------------------------
    # 3. QUY TRÌNH CHẶN SỬA / XÓA KHOẢN THU ĐÃ XÁC NHẬN (SUBTASK 14)
    # --------------------------------------------------------------------------
    @classmethod
    def update_collection(
        cls,
        db: Session,
        collection_id: str,
        payload: RouteCashCollectionUpdate,
        current_user: User,
    ) -> RouteCashCollection:
        """Cập nhật thông tin khoản thu khi chưa nộp. CHẶN nếu đã được xác nhận."""
        record = db.query(RouteCashCollection).filter(RouteCashCollection.id == collection_id).first()
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy khoản thu mã {collection_id}",
            )

        # Ràng buộc bất biến: Không cho sửa khi đã khóa hoặc đã xác nhận nộp
        if record.is_locked or record.status in [CollectionStatus.REMITTED.value, CollectionStatus.ADJUSTED.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Khoản thu đã được kế toán xác nhận nộp tiền, không cho phép sửa đổi trực tiếp. Mọi thay đổi phải đi qua chứng từ điều chỉnh có kiểm soát.",
            )

        if payload.amount is not None:
            record.amount = payload.amount
        if payload.payment_method is not None:
            record.payment_method = payload.payment_method
        if payload.receipt_image_url is not None:
            record.receipt_image_url = payload.receipt_image_url
        if payload.notes is not None:
            record.notes = payload.notes
        record.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(record)
        return record

    @classmethod
    def delete_collection(
        cls,
        db: Session,
        collection_id: str,
        current_user: User,
    ) -> dict:
        """Xóa khoản thu khi còn ở trạng thái Chờ nộp. CHẶN nếu đã được xác nhận."""
        record = db.query(RouteCashCollection).filter(RouteCashCollection.id == collection_id).first()
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy khoản thu mã {collection_id}",
            )

        # Ràng buộc bất biến: Không cho xóa khi đã khóa hoặc đã nộp
        if record.is_locked or record.status in [CollectionStatus.REMITTED.value, CollectionStatus.ADJUSTED.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Khoản thu đã được kế toán xác nhận nộp tiền, không cho phép xóa trực tiếp. Vui lòng lập chứng từ điều chỉnh hoặc hủy bù có kiểm soát.",
            )

        db.delete(record)
        db.commit()
        return {"success": True, "message": f"Đã xóa khoản thu {collection_id} thành công"}

    # --------------------------------------------------------------------------
    # 4. LẬP CHỨNG TỪ ĐIỀU CHỈNH HOẶC HỦY BÙ CÓ KIỂM SOÁT (SUBTASK 14)
    # --------------------------------------------------------------------------
    @classmethod
    def create_adjustment(
        cls,
        db: Session,
        collection_id: str,
        payload: CollectionAdjustmentRequest,
        current_user: User,
    ) -> RouteCashCollection:
        """
        Lập chứng từ điều chỉnh hoặc hủy bù cho khoản đã nộp có kiểm soát.
        - Nếu adjusted_amount == 0: Hủy bù khoản thu (CANCELLED).
        - Nếu adjusted_amount != 0: Điều chỉnh số tiền (ADJUSTED) và tạo chứng từ bù trừ lưu vết.
        """
        orig = db.query(RouteCashCollection).filter(RouteCashCollection.id == collection_id).first()
        if not orig:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy khoản thu mã {collection_id}",
            )

        if orig.status != CollectionStatus.REMITTED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chỉ có thể lập chứng từ điều chỉnh cho khoản thu đã được kế toán xác nhận (REMITTED).",
            )

        now_utc = datetime.now(timezone.utc)
        date_str = now_utc.strftime("%Y%m%d")

        # 1. Tạo bản ghi chứng từ điều chỉnh mới
        adj_code = cls._generate_code(db, date_str) + "-DC"
        diff_amount = payload.adjusted_amount - orig.amount

        adj_record = RouteCashCollection(
            id=adj_code,
            collection_code=adj_code,
            amount=diff_amount,
            payment_method=orig.payment_method,
            collection_date=now_utc,
            collector_id=orig.collector_id,
            collector_name=orig.collector_name,
            collector_phone=orig.collector_phone,
            customer_id=orig.customer_id,
            customer_name=orig.customer_name,
            customer_address=orig.customer_address,
            route_name=orig.route_name,
            order_id=orig.order_id,
            invoice_id=orig.invoice_id,
            receipt_image_url=orig.receipt_image_url,
            status=CollectionStatus.REMITTED.value,
            is_locked=True,
            is_adjustment=True,
            original_collection_id=orig.id,
            adjustment_reason=payload.adjustment_reason,
            adjusted_by_id=current_user.id,
            adjusted_by_name=current_user.full_name or current_user.username,
            adjusted_at=now_utc,
            confirmed_by_id=current_user.id,
            confirmed_by_name=current_user.full_name or current_user.username,
            confirmed_at=now_utc,
            remitted_amount=diff_amount,
            notes=f"Điều chỉnh cho khoản {orig.id}: {payload.notes or ''}",
            created_at=now_utc,
        )
        db.add(adj_record)

        # 2. Cập nhật trạng thái chứng từ gốc
        if payload.adjusted_amount == 0:
            orig.status = CollectionStatus.CANCELLED.value
        else:
            orig.status = CollectionStatus.ADJUSTED.value
        orig.adjustment_reason = payload.adjustment_reason
        orig.adjusted_by_id = current_user.id
        orig.adjusted_by_name = current_user.full_name or current_user.username
        orig.adjusted_at = now_utc
        orig.updated_at = now_utc

        db.commit()
        db.refresh(adj_record)
        return adj_record

    # --------------------------------------------------------------------------
    # 5. TRUY VẤN VÀ CẢNH BÁO CHÊNH LỆCH ĐỐI CHIẾU THEO NGÀY (SUBTASK 10 & 8)
    # --------------------------------------------------------------------------
    @classmethod
    def get_daily_reconciliation(
        cls,
        db: Session,
        target_date: date,
        collector_id: Optional[int] = None,
    ) -> List[DailyReconciliationSummary]:
        """
        Tổng hợp đối chiếu tiền thu và tiền nộp theo từng nhân viên và từng ngày.
        Tự động phát hiện nộp thiếu, nộp thừa hoặc khoản thu treo quá 24h.
        """
        # Xác định khoảng thời gian đầu và cuối ngày UTC
        start_dt = datetime(target_date.year, target_date.month, target_date.day, 0, 0, 0, tzinfo=timezone.utc)
        end_dt = start_dt + timedelta(days=1)

        query = db.query(RouteCashCollection).filter(
            RouteCashCollection.collection_date >= start_dt,
            RouteCashCollection.collection_date < end_dt,
        )
        if collector_id:
            query = query.filter(RouteCashCollection.collector_id == collector_id)

        all_collections = query.order_by(RouteCashCollection.collection_date.asc()).all()

        # Nhóm theo collector_id
        grouped: Dict[int, List[RouteCashCollection]] = {}
        for c in all_collections:
            grouped.setdefault(c.collector_id, []).append(c)

        now_utc = datetime.now(timezone.utc)
        summaries: List[DailyReconciliationSummary] = []

        for c_id, items in grouped.items():
            collector_name = items[0].collector_name or f"Nhân viên #{c_id}"

            total_coll = 0
            total_remit = 0
            total_pend = 0
            cnt_coll = 0
            cnt_remit = 0
            cnt_pend = 0

            warnings: List[DailyReconciliationDiscrepancyWarning] = []

            for it in items:
                cnt_coll += 1
                total_coll += it.amount

                if it.status in [CollectionStatus.REMITTED.value, CollectionStatus.ADJUSTED.value]:
                    cnt_remit += 1
                    actual_remit = it.remitted_amount if it.remitted_amount is not None else it.amount
                    total_remit += actual_remit

                    # Kiểm tra chênh lệch từng khoản thu
                    if actual_remit < it.amount:
                        warnings.append(
                            DailyReconciliationDiscrepancyWarning(
                                collection_id=it.id,
                                collector_id=c_id,
                                collector_name=collector_name,
                                warning_type=DiscrepancyType.UNDER_REMITTED.value,
                                severity="HIGH",
                                message=f"Khoản thu {it.id} nộp thiếu: Thu {it.amount:,}đ nhưng nộp {actual_remit:,}đ (Thiếu {it.amount - actual_remit:,}đ).",
                                details={"amount": it.amount, "remitted": actual_remit, "diff": it.amount - actual_remit},
                            )
                        )
                    elif actual_remit > it.amount:
                        warnings.append(
                            DailyReconciliationDiscrepancyWarning(
                                collection_id=it.id,
                                collector_id=c_id,
                                collector_name=collector_name,
                                warning_type=DiscrepancyType.OVER_REMITTED.value,
                                severity="MEDIUM",
                                message=f"Khoản thu {it.id} nộp thừa: Thu {it.amount:,}đ nhưng nộp {actual_remit:,}đ (Thừa {actual_remit - it.amount:,}đ).",
                                details={"amount": it.amount, "remitted": actual_remit, "diff": actual_remit - it.amount},
                            )
                        )
                elif it.status == CollectionStatus.PENDING_REMITTANCE.value:
                    cnt_pend += 1
                    total_pend += it.amount

                    # Kiểm tra treo quá 24h
                    created_dt = it.created_at
                    if created_dt and created_dt.tzinfo is None:
                        created_dt = created_dt.replace(tzinfo=timezone.utc)
                    age_hours = (now_utc - created_dt).total_seconds() / 3600.0 if created_dt else 0.0
                    if age_hours > 24.0:
                        warnings.append(
                            DailyReconciliationDiscrepancyWarning(
                                collection_id=it.id,
                                collector_id=c_id,
                                collector_name=collector_name,
                                warning_type=DiscrepancyType.PENDING_OVERDUE.value,
                                severity="HIGH" if age_hours < 48 else "CRITICAL",
                                message=f"Khoản thu {it.id} ({it.amount:,}đ) tại {it.customer_name} bị treo chưa nộp quá {int(age_hours)} giờ.",
                                details={"hours_pending": round(age_hours, 1), "amount": it.amount},
                            )
                        )

            # Tính toán tình trạng tổng thể ngày
            # Chênh lệch đối chiếu: Số tiền đã nộp so với số tiền cần nộp (đã thu trừ đi khoản chưa nộp)
            discrepancy = total_remit - (total_coll - total_pend)
            if any(w.warning_type == DiscrepancyType.PENDING_OVERDUE.value for w in warnings):
                recon_status = DiscrepancyType.PENDING_OVERDUE.value
            elif discrepancy < 0:
                recon_status = DiscrepancyType.UNDER_REMITTED.value
                warnings.append(
                    DailyReconciliationDiscrepancyWarning(
                        collector_id=c_id,
                        collector_name=collector_name,
                        warning_type=DiscrepancyType.UNDER_REMITTED.value,
                        severity="HIGH",
                        message=f"Tổng số tiền nộp về công ty trong ngày thiếu {abs(discrepancy):,}đ so với tổng tiền đã thu được xác nhận.",
                    )
                )
            elif discrepancy > 0:
                recon_status = DiscrepancyType.OVER_REMITTED.value
            else:
                recon_status = DiscrepancyType.BALANCED.value

            summaries.append(
                DailyReconciliationSummary(
                    date=target_date.strftime("%Y-%m-%d"),
                    collector_id=c_id,
                    collector_name=collector_name,
                    total_collected_amount=total_coll,
                    total_remitted_amount=total_remit,
                    total_pending_amount=total_pend,
                    count_collected=cnt_coll,
                    count_remitted=cnt_remit,
                    count_pending=cnt_pend,
                    discrepancy_amount=discrepancy,
                    reconciliation_status=recon_status,
                    warnings=warnings,
                    collections=items,
                )
            )

        return summaries

    # --------------------------------------------------------------------------
    # 6. TRUY VẤN DANH SÁCH VÀ CHI TIẾT
    # --------------------------------------------------------------------------
    @classmethod
    def list_collections(
        cls,
        db: Session,
        collector_id: Optional[int] = None,
        status_filter: Optional[str] = None,
        route_name: Optional[str] = None,
        customer_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[RouteCashCollection], int]:
        """Truy vấn danh sách khoản thu có phân trang và bộ lọc."""
        q = db.query(RouteCashCollection)
        if collector_id:
            q = q.filter(RouteCashCollection.collector_id == collector_id)
        if status_filter:
            q = q.filter(RouteCashCollection.status == status_filter)
        if route_name:
            q = q.filter(RouteCashCollection.route_name.ilike(f"%{route_name}%"))
        if customer_id:
            q = q.filter(RouteCashCollection.customer_id == customer_id)
        if date_from:
            dt_f = datetime(date_from.year, date_from.month, date_from.day, 0, 0, 0, tzinfo=timezone.utc)
            q = q.filter(RouteCashCollection.collection_date >= dt_f)
        if date_to:
            dt_t = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc)
            q = q.filter(RouteCashCollection.collection_date <= dt_t)

        total = q.count()
        items = q.order_by(desc(RouteCashCollection.collection_date)).offset(skip).limit(limit).all()
        return items, total

    @classmethod
    def get_collection(cls, db: Session, collection_id: str) -> RouteCashCollection:
        """Chi tiết một khoản thu."""
        record = db.query(RouteCashCollection).filter(RouteCashCollection.id == collection_id).first()
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy khoản thu mã {collection_id}",
            )
        return record
