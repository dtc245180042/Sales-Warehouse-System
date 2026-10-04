import logging
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.models.auth import Role, Permission, User
from app.core.security import get_password_hash

logger = logging.getLogger(__name__)

# -------------------------------------------------------------
# 1. DANH SÁCH CÁC QUYỀN MẶC ĐỊNH THEO TỪNG NHÓM CHỨC NĂNG (MODULE)
# -------------------------------------------------------------
DEFAULT_PERMISSIONS: List[Dict[str, str]] = [
    # Module: Người dùng (users)
    {
        "code": "user:view",
        "name": "Xem danh sách người dùng",
        "module": "users",
        "description": "Cho phép xem danh sách và thông tin tài khoản người dùng"
    },
    {
        "code": "user:create",
        "name": "Thêm mới người dùng",
        "module": "users",
        "description": "Cho phép tạo tài khoản người dùng mới"
    },
    {
        "code": "user:update",
        "name": "Cập nhật người dùng",
        "module": "users",
        "description": "Cho phép cập nhật thông tin và trạng thái người dùng"
    },
    {
        "code": "user:delete",
        "name": "Xóa/Khóa người dùng",
        "module": "users",
        "description": "Cho phép xóa hoặc khóa tài khoản người dùng"
    },

    # Module: Vai trò & Quyền (roles)
    {
        "code": "role:view",
        "name": "Xem vai trò và quyền",
        "module": "roles",
        "description": "Cho phép xem danh sách vai trò và phân quyền hệ thống"
    },
    {
        "code": "role:manage",
        "name": "Quản lý vai trò & quyền",
        "module": "roles",
        "description": "Cho phép cấu hình, gán quyền cho vai trò hoặc phân quyền cho người dùng"
    },

    # Module: Sản phẩm (products)
    {
        "code": "product:view",
        "name": "Xem danh sách sản phẩm",
        "module": "products",
        "description": "Cho phép xem danh mục sản phẩm, giá bán, thông số"
    },
    {
        "code": "product:create",
        "name": "Thêm mới sản phẩm",
        "module": "products",
        "description": "Cho phép tạo mã và thông tin sản phẩm mới"
    },
    {
        "code": "product:update",
        "name": "Cập nhật sản phẩm",
        "module": "products",
        "description": "Cho phép chỉnh sửa thông tin sản phẩm"
    },
    {
        "code": "product:delete",
        "name": "Xóa sản phẩm",
        "module": "products",
        "description": "Cho phép xóa hoặc ngừng kinh doanh sản phẩm"
    },

    # Module: Danh mục sản phẩm (categories)
    {
        "code": "category:view",
        "name": "Xem danh mục hàng",
        "module": "categories",
        "description": "Cho phép xem cấu trúc danh mục ngành hàng"
    },
    {
        "code": "category:manage",
        "name": "Quản lý danh mục hàng",
        "module": "categories",
        "description": "Cho phép thêm, sửa, xóa danh mục phân loại sản phẩm"
    },

    # Module: Kho hàng & Vị trí (warehouse)
    {
        "code": "warehouse:view",
        "name": "Xem danh sách kho",
        "module": "warehouse",
        "description": "Cho phép xem thông tin các kho hàng, chi nhánh kho"
    },
    {
        "code": "warehouse:manage",
        "name": "Quản lý kho hàng",
        "module": "warehouse",
        "description": "Cho phép tạo, cập nhật cấu hình kho hàng và kệ chứa"
    },

    # Module: Tồn kho & Xuất nhập tồn (inventory)
    {
        "code": "inventory:view",
        "name": "Xem tồn kho",
        "module": "inventory",
        "description": "Cho phép xem số lượng tồn kho khả dụng theo từng kho"
    },
    {
        "code": "stock_in:create",
        "name": "Tạo phiếu nhập kho",
        "module": "inventory",
        "description": "Cho phép tạo và xác nhận phiếu nhập hàng từ nhà cung cấp"
    },
    {
        "code": "stock_out:create",
        "name": "Tạo phiếu xuất kho",
        "module": "inventory",
        "description": "Cho phép tạo và xác nhận phiếu xuất kho bán hàng / luân chuyển"
    },
    {
        "code": "stock:adjust",
        "name": "Kiểm kê & điều chỉnh tồn",
        "module": "inventory",
        "description": "Cho phép lập phiếu kiểm kê và cân bằng sai lệch tồn kho"
    },

    # Module: Đơn hàng & Bán hàng (orders)
    {
        "code": "order:view",
        "name": "Xem danh sách đơn hàng",
        "module": "orders",
        "description": "Cho phép xem danh sách đơn đặt hàng và hóa đơn bán"
    },
    {
        "code": "order:create",
        "name": "Tạo đơn bán hàng",
        "module": "orders",
        "description": "Cho phép lập đơn bán hàng mới cho khách hàng"
    },
    {
        "code": "order:update",
        "name": "Cập nhật đơn hàng",
        "module": "orders",
        "description": "Cho phép chỉnh sửa đơn hàng (khi chưa khóa/hoàn thành)"
    },
    {
        "code": "order:cancel",
        "name": "Hủy đơn hàng",
        "module": "orders",
        "description": "Cho phép hủy đơn bán hàng"
    },

    # Module: Khách hàng (customers)
    {
        "code": "customer:view",
        "name": "Xem thông tin khách hàng",
        "module": "customers",
        "description": "Cho phép xem danh sách và hồ sơ khách hàng"
    },
    {
        "code": "customer:create",
        "name": "Thêm khách hàng",
        "module": "customers",
        "description": "Cho phép tạo hồ sơ khách hàng mới"
    },
    {
        "code": "customer:update",
        "name": "Cập nhật khách hàng",
        "module": "customers",
        "description": "Cho phép cập nhật thông tin và công nợ khách hàng"
    },

    # Module: Nhà cung cấp (suppliers)
    {
        "code": "supplier:view",
        "name": "Xem danh sách nhà cung cấp",
        "module": "suppliers",
        "description": "Cho phép xem thông tin đối tác cung cấp hàng hóa"
    },
    {
        "code": "supplier:create",
        "name": "Thêm nhà cung cấp",
        "module": "suppliers",
        "description": "Cho phép tạo mới thông tin nhà cung cấp"
    },
    {
        "code": "supplier:update",
        "name": "Cập nhật nhà cung cấp",
        "module": "suppliers",
        "description": "Cho phép sửa thông tin đối tác cung cấp"
    },

    # Module: Báo cáo & Thống kê (reports)
    {
        "code": "report:revenue_view",
        "name": "Xem báo cáo doanh thu",
        "module": "reports",
        "description": "Cho phép xem báo cáo doanh số, lợi nhuận bán hàng"
    },
    {
        "code": "report:inventory_view",
        "name": "Xem báo cáo kho",
        "module": "reports",
        "description": "Cho phép xem báo cáo xuất nhập tồn, hàng tồn cảnh báo"
    }
]

