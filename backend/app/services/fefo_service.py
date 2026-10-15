from datetime import date, datetime
from typing import List, Optional
from zoneinfo import ZoneInfo
from fastapi import HTTPException, status
from sqlalchemy import asc, update
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.schemas.lot import (
    FEFOSuggestionItem,
    FEFOSuggestionRequest,
    FEFOSuggestionResponse,
)

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class FEFOService:
    @staticmethod
    def get_current_vn_date() -> date:
        return datetime.now(VN_TZ).date()

    @classmethod
    def suggest_lots_fefo(
        cls,
        db: Session,
        product_id: str,
        warehouse_id: int,
        requested_quantity: int,
    ) -> FEFOSuggestionResponse:
        """
        Thuật toán FEFO (First Expired, First Out) gợi ý lô xuất kho (S6-04):
        - Kiểm tra sản phẩm tồn tại và kiểm tra cờ manage_by_lot.
        - Nếu manage_by_lot = False: Trả kết quả 'không áp dụng FEFO'.
        - Lọc lô: Cùng sản phẩm, cùng kho, remaining_quantity > 0, chưa hết hạn (exp_date >= today).
        - Sắp xếp ưu tiên: exp_date ASC, mfg_date ASC, id ASC.
        - Tính số lượng lấy từ từng lô và shortfall (thiếu hụt) nếu không đủ hàng.
        - TUYỆT ĐỐI KHÔNG TRỪ TỒN KHO TRONG HÀM NÀY.
        """
        if requested_quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số lượng yêu cầu xuất (requested_quantity) phải lớn hơn 0.",
            )

        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy sản phẩm có mã '{product_id}'.",
            )

        # Trường hợp SKU không bật quản lý theo lô
        if not product.manage_by_lot:
            return FEFOSuggestionResponse(
                product_id=product.id,
                warehouse_id=warehouse_id,
                requested_quantity=requested_quantity,
                allocated_total=0,
                shortfall=requested_quantity,
                is_fully_allocated=False,
                manage_by_lot=False,
                message="Sản phẩm không áp dụng quản lý theo lô (manage_by_lot=False).",
                suggested_lots=[],
            )

        today = cls.get_current_vn_date()

        # Lọc các lô còn hạn, còn tồn và cùng kho
        valid_lots = (
            db.query(ProductLot)
            .filter(
                ProductLot.product_id == product_id,
                ProductLot.warehouse_id == warehouse_id,
                ProductLot.remaining_quantity > 0,
                ProductLot.exp_date >= today,
            )
            .order_by(
                asc(ProductLot.exp_date),
                asc(ProductLot.mfg_date),
                asc(ProductLot.id),
            )
            .all()
        )

        suggested_items: List[FEFOSuggestionItem] = []
        allocated_total = 0

        for lot in valid_lots:
            needed = requested_quantity - allocated_total
            if needed <= 0:
                break

            take = min(needed, lot.remaining_quantity)
            days_to_expiry = (lot.exp_date - today).days

            suggested_items.append(
                FEFOSuggestionItem(
                    lot_id=lot.id,
                    lot_number=lot.lot_number,
                    mfg_date=lot.mfg_date,
                    exp_date=lot.exp_date,
                    remaining_quantity=lot.remaining_quantity,
                    allocated_quantity=take,
                    days_to_expiry=days_to_expiry,
                )
            )
            allocated_total += take

        shortfall = max(0, requested_quantity - allocated_total)
        is_fully_allocated = shortfall == 0

        msg = (
            "Gợi ý lô FEFO thành công, đáp ứng đủ số lượng yêu cầu."
            if is_fully_allocated
            else f"Tồn kho các lô khả dụng không đủ (thiếu {shortfall} đơn vị so với yêu cầu {requested_quantity})."
        )

        return FEFOSuggestionResponse(
            product_id=product.id,
            warehouse_id=warehouse_id,
            requested_quantity=requested_quantity,
            allocated_total=allocated_total,
            shortfall=shortfall,
            is_fully_allocated=is_fully_allocated,
            manage_by_lot=True,
            message=msg,
            suggested_lots=suggested_items,
        )

    @classmethod
    def validate_lot_override(
        cls,
        suggested_lot_ids: List[int],
        selected_lot_id: int,
        lot_override_reason: Optional[str] = None,
    ) -> bool:
        """
        Kiểm tra tính hợp lệ khi người dùng chọn lô xuất kho (S6-04):
        - Nếu chọn lô nằm ngoài danh sách FEFO gợi ý: Bắt buộc phải có lot_override_reason.
        - Thiếu lý do -> Ném lỗi HTTP 400 rõ ràng.
        """
        if selected_lot_id not in suggested_lot_ids:
            if not lot_override_reason or not lot_override_reason.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Chọn lô khác với gợi ý FEFO bắt buộc phải cung cấp lý do (lot_override_reason).",
                )
        return True

    @classmethod
    def deduct_lot_stock_atomic(
        cls,
        db: Session,
        lot_id: int,
        quantity: int,
    ) -> ProductLot:
        """
        Trừ tồn kho của lô an toàn tuyệt đối theo cơ chế Atomic Conditional UPDATE (S6-04):
        - KHÔNG dùng with_for_update vì SQLite bỏ qua khóa dòng.
        - Dùng câu lệnh UPDATE có điều kiện: WHERE remaining_quantity >= quantity.
        - Kiểm tra result.rowcount: nếu = 0 thì kiểm tra tồn tại và bắn lỗi HTTP 400 rõ ràng.
        - KHÔNG tự commit (để chạy trong cùng transaction xuất kho của S6-05).
        - Gọi db.flush() để đồng bộ trạng thái trong session hiện hành.
        """
        if quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số lượng cần trừ (quantity) phải lớn hơn 0.",
            )

        now_vn = datetime.now(VN_TZ)
        stmt = (
            update(ProductLot)
            .where(
                ProductLot.id == lot_id,
                ProductLot.remaining_quantity >= quantity,
            )
            .values(
                remaining_quantity=ProductLot.remaining_quantity - quantity,
                updated_at=now_vn,
            )
        )
        result = db.execute(stmt)

        if result.rowcount == 0:
            lot = db.query(ProductLot).filter(ProductLot.id == lot_id).first()
            if not lot:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy lô hàng ID={lot_id}.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Tồn kho của lô '{lot.lot_number}' (hiện còn {lot.remaining_quantity}) "
                    f"không đủ để trừ {quantity} đơn vị!"
                ),
            )

        db.flush()
        updated_lot = db.query(ProductLot).filter(ProductLot.id == lot_id).first()
        return updated_lot
