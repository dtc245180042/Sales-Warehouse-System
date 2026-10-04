"""
MASTER TEST RUNNER - ĐIỀU PHỐI VÀ ĐỒNG BỘ KIỂM THỬ BACKEND TOÀN DIỆN
Cung cấp giao diện thực thi duy nhất cho Tester và AI Agent:
- Tự động nhận diện Live Server (HTTP Thật) hoặc chạy In-Memory nhanh chóng.
- Hỗ trợ chạy toàn bộ (Regression) hoặc chạy riêng từng Suite nghiệp vụ.
- Tự động đồng bộ kết quả kiểm thử và Defect Log vào file Excel chuẩn doanh nghiệp.
"""

import sys
import time
import argparse
from pathlib import Path
import httpx

# Không tạo file rác bytecode __pycache__ khi thực thi kiểm thử
sys.dont_write_bytecode = True

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Thiết lập đường dẫn môi trường chuẩn
thu_muc_client = Path(__file__).resolve().parent
if str(thu_muc_client) not in sys.path:
    sys.path.insert(0, str(thu_muc_client))

thu_muc_backend = thu_muc_client.parent
if str(thu_muc_backend) not in sys.path:
    sys.path.insert(0, str(thu_muc_backend))

from config.settings import BASE_URL, DUONG_DAN_EXCEL
from core.reporter import BoBaoCaoKiemThu
from core.excel_sync import dong_bo_ket_qua_excel
from core.template_generator import tao_file_excel_kiem_thu
from live.test_live_api import chay_kiem_thu_live_api
from suites import SUITES_REGISTRY, chay_tat_ca_suites, chay_suite_theo_ten


def kiem_tra_live_server(base_url: str = BASE_URL) -> bool:
    """Kiểm tra nhanh xem máy chủ HTTP Live API có đang hoạt động không."""
    try:
        with httpx.Client(base_url=base_url, timeout=1.5) as client:
            res = client.get("/")
            return res.status_code == 200
    except Exception:
        return False


def chay_runner(
    che_do: str = "auto",
    suite_chi_dinh: str = None,
    dong_bo_excel: bool = True,
    base_url: str = BASE_URL
) -> int:
    thoi_gian_bat_dau = time.time()

    print("=" * 80)
    print("        HỆ THỐNG KIỂM THỬ BACKEND TỰ ĐỘNG (MASTER TEST RUNNER)")
    print("=" * 80)

    server_on = kiem_tra_live_server(base_url=base_url)
    trang_thai_server = f"BẬT ({base_url})" if server_on else "CHƯA BẬT (Offline)"
    print(f"[*] Môi trường kiểm thử : {trang_thai_server}")
    print(f"[*] Chế độ thực thi     : {che_do.upper()}")
    print(f"[*] Phân hệ lựa chọn    : {suite_chi_dinh if suite_chi_dinh else 'TẤT CẢ (ALL)'}")
    print(f"[*] File báo cáo Excel  : {DUONG_DAN_EXCEL.name}")
    print("=" * 80)

    ten_bao_cao = "LIVE API" if (che_do == "live" or (che_do == "auto" and server_on and not suite_chi_dinh)) else "REGRESSION SUITES"
    bao_cao = BoBaoCaoKiemThu(ten_bao_cao)

    # 1. Thực thi Live API Test
    if che_do == "live" or (che_do == "auto" and server_on and not suite_chi_dinh):
        if not server_on:
            print(f"\n[LỖI]: Yêu cầu kiểm thử Live API nhưng máy chủ {base_url} đang tắt!")
            return 1
        print("\n>>> BƯỚC 1: KIỂM THỬ LIVE API TRÊN MÁY CHỦ THẬT <<<")
        chay_kiem_thu_live_api(bao_cao, base_url=base_url)

    # 2. Thực thi Domain Test Suites (In-Memory)
    if che_do in ["auto", "in-memory"]:
        print("\n>>> BƯỚC 2: KIỂM THỬ CÁC GÓI NGHIỆP VỤ (DOMAIN TEST SUITES) <<<")
        if suite_chi_dinh:
            thanh_cong = chay_suite_theo_ten(suite_chi_dinh, bao_cao)
            if not thanh_cong:
                print(f"[LỖI]: Không tìm thấy suite có mã '{suite_chi_dinh}'!")
                print(f"Các suite hiện có: {list(SUITES_REGISTRY.keys())}")
                return 1
        else:
            chay_tat_ca_suites(bao_cao)

    # In bảng tổng hợp kết quả
    tat_ca_pass = bao_cao.in_bang_tong_hop()

    # 3. Đồng bộ hóa vào Excel
    if dong_bo_excel:
        if not DUONG_DAN_EXCEL.exists():
            print(f"\n[*] Chưa có file Excel, đang tự động khởi tạo template mới...")
            tao_file_excel_kiem_thu(DUONG_DAN_EXCEL)

        print(f"\n>>> BƯỚC 3: ĐỒNG BỘ KẾT QUẢ VÀO FILE EXCEL DOANH NGHIỆP <<<")
        dong_bo_ket_qua_excel(bao_cao, duong_dan_excel=DUONG_DAN_EXCEL, nguon_test=ten_bao_cao)

    thoi_gian_chay = time.time() - thoi_gian_bat_dau
    print(f"\n[XONG] Toàn bộ quy trình hoàn tất trong: {thoi_gian_chay:.2f} giây.")

    return 0 if tat_ca_pass else 1


def main():
    parser = argparse.ArgumentParser(
        description="Master Test Runner - Điều phối kiểm thử tự động cho hệ thống Backend"
    )
    parser.add_argument(
        "suite",
        nargs="?",
        default=None,
        help="Mã phân hệ muốn chạy riêng lẻ (ví dụ: auth, products,...)"
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Chỉ chạy kiểm thử Live API qua HTTP thật"
    )
    parser.add_argument(
        "--in-memory",
        action="store_true",
        help="Chỉ chạy kiểm thử In-Memory SQLite"
    )
    parser.add_argument(
        "--no-sync",
        action="store_true",
        help="Không đồng bộ kết quả vào file Excel"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Liệt kê danh sách các Suite nghiệp vụ đang có"
    )
    parser.add_argument(
        "--init-excel",
        action="store_true",
        help="Tạo mới hoặc làm sạch template file Excel báo cáo"
    )
    parser.add_argument(
        "--url",
        default=BASE_URL,
        help=f"URL máy chủ Live API (mặc định: {BASE_URL})"
    )
    parser.add_argument(
        "--no-pause",
        action="store_true",
        help=argparse.SUPPRESS
    )

    args = parser.parse_args()

    if args.list:
        print("\nDANH SÁCH CÁC TEST SUITES NGHIỆP VỤ:")
        print("-" * 60)
        for ma, info in SUITES_REGISTRY.items():
            print(f"  * {ma:<10} : {info['title']}")
            print(f"               Mô tả: {info['description']}")
        print("-" * 60)
        return 0

    if args.init_excel:
        tao_file_excel_kiem_thu(DUONG_DAN_EXCEL)
        return 0

    che_do = "auto"
    if args.live:
        che_do = "live"
    elif args.in_memory:
        che_do = "in-memory"

    ma_thoat = chay_runner(
        che_do=che_do,
        suite_chi_dinh=args.suite,
        dong_bo_excel=not args.no_sync,
        base_url=args.url
    )
    return ma_thoat


if __name__ == "__main__":
    sys.exit(main())
