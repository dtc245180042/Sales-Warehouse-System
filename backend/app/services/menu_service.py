import logging
from typing import List, Dict, Any, Optional, Set
from sqlalchemy.orm import Session
from app.models.navigation import MenuItem
from app.models.auth import Role

logger = logging.getLogger(__name__)

# Cấu hình danh mục Menu điều hướng chuẩn của hệ thống Sales-Warehouse
DEFAULT_MENUS: List[Dict[str, Any]] = [
    {
        "code": "dashboard",
        "title": "Bảng điều khiển",
        "path": "/dashboard",
        "icon": "LayoutDashboard",
        "order": 1,
        "required_permission_code": None,  # Công khai cho tất cả người dùng đăng nhập
        "children": []
    },
    {
        "code": "orders",
        "title": "Quản lý Đơn hàng",
        "path": None,
        "icon": "ShoppingBag",
        "order": 2,
        "required_permission_code": "order:view",
        "children": [
            {
                "code": "orders_list",
                "title": "Danh sách đơn hàng",
                "path": "/orders",
                "icon": "ListOrdered",
                "order": 1,
                "required_permission_code": "order:view"
            },
            {
                "code": "orders_create",
                "title": "Tạo đơn bán mới",
                "path": "/orders/create",
                "icon": "PlusCircle",
                "order": 2,
                "required_permission_code": "order:create"
            }
        ]
    },
    {
        "code": "customers",
        "title": "Quản lý Khách hàng",
        "path": "/customers",
        "icon": "Users",
        "order": 3,
        "required_permission_code": "customer:view",
        "children": []
    },
    {
        "code": "inventory",
        "title": "Quản lý Kho",
        "path": None,
        "icon": "Warehouse",
        "order": 4,
        "required_permission_code": "inventory:view",
        "children": [
            {
                "code": "inventory_stock",
                "title": "Tồn kho khả dụng",
                "path": "/inventory/stock",
                "icon": "Boxes",
                "order": 1,
                "required_permission_code": "inventory:view"
            },
            {
                "code": "stock_in",
                "title": "Phiếu nhập kho",
                "path": "/inventory/stock-in",
                "icon": "ArrowDownToLine",
                "order": 2,
                "required_permission_code": "stock_in:create"
            },
            {
                "code": "stock_out",
                "title": "Phiếu xuất kho",
                "path": "/inventory/stock-out",
                "icon": "ArrowUpFromLine",
                "order": 3,
                "required_permission_code": "stock_out:create"
            },
            {
                "code": "stock_adjust",
                "title": "Kiểm kê & Điều chỉnh",
                "path": "/inventory/adjust",
                "icon": "ClipboardCheck",
                "order": 4,
                "required_permission_code": "stock:adjust"
            },
            {
                "code": "warehouses_list",
                "title": "Danh sách kho hàng",
                "path": "/inventory/warehouses",
                "icon": "Building2",
                "order": 5,
                "required_permission_code": "warehouse:view"
            }
        ]
    },
    {
        "code": "products",
        "title": "Sản phẩm & Hàng hóa",
        "path": None,
        "icon": "Package",
        "order": 5,
        "required_permission_code": "product:view",
        "children": [
            {
                "code": "products_list",
                "title": "Danh sách sản phẩm",
                "path": "/products",
                "icon": "Package",
                "order": 1,
                "required_permission_code": "product:view"
            },
            {
                "code": "categories_list",
                "title": "Danh mục ngành hàng",
                "path": "/products/categories",
                "icon": "Tag",
                "order": 2,
                "required_permission_code": "category:view"
            }
        ]
    },
    {
        "code": "suppliers",
        "title": "Nhà cung cấp",
        "path": "/suppliers",
        "icon": "Truck",
        "order": 6,
        "required_permission_code": "supplier:view",
        "children": []
    },
    {
        "code": "reports",
        "title": "Báo cáo & Thống kê",
        "path": None,
        "icon": "BarChart3",
        "order": 7,
        "required_permission_code": "report:revenue_view",
        "children": [
            {
                "code": "reports_revenue",
                "title": "Báo cáo doanh thu",
                "path": "/reports/revenue",
                "icon": "LineChart",
                "order": 1,
                "required_permission_code": "report:revenue_view"
            },
            {
                "code": "reports_inventory",
                "title": "Báo cáo xuất nhập tồn",
                "path": "/reports/inventory",
                "icon": "PieChart",
                "order": 2,
                "required_permission_code": "report:inventory_view"
            }
        ]
    },
    {
        "code": "system",
        "title": "Cấu hình Hệ thống",
        "path": None,
        "icon": "Settings",
        "order": 8,
        "required_permission_code": "user:view",
        "children": [
            {
                "code": "system_users",
                "title": "Quản lý người dùng",
                "path": "/system/users",
                "icon": "UserCheck",
                "order": 1,
                "required_permission_code": "user:view"
            },
            {
                "code": "system_roles",
                "title": "Vai trò & Phân quyền",
                "path": "/system/roles",
                "icon": "ShieldCheck",
                "order": 2,
                "required_permission_code": "role:view"
            }
        ]
    }
]


