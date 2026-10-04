"""
Cấu hình tập trung cho bộ kiểm thử Backend (Test Client Settings).
Dễ dàng điều chỉnh URL máy chủ, đường dẫn file báo cáo và timeout.
"""

import os
from pathlib import Path

# Thư mục gốc của test_client
THU_MUC_TEST_CLIENT = Path(__file__).resolve().parent.parent

# Cấu hình kết nối Live API (HTTP Thật)
BASE_URL = os.getenv("BACKEND_LIVE_URL", "http://127.0.0.1:8000")
HTTP_TIMEOUT = 10.0

# Thư mục chứa báo cáo Excel
THU_MUC_REPORTS = THU_MUC_TEST_CLIENT / "reports"
THU_MUC_REPORTS.mkdir(parents=True, exist_ok=True)

# Tên file Excel báo cáo chuẩn doanh nghiệp
TEN_FILE_EXCEL = "Bảng kiểm thử Backend.xlsx"
DUONG_DAN_EXCEL = THU_MUC_REPORTS / TEN_FILE_EXCEL
DUONG_DAN_EXCEL_SYNC = THU_MUC_REPORTS / "Bảng kiểm thử Backend_Sync.xlsx"
