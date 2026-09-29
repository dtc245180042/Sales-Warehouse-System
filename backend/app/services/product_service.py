from typing import Any, Dict, List, Optional
from app.models.auth import User, UserRole

# Danh mục sản phẩm kinh doanh mẫu chuẩn trong hệ thống OMS
PRODUCT_CATALOG: List[Dict[str, Any]] = [
    {
        "sku": "SKU-BIA-SG-SPEC",
        "name": "Bia Sài Gòn Special Lon 330ml",
        "unit": "Lon",
        "pack": "24 lon / thùng (4 lốc x 6 lon)",
        "selling_price": 15000.0,
        "cost_price": 10500.0,
        "profit_margin": "30.0%",
        "status": "Có sẵn",
        "category": "Đồ uống có cồn",
    },
    {
        "sku": "SKU-CHOCOPIE-OR",
        "name": "Bánh Chocopie Orion Hộp 12 Cái",
        "unit": "Hộp",
        "pack": "8 hộp / thùng",
        "selling_price": 55000.0,
        "cost_price": 38000.0,
        "profit_margin": "30.9%",
        "status": "Có sẵn",
        "category": "Bánh kẹo",
    },
    {
        "sku": "SKU-LAVIE-500",
        "name": "Nước khoáng thiên nhiên Lavie Chai 500ml",
        "unit": "Chai",
        "pack": "24 chai / thùng",
        "selling_price": 6000.0,
        "cost_price": 3500.0,
        "profit_margin": "41.6%",
        "status": "Có sẵn",
        "category": "Nước giải khát",
    },
    {
        "sku": "SKU-STING-DAU",
        "name": "Nước tăng lực Sting Dâu Chai 330ml",
        "unit": "Chai",
        "pack": "24 chai / thùng",
        "selling_price": 10000.0,
        "cost_price": 6800.0,
        "profit_margin": "32.0%",
        "status": "Có sẵn",
        "category": "Nước giải khát",
    },
    {
        "sku": "SKU-SUA-VNM-180",
        "name": "Sữa tươi tiệt trùng Vinamilk Có đường 180ml",
        "unit": "Hộp",
        "pack": "48 hộp / thùng (12 lốc x 4 hộp)",
        "selling_price": 8500.0,
        "cost_price": 6000.0,
        "profit_margin": "29.4%",
        "status": "Có sẵn",
        "category": "Sữa & Chế phẩm",
    },
]

# Tập hợp các vai trò được phép xem giá vốn và biên lợi nhuận (SCRUM-202)
ALLOWED_MARGIN_ROLES = {
    UserRole.SALES_MANAGER.value.lower(),  # "sales manager"
    "sales_manager",
    "sales_mgr",
    "quản lý kinh doanh",
    UserRole.ADMIN.value.lower(),          # "admin"
    "admin",
}


def can_view_cost_and_margin(user: Optional[User]) -> bool:
    """Kiểm tra xem người dùng có quyền xem giá vốn và biên lợi nhuận hay không (SCRUM-202).
    
    Quy tắc nghiệp vụ:
    - Chỉ vai trò Quản lý kinh doanh (Sales Manager) và Admin được quyền xem.
    - Các vai trò khác (Sales Rep, Warehouse, WH Manager, Accountant, Customer)
      hoàn toàn không được xem.
    """
    if not user:
        return False

    # 1. Kiểm tra trực tiếp thuộc tính role chính
    user_role_str = str(user.role or "").strip().lower()
    if user_role_str in ALLOWED_MARGIN_ROLES:
        return True

    # 2. Kiểm tra danh sách roles liên kết Nhiều - Nhiều
    if hasattr(user, "get_roles_list"):
        roles_list = [str(r).strip().lower() for r in user.get_roles_list()]
        if any(r in ALLOWED_MARGIN_ROLES for r in roles_list):
            return True

    return False


def filter_product_margins(product_data: Dict[str, Any], can_view: bool) -> Dict[str, Any]:
    """Cơ chế lọc trường dữ liệu theo vai trò (Field-level Data Filtering).
    
    - Nếu can_view == True: Giữ nguyên cost_price và profit_margin.
    - Nếu can_view == False: Loại bỏ hoàn toàn cost_price và profit_margin khỏi response.
    """
    filtered = dict(product_data)
    if not can_view:
        filtered.pop("cost_price", None)
        filtered.pop("profit_margin", None)
    return filtered


def get_products_list(
    current_user: Optional[User],
    search: Optional[str] = None,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """Lấy danh sách sản phẩm có áp dụng cơ chế lọc giá vốn và biên lợi nhuận theo vai trò."""
    can_view = can_view_cost_and_margin(current_user)
    items = []

    for prod in PRODUCT_CATALOG:
        # Lọc tìm kiếm theo tên hoặc SKU nếu có
        if search:
            q = search.strip().lower()
            if q not in prod["name"].lower() and q not in prod["sku"].lower():
                continue

        # Lọc theo danh mục nếu có
        if category:
            cat_filter = category.strip().lower()
            if prod.get("category", "").lower() != cat_filter:
                continue

        # Lọc dữ liệu trường theo quyền
        items.append(filter_product_margins(prod, can_view))

    return {
        "total": len(items),
        "can_view_margins": can_view,
        "items": items,
    }


def get_product_by_sku(sku: str, current_user: Optional[User]) -> Optional[Dict[str, Any]]:
    """Lấy chi tiết 1 sản phẩm theo SKU, áp dụng lọc giá vốn theo quyền (SCRUM-202)."""
    can_view = can_view_cost_and_margin(current_user)
    target = None
    target_sku = sku.strip().upper()

    for prod in PRODUCT_CATALOG:
        if prod["sku"].upper() == target_sku:
            target = prod
            break

    if not target:
        return None

    return filter_product_margins(target, can_view)
