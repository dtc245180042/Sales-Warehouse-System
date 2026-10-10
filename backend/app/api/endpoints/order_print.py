"""
Order Print API Endpoints (SCRUM-615, SCRUM-619)
Cung cấp API xuất dữ liệu in ấn và HTML in ấn chứng từ ĐƠN ĐẶT HÀNG chuẩn A4 kèm Barcode.
Tự động nạp qua cơ chế Auto-Discovery của AGENTS.md.
"""

from fastapi import APIRouter, Depends, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User
from app.services.order_print_service import (
    get_order_print_payload,
    generate_order_print_html,
)

router = APIRouter(prefix="/orders", tags=["Order Print & PDF (SCRUM-240 / S4-08)"])


@router.get(
    "/{order_id}/print-data",
    summary="Lấy dữ liệu in ấn đơn hàng chi tiết kèm Barcode Code128 SVG (SCRUM-614, SCRUM-615)",
    status_code=status.HTTP_200_OK,
)
def lay_du_lieu_in_don_hang(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Trả về dữ liệu đã tổng hợp và kiểm tra phân quyền cho đơn hàng:
    - Thông tin đại lý, mã số thuế, địa chỉ trụ sở.
    - Điểm giao hàng thực tế (người nhận, SĐT nhận, ngày giao dự kiến).
    - Danh sách dòng hàng, đơn giá, chiết khấu sản lượng và thành tiền.
    - Mã vạch Code128 SVG chuẩn vector.
    - Watermark chìm theo trạng thái đơn hàng.
    """
    return get_order_print_payload(db=db, order_id_or_code=order_id, user=current_user)


@router.get(
    "/{order_id}/print-html",
    response_class=HTMLResponse,
    summary="Xuất trang in Đơn đặt hàng hoàn chỉnh chuẩn A4 Offline-First (SCRUM-615)",
    status_code=status.HTTP_200_OK,
)
def xuat_trang_in_don_hang(
    order_id: str,
    db: Session = Depends(lay_phien_db),
    current_user: User = Depends(lay_nguoi_dung_hien_tai),
):
    """
    Trả về tài liệu HTML in ấn hoàn chỉnh (Standalone Printable HTML):
    - Khổ giấy A4 portrait, lề in 12mm 15mm.
    - Sử dụng font hệ thống (System Fonts), hiển thị tiếng Việt có dấu 100% offline.
    - Nhúng mã vạch Barcode SVG vector sắc nét.
    - Chống XSS trên toàn bộ dữ liệu do người dùng nhập.
    - Sẵn sàng để hiển thị trực tiếp trong IFrame và gọi in / xuất PDF qua trình duyệt.
    """
    html_content = generate_order_print_html(db=db, order_id_or_code=order_id, user=current_user)
    return HTMLResponse(content=html_content, media_type="text/html; charset=utf-8")
