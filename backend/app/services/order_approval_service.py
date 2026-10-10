import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.product_stock_profile import ProductStockProfile
from app.models.customer import Customer
from app.models.price_list import PriceList, PriceListItem
from app.models.product_price_history import ProductPriceHistory
from app.models.order_approval import (
    OrderApprovalRequest,
    OrderApprovalHistory,
    ApprovalActionEnum,
    ApprovalStatusEnum,
)
from app.schemas.order_approval import (
    FloorPriceViolationItem,
    CreditLimitViolationDetail,
    ViolationItem,
    OrderApprovalListItem,
    OrderApprovalDetailResponse,
    OrderApprovalHistoryResponse,
)
from app.services.customer_credit_service import (
    check_credit_for_dispatch,
    get_or_create_credit_profile,
    calculate_actual_customer_debt,
)


ALLOWED_APPROVER_ROLES = {
    UserRole.SALES_MANAGER.value.lower(),
    UserRole.ADMIN.value.lower(),
    "sales_manager",
    "salesmanager",
    "sales_mgr",
    "quản_lý_kinh_doanh",
    "quản lý kinh doanh",
    "quan ly kinh doanh",
    "admin",
    "director",
    "giám đốc",
}


def is_allowed_to_approve(user: Optional[User]) -> bool:
    """Kiểm tra quyền người dùng: Chỉ Quản lý kinh doanh hoặc Admin mới có quyền duyệt."""
    if not user:
        return False
    raw_role = (user.role or "").strip().lower()
    normalized_role = raw_role.replace(" ", "_")
    return raw_role in ALLOWED_APPROVER_ROLES or normalized_role in ALLOWED_APPROVER_ROLES


def _get_or_create_stock_profile(db: Session, product: Product, default_stock: int = 100) -> ProductStockProfile:
    profile = db.query(ProductStockProfile).filter(ProductStockProfile.product_id == product.id).first()
    if not profile:
        profile = ProductStockProfile(
            product_id=product.id,
            sku=product.sku,
            stock=default_stock,
            min_stock=10,
            warehouse="Kho Tổng Hà Nội"
        )
        db.add(profile)
        db.flush()
    return profile


def get_floor_price_for_item(
    db: Session,
    product_id: Any,
    sku: Optional[str] = None,
    price_list_id: Optional[int] = None,
    customer_group: Optional[str] = None
) -> Optional[float]:
    """
    Tra cứu giá sàn tối thiểu của sản phẩm theo thứ tự ưu tiên:
    1. Bảng giá được chọn (PriceListItem.floor_price)
    2. Bảng giá đang hiệu lực của nhóm khách hàng
    3. Lịch sử giá sàn mới nhất (ProductPriceHistory với price_type == FLOOR_PRICE)
    4. Giá vốn sản phẩm (Product.cost_price)
    """
    str_pid = str(product_id).strip()

    # 1. Bảng giá được chỉ định
    if price_list_id:
        pli = db.query(PriceListItem).filter(
            PriceListItem.price_list_id == price_list_id,
            (PriceListItem.product_id == str_pid) | (PriceListItem.product_sku == sku)
        ).first()
        if pli and pli.floor_price is not None and pli.floor_price > 0:
            return float(pli.floor_price)

    # 2. Bảng giá hiệu lực của nhóm khách hàng
    if customer_group:
        active_pls = db.query(PriceList).filter(
            PriceList.customer_group == customer_group,
            PriceList.status == "APPROVED",
            PriceList.is_active == True
        ).all()
        for pl in active_pls:
            if pl.is_effective:
                pli = db.query(PriceListItem).filter(
                    PriceListItem.price_list_id == pl.id,
                    (PriceListItem.product_id == str_pid) | (PriceListItem.product_sku == sku)
                ).first()
                if pli and pli.floor_price is not None and pli.floor_price > 0:
                    return float(pli.floor_price)

    # 3. Lịch sử thay đổi giá sàn (ProductPriceHistory)
    pph = db.query(ProductPriceHistory).filter(
        (ProductPriceHistory.product_id == str_pid) | (ProductPriceHistory.product_sku == sku),
        ProductPriceHistory.price_type == "FLOOR_PRICE"
    ).order_by(ProductPriceHistory.created_at.desc()).first()
    if pph and pph.new_price > 0:
        return float(pph.new_price)

    # 4. Tra cứu bảng giá bất kỳ có chứa sản phẩm
    any_pli = db.query(PriceListItem).filter(
        (PriceListItem.product_id == str_pid) | (PriceListItem.product_sku == sku),
        PriceListItem.floor_price > 0
    ).first()
    if any_pli:
        return float(any_pli.floor_price)

    # 5. Fallback về giá vốn sản phẩm
    prod = None
    if str_pid.isdigit():
        prod = db.query(Product).filter(Product.id == int(str_pid)).first()
    if not prod and sku:
        prod = db.query(Product).filter(Product.sku == sku).first()
    if prod and prod.cost_price and prod.cost_price > 0:
        return float(prod.cost_price)

    return None


