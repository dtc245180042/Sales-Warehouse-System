"""
Module đồng bộ kết quả kiểm thử vào File Excel chuẩn doanh nghiệp (Excel Sync Engine).
Hỗ trợ tự động điền danh sách test matrix chuẩn, cập nhật Actual Result, PASS/FAIL và Defect Log.
Tự động áp dụng đường viền dưới (bottom border) ngăn cách rõ ràng giữa các Endpoint khác nhau.
"""

import sys
from pathlib import Path
from datetime import datetime
import re
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

thu_muc_client = Path(__file__).resolve().parent.parent
if str(thu_muc_client) not in sys.path:
    sys.path.insert(0, str(thu_muc_client))

from core.reporter import BoBaoCaoKiemThu
from config.settings import DUONG_DAN_EXCEL, DUONG_DAN_EXCEL_SYNC
from config.test_matrix import DANH_SACH_TEST_CASES_CHUAN



def _ap_dung_vien_ngan_cach_endpoint(ws_tc):
    """
    Tạo đường viền dưới (bottom border) ngăn cách rõ ràng giữa các endpoint khác nhau trong Sheet 'Test Cases'.
    Sử dụng mã màu ARGB chuẩn (FF1F4E78) và đồng bộ cả bottom của dòng hiện tại lẫn top của dòng tiếp theo
    để đảm bảo hiển thị sắc nét 100% trên tất cả các trình đọc Excel (MS Excel, WPS, LibreOffice, Google Sheets).
    """
    side_thin = Side(border_style="thin", color="FFD9D9D9")
    side_separator = Side(border_style="medium", color="FF1F4E78")  # Đường viền xanh đậm ngăn cách Endpoint

    max_r = ws_tc.max_row
    if max_r < 3:
        return

    # Đường viền dưới cho dòng tiêu đề Header (Row 2)
    for col in range(1, 15):
        cell_h = ws_tc.cell(row=2, column=col)
        cell_h.border = Border(
            left=Side(border_style="thin", color="FF1F4E78"),
            right=Side(border_style="thin", color="FF1F4E78"),
            top=Side(border_style="medium", color="FF1F4E78"),
            bottom=side_separator
        )

    # Xác định các dòng là dòng cuối cùng của từng Endpoint
    cac_dong_phan_cach = set()
    for row in range(3, max_r + 1):
        ep_current = str(ws_tc.cell(row=row, column=8).value or "").strip()
        ep_next = str(ws_tc.cell(row=row + 1, column=8).value or "").strip() if row < max_r else None

        # Chuẩn hóa endpoint: bỏ query params, quy đổi {param} và số id ở cuối URL thành {id}
        base_ep_current = re.sub(r'/\d+$', '/{id}', re.sub(r'\{[^}]+\}', '{id}', ep_current.split("?")[0].strip()))
        base_ep_next = re.sub(r'/\d+$', '/{id}', re.sub(r'\{[^}]+\}', '{id}', ep_next.split("?")[0].strip())) if ep_next else None

        if base_ep_current != base_ep_next or row == max_r:
            cac_dong_phan_cach.add(row)

    # Áp dụng viền cho từng ô trong bảng dữ liệu
    for row in range(3, max_r + 1):
        la_dong_phan_cach = (row in cac_dong_phan_cach)
        la_dong_ngay_sau_phan_cach = ((row - 1) in cac_dong_phan_cach)

        # Viền trên: nếu dòng trước đó là phân cách thì viền trên cũng là side_separator
        top_side = side_separator if (la_dong_ngay_sau_phan_cach or row == 3) else side_thin
        # Viền dưới: nếu là dòng phân cách (kết thúc endpoint) thì dùng side_separator
        bottom_side = side_separator if la_dong_phan_cach else side_thin

        for col in range(1, 15):
            c = ws_tc.cell(row=row, column=col)
            c.border = Border(
                left=side_thin,
                right=side_thin,
                top=top_side,
                bottom=bottom_side
            )


