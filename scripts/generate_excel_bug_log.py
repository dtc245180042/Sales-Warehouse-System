import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime
import os

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Tong_Hop_Loi_Da_Sua"

# Set sheet view gridlines
ws.views.sheetView[0].showGridLines = True

# Colors & Styles
FONT_TITLE = Font(name="Calibri", size=16, bold=True, color="1E3A8A")
FONT_SUBTITLE = Font(name="Calibri", size=11, italic=True, color="475569")
FONT_HEADER = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
FONT_BOLD = Font(name="Calibri", size=11, bold=True, color="1E293B")
FONT_REGULAR = Font(name="Calibri", size=10, color="1E293B")
FONT_STATUS_OK = Font(name="Calibri", size=10, bold=True, color="047857")

FILL_HEADER = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
FILL_ZEBRA = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
FILL_STATUS_OK = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")

THIN_BORDER_SIDE = Side(border_style="thin", color="CBD5E1")
BORDER_CELL = Border(left=THIN_BORDER_SIDE, right=THIN_BORDER_SIDE, top=THIN_BORDER_SIDE, bottom=THIN_BORDER_SIDE)
BORDER_HEADER = Border(left=THIN_BORDER_SIDE, right=THIN_BORDER_SIDE, top=Side(border_style="medium", color="0F172A"), bottom=Side(border_style="medium", color="0F172A"))

# Title Block
ws.merge_cells("A1:H1")
ws["A1"] = "BẢNG TỔNG HỢP THEO DÕI VÀ XỬ LÝ LỖI HỆ THỐNG"
ws["A1"].font = FONT_TITLE
ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
ws.row_dimensions[1].height = 35

ws.merge_cells("A2:H2")
now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
ws["A2"] = f"Dự án: Hệ Thống Bán Hàng & Kho Vận (Sales-Warehouse-System) | Ngày cập nhật: {now_str} | Trạng thái: Đã xử lý & Kiểm thử hoàn tất"
ws["A2"].font = FONT_SUBTITLE
ws["A2"].alignment = Alignment(horizontal="center", vertical="center")
ws.row_dimensions[2].height = 22

ws.append([]) # Empty row 3

# Table Headers
headers = [
    "STT",
    "Mã Lỗi / Hạng Mục",
    "Mô Tả Lỗi (Hiện Tượng)",
    "Nguyên Nhân Kỹ Thuật (Root Cause)",
    "Giải Pháp Đã Xử Lý (Resolution)",
    "Các File Can Thiệp / Chỉnh Sửa",
    "Trạng Thái",
    "Kết Quả Kiểm Thử"
]

ws.append(headers)
header_row_idx = 4
ws.row_dimensions[header_row_idx].height = 28

for col_idx, col_name in enumerate(headers, 1):
    cell = ws.cell(row=header_row_idx, column=col_idx)
    cell.font = FONT_HEADER
    cell.fill = FILL_HEADER
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = BORDER_HEADER

