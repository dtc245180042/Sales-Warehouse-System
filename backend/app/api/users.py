import secrets
import math
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import lay_phien_db
from app.core.security import bam_mat_khau
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro
from app.models.auth import Role, User, UserRole
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserLockRequest,
    UserResponse,
    UserPaginatedResponse,
)
from app.schemas.auth import MessageResponse

router = APIRouter(prefix="/users", tags=["Users Management"])

# Danh sách các vai trò thuộc nhóm Kho
VAI_TRO_KHO = [UserRole.WAREHOUSE.value, UserRole.WH_MANAGER.value, "WAREHOUSE", "WH_MANAGER"]

ROLE_ALIASES = {
    "ADMIN": "ADMIN",
    "SYSTEM ADMIN": "ADMIN",
    "QUẢN TRỊ VIÊN": "ADMIN",
    "SALES MANAGER": "SALES_MANAGER",
    "SALESMANAGER": "SALES_MANAGER",
    "MANAGER": "SALES_MANAGER",
    "QL KINH DOANH": "SALES_MANAGER",
    "SALES REP": "SALES_REP",
    "SALESREP": "SALES_REP",
    "SALES STAFF": "SALES_REP",
    "SALESSTAFF": "SALES_REP",
    "SALES": "SALES_REP",
    "NHÂN VIÊN BÁN HÀNG": "SALES_REP",
    "WH MANAGER": "WH_MANAGER",
    "WHMANAGER": "WH_MANAGER",
    "WAREHOUSE MANAGER": "WH_MANAGER",
    "WAREHOUSEMANAGER": "WH_MANAGER",
    "QL KHO": "WH_MANAGER",
    "WAREHOUSE": "WAREHOUSE",
    "WAREHOUSE STAFF": "WAREHOUSE",
    "WAREHOUSESTAFF": "WAREHOUSE",
    "THỦ KHO": "WAREHOUSE",
    "ACCOUNTANT": "ACCOUNTANT",
    "KẾ TOÁN": "ACCOUNTANT",
    "DIRECTOR": "DIRECTOR",
    "BAN GIÁM ĐỐC": "DIRECTOR",
    "CUSTOMER": "CUSTOMER",
    "USER": "CUSTOMER",
}


def tim_hoac_tao_role(phien_db: Session, raw_name: str) -> Optional[Role]:
    """Tìm hoặc tạo đối tượng Role tương thích với chuỗi role truyền vào."""
    if not raw_name:
        return None
    raw_str = str(raw_name).strip()
    norm_upper = raw_str.upper()
    alias_target = ROLE_ALIASES.get(norm_upper, norm_upper)

    # 1. Tìm chính xác theo tên
    role_obj = phien_db.query(Role).filter(
        or_(
            Role.name == raw_str,
            Role.name == norm_upper,
            Role.name == alias_target,
            Role.name.ilike(raw_str),
            Role.name.ilike(alias_target)
        )
    ).first()

    # 2. Tìm theo nhóm tương đương nếu DB dùng mã cũ
    if not role_obj:
        if "SALES_MANAGER" in alias_target:
            role_obj = phien_db.query(Role).filter(Role.name.in_(["SALES_MANAGER", "MANAGER"])).first()
        elif "SALES_REP" in alias_target:
            role_obj = phien_db.query(Role).filter(Role.name.in_(["SALES_REP", "SALES"])).first()
        elif "WH_MANAGER" in alias_target:
            role_obj = phien_db.query(Role).filter(Role.name.in_(["WH_MANAGER", "WAREHOUSE"])).first()

    # 3. Tạo mới nếu chưa có để đảm bảo không mất vai trò
    if not role_obj:
        try:
            role_obj = Role(name=alias_target, display_name=raw_str, description=f"Vai trò {raw_str}")
            phien_db.add(role_obj)
            phien_db.flush()
        except Exception:
            phien_db.rollback()
            role_obj = phien_db.query(Role).filter(Role.name == alias_target).first()

    return role_obj


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo tài khoản người dùng mới (SCRUM-205 & SCRUM-206)"
)
def tao_nguoi_dung(
    du_lieu: UserCreate,
    nguoi_dung_hien_tai: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    phien_db: Session = Depends(lay_phien_db)
):
    """Tạo người dùng mới:
    - Bắt lỗi trùng tài khoản kèm thông báo cụ thể (SCRUM-205).
    - Cấp mật khẩu tạm nếu không truyền mật khẩu.
    - Kiểm tra ràng buộc: Người dùng thuộc vai trò kho phải gắn với ít nhất một kho (SCRUM-206).
    """
    ten_dang_nhap = du_lieu.username.strip()
    dia_chi_email = du_lieu.email.strip().lower()

    # 1. Kiểm tra trùng tên đăng nhập
    if phien_db.query(User).filter(User.username == ten_dang_nhap).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tên đăng nhập '{ten_dang_nhap}' đã tồn tại trong hệ thống. Vui lòng chọn tên khác."
        )

    # 2. Kiểm tra trùng địa chỉ email
    if phien_db.query(User).filter(User.email == dia_chi_email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Địa chỉ email '{dia_chi_email}' đã được đăng ký cho một tài khoản khác."
        )

    # 3. Ràng buộc vai trò kho (SCRUM-206)
    vai_tro_chinh = du_lieu.role or UserRole.CUSTOMER.value
    cac_vai_tro = du_lieu.role_names or []
    la_vai_tro_kho = vai_tro_chinh in VAI_TRO_KHO or any(r in VAI_TRO_KHO for r in cac_vai_tro)

    if la_vai_tro_kho and not du_lieu.assigned_warehouse:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người dùng thuộc vai trò kho phải được gắn với ít nhất một kho hoặc địa bàn cụ thể."
        )

    # 4. Tạo mật khẩu (nếu không có thì tạo mật khẩu tạm ngẫu nhiên)
    mat_khau_khoi_tao = du_lieu.password if du_lieu.password else f"Temp@{secrets.token_hex(4)}1"
    phai_doi_mat_khau = du_lieu.password is None

    nguoi_dung_moi = User(
        username=ten_dang_nhap,
        email=dia_chi_email,
        full_name=du_lieu.full_name,
        phone_number=du_lieu.phone_number,
        role=vai_tro_chinh,
        assigned_warehouse=du_lieu.assigned_warehouse,
        hashed_password=bam_mat_khau(mat_khau_khoi_tao),
        must_change_password=phai_doi_mat_khau,
        is_active=du_lieu.is_active if du_lieu.is_active is not None else True,
        token_version=1
    )

    # Gán các vai trò quan hệ nếu có
    cac_role_can_gan = list(cac_vai_tro) if cac_vai_tro else []
    if vai_tro_chinh and vai_tro_chinh not in cac_role_can_gan:
        cac_role_can_gan.append(vai_tro_chinh)

    for ten_role in cac_role_can_gan:
        role_obj = tim_hoac_tao_role(phien_db, ten_role)
        if role_obj and role_obj not in nguoi_dung_moi.roles:
            nguoi_dung_moi.roles.append(role_obj)

    phien_db.add(nguoi_dung_moi)
    phien_db.commit()
    phien_db.refresh(nguoi_dung_moi)

    return UserResponse.model_validate(nguoi_dung_moi)