# -------------------------------------------------------------
# 2. DANH SÁCH VAI TRÒ MẶC ĐỊNH (ROLES)
# -------------------------------------------------------------
DEFAULT_ROLES: List[Dict[str, str]] = [
    {
        "name": "ADMIN",
        "display_name": "Quản trị viên hệ thống",
        "description": "Toàn quyền quản trị hệ thống, người dùng và toàn bộ dữ liệu nghiệp vụ"
    },
    {
        "name": "MANAGER",
        "display_name": "Quản lý kinh doanh & kho",
        "description": "Giám sát toàn bộ hoạt động bán hàng, quản lý kho, xem báo cáo tổng hợp"
    },
    {
        "name": "SALES",
        "display_name": "Nhân viên bán hàng",
        "description": "Tạo đơn hàng, quản lý thông tin khách hàng và theo dõi tình trạng đơn"
    },
    {
        "name": "WAREHOUSE",
        "display_name": "Thủ kho / Nhân viên kho",
        "description": "Quản lý xuất nhập tồn, tạo phiếu kiểm kê và quản lý kho hàng"
    },
    {
        "name": "ACCOUNTANT",
        "display_name": "Kế toán / Tài chính",
        "description": "Theo dõi đơn hàng, quản lý công nợ khách hàng và xem báo cáo tài chính"
    }
]

# -------------------------------------------------------------
# 3. MA TRẬN GÁN QUYỀN MẶC ĐỊNH CHO TỪNG VAI TRÒ
# -------------------------------------------------------------
DEFAULT_ROLE_PERMISSIONS: Dict[str, List[str]] = {
    # ADMIN sở hữu mọi quyền
    "ADMIN": ["*"],

    # MANAGER có quyền giám sát hầu hết các module nghiệp vụ
    "MANAGER": [
        "user:view",
        "role:view",
        "product:view", "product:create", "product:update",
        "category:view", "category:manage",
        "warehouse:view",
        "inventory:view", "stock_in:create", "stock_out:create", "stock:adjust",
        "order:view", "order:create", "order:update", "order:cancel",
        "customer:view", "customer:create", "customer:update",
        "supplier:view", "supplier:create", "supplier:update",
        "report:revenue_view", "report:inventory_view"
    ],

    # SALES tập trung vào bán hàng, khách hàng và xem tồn
    "SALES": [
        "product:view",
        "category:view",
        "inventory:view",
        "order:view", "order:create", "order:update",
        "customer:view", "customer:create", "customer:update",
        "report:revenue_view"
    ],

    # WAREHOUSE tập trung vào kho, xuất nhập và kiểm kê
    "WAREHOUSE": [
        "product:view", "product:create", "product:update",
        "category:view",
        "warehouse:view",
        "inventory:view", "stock_in:create", "stock_out:create", "stock:adjust",
        "supplier:view",
        "report:inventory_view"
    ],

    # ACCOUNTANT theo dõi công nợ, đơn và báo cáo
    "ACCOUNTANT": [
        "order:view",
        "inventory:view",
        "customer:view",
        "supplier:view",
        "report:revenue_view",
        "report:inventory_view"
    ]
}


