from typing import List, Optional, Any
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai, lay_nguoi_dung_tuy_chon
from app.models.auth import User
from app.schemas.order_approval import (
    OrderApprovalListItem,
    OrderApprovalDetailResponse,
    OrderApprovalHistoryResponse,
    OrderApprovalActionRequest,
    OrderApprovalApproveRequest,
    OrderApprovalRejectRequest,
    OrderApprovalReturnRequest,
    OrderApprovalEvaluationResponse,
)
from app.services import order_approval_service

router = APIRouter(prefix="/order-approvals", tags=["Duyệt đơn hàng ngoại lệ"])


class EvaluateOrderRequest(BaseModel):
    customer_id: str = Field(..., description="Mã khách hàng / đại lý")
    items: List[Any] = Field(..., description="Danh sách sản phẩm")
    total_amount: float = Field(..., description="Tổng tiền đơn hàng")
    paid_amount: float = Field(0.0, description="Số tiền đã thanh toán")
    price_list_id: Optional[int] = Field(None, description="ID bảng giá nếu có")


@router.get("", response_model=List[OrderApprovalListItem])
@router.get("/", response_model=List[OrderApprovalListItem], include_in_schema=False)
def list_pending_order_approvals(
    status_filter: Optional[str] = Query("pending", alias="status", description="Lọc trạng thái: pending, approved, rejected, returned, all"),
    violation_type: Optional[str] = Query(None, description="Lọc loại vi phạm: credit_limit, floor_price, both, all"),
    search: Optional[str] = Query(None, description="Tìm theo mã đơn hoặc tên đại lý"),
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Lấy danh sách các đơn hàng chờ duyệt ngoại lệ (S4-05, SCRUM-237).
    Hiển thị rõ lý do cần duyệt (vượt hạn mức nợ / bán dưới giá sàn) và mức độ vi phạm.
    """
    return order_approval_service.list_order_approvals(
        db=db,
        status_filter=status_filter,
        violation_type=violation_type,
        search=search,
    )


@router.post("/evaluate", response_model=OrderApprovalEvaluationResponse)
def evaluate_order(
    req: EvaluateOrderRequest,
    db: Session = Depends(lay_phien_db),
):
    """
    Đánh giá vi phạm hạn mức công nợ và giá sàn của đơn hàng theo thời gian thực (SCRUM-237).
    """
    res = order_approval_service.evaluate_order_violations(
        db=db,
        customer_id=req.customer_id,
        items=req.items,
        total_amount=req.total_amount,
        paid_amount=req.paid_amount,
        price_list_id=req.price_list_id,
    )
    return OrderApprovalEvaluationResponse(
        requires_approval=res["requires_approval"],
        has_credit_limit_violation=res["has_credit_limit_violation"],
        has_floor_price_violation=res["has_floor_price_violation"],
        violations=res["violations"],
        floor_price_violations=res["floor_price_violations"],
        credit_detail=res["credit_detail"],
    )


@router.get("/{order_id}", response_model=OrderApprovalDetailResponse)
def get_order_approval_detail(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Xem chi tiết đơn hàng chờ duyệt ngoại lệ cùng báo cáo vi phạm và audit trail lịch sử duyệt (SCRUM-237).
    """
    return order_approval_service.get_order_approval_detail(db=db, order_id=order_id)


@router.get("/{order_id}/history", response_model=List[OrderApprovalHistoryResponse])
def get_order_approval_history(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: Optional[User] = Depends(lay_nguoi_dung_tuy_chon),
):
    """
    Truy xuất audit trail lịch sử quyết định phê duyệt bất biến của đơn hàng (SCRUM-237).
    """
    return order_approval_service.get_order_approval_history(db=db, order_id=order_id)


@router.post("/{order_id}/action", response_model=OrderApprovalDetailResponse)
def process_approval_action(
    order_id: str,
    action_in: OrderApprovalActionRequest,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Xử lý 3 hành động nghiệp vụ của Quản lý kinh doanh:
    - APPROVE: Duyệt đơn và kích hoạt chuyển sang giữ chỗ tồn kho & chờ xuất kho (reserved)
    - REJECT: Từ chối đơn (bắt buộc nhập ý kiến giải thích)
    - RETURN: Trả lại sửa (bắt buộc nhập ý kiến hướng dẫn)
    """
    return order_approval_service.process_order_approval_action(
        db=db,
        order_id=order_id,
        action=action_in.action,
        comment=action_in.comment,
        current_user=current_user,
    )


@router.post("/{order_id}/approve", response_model=OrderApprovalDetailResponse)
def approve_order(
    order_id: str,
    approve_in: Optional[OrderApprovalApproveRequest] = None,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Duyệt đơn hàng ngoại lệ: Chuyển đơn sang trạng thái giữ chỗ tồn kho và chờ xuất kho (SCRUM-237).
    Ý kiến là tùy chọn.
    """
    comment = approve_in.comment if approve_in else None
    return order_approval_service.process_order_approval_action(
        db=db,
        order_id=order_id,
        action="APPROVE",
        comment=comment,
        current_user=current_user,
    )


@router.post("/{order_id}/reject", response_model=OrderApprovalDetailResponse)
def reject_order(
    order_id: str,
    reject_in: OrderApprovalRejectRequest,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Từ chối đơn hàng ngoại lệ (SCRUM-237).
    Ý kiến lý do từ chối là BẮT BUỘC. Không giữ chỗ tồn kho.
    """
    return order_approval_service.process_order_approval_action(
        db=db,
        order_id=order_id,
        action="REJECT",
        comment=reject_in.comment,
        current_user=current_user,
    )


@router.post("/{order_id}/return", response_model=OrderApprovalDetailResponse)
def return_order(
    order_id: str,
    return_in: OrderApprovalReturnRequest,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Trả lại đơn hàng ngoại lệ để nhân viên kinh doanh sửa đổi (SCRUM-237).
    Ý kiến hướng dẫn sửa là BẮT BUỘC. Không giữ chỗ tồn kho.
    """
    return order_approval_service.process_order_approval_action(
        db=db,
        order_id=order_id,
        action="RETURN",
        comment=return_in.comment,
        current_user=current_user,
    )
