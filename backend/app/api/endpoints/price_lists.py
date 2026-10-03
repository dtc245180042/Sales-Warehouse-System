import math
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro
from app.models.auth import User, UserRole
from app.models.price_list import PriceList, PriceListItem
from app.schemas.price_list import (
    PriceListCreate,
    PriceListUpdate,
    PriceListResponse,
    PriceListDetailResponse,
    PriceListPaginatedResponse,
    PriceApprovalRequest,
    PriceLookupResponse,
    PriceListCloneRequest,
    PriceListLockStatusResponse,
    PriceListVersionHistoryItem,
    PriceListOverlapCheckResponse,
    CustomerGroupSummaryResponse,
    CustomerGroupSummaryItem,
    BulkPriceLookupRequest,
    BulkPriceLookupResponse,
    PriceListItemCreate,
    PriceListItemUpdate,
    PriceListItemResponse,
    PriceListItemPaginatedResponse,
    PriceListItemApprovalRequest,
)
from app.services.price_list_service import (
    create_price_list,
    update_price_list,
    clone_inherited_version,
    get_price_list_lock_status,
    get_price_list_versions,
    approve_price_list,
    reject_price_list,
    lookup_effective_price,
    check_if_locked_for_edit,
    check_price_list_overlap_api,
    get_active_price_list_by_group,
    get_customer_groups_summary,
    bulk_lookup_prices,
    get_price_list_items,
    get_price_list_item_by_id,
    add_price_list_item,
    update_price_list_item,
    delete_price_list_item,
    approve_price_list_item,
)

# Khai báo router theo chuẩn Auto-Discovery của hệ thống (AGENTS.md)
router = APIRouter(prefix="/price-lists", tags=["Price Lists Management (SCRUM-415..SCRUM-419)"])