def seed_permissions(db: Session) -> Dict[str, int]:
    """Khởi tạo danh sách quyền mặc định (Idempotent: chỉ thêm quyền mới hoặc cập nhật thông tin)."""
    created_count = 0
    updated_count = 0

    for item in DEFAULT_PERMISSIONS:
        perm = db.query(Permission).filter(Permission.code == item["code"]).first()
        if not perm:
            perm = Permission(
                code=item["code"],
                name=item["name"],
                module=item["module"],
                description=item["description"]
            )
            db.add(perm)
            created_count += 1
        else:
            # Cập nhật nếu có sự thay đổi
            perm.name = item["name"]
            perm.module = item["module"]
            perm.description = item["description"]
            updated_count += 1

    db.commit()
    logger.info(f"Seed permissions: {created_count} created, {updated_count} updated.")
    return {"created": created_count, "updated": updated_count, "total": len(DEFAULT_PERMISSIONS)}


def seed_roles(db: Session) -> Dict[str, int]:
    """Khởi tạo danh sách vai trò nghiệp vụ mặc định."""
    created_count = 0
    updated_count = 0

    for item in DEFAULT_ROLES:
        role = db.query(Role).filter(Role.name == item["name"]).first()
        if not role:
            role = Role(
                name=item["name"],
                display_name=item["display_name"],
                description=item["description"]
            )
            db.add(role)
            created_count += 1
        else:
            role.display_name = item["display_name"]
            role.description = item["description"]
            updated_count += 1

    db.commit()
    logger.info(f"Seed roles: {created_count} created, {updated_count} updated.")
    return {"created": created_count, "updated": updated_count, "total": len(DEFAULT_ROLES)}


def assign_default_permissions_to_roles(db: Session) -> Dict[str, int]:
    """Gán quyền mặc định cho từng vai trò theo cấu hình nghiệp vụ."""
    all_permissions = {p.code: p for p in db.query(Permission).all()}
    role_mapping_stats: Dict[str, int] = {}

    for role_name, perm_codes in DEFAULT_ROLE_PERMISSIONS.items():
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            continue

        if perm_codes == ["*"]:
            # Gán toàn bộ quyền trong hệ thống
            target_permissions = list(all_permissions.values())
        else:
            # Lọc các quyền khớp mã code
            target_permissions = [all_permissions[code] for code in perm_codes if code in all_permissions]

        # Gán quyền vào role (tránh trùng lặp)
        current_perm_ids = {p.id for p in role.permissions}
        for p in target_permissions:
            if p.id not in current_perm_ids:
                role.permissions.append(p)

        role_mapping_stats[role_name] = len(role.permissions)

    db.commit()
    logger.info(f"Assigned permissions to roles: {role_mapping_stats}")
    return role_mapping_stats


def seed_default_admin(db: Session) -> Dict[str, Any]:
    """Tạo tài khoản quản trị viên Admin mặc định nếu chưa tồn tại."""
    admin_user = db.query(User).filter(User.username == "admin").first()
    admin_role = db.query(Role).filter(Role.name == "ADMIN").first()

    if not admin_user:
        admin_user = User(
            username="admin",
            email="admin@warehouse.local",
            full_name="Trần Quản Trị Hệ Thống",
            hashed_password=get_password_hash("Admin@1234"),
            role="Admin",
            is_active=True
        )
        if admin_role:
            admin_user.roles.append(admin_role)
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        return {"created": True, "username": admin_user.username, "email": admin_user.email}
    else:
        # Đảm bảo admin có role ADMIN và thông tin chuẩn
        if admin_role and admin_role not in admin_user.roles:
            admin_user.roles.append(admin_role)
        if admin_user.role != "Admin":
            admin_user.role = "Admin"
        if admin_user.email == "admin@saleswarehouse.com":
            admin_user.email = "admin@warehouse.local"
        db.commit()
        return {"created": False, "username": admin_user.username, "email": admin_user.email}


def seed_all(db: Session) -> Dict[str, Any]:
    """Thực thi toàn bộ quy trình khởi tạo CSDL, quyền và vai trò mặc định."""
    perm_stats = seed_permissions(db)
    role_stats = seed_roles(db)
    mapping_stats = assign_default_permissions_to_roles(db)
    admin_stats = seed_default_admin(db)

    return {
        "status": "success",
        "permissions": perm_stats,
        "roles": role_stats,
        "role_permissions": mapping_stats,
        "default_admin": admin_stats
    }