@router.get(
    "",
    response_model=UserPaginatedResponse,
    summary="Tìm kiếm, lọc và phân trang danh sách người dùng (SCRUM-205)"
)
def danh_sach_nguoi_dung(
    q: Optional[str] = Query(None, description="Tìm theo tên, tài khoản hoặc số điện thoại"),
    role: Optional[str] = Query(None, description="Lọc theo vai trò"),
    is_active: Optional[bool] = Query(None, description="Lọc theo trạng thái hoạt động"),
    page: int = Query(1, ge=1, description="Số trang hiện tại (bắt đầu từ 1)"),
    page_size: int = Query(20, ge=1, le=100, description="Số bản ghi trên mỗi trang (mặc định 20)"),
    nguoi_dung_hien_tai: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    phien_db: Session = Depends(lay_phien_db)
):
    """Tìm kiếm, lọc và phân trang danh sách tài khoản theo đúng SCRUM-205 (mặc định 20 dòng)."""
    truy_van = phien_db.query(User)

    # Tìm kiếm theo từ khóa: tên, username hoặc số điện thoại
    if q and q.strip():
        tu_khoa = f"%{q.strip()}%"
        truy_van = truy_van.filter(
            or_(
                User.username.ilike(tu_khoa),
                User.email.ilike(tu_khoa),
                User.full_name.ilike(tu_khoa),
                User.phone_number.ilike(tu_khoa)
            )
        )

    # Lọc theo vai trò
    if role and role.strip():
        truy_van = truy_van.filter(User.role == role.strip())

    # Lọc theo trạng thái
    if is_active is not None:
        truy_van = truy_van.filter(User.is_active == is_active)

    tong_so_luong = truy_van.count()
    tong_so_trang = math.ceil(tong_so_luong / page_size) if tong_so_luong > 0 else 1

    danh_sach_ket_qua = (
        truy_van.order_by(User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return UserPaginatedResponse(
        items=[UserResponse.model_validate(u) for u in danh_sach_ket_qua],
        total=tong_so_luong,
        page=page,
        page_size=page_size,
        total_pages=tong_so_trang
    )


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="Chỉnh sửa thông tin và vai trò người dùng (SCRUM-205 & SCRUM-206)"
)
def cap_nhat_nguoi_dung(
    user_id: int,
    du_lieu: UserUpdate,
    nguoi_dung_hien_tai: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    phien_db: Session = Depends(lay_phien_db)
):
    """Cập nhật người dùng:
    - Không thể tự thu hồi quyền quản trị của chính mình (SCRUM-206).
    - Ràng buộc vai trò kho phải gắn kho (SCRUM-206).
    """
    target_user = phien_db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")

    # 1. Ràng buộc: Quản trị viên không thể tự thu hồi vai trò quản trị của chính mình (SCRUM-206)
    if target_user.id == nguoi_dung_hien_tai.id:
        if du_lieu.role and du_lieu.role.upper() != UserRole.ADMIN.value.upper():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự thu hồi vai trò quản trị viên của chính mình."
            )

    # 2. Cập nhật thông tin cơ bản
    if du_lieu.full_name is not None:
        target_user.full_name = du_lieu.full_name
    if du_lieu.phone_number is not None:
        target_user.phone_number = du_lieu.phone_number
    if du_lieu.assigned_warehouse is not None:
        target_user.assigned_warehouse = du_lieu.assigned_warehouse
    if du_lieu.is_active is not None:
        target_user.is_active = du_lieu.is_active

    # 3. Cập nhật vai trò và kiểm tra ràng buộc vai trò kho
    if du_lieu.role:
        target_user.role = du_lieu.role

    la_kho = target_user.role in VAI_TRO_KHO or (du_lieu.role_names and any(r in VAI_TRO_KHO for r in du_lieu.role_names))
    if la_kho and not target_user.assigned_warehouse:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người dùng thuộc vai trò kho phải được gắn với ít nhất một kho hoặc địa bàn cụ thể."
        )

    # Cập nhật quan hệ Role nếu được truyền
    if du_lieu.role_names is not None:
        target_user.roles.clear()
        cac_role_can_gan = list(du_lieu.role_names)
        if du_lieu.role and du_lieu.role not in cac_role_can_gan:
            cac_role_can_gan.append(du_lieu.role)

        for ten_role in cac_role_can_gan:
            role_obj = tim_hoac_tao_role(phien_db, ten_role)
            if role_obj and role_obj not in target_user.roles:
                target_user.roles.append(role_obj)

    phien_db.commit()
    phien_db.refresh(target_user)
    return UserResponse.model_validate(target_user)