def _nap_ma_tran_test_cases_neu_trong(ws_tc):
    """Điền danh sách test case chuẩn từ ma trận nếu Sheet 'Test Cases' đang trống."""
    font_regular = Font(name="Segoe UI", size=9)
    font_bold = Font(name="Segoe UI", size=9, bold=True)
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center", wrap_text=True)

    # Đọc danh sách mã test case hiện có trong sheet
    ma_tc_hien_co = {}
    for r in range(3, ws_tc.max_row + 1):
        v = ws_tc.cell(row=r, column=4).value
        if v:
            ma_tc_hien_co[str(v).strip()] = r

    # Nếu chưa có test case nào, nạp toàn bộ
    if not ma_tc_hien_co:
        for idx, tc in enumerate(DANH_SACH_TEST_CASES_CHUAN, start=3):
            ws_tc.cell(row=idx, column=1, value=tc["stt"]).alignment = align_center
            ws_tc.cell(row=idx, column=2, value=tc["pkg_id"]).alignment = align_center
            ws_tc.cell(row=idx, column=3, value=tc["story_id"]).alignment = align_center
            ws_tc.cell(row=idx, column=4, value=tc["tc_id"]).alignment = align_center
            ws_tc.cell(row=idx, column=5, value=tc["name"]).alignment = align_left
            ws_tc.cell(row=idx, column=6, value=tc["priority"]).alignment = align_center
            ws_tc.cell(row=idx, column=7, value=tc["test_type"]).alignment = align_center
            ws_tc.cell(row=idx, column=8, value=tc["endpoint"]).alignment = align_left
            ws_tc.cell(row=idx, column=9, value=tc["payload"]).alignment = align_left
            ws_tc.cell(row=idx, column=10, value=tc["expected"]).alignment = align_left
            ws_tc.cell(row=idx, column=11, value="Chưa chạy kiểm thử").alignment = align_left
            ws_tc.cell(row=idx, column=12, value="NOT RUN").alignment = align_center
            ws_tc.cell(row=idx, column=13, value="Automation QA / AI Agent").alignment = align_center
            ws_tc.cell(row=idx, column=14, value=tc["notes"]).alignment = align_left

            # Định dạng font chữ
            for col in range(1, 15):
                c = ws_tc.cell(row=idx, column=col)
                c.font = font_bold if col in [1, 2, 3, 4, 6, 7, 12] else font_regular

            ws_tc.row_dimensions[idx].height = 24

        # Áp dụng viền ngăn cách endpoint
        _ap_dung_vien_ngan_cach_endpoint(ws_tc)


