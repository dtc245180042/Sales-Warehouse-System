"""
Bộ tạo file mẫu Excel Báo cáo & Kịch bản Kiểm thử chuẩn Doanh nghiệp (Corporate Template Generator).
Khởi tạo template sạch 100% sẵn sàng cho mọi dự án và sprint mới:
1. Sheet 'Dashboard': KPI Cards động (COUNTIF, COUNTA, IF), bảng tiến độ module tự động.
2. Sheet 'Test Cases': Danh sách kịch bản trống (Row 3-1000) có sẵn Dropdown, Format màu, Border.
3. Sheet 'Defect Log': Sổ theo dõi lỗi trống (Row 3-1000) có sẵn Dropdown Severity, Priority, Status.
"""

import sys
from pathlib import Path
from typing import Optional

client_root = Path(__file__).resolve().parent.parent
if str(client_root) not in sys.path:
    sys.path.insert(0, str(client_root))

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule
from openpyxl.utils import get_column_letter

from config.settings import DUONG_DAN_EXCEL


def tao_file_excel_kiem_thu(duong_dan_file: Optional[Path] = None) -> Path:
    """
    Tạo file Excel chuẩn doanh nghiệp sạch sẽ, sẵn sàng nạp bất kỳ kịch bản kiểm thử mới nào.
    """
    if duong_dan_file is None:
        duong_dan_file = DUONG_DAN_EXCEL

    wb = Workbook()

    # Bảng màu chuẩn doanh nghiệp (Corporate Executive Palette)
    NAVY_HEADER = "1F4E78"       # Xanh dương đậm tiêu đề
    LIGHT_BLUE = "D9E1F2"        # Xanh nhạt highlight
    PASS_BG = "E2EFDA"           # Xanh lá pastel cho PASS
    PASS_FG = "276A3C"
    FAIL_BG = "FCE4D6"           # Đỏ cam pastel cho FAIL
    FAIL_FG = "C65911"
    BLOCKED_BG = "FFF2CC"        # Vàng pastel cho BLOCKED
    BLOCKED_FG = "B25900"
    GRAY_BG = "F2F2F2"

    font_title = Font(name="Segoe UI", size=15, bold=True, color="1F4E78")
    font_subtitle = Font(name="Segoe UI", size=9, italic=True, color="595959")
    font_card_num = Font(name="Segoe UI", size=18, bold=True, color="1F4E78")
    font_card_lbl = Font(name="Segoe UI", size=9, bold=True, color="595959")
    font_header = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    font_bold = Font(name="Segoe UI", size=10, bold=True)
    font_regular = Font(name="Segoe UI", size=9)
    font_pass = Font(name="Segoe UI", size=9, bold=True, color=PASS_FG)
    font_fail = Font(name="Segoe UI", size=9, bold=True, color=FAIL_FG)
    font_blocked = Font(name="Segoe UI", size=9, bold=True, color=BLOCKED_FG)

    fill_header = PatternFill(start_color=NAVY_HEADER, end_color=NAVY_HEADER, fill_type="solid")
    fill_light_blue = PatternFill(start_color=LIGHT_BLUE, end_color=LIGHT_BLUE, fill_type="solid")
    fill_pass = PatternFill(start_color=PASS_BG, end_color=PASS_BG, fill_type="solid")
    fill_fail = PatternFill(start_color=FAIL_BG, end_color=FAIL_BG, fill_type="solid")
    fill_blocked = PatternFill(start_color=BLOCKED_BG, end_color=BLOCKED_BG, fill_type="solid")
    fill_gray = PatternFill(start_color=GRAY_BG, end_color=GRAY_BG, fill_type="solid")

    border_cell = Border(
        left=Side(border_style="thin", color="D9D9D9"),
        right=Side(border_style="thin", color="D9D9D9"),
        top=Side(border_style="thin", color="D9D9D9"),
        bottom=Side(border_style="thin", color="D9D9D9")
    )

    # =========================================================================
    # SHEET 1: DASHBOARD (LIÊN KẾT ĐỘNG 100% VỚI SHEET 2 VÀ SHEET 3)
    # =========================================================================
    ws_dash = wb.active
    ws_dash.title = "Dashboard"
    ws_dash.views.sheetView[0].showGridLines = True

    ws_dash["B2"] = "HỆ THỐNG KIỂM THỬ BACKEND TỰ ĐỘNG (API AUTOMATION TEST REPORT)"
    ws_dash["B2"].font = font_title
    ws_dash["B3"] = "BÁO CÁO KẾT QUẢ KIỂM THỬ CHUẨN DOANH NGHIỆP (LIÊN KẾT SỐ LIỆU ĐỘNG)"
    ws_dash["B3"].font = Font(name="Segoe UI", size=11, bold=True, color="2F5597")
    ws_dash["B4"] = "Dữ liệu tự động cập nhật theo thời gian thực khi Tester / AI Agent thực thi kiểm thử"
    ws_dash["B4"].font = font_subtitle

    # Thông tin dự án chung
    info_fields = [
        ("Phân hệ kiểm thử:", "Chờ nạp yêu cầu nghiệp vụ / file Excel"),
        ("Người thực hiện kiểm thử (Tester):", "Automation QA / AI Agent"),
        ("Nhà phát triển phụ trách (Dev):", "Đội ngũ Backend"),
        ("Môi trường kiểm thử:", "Localhost (FastAPI / In-Memory & Live Server)"),
        ("Thời gian thực hiện:", "Chờ thực thi"),
        ("Phạm vi kiểm thử:", "Tự động phát hiện theo Scope"),
    ]
    for idx, (label, val) in enumerate(info_fields, start=6):
        ws_dash[f"B{idx}"] = label
        ws_dash[f"B{idx}"].font = font_bold
        ws_dash[f"D{idx}"] = val
        ws_dash[f"D{idx}"].font = font_regular
        ws_dash.merge_cells(f"B{idx}:C{idx}")
        ws_dash.merge_cells(f"D{idx}:F{idx}")

    # Khối KPI Cards (Công thức động liên kết sang Sheet 'Test Cases' từ dòng 3 đến 1000)
    kpis = [
        ("TỔNG TEST CASES", "=COUNTA('Test Cases'!D3:D1000)", "B", "C"),
        ("ĐÃ ĐẠT (PASS)", "=COUNTIF('Test Cases'!L3:L1000, \"PASS\")", "D", "E"),
        ("THẤT BẠI (FAIL)", "=COUNTIF('Test Cases'!L3:L1000, \"FAIL\")", "F", "G"),
        ("TỶ LỆ ĐẠT (PASS RATE)", "=IF(B13>0, D13/B13, 0)", "H", "I"),
        ("BLOCKED / NOT RUN", "=COUNTIF('Test Cases'!L3:L1000, \"BLOCKED\") + COUNTIF('Test Cases'!L3:L1000, \"NOT RUN\")", "J", "K"),
    ]
    for lbl, formula, c_start, c_end in kpis:
        c_val = f"{c_start}13"
        c_lbl = f"{c_start}14"
        ws_dash.merge_cells(f"{c_start}13:{c_end}13")
        ws_dash.merge_cells(f"{c_start}14:{c_end}14")

        ws_dash[c_val] = formula
        ws_dash[c_val].font = font_card_num
        ws_dash[c_val].alignment = Alignment(horizontal="center", vertical="center")
        ws_dash[c_val].fill = fill_light_blue

        ws_dash[c_lbl] = lbl
        ws_dash[c_lbl].font = font_card_lbl
        ws_dash[c_lbl].alignment = Alignment(horizontal="center", vertical="center")
        ws_dash[c_lbl].fill = fill_gray

    ws_dash["H13"].number_format = "0.0%"

    # Khối Defect Summary liên kết với Sheet 'Defect Log'
    ws_dash["B17"] = "THỐNG KÊ LỖI PHẦN MỀM (LIÊN KẾT VỚI SHEET 'DEFECT LOG')"
    ws_dash["B17"].font = font_bold

    defect_kpis = [
        ("TỔNG SỐ BUG GHI NHẬN", "=COUNTA('Defect Log'!A3:A1000)", "B", "C"),
        ("BUG ĐANG MỞ (OPEN/IN PROGRESS)", "=COUNTIF('Defect Log'!K3:K1000, \"OPEN\") + COUNTIF('Defect Log'!K3:K1000, \"IN PROGRESS\") + COUNTIF('Defect Log'!K3:K1000, \"REOPENED\")", "D", "F"),
        ("BUG ĐÃ ĐÓNG (CLOSED/RESOLVED)", "=COUNTIF('Defect Log'!K3:K1000, \"CLOSED\") + COUNTIF('Defect Log'!K3:K1000, \"RESOLVED\")", "G", "I"),
        ("TỶ LỆ GIẢI QUYẾT", "=IF(B19>0, G19/B19, 1)", "J", "K"),
    ]
    for lbl, formula, c_start, c_end in defect_kpis:
        c_val = f"{c_start}19"
        c_lbl = f"{c_start}20"
        ws_dash.merge_cells(f"{c_start}19:{c_end}19")
        ws_dash.merge_cells(f"{c_start}20:{c_end}20")

        ws_dash[c_val] = formula
        ws_dash[c_val].font = font_card_num
        ws_dash[c_val].alignment = Alignment(horizontal="center", vertical="center")
        ws_dash[c_val].fill = fill_light_blue

        ws_dash[c_lbl] = lbl
        ws_dash[c_lbl].font = font_card_lbl
        ws_dash[c_lbl].alignment = Alignment(horizontal="center", vertical="center")
        ws_dash[c_lbl].fill = fill_gray

    ws_dash["J19"].number_format = "0.0%"

    # =========================================================================
    # SHEET 2: CHI TIẾT TEST CASES (DROPDOWN + CONDITIONAL FORMATTING)
    # =========================================================================
    ws_tc = wb.create_sheet(title="Test Cases")
    ws_tc.views.sheetView[0].showGridLines = True
    ws_tc.freeze_panes = "D3"

    ws_tc["A1"] = "DANH SÁCH CHI TIẾT KỊCH BẢN KIỂM THỬ BACKEND API (TEST CASES MATRIX)"
    ws_tc["A1"].font = font_title

    tc_headers = [
        "STT", "Mã Gói", "Story ID", "Mã Test Case", "Tên Kịch Bản Kiểm Thử",
        "Mức Ưu Tiên", "Loại Test", "Endpoint & Method", "Dữ Liệu Đầu Vào (Payload)",
        "Kết Quả Mong Đợi (Expected)", "Kết Quả Thực Tế (Actual)",
        "Trạng Thái", "Người Test", "Ghi Chú Nghiệp Vụ"
    ]
    for col_idx, h in enumerate(tc_headers, start=1):
        cell = ws_tc.cell(row=2, column=col_idx, value=h)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Thiết lập Data Validation (Dropdowns) cho Sheet 'Test Cases'
    dv_priority = DataValidation(type="list", formula1='"Critical,High,Medium,Low"', allow_blank=True)
    dv_priority.prompt = "Chọn mức độ ưu tiên từ danh sách"
    dv_priority.promptTitle = "Mức Ưu Tiên"
    ws_tc.add_data_validation(dv_priority)
    dv_priority.add("F3:F1000")

    dv_type = DataValidation(type="list", formula1='"Validation,Security,Functional,Database,Business,Schema"', allow_blank=True)
    dv_type.prompt = "Chọn loại kiểm thử"
    dv_type.promptTitle = "Loại Test"
    ws_tc.add_data_validation(dv_type)
    dv_type.add("G3:G1000")

    dv_status = DataValidation(type="list", formula1='"PASS,FAIL,BLOCKED,NOT RUN"', allow_blank=True)
    dv_status.error = "Trạng thái bắt buộc phải là: PASS, FAIL, BLOCKED hoặc NOT RUN"
    dv_status.errorTitle = "Sai Trạng Thái"
    dv_status.prompt = "Chọn kết quả test: PASS, FAIL, BLOCKED hoặc NOT RUN"
    dv_status.promptTitle = "Trạng Thái Kiểm Thử"
    ws_tc.add_data_validation(dv_status)
    dv_status.add("L3:L1000")

    # Conditional Formatting cho Sheet 'Test Cases'
    rule_pass = CellIsRule(operator='equal', formula=['"PASS"'], fill=fill_pass, font=font_pass)
    rule_fail = CellIsRule(operator='equal', formula=['"FAIL"'], fill=fill_fail, font=font_fail)
    rule_blocked = CellIsRule(operator='equal', formula=['"BLOCKED"'], fill=fill_blocked, font=font_blocked)
    rule_not_run = CellIsRule(operator='equal', formula=['"NOT RUN"'], fill=fill_gray, font=Font(name="Segoe UI", size=9, bold=True, color="595959"))

    ws_tc.conditional_formatting.add("L3:L1000", rule_pass)
    ws_tc.conditional_formatting.add("L3:L1000", rule_fail)
    ws_tc.conditional_formatting.add("L3:L1000", rule_blocked)
    ws_tc.conditional_formatting.add("L3:L1000", rule_not_run)

    # =========================================================================
    # SHEET 3: SỔ THEO DÕI LỖI (DEFECT LOG - DROPDOWNS & STATUS)
    # =========================================================================
    ws_bug = wb.create_sheet(title="Defect Log")
    ws_bug.views.sheetView[0].showGridLines = True

    ws_bug["A1"] = "BẢNG QUẢN LÝ VÀ THEO DÕI LỖI PHẦN MỀM (DEFECT TRACKING LOG)"
    ws_bug["A1"].font = font_title

    bug_headers = [
        "Mã Bug", "Thuộc Test Case", "Tiêu Đề / Mô Tả Ngắn Lỗi", "Mức Nghiêm Trọng (Severity)",
        "Mức Ưu Tiên (Priority)", "Các Bước Tái Hiện Lỗi (Steps)", "Kết Quả Thực Tế (Actual)",
        "Kết Quả Kỳ Vọng (Expected)", "Người Phát Hiện", "Dev Phụ Trách", "Trạng Thái", "Ngày Đóng"
    ]
    for col_idx, h in enumerate(bug_headers, start=1):
        cell = ws_bug.cell(row=2, column=col_idx, value=h)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Dropdowns cho Sheet 'Defect Log'
    dv_bug_sev = DataValidation(type="list", formula1='"Critical,Major,Minor,Trivial"', allow_blank=True)
    ws_bug.add_data_validation(dv_bug_sev)
    dv_bug_sev.add("D3:D1000")

    dv_bug_pri = DataValidation(type="list", formula1='"High,Medium,Low"', allow_blank=True)
    ws_bug.add_data_validation(dv_bug_pri)
    dv_bug_pri.add("E3:E1000")

    dv_bug_status = DataValidation(type="list", formula1='"OPEN,IN PROGRESS,RESOLVED,CLOSED,REOPENED"', allow_blank=True)
    ws_bug.add_data_validation(dv_bug_status)
    dv_bug_status.add("K3:K1000")

    # Conditional formatting cho trạng thái Bug
    rule_bug_open = CellIsRule(operator='equal', formula=['"OPEN"'], fill=fill_fail, font=font_fail)
    rule_bug_reopen = CellIsRule(operator='equal', formula=['"REOPENED"'], fill=fill_fail, font=font_fail)
    rule_bug_closed = CellIsRule(operator='equal', formula=['"CLOSED"'], fill=fill_pass, font=font_pass)
    rule_bug_resolved = CellIsRule(operator='equal', formula=['"RESOLVED"'], fill=fill_pass, font=font_pass)
    rule_bug_inprog = CellIsRule(operator='equal', formula=['"IN PROGRESS"'], fill=fill_light_blue, font=Font(name="Segoe UI", size=9, bold=True, color="1F4E78"))

    ws_bug.conditional_formatting.add("K3:K1000", rule_bug_open)
    ws_bug.conditional_formatting.add("K3:K1000", rule_bug_reopen)
    ws_bug.conditional_formatting.add("K3:K1000", rule_bug_closed)
    ws_bug.conditional_formatting.add("K3:K1000", rule_bug_resolved)
    ws_bug.conditional_formatting.add("K3:K1000", rule_bug_inprog)

    # ĐIỀU CHỈNH KÍCH THƯỚC CỘT
    do_rong_co_dinh = {
        "Dashboard": {1: 4, 2: 12, 3: 16, 4: 38, 5: 18, 6: 12, 7: 12, 8: 12, 9: 12, 10: 14, 11: 18},
        "Test Cases": {
            1: 6, 2: 12, 3: 14, 4: 14, 5: 35, 6: 14, 7: 14, 8: 38, 9: 35,
            10: 42, 11: 35, 12: 16, 13: 18, 14: 30
        },
        "Defect Log": {
            1: 12, 2: 16, 3: 40, 4: 18, 5: 14, 6: 35, 7: 30, 8: 30, 9: 18, 10: 16, 11: 16, 12: 14
        }
    }

    for ws in wb.worksheets:
        ten_sheet = ws.title
        ws.row_dimensions[1].height = 25
        ws.row_dimensions[2].height = 28

        if ten_sheet in do_rong_co_dinh:
            for c_idx, width in do_rong_co_dinh[ten_sheet].items():
                col_letter = get_column_letter(c_idx)
                ws.column_dimensions[col_letter].width = width

    # Lưu file
    duong_dan_file.parent.mkdir(parents=True, exist_ok=True)
    wb.save(duong_dan_file)
    print(f"[OK] Đã tạo file Excel chuẩn doanh nghiệp sạch tại:\n  {duong_dan_file}")
    return duong_dan_file


if __name__ == "__main__":
    tao_file_excel_kiem_thu()
