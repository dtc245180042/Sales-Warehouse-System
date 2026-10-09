from enum import Enum


class CustomerGroup(str, Enum):
    """5 nhóm khách hàng dùng chung theo chuẩn hệ thống (SCRUM-420, S3-01, S3-03)."""
    TIER_1 = "TIER_1"          # Đại lý Cấp 1
    TIER_2 = "TIER_2"          # Đại lý Cấp 2
    WHOLESALE = "WHOLESALE"    # Khách mua sỉ
    RETAIL = "RETAIL"          # Khách bán lẻ
    VIP = "VIP"                # Khách hàng VIP