# Data Rows
data = [
    [
        1,
        "BUG-PAGINATION\n(SCRUM-229)",
        "Lỗi phân trang danh sách Đại lý: Khi chọn kích thước hiển thị 5, 20 hay 50 bản ghi thì bảng chỉ hiển thị 1 trang, không chia sang trang thứ 2 và không chuyển trang được.",
        "1. CustomerList.tsx gọi customerService.getPaginated() với tham số page_size: 10 bị gán cứng, không đọc pageSize từ URL.\n2. Component DataTable chỉ hỗ trợ phân trang client-side trên mảng data nhận vào (chỉ có 10 bản ghi từ server) nên luôn tính tổng trang = 1 khi chọn 10, 20, 50.\n3. DataTable thiếu cơ chế phân trang Server-side (Controlled Pagination) để thông báo cho component cha khi đổi pageSize hoặc chuyển trang.",
        "1. Nâng cấp DataTable.tsx: Bổ sung props serverSidePagination, totalRecords, currentPage, pageSize, onPageChange, onPageSizeChange, hiển thị đúng tổng số bản ghi và hỗ trợ dãy nút bấm trực tiếp số trang (1, 2, 3...).\n2. Cập nhật CustomerList.tsx: Đọc urlPageSize từ URL SearchParams, truyền page_size động vào API, đồng bộ chuyển trang 2 chiều và bổ sung phân trang cho cả chế độ xem thẻ di động ngoài hiện trường.",
        "frontend/src/components/common/DataTable.tsx\nfrontend/src/pages/customers/CustomerList.tsx",
        "ĐÃ SỬA",
        "Đạt 100%. Chọn 5, 10, 20, 50 bản ghi đều hiển thị chuẩn số trang thực tế (Trang 1/2, 1/3...), chuyển trang Next/Prev và nhảy số trang hoạt động mượt mà."
    ],
    [
        2,
        "BUG-TIMEZONE\n(DATETIME-UTC)",
        "Lệch múi giờ hiển thị thời gian đơn hàng: Ngày tạo khớp nhưng giờ tạo bị trễ 7 tiếng so với thực tế (ví dụ 10:00 sáng nhưng hiển thị 03:00 sáng).",
        "Backend lưu trữ và serialize timestamp theo chuẩn UTC ISO-8601 không kèm hậu tố 'Z'. Khi frontend dùng hàm new Date() phân tích cú pháp, JavaScript hiểu nhầm là giờ Local hoặc không áp dụng múi giờ Việt Nam (UTC+7 / Asia/Ho_Chi_Minh).",
        "1. Bổ sung chuẩn hóa chuỗi thời gian trong utils/formatters.ts tự động nhận diện chuỗi UTC và hiển thị chuẩn định dạng dd/MM/yyyy HH:mm theo múi giờ GMT+7.\n2. Cập nhật orderService.ts và axios interceptor đảm bảo mọi trường ngày giờ tạo đơn, cập nhật trạng thái đều hiển thị thống nhất.",
        "frontend/src/utils/formatters.ts\nfrontend/src/services/orderService.ts\nfrontend/src/services/api.ts",
        "ĐÃ SỬA",
        "Đạt 100%. Thời gian đơn hàng, lịch sử vòng đời đơn và nhật ký thao tác hiển thị chính xác đúng giờ địa phương Việt Nam."
    ],
    [
        3,
        "DATA-PRODUCT-CLEAN\n(PRODUCT-CATALOG)",
        "Dữ liệu danh mục sản phẩm không đúng nghiệp vụ: Kho là kho thiết bị điện tử nhưng trong danh mục lại xuất hiện sản phẩm bánh kẹo, đồ ăn vặt, đồ ngọt.",
        "Dữ liệu mẫu (seed data / Excel import cũ) còn sót 482 mã sản phẩm đồ ngọt, kẹo dẻo, socola, bánh quy, trà sữa không thuộc ngành hàng điện tử & linh kiện.",
        "Viết và thực thi kịch bản clean_food_products.py quét sạch sẽ toàn bộ 482 bản ghi sản phẩm bánh kẹo, thực phẩm khỏi cơ sở dữ liệu MySQL và SQLite; bảo toàn nguyên vẹn 5,868 sản phẩm điện tử, linh kiện phần cứng, phụ kiện mạng.",
        "scripts/clean_food_products.py\nCơ sở dữ liệu MySQL & SQLite",
        "ĐÃ SỬA",
        "Đạt 100%. Danh mục sản phẩm sạch hoàn toàn, 100% thuộc ngành hàng điện tử - viễn thông - linh kiện."
    ],
    [
        4,
        "AUTH-LOGIN-LOCK\n(SECURITY-AUTH)",
        "Lỗi không đăng nhập được tài khoản: Thông tin tài khoản trong file tài khoản.txt bị báo sai mật khẩu hoặc tài khoản bị khóa tạm thời.",
        "1. Cơ chế bảo vệ chống tấn công dò mật khẩu (brute-force) tự động khóa tài khoản khi có nhiều lần thử sai (locked_until > now).\n2. Hash mật khẩu của một số tài khoản thử nghiệm chưa được đồng bộ chính xác với mật khẩu quy định trong tài khoản.txt.",
        "1. Chạy script reset giải phóng trạng thái khóa (failed_login_attempts = 0, is_active = True, locked_until = None) cho toàn bộ tài khoản.\n2. Đồng bộ hash bcrypt chuẩn cho các tài khoản: SalesMgr@1234, WhMgr@1234, Customer@1234, SalesRep@1234, Accountant@1234, Admin@123456.\n3. Cập nhật và đối soát chuẩn xác file tài khoản.txt.",
        "Sales-Warehouse-System_Frontend/tài khoản.txt\nbackend/scripts/reset_passwords.py",
        "ĐÃ SỬA",
        "Đạt 100%. Đăng nhập trơn tru trên tất cả 7 vai trò người dùng (Admin, Sales Manager, Sales Staff, Warehouse Manager, Warehouse Staff, Accountant, Customer)."
    ],
    [
        5,
        "UI-JIRA-CLEANUP\n(SYSTEM-UI)",
        "Dọn dẹp các mã vé nội bộ và Jira ticket hiển thị thô trên giao diện người dùng (ví dụ S4-01, S5-02, SCRUM-xxx).",
        "Các nhãn và tag đặt tên theo mã Jira trong giai đoạn phát triển sprint còn sót lại trong tiêu đề modal, Swagger tag và breadcrumb.",
        "Rà soát và chuyển đổi toàn bộ nhãn hiển thị sang ngôn ngữ tiếng Việt thân thiện với nghiệp vụ kinh doanh - kho vận.",
        "frontend/src/routes/AppRoutes.tsx\nfrontend/src/pages/orders/CreateOrder.tsx\nbackend/app/api/endpoints/*",
        "ĐÃ SỬA",
        "Đạt 100%. Giao diện người dùng chuyên nghiệp, đồng bộ ngôn ngữ nghiệp vụ."
    ],
    [
        6,
        "ORDER-CUSTOM-ADDRESS\n(EP-03 / SC-ORDER)",
        "Tạo đơn hàng không nhập được địa chỉ khác: Khi chọn 'Giao tại địa chỉ khác...', giao diện chỉ hiện địa chỉ tĩnh của công ty, không cho nhập địa chỉ nhận hàng, người nhận hoặc số điện thoại mới.",
        "Component CreateOrder.tsx chỉ hiển thị thẻ địa chỉ mặc định tĩnh, thiếu các trường input form khi selectedAddressId === undefined.",
        "Bổ sung 3 trường nhập liệu: Địa chỉ nhận hàng chi tiết, Tên người nhận hàng, Số điện thoại người nhận cùng các nút chọn nhanh hôm nay/+1 ngày. Dữ liệu được gán chính xác vào payload tạo đơn.",
        "frontend/src/pages/orders/CreateOrder.tsx",
        "ĐÃ SỬA",
        "Đạt 100%. Khi chọn 'Giao tại địa chỉ khác...', các trường nhập địa chỉ và người nhận hiển thị đầy đủ, nhập liệu mượt mà."
    ],
    [
        7,
        "SALES-REP-VISIBILITY\n(CUSTOMER-SYNC)",
        "Đã tạo công ty nhưng khi đăng nhập bằng tài khoản sales_rep thì bị mất / không tìm thấy công ty vừa tạo.",
        "Khi Admin/Kế toán tạo đại lý mới, trường assigned_sales_rep được lưu nhưng CustomerAssignment chưa liên kết assigned_staff_id. Query của Sales Rep lọc theo INNER JOIN assigned_staff_id khiến công ty bị ẩn.",
        "1. Backend auto-link User ID tương ứng với tên assigned_sales_rep vào CustomerAssignment.\n2. Mở rộng truy vấn GET /customers của Sales Rep khớp cả assigned_staff_id lẫn tên nhân viên.\n3. Chuẩn hóa ENUM dữ liệu khách hàng tránh lỗi 500 Pydantic.",
        "backend/app/services/customer_service.py",
        "ĐÃ SỬA",
        "Đạt 100%. Tài khoản sales_rep đăng nhập thấy ngay công ty mới tạo (VD: CUS-1313 / Công ty CP Công Nghệ & Tin Học Hà Nội)."
    ],
    [
        8,
        "UI-SPRINT-TAG-REMOVAL\n(EP-03)",
        "Giao diện danh sách đại lý xuất hiện mã nội bộ '(EP-03)' trên tiêu đề phụ gây khó hiểu cho người dùng.",
        "Tiêu đề phụ của trang CustomerList.tsx còn sót lại chuỗi '(EP-03)' từ mã epic trong giai đoạn lập trình sprint.",
        "Xóa bỏ hoàn toàn mã '(EP-03)', chuẩn hóa lại thành mô tả nghiệp vụ thân thiện: 'Hệ thống quản lý {totalCount} đại lý và khách hàng trong tuyến phân phối'.",
        "frontend/src/pages/customers/CustomerList.tsx",
        "ĐÃ SỬA",
        "Đạt 100%. Tiêu đề trang hiển thị chuẩn mực và chuyên nghiệp, không còn mã kỹ thuật EP-03."
    ],
    [
        9,
        "CREDIT-LIMIT-SETUP-BUTTON\n(CREDIT-MANAGEMENT)",
        "Không tìm thấy nút 'Thiết lập hạn mức tín dụng' và phân quyền chưa đồng bộ.",
        "1. Nút thiết lập hạn mức tín dụng chỉ nằm bên trong trang chi tiết CustomerDetail.tsx và bị giới hạn quyền truy cập.\n2. Danh sách đại lý CustomerList.tsx chưa có lối tắt mở nhanh modal thiết lập hạn mức công nợ.",
        "1. Trong CustomerDetail.tsx: Đặt nút nổi bật với nhãn rõ ràng 'Thiết lập hạn mức tín dụng', mở rộng quyền cho Giám đốc kinh doanh, Quản lý, Kế toán và Admin.\n2. Trong CustomerList.tsx: Bổ sung nút CreditCard tại cột Thao tác và cho phép click trực tiếp vào cột 'Hạn Mức Cấp' để mở Modal thiết lập hạn mức ngay trên danh sách.",
        "frontend/src/pages/customers/CustomerDetail.tsx\nfrontend/src/pages/customers/CustomerList.tsx",
        "ĐÃ SỬA",
        "Đạt 100%. Người dùng dễ dàng tìm thấy và thao tác nút 'Thiết lập hạn mức tín dụng' ở cả danh sách đại lý lẫn trang chi tiết."
    ]
]

