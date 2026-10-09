import re
from typing import Dict, Any, Optional
from fastapi import Request


def lay_dia_chi_ip(request: Request) -> str:
    """Trích xuất địa chỉ IP thực tế của client từ request header hoặc socket."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # X-Forwarded-For có thể chứa chuỗi "client, proxy1, proxy2"
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    if request.client and request.client.host:
        host = request.client.host
        if host in ("::1", "127.0.0.1", "localhost"):
            return "127.0.0.1 (Localhost)"
        return host

    return "127.0.0.1"


def phan_tich_thiet_bi(user_agent_str: Optional[str]) -> Dict[str, Any]:
    """
    Phân tích User-Agent để nhận diện:
    - Hệ điều hành (OS)
    - Trình duyệt (Browser)
    - Loại thiết bị (Desktop / Mobile / Tablet)
    - Chuỗi mô tả thân thiện, ngắn gọn (device_summary)
    """
    if not user_agent_str or not user_agent_str.strip():
        return {
            "device_summary": "Thiết bị không xác định",
            "os": "Không xác định",
            "browser": "Không xác định",
            "device_type": "Không xác định",
            "raw_user_agent": "N/A",
        }

    ua = user_agent_str.strip()
    ua_lower = ua.lower()

    # 1. Nhận diện Hệ điều hành (OS)
    os_name = "Không xác định"
    if "windows nt 10.0" in ua_lower:
        # Windows 10 hoặc 11 (User-Agent thường dùng Windows NT 10.0 cho cả 10 và 11)
        os_name = "Windows 10/11"
    elif "windows nt 6.3" in ua_lower:
        os_name = "Windows 8.1"
    elif "windows nt 6.1" in ua_lower:
        os_name = "Windows 7"
    elif "windows" in ua_lower:
        os_name = "Windows"
    elif "iphone" in ua_lower:
        match = re.search(r"os (\d+[_.]\d+)", ua_lower)
        ver = match.group(1).replace("_", ".") if match else ""
        os_name = f"iOS {ver}".strip()
    elif "ipad" in ua_lower:
        match = re.search(r"os (\d+[_.]\d+)", ua_lower)
        ver = match.group(1).replace("_", ".") if match else ""
        os_name = f"iPadOS {ver}".strip()
    elif "android" in ua_lower:
        match = re.search(r"android (\d+(\.\d+)?)", ua_lower)
        ver = match.group(1) if match else ""
        os_name = f"Android {ver}".strip()
    elif "macintosh" in ua_lower or "mac os x" in ua_lower:
        match = re.search(r"mac os x (\d+[_.]\d+)", ua_lower)
        ver = match.group(1).replace("_", ".") if match else ""
        os_name = f"macOS {ver}".strip()
    elif "linux" in ua_lower:
        os_name = "Linux"

    # 2. Nhận diện Trình duyệt (Browser)
    browser_name = "Trình duyệt Web"
    if "edg/" in ua_lower or "edge/" in ua_lower:
        match = re.search(r"edg[e]?/(\d+)", ua_lower)
        ver = match.group(1) if match else ""
        browser_name = f"Microsoft Edge {ver}".strip()
    elif "coc_coc_browser" in ua_lower or "coccoc" in ua_lower:
        browser_name = "Cốc Cốc"
    elif "opr/" in ua_lower or "opera" in ua_lower:
        browser_name = "Opera"
    elif "chrome/" in ua_lower:
        match = re.search(r"chrome/(\d+)", ua_lower)
        ver = match.group(1) if match else ""
        browser_name = f"Google Chrome {ver}".strip()
    elif "firefox/" in ua_lower:
        match = re.search(r"firefox/(\d+)", ua_lower)
        ver = match.group(1) if match else ""
        browser_name = f"Mozilla Firefox {ver}".strip()
    elif "safari/" in ua_lower and "chrome/" not in ua_lower:
        browser_name = "Apple Safari"

    # 3. Loại thiết bị (Device Type)
    device_type = "Máy tính (Desktop)"
    if "mobile" in ua_lower or "iphone" in ua_lower or ("android" in ua_lower and "tablet" not in ua_lower):
        device_type = "Điện thoại (Mobile)"
    elif "ipad" in ua_lower or "tablet" in ua_lower:
        device_type = "Máy tính bảng (Tablet)"

    # 4. Tóm tắt thiết bị hiển thị trực quan
    device_summary = f"{os_name} · {browser_name} ({device_type})"

    return {
        "device_summary": device_summary,
        "os": os_name,
        "browser": browser_name,
        "device_type": device_type,
        "raw_user_agent": ua,
    }
