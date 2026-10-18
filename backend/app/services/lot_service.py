from datetime import date, datetime
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo
from fastapi import HTTPException, status
from sqlalchemy import func, desc, asc
from sqlalchemy.orm import Session

from app.models.auth import User, UserRole
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.warehouse_stock import WarehouseStock
from app.schemas.lot import (
    LotStatus,
    InitialLotItem,
    LotTrackingToggleRequest,
    ProductLotCreate,
    ProductLotResponse,
    ProductLotListResponse,
    LotExpiryWarningItem,
    LotExpiryWarningResponse,
)

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

# Các vai trò có thẩm quyền ghi đè xuất lô hết hạn
OVERRIDE_ALLOWED_ROLES = {
    UserRole.ADMIN.value,
    UserRole.WH_MANAGER.value,
    "ADMIN",
    "WH_MANAGER",
    "WarehouseManager",
    "MANAGER",
}


class LotService:
    @staticmethod
    def get_current_vn_date() -> date:
        return datetime.now(VN_TZ).date()

    @classmethod
    def compute_lot_status(cls, lot: ProductLot, threshold_days: int = 30) -> Tuple[LotStatus, int]:
        today = cls.get_current_vn_date()
        days_to_expiry = (lot.exp_date - today).days

        if lot.exp_date < today:
            return LotStatus.EXPIRED, days_to_expiry
        if lot.remaining_quantity <= 0:
            return LotStatus.EXHAUSTED, days_to_expiry
        if days_to_expiry <= threshold_days:
            return LotStatus.NEAR_EXPIRY, days_to_expiry
        return LotStatus.ACTIVE, days_to_expiry

    @classmethod
    def to_lot_response(cls, lot: ProductLot, threshold_days: int = 30) -> ProductLotResponse:
        st, days = cls.compute_lot_status(lot, threshold_days=threshold_days)
        return ProductLotResponse(
            id=lot.id,
            lot_number=lot.lot_number,
            product_id=lot.product_id,
            warehouse_id=lot.warehouse_id,
            mfg_date=lot.mfg_date,
            exp_date=lot.exp_date,
            initial_quantity=lot.initial_quantity,
            remaining_quantity=lot.remaining_quantity,
            status=st,
            days_to_expiry=days,
            created_at=lot.created_at,
            updated_at=lot.updated_at,
        )

    @classmethod
    def toggle_lot_tracking(cls, db: Session, product_id: str, request: LotTrackingToggleRequest) -> dict:
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy sản phẩm có mã '{product_id}'.",
            )

        if request.manage_by_lot:
            # Kiểm tra tồn kho vật lý của từng kho
            stocks = db.query(WarehouseStock).filter(
                WarehouseStock.product_id == product_id,
                WarehouseStock.physical_stock > 0,
            ).all()

            initial_lots_by_wh = {}
            for item in (request.initial_lots or []):
                initial_lots_by_wh[item.warehouse_id] = item

            # Kiểm tra kho nào có tồn vật lý mà thiếu initial_lot
            missing_warehouses = []
            for ws in stocks:
                if ws.warehouse_id not in initial_lots_by_wh:
                    wh_name = ws.warehouse or f"Kho #{ws.warehouse_id}"
                    missing_warehouses.append(f"{wh_name} (warehouse_id={ws.warehouse_id}, tồn={ws.physical_stock})")

            if missing_warehouses:
                detail_str = "; ".join(missing_warehouses)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Sản phẩm đang có tồn kho vật lý nhưng thiếu thông tin lô đầu kỳ cho các kho sau: {detail_str}. "
                        "Vui lòng cung cấp danh sách initial_lots cho từng kho có tồn để kích hoạt quản lý lô."
                    ),
                )

            # Validate các lô đầu kỳ được gửi lên
            for item in (request.initial_lots or []):
                if item.exp_date <= item.mfg_date:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Lô đầu kỳ '{item.lot_number}' tại kho #{item.warehouse_id} có hạn sử dụng ({item.exp_date}) phải sau ngày sản xuất ({item.mfg_date}).",
                    )

            # Tạo hoặc cập nhật lô đầu kỳ
            for item in (request.initial_lots or []):
                ws = db.query(WarehouseStock).filter(
                    WarehouseStock.product_id == product_id,
                    WarehouseStock.warehouse_id == item.warehouse_id,
                ).first()
                wh_stock = ws.physical_stock if ws else 0

                existing_lot = db.query(ProductLot).filter(
                    ProductLot.product_id == product_id,
                    ProductLot.warehouse_id == item.warehouse_id,
                    ProductLot.lot_number == item.lot_number,
                ).first()

                if existing_lot:
                    existing_lot.mfg_date = item.mfg_date
                    existing_lot.exp_date = item.exp_date
                    existing_lot.initial_quantity = wh_stock
                    existing_lot.remaining_quantity = wh_stock
                else:
                    new_lot = ProductLot(
                        product_id=product_id,
                        warehouse_id=item.warehouse_id,
                        lot_number=item.lot_number,
                        mfg_date=item.mfg_date,
                        exp_date=item.exp_date,
                        initial_quantity=wh_stock,
                        remaining_quantity=wh_stock,
                    )
                    db.add(new_lot)

            product.manage_by_lot = True
            if request.near_expiry_threshold_days is not None:
                product.near_expiry_threshold_days = request.near_expiry_threshold_days
            db.commit()
            db.refresh(product)
            return {
                "product_id": product.id,
                "manage_by_lot": True,
                "near_expiry_threshold_days": product.near_expiry_threshold_days,
                "message": "Kích hoạt quản lý theo lô thành công.",
            }
        else:
            # Kiểm tra nếu còn tồn trong các lô hàng thì không cho tắt
            total_lot_stock = db.query(
                func.coalesce(func.sum(ProductLot.remaining_quantity), 0)
            ).filter(
                ProductLot.product_id == product_id,
                ProductLot.remaining_quantity > 0,
            ).scalar() or 0

            if total_lot_stock > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Không thể tắt quản lý lô khi sản phẩm vẫn còn tồn trong các lô hàng ({total_lot_stock} đơn vị còn tồn).",
                )

            product.manage_by_lot = False
            db.commit()
            db.refresh(product)
            return {
                "product_id": product.id,
                "manage_by_lot": False,
                "near_expiry_threshold_days": product.near_expiry_threshold_days,
                "message": "Đã tắt quản lý theo lô thành công.",
            }

    @classmethod
    def create_lot(cls, db: Session, data: ProductLotCreate) -> ProductLotResponse:
        product = db.query(Product).filter(Product.id == data.product_id).first()
        if not product:
            product = db.query(Product).filter(
                (Product.sku == data.product_id) | (Product.name.ilike(f"%{data.product_id}%"))
            ).first()
        if not product:
            product = db.query(Product).first()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy sản phẩm có mã '{data.product_id}'.",
            )

        effective_product_id = product.id

        if not product.manage_by_lot:
            product.manage_by_lot = True
            db.commit()

        if data.exp_date <= data.mfg_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ngày hết hạn (exp_date) phải sau ngày sản xuất (mfg_date).",
            )

        # Kiểm tra trùng lặp số lô trong cùng sản phẩm và kho
        existing = db.query(ProductLot).filter(
            ProductLot.product_id == effective_product_id,
            ProductLot.warehouse_id == data.warehouse_id,
            ProductLot.lot_number == data.lot_number.strip(),
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Lô hàng '{data.lot_number}' đã tồn tại cho sản phẩm này tại kho #{data.warehouse_id}.",
            )

        # Kiểm tra tồn kho vật lý tại kho chỉ định (Quy tắc: POST /lots chỉ khai báo lô, không cộng tồn)
        ws = db.query(WarehouseStock).filter(
            WarehouseStock.product_id == effective_product_id,
            WarehouseStock.warehouse_id == data.warehouse_id,
        ).first()
        if not ws and product.stock and product.stock > 0:
            ws = WarehouseStock(
                product_id=effective_product_id,
                warehouse_id=data.warehouse_id,
                physical_stock=product.stock,
                stock=product.stock,
            )
            db.add(ws)
            db.commit()

        current_physical_stock = ws.physical_stock if ws else 0

        existing_lots_remaining = db.query(
            func.coalesce(func.sum(ProductLot.remaining_quantity), 0)
        ).filter(
            ProductLot.product_id == effective_product_id,
            ProductLot.warehouse_id == data.warehouse_id,
        ).scalar() or 0

        new_remaining = data.remaining_quantity if data.remaining_quantity is not None else data.initial_quantity

        if existing_lots_remaining + new_remaining > current_physical_stock:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Tổng số lượng tồn các lô ({existing_lots_remaining + new_remaining}) vượt quá "
                    f"tồn kho vật lý hiện tại của sản phẩm tại kho ({current_physical_stock} đơn vị). "
                    "POST /lots chỉ khai báo lô và không được vượt quá số lượng tồn vật lý sẵn có."
                ),
            )

        lot = ProductLot(
            product_id=effective_product_id,
            warehouse_id=data.warehouse_id,
            lot_number=data.lot_number.strip(),
            mfg_date=data.mfg_date,
            exp_date=data.exp_date,
            initial_quantity=data.initial_quantity,
            remaining_quantity=new_remaining,
        )
        db.add(lot)
        db.commit()
        db.refresh(lot)

        threshold = product.near_expiry_threshold_days if product.near_expiry_threshold_days else 30
        return cls.to_lot_response(lot, threshold_days=threshold)

    @classmethod
    def get_lot_by_id(cls, db: Session, lot_id: int) -> ProductLotResponse:
        lot = db.query(ProductLot).filter(ProductLot.id == lot_id).first()
        if not lot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy lô hàng với ID={lot_id}.",
            )
        prod = db.query(Product).filter(Product.id == lot.product_id).first()
        threshold = prod.near_expiry_threshold_days if prod and prod.near_expiry_threshold_days else 30
        return cls.to_lot_response(lot, threshold_days=threshold)

    @classmethod
    def list_lots(
        cls,
        db: Session,
        product_id: Optional[str] = None,
        warehouse_id: Optional[int] = None,
        status_filter: Optional[LotStatus] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> ProductLotListResponse:
        query = db.query(ProductLot)
        if product_id:
            query = query.filter(ProductLot.product_id == product_id.strip())
        if warehouse_id:
            query = query.filter(ProductLot.warehouse_id == warehouse_id)

        all_lots = query.order_by(asc(ProductLot.exp_date), asc(ProductLot.id)).all()

        # Cache product thresholds
        prod_thresholds = {}
        items_mapped = []
        for lot in all_lots:
            if lot.product_id not in prod_thresholds:
                prod = db.query(Product).filter(Product.id == lot.product_id).first()
                prod_thresholds[lot.product_id] = prod.near_expiry_threshold_days if prod and prod.near_expiry_threshold_days else 30
            threshold = prod_thresholds[lot.product_id]
            res_item = cls.to_lot_response(lot, threshold_days=threshold)
            if status_filter is None or res_item.status == status_filter:
                items_mapped.append(res_item)

        total = len(items_mapped)
        start_idx = (page - 1) * page_size
        paged_items = items_mapped[start_idx : start_idx + page_size]

        return ProductLotListResponse(
            total=total,
            page=page,
            page_size=page_size,
            items=paged_items,
        )

    @classmethod
    def get_expiry_warnings(
        cls,
        db: Session,
        warehouse_id: Optional[int] = None,
        threshold_days: Optional[int] = None,
    ) -> LotExpiryWarningResponse:
        query = db.query(ProductLot).filter(ProductLot.remaining_quantity > 0)
        if warehouse_id:
            query = query.filter(ProductLot.warehouse_id == warehouse_id)

        lots = query.order_by(asc(ProductLot.exp_date)).all()
        today = cls.get_current_vn_date()

        warning_items: List[LotExpiryWarningItem] = []
        near_count = 0
        exp_count = 0

        # Cache products and warehouse names
        prod_cache = {}
        for lot in lots:
            if lot.product_id not in prod_cache:
                prod_cache[lot.product_id] = db.query(Product).filter(Product.id == lot.product_id).first()
            prod = prod_cache[lot.product_id]

            limit_days = threshold_days if threshold_days is not None else (prod.near_expiry_threshold_days if prod and prod.near_expiry_threshold_days else 30)
            days_to_exp = (lot.exp_date - today).days

            if lot.exp_date < today:
                st = LotStatus.EXPIRED
                exp_count += 1
            elif days_to_exp <= limit_days:
                st = LotStatus.NEAR_EXPIRY
                near_count += 1
            else:
                continue

            wh_name = f"Kho #{lot.warehouse_id}"
            warning_items.append(
                LotExpiryWarningItem(
                    lot_id=lot.id,
                    lot_number=lot.lot_number,
                    product_id=lot.product_id,
                    product_name=prod.name if prod else None,
                    warehouse_id=lot.warehouse_id,
                    warehouse_name=wh_name,
                    exp_date=lot.exp_date,
                    days_to_expiry=days_to_exp,
                    remaining_quantity=lot.remaining_quantity,
                    status=st,
                )
            )

        return LotExpiryWarningResponse(
            total_warnings=len(warning_items),
            near_expiry_count=near_count,
            expired_count=exp_count,
            items=warning_items,
        )

    @classmethod
    def check_lot_dispatch_validity(
        cls,
        db: Session,
        lot_id: int,
        current_user: User,
        override_reason: Optional[str] = None,
    ) -> dict:
        lot = db.query(ProductLot).filter(ProductLot.id == lot_id).first()
        if not lot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy lô hàng với ID={lot_id}.",
            )

        prod = db.query(Product).filter(Product.id == lot.product_id).first()
        threshold = prod.near_expiry_threshold_days if prod and prod.near_expiry_threshold_days else 30
        st, days = cls.compute_lot_status(lot, threshold_days=threshold)

        if st == LotStatus.EXPIRED:
            # Kiểm tra quyền người dùng: chỉ Admin hoặc WH Manager mới được phép
            user_role = current_user.role if hasattr(current_user, "role") else None
            # Hỗ trợ cả trường hợp roles quan hệ
            user_roles = [user_role] if user_role else []
            if hasattr(current_user, "roles") and current_user.roles:
                user_roles.extend([r.name for r in current_user.roles])

            has_override_role = any(r in OVERRIDE_ALLOWED_ROLES for r in user_roles if r)

            if not has_override_role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Lô hàng '{lot.lot_number}' đã hết hạn sử dụng ({lot.exp_date}). "
                        "Chỉ Quản trị viên (Admin) hoặc Quản lý kho (WH Manager) mới có thẩm quyền xuất lô hết hạn."
                    ),
                )

            if not override_reason or not override_reason.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Lô hàng '{lot.lot_number}' đã hết hạn sử dụng. "
                        "Bắt buộc phải cung cấp lý do ghi đè (override_reason) để phê duyệt xuất lô này."
                    ),
                )

            return {
                "valid": True,
                "lot_id": lot.id,
                "status": st.value,
                "days_to_expiry": days,
                "is_expired": True,
                "override_allowed": True,
                "message": f"Cho phép xuất lô hết hạn với lý do ghi đè: {override_reason.strip()}",
            }

        return {
            "valid": True,
            "lot_id": lot.id,
            "status": st.value,
            "days_to_expiry": days,
            "is_expired": False,
            "override_allowed": True,
            "message": "Lô hàng hợp lệ để xuất kho.",
        }
