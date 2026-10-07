from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from fastapi import HTTPException, status

from app.models.auth import User, UserRole
from app.models.order import Order
from app.models.inventory import StockReceipt
from app.models.price_list import PriceList
from app.models.audit_log import AuditLog
from app.schemas.user_deletion import (
    UserCanDeleteResponse,
    UserDependencyDetails,
    UserDeleteResponse,
)

# Thử import UserAvatar nếu có
try:
    from app.models.user_avatar import UserAvatar
except ImportError:
    UserAvatar = None


class UserDeletionService:
    @staticmethod
    def check_user_dependencies(db: Session, target_user: User) -> UserCanDeleteResponse:
        """
        Kiểm tra toàn diện xem tài khoản người dùng có phụ thuộc vào bất kỳ dữ liệu nghiệp vụ nào không.
        (Đơn hàng, Phiếu nhập xuất kho, Bảng giá kinh doanh, Nhật ký kiểm toán).
        """
        # 1. Đếm đơn hàng do nhân sự này tạo / phụ trách hoặc làm khách hàng
        orders_count = 0
        try:
            orders_count = db.query(func.count(Order.id)).filter(
                or_(
                    Order.staff_id == str(target_user.id),
                    Order.staff_id == target_user.username,
                    Order.customer_id == str(target_user.id),
                )
            ).scalar() or 0
        except Exception:
            pass

        # 2. Đếm phiếu nhập / xuất kho do nhân sự này lập
        stock_receipts_count = 0
        try:
            stock_receipts_count = db.query(func.count(StockReceipt.id)).filter(
                or_(
                    StockReceipt.created_by == target_user.username,
                    StockReceipt.created_by == target_user.full_name,
                )
            ).scalar() or 0
        except Exception:
            pass

        # 3. Đếm bảng giá phân phối do nhân sự tạo hoặc duyệt
        price_lists_count = 0
        try:
            price_lists_count = db.query(func.count(PriceList.id)).filter(
                or_(
                    PriceList.created_by_id == target_user.id,
                    PriceList.approved_by_id == target_user.id,
                )
            ).scalar() or 0
        except Exception:
            pass

        # 4. Đếm nhật ký thao tác
        audit_logs_count = 0
        try:
            audit_logs_count = db.query(func.count(AuditLog.id)).filter(
                AuditLog.user_id == target_user.id
            ).scalar() or 0
        except Exception:
            pass

        # Ràng buộc nghiệp vụ: Có phụ thuộc dữ liệu nếu đã có đơn hàng, phiếu kho hoặc bảng giá
        has_business_dependencies = (
            orders_count > 0 or stock_receipts_count > 0 or price_lists_count > 0
        )

        can_delete = not has_business_dependencies

        dependency_items = []
        if orders_count > 0:
            dependency_items.append(f"{orders_count} đơn hàng bán")
        if stock_receipts_count > 0:
            dependency_items.append(f"{stock_receipts_count} phiếu nhập/xuất kho")
        if price_lists_count > 0:
            dependency_items.append(f"{price_lists_count} bảng giá kinh doanh")

        if has_business_dependencies:
            reason = (
                f"Tài khoản '{target_user.username}' đã phát sinh giao dịch trong hệ thống ({', '.join(dependency_items)}). "
                f"Để bảo đảm tính toàn vẹn dữ liệu kế toán và lịch sử giao dịch, tài khoản này KHÔNG ĐƯỢC PHÉP XÓA VĨNH VIỄN. "
                f"Bạn nên thực hiện KHÓA TÀI KHOẢN để vô hiệu hóa quyền truy cập."
            )
            suggested_action = "lock"
        else:
            reason = (
                f"Tài khoản '{target_user.username}' chưa phát sinh dữ liệu nghiệp vụ nào (được tạo nhầm, thử nghiệm hoặc tạo mới). "
                f"Có thể xóa vĩnh viễn khỏi hệ thống an toàn mà không ảnh hưởng toàn vẹn dữ liệu."
            )
            suggested_action = "delete"

        return UserCanDeleteResponse(
            user_id=target_user.id,
            username=target_user.username,
            full_name=target_user.full_name,
            can_delete=can_delete,
            has_dependencies=has_business_dependencies,
            dependencies=UserDependencyDetails(
                orders_count=orders_count,
                stock_receipts_count=stock_receipts_count,
                price_lists_count=price_lists_count,
                audit_logs_count=audit_logs_count,
            ),
            reason=reason,
            suggested_action=suggested_action,
        )

    @staticmethod
    def delete_user_if_safe(
        db: Session,
        user_id: int,
        current_user: User,
    ) -> UserDeleteResponse:
        """
        Xóa vĩnh viễn tài khoản người dùng nếu không có dữ liệu giao dịch phụ thuộc.
        Chặn xóa nếu tài khoản đã có dữ liệu giao dịch phát sinh (yêu cầu chuyển sang khóa).
        """
        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy người dùng có ID {user_id}.",
            )

        # 1. Ràng buộc an toàn: Không thể tự xóa tài khoản của chính mình
        if target_user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự xóa tài khoản Quản trị viên đang đăng nhập của chính mình.",
            )

        # 2. Ràng buộc an toàn: Không thể xóa tài khoản Quản trị viên gốc (admin hoặc ID 1)
        if target_user.username.lower() == "admin" or target_user.id == 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể xóa tài khoản Quản trị viên gốc mặc định của hệ thống ('admin').",
            )

        # 3. Kiểm tra phụ thuộc dữ liệu
        check_result = UserDeletionService.check_user_dependencies(db, target_user)
        if not check_result.can_delete:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=check_result.reason,
            )

        username = target_user.username

        # 4. Dọn dẹp các liên kết phụ thuộc an toàn (avatar, vai trò, audit log cá nhân)
        try:
            if UserAvatar is not None:
                avatar_record = db.query(UserAvatar).filter(UserAvatar.user_id == target_user.id).first()
                if avatar_record:
                    db.delete(avatar_record)
        except Exception:
            pass

        try:
            # Ngắt liên kết vai trò
            target_user.roles.clear()
        except Exception:
            pass

        try:
            # Ẩn danh hóa hoặc dọn dẹp các audit logs của tài khoản này
            db.query(AuditLog).filter(AuditLog.user_id == target_user.id).update({"user_id": None})
        except Exception:
            pass

        # 5. Xóa cứng bản ghi User khỏi CSDL
        db.delete(target_user)
        db.commit()

        return UserDeleteResponse(
            success=True,
            message=f"Đã xóa vĩnh viễn tài khoản '{username}' khỏi hệ thống thành công do không có dữ liệu giao dịch phụ thuộc.",
            deleted_user_id=user_id,
            action_taken="deleted",
        )