def dong_bo_ket_qua_excel(bao_cao: BoBaoCaoKiemThu, duong_dan_excel: Path = None, nguon_test: str = "Tự Động") -> int:
    """
    Đồng bộ toàn bộ danh sách kết quả trong bao_cao vào Sheet 'Test Cases', 'Dashboard' và 'Defect Log'.
    Tự động áp dụng đường viền ngăn cách giữa các endpoint khác nhau.
    """
    if duong_dan_excel is None:
        duong_dan_excel = DUONG_DAN_EXCEL

    if not duong_dan_excel.exists():
        print(f"[CẢNH BÁO]: Không tìm thấy file Excel tại {duong_dan_excel}!")
        return 1

    try:
        wb = openpyxl.load_workbook(duong_dan_excel)
    except PermissionError:
        print("\n[LỖI]: File Excel đang được mở trong ứng dụng khác!")
        return 1

    if "Test Cases" not in wb.sheetnames:
        print("Lỗi: Không tìm thấy sheet 'Test Cases' trong file Excel!")
        return 1

    ws_tc = wb["Test Cases"]

    # 1. Đảm bảo ma trận test cases được nạp đầy đủ
    _nap_ma_tran_test_cases_neu_trong(ws_tc)

    # 2. Tạo bản đồ tra cứu kết quả từ bao_cao
    ket_qua_dict = {item["ma"]: item for item in bao_cao.danh_sach}

    so_dong_cap_nhat = 0
    cac_ca_fail = []

    # Quét qua các dòng và cập nhật kết quả
    for row in range(3, ws_tc.max_row + 1):
        ma_tc = ws_tc.cell(row=row, column=4).value  # Cột D: Mã Test Case
        if ma_tc and str(ma_tc).strip() in ket_qua_dict:
            kq = ket_qua_dict[str(ma_tc).strip()]
            trang_thai = kq["trang_thai"]
            chi_tiet = kq["chi_tiet"]

            # Cột K: Actual Result
            if trang_thai == "PASS":
                ws_tc.cell(row=row, column=11, value=f"[{nguon_test}] Đạt yêu cầu nghiệp vụ - Status: PASS ({chi_tiet})")
            else:
                ws_tc.cell(row=row, column=11, value=f"[{nguon_test}] Thất bại: {chi_tiet}")
                cac_ca_fail.append((ma_tc, ws_tc.cell(row=row, column=5).value, chi_tiet))

            # Cột L: Status
            ws_tc.cell(row=row, column=12, value=trang_thai)
            so_dong_cap_nhat += 1

    # Nếu có mã test trong bao_cao chưa có dòng trong ws_tc, thêm dòng mới
    ma_tc_da_co = {str(ws_tc.cell(row=r, column=4).value).strip() for r in range(3, ws_tc.max_row + 1)}
    for item in bao_cao.danh_sach:
        ma = item["ma"]
        if ma not in ma_tc_da_co:
            new_row = ws_tc.max_row + 1
            ws_tc.cell(row=new_row, column=1, value=new_row - 2)
            ws_tc.cell(row=new_row, column=2, value="PKG-AUTO")
            ws_tc.cell(row=new_row, column=3, value="S1-AUTO")
            ws_tc.cell(row=new_row, column=4, value=ma)
            ws_tc.cell(row=new_row, column=5, value=item["ten"])
            ws_tc.cell(row=new_row, column=6, value="High")
            ws_tc.cell(row=new_row, column=7, value="Functional")
            ws_tc.cell(row=new_row, column=8, value="AUTO API")
            ws_tc.cell(row=new_row, column=9, value="{}")
            ws_tc.cell(row=new_row, column=10, value="HTTP 200 OK")
            if item["trang_thai"] == "PASS":
                ws_tc.cell(row=new_row, column=11, value=f"[{nguon_test}] Đạt yêu cầu nghiệp vụ - Status: PASS ({item['chi_tiet']})")
            else:
                ws_tc.cell(row=new_row, column=11, value=f"[{nguon_test}] Thất bại: {item['chi_tiet']}")
                cac_ca_fail.append((ma, item["ten"], item["chi_tiet"]))
            ws_tc.cell(row=new_row, column=12, value=item["trang_thai"])
            ws_tc.cell(row=new_row, column=13, value="Automation QA / AI Agent")
            ws_tc.cell(row=new_row, column=14, value="Auto generated test")
            so_dong_cap_nhat += 1

    # 3. Áp dụng đường viền ngăn cách giữa các endpoint khác nhau
    _ap_dung_vien_ngan_cach_endpoint(ws_tc)

    print(f">>> Đã cập nhật thành công {so_dong_cap_nhat} dòng trong Sheet 'Test Cases'.")

    # 4. Cập nhật thông tin dự án trong Sheet 'Dashboard'
    if "Dashboard" in wb.sheetnames:
        ws_dash = wb["Dashboard"]
        ws_dash["D6"] = "Sprint 1: Phân hệ Tài khoản, Phân quyền & Quản trị người dùng"
        ws_dash["D10"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        ws_dash["D11"] = f"Toàn bộ 10 User Stories (S1-01 -> S1-10) - {nguon_test}"

    # 5. Ghi nhận Bug mới vào Sheet 'Defect Log' nếu có FAIL
    if cac_ca_fail and "Defect Log" in wb.sheetnames:
        ws_bug = wb["Defect Log"]
        dong_tiep_theo = ws_bug.max_row + 1

        bugs_da_co = set()
        for r in range(3, ws_bug.max_row + 1):
            tc_cu = ws_bug.cell(row=r, column=2).value
            status_cu = ws_bug.cell(row=r, column=11).value
            if tc_cu and status_cu == "OPEN":
                bugs_da_co.add(str(tc_cu).strip())

        bugs_moi = 0
        for idx, (ma_tc, ten_tc, ly_do) in enumerate(cac_ca_fail, start=1):
            if str(ma_tc).strip() in bugs_da_co:
                continue
            ma_bug = f"BUG-AUTO-{dong_tiep_theo:03d}"
            ws_bug.cell(row=dong_tiep_theo, column=1, value=ma_bug)
            ws_bug.cell(row=dong_tiep_theo, column=2, value=ma_tc)
            ws_bug.cell(row=dong_tiep_theo, column=3, value=f"[Auto] {ten_tc}")
            ws_bug.cell(row=dong_tiep_theo, column=4, value="Major")
            ws_bug.cell(row=dong_tiep_theo, column=5, value="High")
            ws_bug.cell(row=dong_tiep_theo, column=6, value=f"Kiểm thử {ma_tc}")
            ws_bug.cell(row=dong_tiep_theo, column=7, value=ly_do)
            ws_bug.cell(row=dong_tiep_theo, column=8, value="Phản hồi chuẩn xác theo nghiệp vụ")
            ws_bug.cell(row=dong_tiep_theo, column=9, value="Auto Test")
            ws_bug.cell(row=dong_tiep_theo, column=10, value="Dev Backend")
            ws_bug.cell(row=dong_tiep_theo, column=11, value="OPEN")
            dong_tiep_theo += 1
            bugs_moi += 1

        print(f">>> Đã ghi nhận {bugs_moi} bug mới vào Sheet 'Defect Log'.")
    else:
        print(">>> Không có ca test nào thất bại. Sheet 'Defect Log' sạch đẹp!")

    # 6. Lưu file an toàn
    try:
        wb.save(duong_dan_excel)
        print("=" * 80)
        print(f" HOÀN TẤT! Đã đổ kết quả kiểm thử vào file Excel tại:\n {duong_dan_excel}")
        print("=" * 80)
    except PermissionError:
        backup_excel = DUONG_DAN_EXCEL_SYNC
        wb.save(backup_excel)
        print("=" * 80)
        print(f"[LƯU Ý]: File chính đang mở. Đã lưu kết quả vào file dự phòng:\n {backup_excel}")
        print("=" * 80)

    return 0