for row_idx, row_data in enumerate(data, start=header_row_idx + 1):
    ws.row_dimensions[row_idx].height = 65
    is_zebra = (row_idx % 2 == 0)
    for col_idx, val in enumerate(row_data, 1):
        cell = ws.cell(row=row_idx, column=col_idx, value=val)
        cell.border = BORDER_CELL
        if col_idx == 1:
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.font = FONT_BOLD
        elif col_idx == 2:
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.font = FONT_BOLD
        elif col_idx == 7:
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.font = FONT_STATUS_OK
            cell.fill = FILL_STATUS_OK
        elif col_idx == 8:
            cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
            cell.font = FONT_REGULAR
        else:
            cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
            cell.font = FONT_REGULAR
        
        if col_idx != 7 and is_zebra:
            cell.fill = FILL_ZEBRA

# Auto adjust column widths
col_widths = {
    1: 8,   # STT
    2: 24,  # Mã Lỗi
    3: 38,  # Mô tả
    4: 45,  # Nguyên nhân
    5: 45,  # Giải pháp
    6: 35,  # File can thiệp
    7: 15,  # Trạng thái
    8: 35   # Kết quả kiểm thử
}

for col_idx, width in col_widths.items():
    col_letter = get_column_letter(col_idx)
    ws.column_dimensions[col_letter].width = width

# Save to workspace paths
file_path_1 = os.path.abspath(os.path.join(os.getcwd(), "tong_hop_loi_da_sua.xlsx"))
file_path_2 = os.path.abspath(os.path.join(os.getcwd(), "..", "tong_hop_loi_da_sua.xlsx"))

wb.save(file_path_1)
print(f"Saved Excel log to: {file_path_1}")
try:
    wb.save(file_path_2)
    print(f"Saved Excel log to: {file_path_2}")
except Exception as e:
    print(f"Could not save to parent dir: {e}")