@router.post(
    "/{user_id}/lock",
    summary="Khóa tài khoản và thu hồi các phiên đăng nhập (SCRUM-207)"
)
def khoa_tai_khoan(
    user_id: int,
    du_lieu: UserLockRequest,
    nguoi_dung_hien_tai: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    phien_db: Session = Depends(lay_phien_db)
):
    """Khóa tài khoản:
    - Bắt buộc ghi rõ lý do khóa.
    - Ngăn đăng nhập và thu hồi toàn bộ phiên đang mở (tăng token_version).
    - Cảnh báo đại lý cần bàn giao nếu là nhân viên bán hàng/kinh doanh.
    """
    target_user = phien_db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")

    if target_user.id == nguoi_dung_hien_tai.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự khóa tài khoản của chính mình."
        )

    target_user.is_active = False
    target_user.lock_reason = du_lieu.reason.strip()
    target_user.token_version += 1  # Lập tức thu hồi phiên đang mở phía server
    phien_db.commit()

    # Kiểm tra nếu là nhân viên kinh doanh để cảnh báo bàn giao đại lý
    la_nhan_vien_kinh_doanh = target_user.role in [UserRole.SALES_REP.value, UserRole.SALES_MANAGER.value]
    thong_bao_canh_bao = None
    if la_nhan_vien_kinh_doanh:
        thong_bao_canh_bao = (
            f"CẢNH BÁO: Nhân viên '{target_user.username}' thuộc bộ phận kinh doanh phụ trách các đại lý địa bàn. "
            f"Vui lòng phân công bàn giao danh sách khách hàng/đại lý ngay lập tức."
        )

    return {
        "status": "success",
        "message": f"Tài khoản '{target_user.username}' đã bị khóa thành công.",
        "lock_reason": target_user.lock_reason,
        "session_revoked": True,
        "handover_warning": thong_bao_canh_bao
    }


@router.post(
    "/{user_id}/unlock",
    response_model=MessageResponse,
    summary="Mở khóa tài khoản người dùng (SCRUM-207)"
)
def mo_khoa_tai_khoan(
    user_id: int,
    nguoi_dung_hien_tai: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    phien_db: Session = Depends(lay_phien_db)
):
    """Mở khóa tài khoản: Cho phép người dùng hoạt động trở lại."""
    target_user = phien_db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")

    target_user.is_active = True
    target_user.lock_reason = None
    target_user.failed_login_attempts = 0
    target_user.locked_until = None
    phien_db.commit()

    return MessageResponse(message=f"Tài khoản '{target_user.username}' đã được mở khóa thành công.")