def seed_menus(db: Session) -> Dict[str, int]:
    """Khởi tạo danh sách menu điều hướng hệ thống (Idempotent)."""
    created_count = 0
    updated_count = 0

    for parent_data in DEFAULT_MENUS:
        parent_item = db.query(MenuItem).filter(MenuItem.code == parent_data["code"]).first()
        if not parent_item:
            parent_item = MenuItem(
                code=parent_data["code"],
                title=parent_data["title"],
                path=parent_data["path"],
                icon=parent_data["icon"],
                order=parent_data["order"],
                required_permission_code=parent_data["required_permission_code"],
                parent_id=None,
                is_active=True
            )
            db.add(parent_item)
            db.commit()
            db.refresh(parent_item)
            created_count += 1
        else:
            parent_item.title = parent_data["title"]
            parent_item.path = parent_data["path"]
            parent_item.icon = parent_data["icon"]
            parent_item.order = parent_data["order"]
            parent_item.required_permission_code = parent_data["required_permission_code"]
            db.commit()
            updated_count += 1

        # Xử lý các menu con
        for child_data in parent_data.get("children", []):
            child_item = db.query(MenuItem).filter(MenuItem.code == child_data["code"]).first()
            if not child_item:
                child_item = MenuItem(
                    code=child_data["code"],
                    title=child_data["title"],
                    path=child_data["path"],
                    icon=child_data["icon"],
                    order=child_data["order"],
                    required_permission_code=child_data["required_permission_code"],
                    parent_id=parent_item.id,
                    is_active=True
                )
                db.add(child_item)
                created_count += 1
            else:
                child_item.title = child_data["title"]
                child_item.path = child_data["path"]
                child_item.icon = child_data["icon"]
                child_item.order = child_data["order"]
                child_item.required_permission_code = child_data["required_permission_code"]
                child_item.parent_id = parent_item.id
                updated_count += 1

    db.commit()
    logger.info(f"Seed menus: {created_count} created, {updated_count} updated.")
    return {"created": created_count, "updated": updated_count}


def get_all_menus(db: Session) -> List[MenuItem]:
    """Lấy danh sách tất cả các mục menu gốc (bao gồm các menu con lồng nhau)."""
    return db.query(MenuItem).filter(
        MenuItem.parent_id == None,
        MenuItem.is_active == True
    ).order_by(MenuItem.order).all()


def get_user_navigation_menu(
    db: Session,
    role_name: Optional[str] = None,
    permission_codes: Optional[List[str]] = None
) -> List[MenuItem]:
    """Lấy cây menu được cá nhân hóa dựa trên vai trò hoặc danh sách quyền hạn.
    - ADMIN: Thấy toàn bộ menu.
    - Các vai trò khác: Chỉ hiển thị menu khi người dùng có quyền tương ứng.
    - Cây menu tự động ẩn các nhóm cha nếu toàn bộ menu con bên trong đều bị ẩn.
    """
    if role_name == "ADMIN":
        return get_all_menus(db)

    # Tập hợp các quyền của người dùng
    user_perms: Set[str] = set(permission_codes or [])
    if role_name:
        role = db.query(Role).filter(Role.name == role_name).first()
        if role:
            user_perms.update({p.code for p in role.permissions})

    # Lấy toàn bộ menu gốc đang kích hoạt
    all_roots = db.query(MenuItem).filter(
        MenuItem.parent_id == None,
        MenuItem.is_active == True
    ).order_by(MenuItem.order).all()

    allowed_menus: List[MenuItem] = []

    for root in all_roots:
        # Lọc các menu con được phép xem
        visible_children = [
            child for child in root.children
            if child.is_active and (
                child.required_permission_code is None or child.required_permission_code in user_perms
            )
        ]

        # Điều kiện menu cha được hiển thị:
        # 1. Menu độc lập không có quyền yêu cầu (ví dụ Dashboard)
        # 2. Người dùng có quyền truy cập trực tiếp menu cha
        # 3. Hoặc có ít nhất 1 menu con bên trong mà người dùng được phép xem
        is_root_allowed = (
            root.required_permission_code is None or
            root.required_permission_code in user_perms or
            len(visible_children) > 0
        )

        if is_root_allowed:
            # Tạo bản sao hoặc gán danh sách con đã lọc
            root_copy = MenuItem(
                id=root.id,
                code=root.code,
                title=root.title,
                path=root.path,
                icon=root.icon,
                order=root.order,
                is_active=root.is_active,
                required_permission_code=root.required_permission_code,
                created_at=root.created_at,
                updated_at=root.updated_at
            )
            root_copy.children = visible_children
            allowed_menus.append(root_copy)

    return allowed_menus