@router.get(
    "",
    response_model=PriceListPaginatedResponse,
    summary="Danh sách bảng giá theo nhóm khách hàng và thời gian hiệu lực (SCRUM-417, SCRUM-419)"
)
def lay_danh_sach_bang_gia(
    customer_group: Optional[str] = Query(None, description="Lọc theo nhóm: TIER_1, TIER_2, RETAIL, VIP, WHOLESALE"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc trạng thái: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED"),
    time_status: Optional[str] = Query(None, description="Lọc trạng thái thời gian: ACTIVE (đang hiệu lực), UPCOMING (sắp áp dụng), EXPIRED (hết hạn)"),
    from_date: Optional[datetime] = Query(None, description="Lọc bảng giá có hiệu lực từ ngày"),
    to_date: Optional[datetime] = Query(None, description="Lọc bảng giá có hiệu lực đến ngày"),
    is_locked: Optional[bool] = Query(None, description="Lọc bảng giá đã bị khóa sửa đổi (đã có đơn hàng)"),
    requires_approval: Optional[bool] = Query(None, description="Lọc bảng giá có dòng giá dưới sàn cần duyệt"),
    search: Optional[str] = Query(None, description="Tìm theo tên hoặc mã bảng giá"),
    page: int = Query(1, ge=1, description="Số trang hiện tại"),
    page_size: int = Query(20, ge=1, le=100, description="Số bản ghi mỗi trang"),
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy danh sách các bảng giá có phân trang, bộ lọc nhóm khách hàng và thời gian hiệu lực."""
    query = phien_db.query(PriceList)

    if customer_group:
        query = query.filter(PriceList.customer_group == customer_group.strip())
    if status_filter:
        query = query.filter(PriceList.status == status_filter.strip())
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(or_(PriceList.code.ilike(s), PriceList.name.ilike(s)))

    # Bộ lọc trạng thái thời gian hiệu lực (SCRUM-417)
    now_utc = datetime.now(timezone.utc)
    if time_status:
        ts = time_status.strip().upper()
        if ts == "ACTIVE":
            query = query.filter(
                PriceList.status == "APPROVED",
                PriceList.is_active == True,
                PriceList.valid_from <= now_utc,
                or_(PriceList.valid_to == None, PriceList.valid_to >= now_utc)
            )
        elif ts == "UPCOMING":
            query = query.filter(PriceList.valid_from > now_utc)
        elif ts == "EXPIRED":
            query = query.filter(PriceList.valid_to != None, PriceList.valid_to < now_utc)

    if from_date:
        query = query.filter(or_(PriceList.valid_to == None, PriceList.valid_to >= from_date))
    if to_date:
        query = query.filter(PriceList.valid_from <= to_date)
    if is_locked is not None:
        if is_locked:
            query = query.filter(or_(PriceList.has_orders == True, PriceList.orders_count > 0))
        else:
            query = query.filter(PriceList.has_orders == False, PriceList.orders_count == 0)
    if requires_approval is not None:
        query = query.filter(PriceList.requires_approval == requires_approval)

    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 1
    offset = (page - 1) * page_size
    items = query.order_by(PriceList.created_at.desc()).offset(offset).limit(page_size).all()

    # Tính items_count cho từng bảng giá
    results = []
    for item in items:
        resp_item = PriceListResponse.model_validate(item)
        resp_item.items_count = len(item.items)
        results.append(resp_item)

    return PriceListPaginatedResponse(
        items=results,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get(
    "/lookup",
    response_model=PriceLookupResponse,
    summary="Tra cứu giá bán hiệu lực theo nhóm khách hàng và sản phẩm (SCRUM-419)"
)
def tra_cuu_gia_ban(
    customer_group: str = Query(..., description="Nhóm khách hàng: TIER_1, TIER_2, RETAIL, VIP, WHOLESALE"),
    product_id: str = Query(..., description="Mã ID sản phẩm (ví dụ: PRD-001)"),
    phien_db: Session = Depends(lay_phien_db)
):
    """API giúp tự động lấy đúng giá bán cho đại lý cấp 1 và cấp 2 khi tạo đơn."""
    result = lookup_effective_price(
        db=phien_db,
        customer_group=customer_group.strip(),
        product_id=product_id.strip()
    )
    return PriceLookupResponse(**result)


@router.get(
    "/check-overlap",
    response_model=PriceListOverlapCheckResponse,
    summary="Kiểm tra trước chống chồng lấn thời gian hiệu lực bảng giá (SCRUM-417)"
)
def kiem_tra_chong_lan_thoi_gian(
    customer_group: str = Query(..., description="Nhóm khách hàng (TIER_1, TIER_2, ...)"),
    valid_from: datetime = Query(..., description="Thời điểm bắt đầu hiệu lực"),
    valid_to: Optional[datetime] = Query(None, description="Thời điểm kết thúc hiệu lực"),
    exclude_id: Optional[int] = Query(None, description="ID bảng giá cần loại trừ kiểm tra (khi cập nhật)"),
    phien_db: Session = Depends(lay_phien_db)
):
    """Kiểm tra trước (Pre-flight check) xem khoảng thời gian hiệu lực có bị trùng với bảng giá nào đang chạy không."""
    return check_price_list_overlap_api(
        db=phien_db,
        customer_group=customer_group.strip(),
        valid_from=valid_from,
        valid_to=valid_to,
        exclude_id=exclude_id
    )


@router.get(
    "/customer-groups/summary",
    response_model=CustomerGroupSummaryResponse,
    summary="Tổng quan tình trạng bảng giá theo từng nhóm khách hàng (SCRUM-417, SCRUM-419)"
)
def lay_tong_quan_nhom_khach_hang(
    phien_db: Session = Depends(lay_phien_db)
):
    """Báo cáo tổng quan trạng thái bảng giá của từng nhóm khách hàng (bảng giá đang áp dụng, hết hạn, chờ duyệt)."""
    return get_customer_groups_summary(db=phien_db)


@router.get(
    "/customer-groups/{customer_group}/active",
    response_model=PriceListDetailResponse,
    summary="Lấy bảng giá đang có hiệu lực của một nhóm khách hàng (SCRUM-417, SCRUM-419)"
)
def lay_bang_gia_hieu_luc_nhom(
    customer_group: str,
    check_date: Optional[datetime] = Query(None, description="Thời điểm áp dụng (mặc định là hiện tại)"),
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy chi tiết bảng giá đang có hiệu lực cùng đầy đủ các sản phẩm và giá bán được duyệt cho nhóm khách hàng."""
    price_list = get_active_price_list_by_group(
        db=phien_db,
        customer_group=customer_group,
        check_date=check_date
    )
    resp = PriceListDetailResponse.model_validate(price_list)
    resp.items_count = len(price_list.items)
    return resp


@router.post(
    "/customer-groups/{customer_group}/lookup",
    response_model=BulkPriceLookupResponse,
    summary="Tra cứu giá bán hiệu lực hàng loạt cho danh sách sản phẩm theo nhóm khách hàng (SCRUM-419)"
)
def tra_cuu_gia_ban_hang_loat(
    customer_group: str,
    du_lieu: BulkPriceLookupRequest,
    phien_db: Session = Depends(lay_phien_db)
):
    """Tra cứu nhanh giá bán áp dụng cho nhiều sản phẩm cùng lúc theo nhóm khách hàng và thời điểm hiệu lực."""
    return bulk_lookup_prices(
        db=phien_db,
        customer_group=customer_group,
        product_ids=du_lieu.product_ids,
        check_date=du_lieu.check_date
    )


@router.get(
    "/{price_list_id}",
    response_model=PriceListDetailResponse,
    summary="Xem chi tiết bảng giá và các dòng sản phẩm (SCRUM-415)"
)
def lay_chi_tiet_bang_gia(
    price_list_id: int,
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy chi tiết bảng giá bao gồm danh sách đầy đủ các dòng giá, giá sàn và trạng thái duyệt."""
    price_list = phien_db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    resp = PriceListDetailResponse.model_validate(price_list)
    resp.items_count = len(price_list.items)
    return resp


@router.post(
    "",
    response_model=PriceListDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo mới bảng giá theo nhóm khách hàng (SCRUM-415, SCRUM-417, SCRUM-419)"
)
def tao_bang_gia_moi(
    du_lieu: PriceListCreate,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Khai báo bảng giá mới:
    - SCRUM-415: Lưu chi tiết dòng giá, giá bán và giá sàn.
    - SCRUM-417: Ràng buộc ngày hiệu lực.
    - SCRUM-418: Tự động đánh dấu PENDING_APPROVAL nếu có sản phẩm bán dưới giá sàn.
    """
    price_list = create_price_list(db=phien_db, data=du_lieu, user=nguoi_dung)
    resp = PriceListDetailResponse.model_validate(price_list)
    resp.items_count = len(price_list.items)
    return resp


@router.put(
    "/{price_list_id}",
    response_model=PriceListDetailResponse,
    summary="Cập nhật thông tin bảng giá (SCRUM-416)"
)
def cap_nhat_bang_gia(
    price_list_id: int,
    du_lieu: PriceListUpdate,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Cập nhật bảng giá:
    - SCRUM-416: Bị khóa nếu bảng giá đã phát sinh đơn hàng (has_orders = True).
    """
    price_list = update_price_list(
        db=phien_db,
        price_list_id=price_list_id,
        data=du_lieu,
        user=nguoi_dung
    )
    resp = PriceListDetailResponse.model_validate(price_list)
    resp.items_count = len(price_list.items)
    return resp


@router.get(
    "/{price_list_id}/lock-status",
    response_model=PriceListLockStatusResponse,
    summary="Kiểm tra trạng thái khóa sửa đổi của bảng giá (SCRUM-416)"
)
def kiem_tra_trang_thai_khoa(
    price_list_id: int,
    phien_db: Session = Depends(lay_phien_db)
):
    """Kiểm tra xem bảng giá có bị khóa do phát sinh đơn hàng hay không, quyền chỉnh sửa và xóa."""
    return get_price_list_lock_status(db=phien_db, price_list_id=price_list_id)


@router.get(
    "/{price_list_id}/versions",
    response_model=List[PriceListVersionHistoryItem],
    summary="Xem lịch sử các phiên bản trong chuỗi kế thừa (SCRUM-416)"
)
def lay_lich_su_phien_ban(
    price_list_id: int,
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy toàn bộ cây/chuỗi các phiên bản kế thừa từ version gốc đến các version mới nhất."""
    return get_price_list_versions(db=phien_db, price_list_id=price_list_id)


@router.post(
    "/{price_list_id}/clone-version",
    response_model=PriceListDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo phiên bản kế thừa từ bảng giá cũ (SCRUM-416)"
)
def tao_phien_ban_ke_thua(
    price_list_id: int,
    du_lieu: Optional[PriceListCloneRequest] = None,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Nhân bản bảng giá cũ thành phiên bản mới (v2, v3...) để điều chỉnh giá mà không làm hỏng lịch sử đơn cũ.
    - Hỗ trợ truyền tùy chỉnh mã, tên, ngày hiệu lực và tăng/giảm giá bán đồng loạt theo %.
    """
    new_version = clone_inherited_version(
        db=phien_db,
        parent_id=price_list_id,
        user=nguoi_dung,
        clone_data=du_lieu
    )
    resp = PriceListDetailResponse.model_validate(new_version)
    resp.items_count = len(new_version.items)
    return resp


@router.post(
    "/{price_list_id}/approve",
    response_model=PriceListDetailResponse,
    summary="Phê duyệt áp dụng bảng giá (SCRUM-418)"
)
def phe_duyet_bang_gia(
    price_list_id: int,
    yeu_cau: PriceApprovalRequest,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Luồng duyệt bảng giá:
    - Nếu approved=True: Kiểm tra quyền và chống chồng lấn thời gian hiệu lực (SCRUM-417), chuyển sang APPROVED.
    - Nếu approved=False: Chuyển sang REJECTED kèm lý do từ chối.
    """
    if yeu_cau.approved:
        updated = approve_price_list(
            db=phien_db,
            price_list_id=price_list_id,
            user=nguoi_dung,
            note=yeu_cau.note,
            auto_resolve_overlap=yeu_cau.auto_resolve_overlap
        )
    else:
        updated = reject_price_list(
            db=phien_db,
            price_list_id=price_list_id,
            user=nguoi_dung,
            note=yeu_cau.note
        )
    resp = PriceListDetailResponse.model_validate(updated)
    resp.items_count = len(updated.items)
    return resp


@router.post(
    "/{price_list_id}/simulate-order",
    response_model=PriceListResponse,
    summary="Mô phỏng phát sinh đơn hàng áp dụng bảng giá này (Hỗ trợ kiểm thử SCRUM-416)"
)
def mo_phong_phat_sinh_don(
    price_list_id: int,
    phien_db: Session = Depends(lay_phien_db)
):
    """Đánh dấu bảng giá đã phát sinh đơn hàng để kích hoạt cơ chế khóa sửa đổi."""
    price_list = phien_db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    price_list.has_orders = True
    price_list.orders_count += 1
    phien_db.commit()
    phien_db.refresh(price_list)
    return price_list


@router.delete(
    "/{price_list_id}",
    summary="Xóa bảng giá chưa phát sinh đơn hàng (SCRUM-416)"
)
def xoa_bang_gia(
    price_list_id: int,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Xóa bảng giá: Chỉ được xóa khi chưa phát sinh đơn hàng."""
    price_list = phien_db.query(PriceList).filter(PriceList.id == price_list_id).first()
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bảng giá.")

    check_if_locked_for_edit(price_list, db=phien_db)

    phien_db.delete(price_list)
    phien_db.commit()
    return {"success": True, "message": f"Đã xóa bảng giá '{price_list.code}' thành công."}


# =============================================================================
# CÁC API CHI TIẾT DÒNG GIÁ (PRICE LIST ITEMS - SCRUM-415, SCRUM-418)
# =============================================================================

@router.get(
    "/{price_list_id}/items",
    response_model=PriceListItemPaginatedResponse,
    summary="Danh sách chi tiết dòng giá của một bảng giá (SCRUM-415)"
)
def lay_danh_sach_dong_gia(
    price_list_id: int,
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc trạng thái: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED"),
    requires_approval: Optional[bool] = Query(None, description="Lọc dòng giá bán dưới giá sàn (True/False)"),
    search: Optional[str] = Query(None, description="Tìm theo tên sản phẩm, SKU hoặc Product ID"),
    page: int = Query(1, ge=1, description="Số trang"),
    page_size: int = Query(20, ge=1, le=100, description="Số bản ghi mỗi trang"),
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy danh sách các dòng giá của một bảng giá với giá bán, giá sàn và trạng thái duyệt."""
    items, total, total_pages = get_price_list_items(
        db=phien_db,
        price_list_id=price_list_id,
        status_filter=status_filter,
        requires_approval=requires_approval,
        search=search,
        page=page,
        page_size=page_size
    )
    return PriceListItemPaginatedResponse(
        items=[PriceListItemResponse.model_validate(it) for it in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get(
    "/{price_list_id}/items/{item_id}",
    response_model=PriceListItemResponse,
    summary="Xem chi tiết 1 dòng giá trong bảng giá (SCRUM-415)"
)
def lay_chi_tiet_dong_gia(
    price_list_id: int,
    item_id: int,
    phien_db: Session = Depends(lay_phien_db)
):
    """Lấy thông tin chi tiết một dòng giá theo ID."""
    item = get_price_list_item_by_id(
        db=phien_db,
        price_list_id=price_list_id,
        item_id=item_id
    )
    return PriceListItemResponse.model_validate(item)


@router.post(
    "/{price_list_id}/items",
    response_model=PriceListItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Thêm dòng giá mới vào bảng giá (SCRUM-415, SCRUM-418)"
)
def them_dong_gia_moi(
    price_list_id: int,
    du_lieu: PriceListItemCreate,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Thêm một mặt hàng vào bảng giá:
    - Bắt buộc kiểm tra bảng giá chưa phát sinh đơn hàng (SCRUM-416).
    - So sánh giá bán với giá sàn: Nếu sale_price < floor_price -> Tự động gắn cờ requires_approval = True và status = PENDING_APPROVAL.
    """
    item = add_price_list_item(
        db=phien_db,
        price_list_id=price_list_id,
        data=du_lieu,
        user=nguoi_dung
    )
    return PriceListItemResponse.model_validate(item)


@router.put(
    "/{price_list_id}/items/{item_id}",
    response_model=PriceListItemResponse,
    summary="Cập nhật dòng giá: giá bán, giá sàn, chiết khấu (SCRUM-415, SCRUM-418)"
)
def cap_nhat_dong_gia(
    price_list_id: int,
    item_id: int,
    du_lieu: PriceListItemUpdate,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Cập nhật thông tin dòng giá:
    - Kiểm tra bảng giá không bị khóa sửa (SCRUM-416).
    - Tự động đánh giá lại trạng thái duyệt theo giá sàn mới.
    """
    item = update_price_list_item(
        db=phien_db,
        price_list_id=price_list_id,
        item_id=item_id,
        data=du_lieu,
        user=nguoi_dung
    )
    return PriceListItemResponse.model_validate(item)


@router.delete(
    "/{price_list_id}/items/{item_id}",
    summary="Xóa dòng giá khỏi bảng giá (SCRUM-415)"
)
def xoa_dong_gia(
    price_list_id: int,
    item_id: int,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Xóa một mặt hàng khỏi bảng giá chưa phát sinh đơn hàng."""
    return delete_price_list_item(
        db=phien_db,
        price_list_id=price_list_id,
        item_id=item_id,
        user=nguoi_dung
    )


@router.post(
    "/{price_list_id}/items/{item_id}/approve",
    response_model=PriceListItemResponse,
    summary="Phê duyệt hoặc từ chối riêng lẻ dòng giá bán dưới sàn (SCRUM-418)"
)
def phe_duyet_dong_gia(
    price_list_id: int,
    item_id: int,
    yeu_cau: PriceListItemApprovalRequest,
    nguoi_dung: User = Depends(lay_nguoi_dung_hien_tai),
    phien_db: Session = Depends(lay_phien_db)
):
    """Phê duyệt hoặc từ chối dòng giá có giá bán thấp hơn giá sàn (Dành cho Sales Manager / Admin)."""
    item = approve_price_list_item(
        db=phien_db,
        price_list_id=price_list_id,
        item_id=item_id,
        user=nguoi_dung,
        approved=yeu_cau.approved,
        note=yeu_cau.note
    )
    return PriceListItemResponse.model_validate(item)