def evaluate_order_violations(
    db: Session,
    customer_id: str,
    items: List[Any],
    total_amount: float,
    paid_amount: float = 0.0,
    price_list_id: Optional[int] = None,
    order_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Đánh giá toàn diện các vi phạm của đơn hàng:
    - Vượt hạn mức công nợ hoặc có khoản nợ quá hạn
    - Bán dưới giá sàn tối thiểu quy định
    Trả về cấu trúc phân tích chi tiết mức độ vi phạm.
    """
    unpaid_amount = max(0.0, float(total_amount or 0.0) - float(paid_amount or 0.0))
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.code == customer_id)
    ).first()
    customer_group = getattr(customer, "group", None) or getattr(customer, "customer_group", None)

    violations: List[Dict[str, Any]] = []

    # 1. Đánh giá hạn mức công nợ
    has_credit_limit_violation = False
    credit_limit_amount = 0
    current_debt_amount = 0
    credit_excess_amount = 0
    overdue_days = 0
    overdue_order_code = None
    credit_detail_dict = None

    if unpaid_amount > 0 and customer:
        credit_check = check_credit_for_dispatch(
            db=db,
            customer_id=customer.id,
            unpaid_amount=unpaid_amount,
            order_id=order_id
        )
        credit_limit_amount = int(credit_check.get("credit_limit") or 0)
        current_debt_amount = int(credit_check.get("dispatched_debt") or 0)
        credit_excess_amount = int(credit_check.get("excess_amount") or 0)
        overdue_days = int(credit_check.get("overdue_days") or 0)
        overdue_order_code = credit_check.get("overdue_order_code")

        if not credit_check["allowed"]:
            msg = credit_check.get("error_message") or "Vi phạm hạn mức công nợ"

            if overdue_days > 0:
                has_credit_limit_violation = True
                violations.append({
                    "type": "overdue_debt",
                    "title": "Nợ quá hạn thanh toán",
                    "severity": "danger",
                    "description": (
                        f"Đại lý đang có đơn hàng {overdue_order_code} nợ quá hạn {overdue_days} ngày "
                        f"(quy định tối đa {credit_check.get('max_debt_days', 0)} ngày)."
                    ),
                    "violation_amount": float(credit_excess_amount or unpaid_amount)
                })
            elif credit_limit_amount > 0 and credit_excess_amount > 0:
                has_credit_limit_violation = True
                violations.append({
                    "type": "credit_limit",
                    "title": "Vượt hạn mức công nợ",
                    "severity": "danger",
                    "description": (
                        f"Đơn hàng vượt hạn mức công nợ: Hạn mức {credit_limit_amount:,} đ, "
                        f"Dư nợ hiện tại {current_debt_amount:,} đ, Đơn hàng nợ {int(unpaid_amount):,} đ, "
                        f"Vượt quá {credit_excess_amount:,} đ."
                    ),
                    "violation_amount": float(credit_excess_amount)
                })

            if has_credit_limit_violation:
                credit_detail_dict = {
                    "credit_limit": credit_limit_amount,
                    "current_debt": current_debt_amount,
                    "order_unpaid_amount": int(round(unpaid_amount)),
                    "total_debt_projected": current_debt_amount + int(round(unpaid_amount)),
                    "excess_amount": credit_excess_amount,
                    "max_debt_days": int(credit_check.get("max_debt_days") or 0),
                    "overdue_days": overdue_days,
                    "overdue_order_code": overdue_order_code,
                    "message": msg
                }

    # 2. Đánh giá bán dưới giá sàn
    has_floor_price_violation = False
    floor_price_violations: List[Dict[str, Any]] = []
    total_floor_price_gap = 0.0

    for itm in items:
        pid = getattr(itm, "product_id", None)
        sku = getattr(itm, "sku", None)
        pname = getattr(itm, "name", None)
        sale_price = float(getattr(itm, "price", 0.0) or 0.0)
        qty = int(getattr(itm, "quantity", 1) or 1)

        floor_price = get_floor_price_for_item(
            db=db,
            product_id=pid,
            sku=sku,
            price_list_id=price_list_id,
            customer_group=customer_group
        )

        if floor_price is not None and sale_price < floor_price:
            has_floor_price_violation = True
            diff_amount = floor_price - sale_price
            diff_percent = round((diff_amount / floor_price) * 100, 2) if floor_price > 0 else 0.0
            subtotal_gap = diff_amount * qty
            total_floor_price_gap += subtotal_gap

            floor_price_violations.append({
                "product_id": str(pid),
                "sku": sku,
                "name": pname or f"Sản phẩm #{pid}",
                "unit_price": sale_price,
                "floor_price": floor_price,
                "diff_amount": diff_amount,
                "diff_percent": diff_percent,
                "quantity": qty,
                "subtotal_gap": subtotal_gap
            })

    if has_floor_price_violation:
        violations.append({
            "type": "floor_price",
            "title": f"Bán dưới giá sàn ({len(floor_price_violations)} sản phẩm)",
            "severity": "danger",
            "description": (
                f"Đơn hàng có {len(floor_price_violations)} mặt hàng bán thấp hơn giá sàn tối thiểu. "
                f"Tổng mức chênh lệch dưới giá sàn: {int(total_floor_price_gap):,} đ."
            ),
            "violation_amount": float(total_floor_price_gap)
        })

    requires_approval = has_credit_limit_violation or has_floor_price_violation

    # Tóm tắt lý do
    reasons = []
    if has_credit_limit_violation:
        if overdue_days > 0:
            reasons.append(f"Nợ quá hạn {overdue_days} ngày")
        else:
            reasons.append(f"Vượt hạn mức nợ {credit_excess_amount:,} đ")
    if has_floor_price_violation:
        reasons.append(f"Bán dưới giá sàn (thấp hơn giá sàn, {len(floor_price_violations)} mặt hàng, lệch {int(total_floor_price_gap):,} đ)")

    violation_summary = " & ".join(reasons) if reasons else None

    return {
        "requires_approval": requires_approval,
        "has_credit_limit_violation": has_credit_limit_violation,
        "credit_limit_amount": credit_limit_amount,
        "current_debt_amount": current_debt_amount,
        "order_unpaid_amount": int(round(unpaid_amount)),
        "credit_excess_amount": credit_excess_amount,
        "overdue_days": overdue_days,
        "overdue_order_code": overdue_order_code,
        "credit_detail": credit_detail_dict,
        "has_floor_price_violation": has_floor_price_violation,
        "floor_price_violations": floor_price_violations,
        "floor_price_violation_count": len(floor_price_violations),
        "total_floor_price_gap": total_floor_price_gap,
        "violations": violations,
        "violation_summary": violation_summary
    }


def record_or_update_approval_request(
    db: Session,
    order: Order,
    eval_result: Optional[Dict[str, Any]] = None
) -> OrderApprovalRequest:
    """Tạo mới hoặc cập nhật bản ghi OrderApprovalRequest cho đơn hàng."""
    if not eval_result:
        eval_result = evaluate_order_violations(
            db=db,
            customer_id=order.customer_id,
            items=order.items,
            total_amount=order.total,
            paid_amount=order.paid_amount,
            price_list_id=order.price_list_id,
            order_id=order.id
        )

    req = db.query(OrderApprovalRequest).filter(OrderApprovalRequest.order_id == order.id).first()
    if not req:
        req = OrderApprovalRequest(
            order_id=order.id,
            order_code=order.code,
            customer_id=order.customer_id,
            customer_name=order.customer_name,
            approval_status=ApprovalStatusEnum.PENDING,
        )
        db.add(req)

    req.has_credit_limit_violation = eval_result["has_credit_limit_violation"]
    req.credit_limit_amount = eval_result["credit_limit_amount"]
    req.current_debt_amount = eval_result["current_debt_amount"]
    req.order_unpaid_amount = eval_result["order_unpaid_amount"]
    req.credit_excess_amount = eval_result["credit_excess_amount"]
    req.overdue_days = eval_result["overdue_days"]
    req.overdue_order_code = eval_result["overdue_order_code"]

    req.has_floor_price_violation = eval_result["has_floor_price_violation"]
    req.floor_price_violation_count = eval_result["floor_price_violation_count"]
    req.total_floor_price_gap = eval_result["total_floor_price_gap"]

    req.violation_summary = eval_result["violation_summary"]
    req.violation_details = json.dumps({
        "violations": eval_result["violations"],
        "credit_detail": eval_result["credit_detail"],
        "floor_price_violations": eval_result["floor_price_violations"]
    }, ensure_ascii=False)

    db.flush()
    return req


def list_order_approvals(
    db: Session,
    status_filter: Optional[str] = "pending",
    violation_type: Optional[str] = None,
    search: Optional[str] = None
) -> List[OrderApprovalListItem]:
    """Lấy danh sách các đơn hàng chờ duyệt ngoại lệ kèm thông tin vi phạm."""
    query = db.query(OrderApprovalRequest, Order).join(
        Order, OrderApprovalRequest.order_id == Order.id
    )

    if status_filter and status_filter.lower() != "all":
        st = status_filter.upper()
        if st in ["PENDING", "PENDING_APPROVAL"]:
            query = query.filter(OrderApprovalRequest.approval_status == ApprovalStatusEnum.PENDING)
        elif st in ["APPROVED", "REJECTED", "RETURNED"]:
            query = query.filter(OrderApprovalRequest.approval_status == st)
        else:
            query = query.filter(OrderApprovalRequest.approval_status == st)

    if violation_type:
        vt = violation_type.lower()
        if vt == "credit_limit":
            query = query.filter(OrderApprovalRequest.has_credit_limit_violation == True)
        elif vt == "floor_price":
            query = query.filter(OrderApprovalRequest.has_floor_price_violation == True)
        elif vt == "both":
            query = query.filter(
                OrderApprovalRequest.has_credit_limit_violation == True,
                OrderApprovalRequest.has_floor_price_violation == True
            )

    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            (Order.code.ilike(s)) |
            (Order.customer_name.ilike(s)) |
            (Order.customer_phone.ilike(s)) |
            (OrderApprovalRequest.order_id.ilike(s))
        )

    results = query.order_by(OrderApprovalRequest.created_at.desc()).all()

    items_res: List[OrderApprovalListItem] = []
    for req, order in results:
        violations_list = []
        if req.violation_details:
            try:
                parsed = json.loads(req.violation_details)
                violations_list = [ViolationItem(**v) for v in parsed.get("violations", [])]
            except Exception:
                pass

        items_res.append(OrderApprovalListItem(
            id=req.id,
            order_id=order.id,
            order_code=order.code,
            customer_id=order.customer_id,
            customer_name=order.customer_name,
            order_total=float(order.total or 0.0),
            approval_status=req.approval_status,
            order_status=order.status,
            staff_name=order.staff_name,
            has_credit_limit_violation=req.has_credit_limit_violation,
            credit_excess_amount=int(req.credit_excess_amount or 0),
            overdue_days=int(req.overdue_days or 0),
            has_floor_price_violation=req.has_floor_price_violation,
            floor_price_violation_count=int(req.floor_price_violation_count or 0),
            total_floor_price_gap=float(req.total_floor_price_gap or 0.0),
            violation_summary=req.violation_summary,
            violations=violations_list,
            created_at=req.created_at
        ))

    return items_res


def get_order_approval_detail(
    db: Session,
    order_id: str
) -> OrderApprovalDetailResponse:
    """Lấy chi tiết toàn diện đơn hàng chờ duyệt ngoại lệ cùng lịch sử duyệt bất biến."""
    order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng '{order_id}'."
        )

    req = db.query(OrderApprovalRequest).filter(OrderApprovalRequest.order_id == order.id).first()
    if not req:
        # Tự động khởi tạo đánh giá nếu đơn đang chờ duyệt
        eval_res = evaluate_order_violations(
            db=db,
            customer_id=order.customer_id,
            items=order.items,
            total_amount=order.total,
            paid_amount=order.paid_amount,
            price_list_id=order.price_list_id,
            order_id=order.id
        )
        req = record_or_update_approval_request(db=db, order=order, eval_result=eval_res)
        db.commit()

    # Parse JSON chi tiết vi phạm
    credit_detail = None
    floor_price_violations = []
    violations = []
    if req.violation_details:
        try:
            parsed = json.loads(req.violation_details)
            if parsed.get("credit_detail"):
                credit_detail = CreditLimitViolationDetail(**parsed["credit_detail"])
            if parsed.get("floor_price_violations"):
                floor_price_violations = [FloorPriceViolationItem(**f) for f in parsed["floor_price_violations"]]
            if parsed.get("violations"):
                violations = [ViolationItem(**v) for v in parsed["violations"]]
        except Exception:
            pass

    # Lấy audit trail lịch sử duyệt bất biến
    histories = db.query(OrderApprovalHistory).filter(
        OrderApprovalHistory.order_id == order.id
    ).order_by(OrderApprovalHistory.created_at.asc()).all()

    histories_res = [OrderApprovalHistoryResponse.model_validate(h) for h in histories]

    order_items_dict = [
        {
            "id": it.id,
            "product_id": it.product_id,
            "sku": it.sku,
            "name": it.name,
            "price": it.price,
            "quantity": it.quantity,
            "unit": it.unit,
            "subtotal": it.subtotal,
            "discount": it.discount
        }
        for it in order.items
    ]

    unpaid_amount = max(0.0, float(order.total or 0.0) - float(order.paid_amount or 0.0))

    return OrderApprovalDetailResponse(
        id=req.id,
        order_id=order.id,
        order_code=order.code,
        customer_id=order.customer_id,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        customer_address=order.customer_address,
        order_total=float(order.total or 0.0),
        order_subtotal=float(order.subtotal or 0.0),
        order_discount=float(order.discount or 0.0),
        paid_amount=float(order.paid_amount or 0.0),
        unpaid_amount=unpaid_amount,
        approval_status=req.approval_status,
        order_status=order.status,
        staff_id=order.staff_id,
        staff_name=order.staff_name,
        created_at=req.created_at,
        has_credit_limit_violation=req.has_credit_limit_violation,
        credit_detail=credit_detail,
        has_floor_price_violation=req.has_floor_price_violation,
        floor_price_violations=floor_price_violations,
        floor_price_violation_count=req.floor_price_violation_count,
        total_floor_price_gap=req.total_floor_price_gap,
        violations=violations,
        is_stock_reserved=req.is_stock_reserved,
        decision_comment=req.decision_comment,
        processed_by_id=req.processed_by_id,
        processed_by_name=req.processed_by_name,
        processed_by_role=req.processed_by_role,
        processed_at=req.processed_at,
        items=order_items_dict,
        histories=histories_res
    )


def process_order_approval_action(
    db: Session,
    order_id: str,
    action: str,
    comment: Optional[str] = None,
    current_user: Optional[User] = None
) -> OrderApprovalDetailResponse:
    """
    Xử lý 3 hành động nghiệp vụ của Quản lý kinh doanh:
    1. APPROVE (Duyệt): Chuyển đơn sang trạng thái giữ chỗ tồn kho và chờ xuất kho (reserved)
    2. REJECT (Từ chối): Bắt buộc nhập ý kiến, không giữ chỗ tồn kho
    3. RETURN (Trả lại sửa): Bắt buộc nhập ý kiến, không giữ chỗ tồn kho
    Tự động ghi nhận audit trail bất biến vào OrderApprovalHistory.
    """
    # 0. Kiểm tra phân quyền: Chỉ Quản lý kinh doanh hoặc Admin
    if not is_allowed_to_approve(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kinh doanh mới có quyền phê duyệt đơn hàng ngoại lệ."
        )

    act = action.strip().upper()
    if act not in [ApprovalActionEnum.APPROVE, ApprovalActionEnum.REJECT, ApprovalActionEnum.RETURN]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Hành động '{action}' không hợp lệ. Chỉ chấp nhận APPROVE, REJECT, RETURN."
        )

    # 1. Ràng buộc ý kiến bắt buộc khi Từ chối hoặc Trả lại sửa
    if act in [ApprovalActionEnum.REJECT, ApprovalActionEnum.RETURN]:
        if not comment or not comment.strip():
            action_vn = "từ chối" if act == ApprovalActionEnum.REJECT else "trả lại sửa"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ý kiến xử lý là bắt buộc khi {action_vn} đơn hàng."
            )
        if len(comment.strip()) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ý kiến xử lý phải có tối thiểu 3 ký tự để đảm bảo tính giải trình."
            )

    order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng '{order_id}'."
        )

    req = db.query(OrderApprovalRequest).filter(OrderApprovalRequest.order_id == order.id).first()
    if not req:
        # Nếu chưa có req, tạo mới
        eval_res = evaluate_order_violations(
            db=db,
            customer_id=order.customer_id,
            items=order.items,
            total_amount=order.total,
            paid_amount=order.paid_amount,
            price_list_id=order.price_list_id,
            order_id=order.id
        )
        req = record_or_update_approval_request(db=db, order=order, eval_result=eval_res)

    if req.approval_status != ApprovalStatusEnum.PENDING and order.status != "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đơn hàng đã được xử lý trước đó với kết quả '{req.approval_status}'. Không thể xử lý lại."
        )

    old_status = order.status
    performer_id = current_user.id if current_user else None
    performer_name = (current_user.full_name or current_user.username) if current_user else "Quản lý kinh doanh"
    performer_role = current_user.role if current_user else "SalesManager"
    now_utc = datetime.now(timezone.utc)
    clean_comment = comment.strip() if comment else None

    # 2. Xử lý từng hành động cụ thể
    if act == ApprovalActionEnum.APPROVE:
        # KÍCH HOẠT GIỮ CHỖ TỒN KHO TỰ ĐỘNG
        for itm in order.items:
            prod = None
            str_pid = str(itm.product_id).strip()
            if str_pid.isdigit():
                prod = db.query(Product).filter(Product.id == int(str_pid)).first()
            if not prod and itm.sku:
                prod = db.query(Product).filter(Product.sku == itm.sku).first()

            if prod:
                stock_profile = _get_or_create_stock_profile(db, prod, default_stock=100)
                if stock_profile.stock < itm.quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Sản phẩm '{prod.name}' không đủ tồn kho để giữ chỗ (Còn {stock_profile.stock}, yêu cầu {itm.quantity})."
                    )
                stock_profile.stock = max(0, stock_profile.stock - itm.quantity)
                if stock_profile.stock == 0:
                    prod.status = "out_of_stock"
                elif stock_profile.stock <= stock_profile.min_stock:
                    prod.status = "low_stock"

        # Khóa bảng giá nếu có
        if order.price_list_id:
            pl = db.query(PriceList).filter(PriceList.id == order.price_list_id).first()
            if pl:
                pl.has_orders = True
                pl.orders_count += 1

        # Cập nhật chi tiêu khách hàng
        cus = db.query(Customer).filter(Customer.id == order.customer_id).first()
        if cus:
            cus.total_orders += 1
            cus.total_spent += float(order.total or 0.0)
            cus.last_order_date = now_utc.strftime("%Y-%m-%d")

        # Chuyển đơn sang trạng thái giữ chỗ tồn và chờ xuất kho
        order.status = "reserved"
        req.approval_status = ApprovalStatusEnum.APPROVED
        req.is_stock_reserved = True
        new_status = "reserved"

    elif act == ApprovalActionEnum.REJECT:
        # Từ chối đơn hàng: TUYỆT ĐỐI KHÔNG GIỮ CHỖ TỒN KHO
        order.status = "rejected"
        req.approval_status = ApprovalStatusEnum.REJECTED
        req.is_stock_reserved = False
        new_status = "rejected"

    elif act == ApprovalActionEnum.RETURN:
        # Trả lại sửa: TUYỆT ĐỐI KHÔNG GIỮ CHỖ TỒN KHO, chuyển về trạng thái returned (cho phép sales sửa lại)
        order.status = "returned"
        req.approval_status = ApprovalStatusEnum.RETURNED
        req.is_stock_reserved = False
        new_status = "returned"

    # 3. Ghi nhận audit trail bất biến vào OrderApprovalHistory
    history_entry = OrderApprovalHistory(
        order_id=order.id,
        order_code=order.code,
        action=act,
        previous_status=old_status,
        new_status=new_status,
        comment=clean_comment,
        performed_by_id=performer_id,
        performed_by_name=performer_name,
        performed_by_role=performer_role,
        created_at=now_utc
    )
    db.add(history_entry)

    # 4. Cập nhật thông tin quyết định trên request
    req.processed_by_id = performer_id
    req.processed_by_name = performer_name
    req.processed_by_role = performer_role
    req.processed_at = now_utc
    req.decision_comment = clean_comment
    order.updated_at = now_utc

    db.commit()
    db.refresh(order)
    db.refresh(req)

    return get_order_approval_detail(db, order.id)


def get_order_approval_history(
    db: Session,
    order_id: str
) -> List[OrderApprovalHistoryResponse]:
    """Truy xuất audit trail lịch sử phê duyệt của đơn hàng."""
    order = db.query(Order).filter(
        (Order.id == order_id) | (Order.code == order_id)
    ).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng '{order_id}'."
        )

    histories = db.query(OrderApprovalHistory).filter(
        OrderApprovalHistory.order_id == order.id
    ).order_by(OrderApprovalHistory.created_at.asc()).all()

    return [OrderApprovalHistoryResponse.model_validate(h) for h in histories]
