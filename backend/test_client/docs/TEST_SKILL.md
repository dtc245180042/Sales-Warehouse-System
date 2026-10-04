# TÀI LIỆU QUY TRÌNH KIỂM THỬ TỰ ĐỘNG BACKEND (BACKEND TEST WORKFLOW)
**Dự án:** Hệ Thống Quản Lý Bán Hàng & Kho Hàng (Sales & Warehouse Management System)  
**Phân hệ áp dụng:** Toàn bộ Backend API (Tiếp nhận file yêu cầu nghiệp vụ Excel & kiểm thử các Endpoint)  
**Đối tượng thực hiện:** AI Agent (Antigravity) & QA Engineer / Tester  
**Tệp báo cáo chuẩn:** [reports/Bảng kiểm thử Backend.xlsx](file:///d:/Em/Sales-Warehouse-System/backend/test_client/reports/Bảng kiểm thử Backend.xlsx)

---

## NGUYÊN TẮC CỐT LÕI (CORE PRINCIPLES)

1. **CHỈ KIỂM THỬ, TUYỆT ĐỐI KHÔNG SỬA CODE (READ-ONLY & TEST ONLY):**
   * AI Agent đóng vai trò là Kiểm thử viên độc lập (Independent QA Tester).
   * **Nghiêm cấm** Agent tự ý sửa mã nguồn (`backend/app/...`) khi gặp test case thất bại.
   * Mọi sai lệch giữa thực tế và yêu cầu đều phải được ghi nhận trung thực thành lỗi (Defect/Bug) trong báo cáo kiểm thử để đội ngũ Lập trình viên (Dev) xử lý.

2. **CƠ CHẾ TIẾP NHẬN YÊU CẦU ĐỘNG (REQUIREMENTS INGESTION):**
   * Bộ 30 test case và file Excel hiện tại là **khung mẫu thử nghiệm (Sample/Template Pipeline)** nhằm chuẩn hóa quy trình.
   * Khi người dùng nạp file Excel yêu cầu nghiệp vụ chính thức và danh sách các endpoint mới, quy trình sẽ tự động phân tích ma trận nghiệp vụ, sinh kịch bản kiểm thử và cập nhật kết quả vào bảng tính động.

---

## QUY TRÌNH 3 GIAI ĐOẠN KHÉP KÍN (THE 3-PHASE PIPELINE)

```text
========================================================================================
 GIAI ĐOẠN 1: NẠP YÊU CẦU NGHIỆP VỤ & THIẾT KẾ TEST (REQUIREMENTS & TEST MATRIX)
  - Tiếp nhận file Excel yêu cầu nghiệp vụ và danh sách Endpoint mới từ người dùng
  - Phân tích Acceptance Criteria thành Test Matrix: Happy Path, Validation, Security, DB
  - Tạo Package theo đúng cấu trúc chuẩn: backend/test_client/suites/pkg_XX_<ten_module>/
  - Đăng ký tự động vào Master Runner (runner.py) và Excel Synchronizer
========================================================================================
                                           │
                                           ▼
========================================================================================
 GIAI ĐOẠN 2: THỰC THI KIỂM THỬ ĐỘC LẬP (STRICT TEST EXECUTION - NO SELF-HEALING)
  - Chế độ 1: In-Memory Fast Test (SQLite :memory: + TestClient + Mock Time)
  - Chế độ 2: Live Server Test (HTTP thực tế qua httpx, kiểm tra CORS & Máy chủ thật)
  - Ma trận Token 7 vai trò + Quy tắc Teardown dọn rác DB không làm bẩn môi trường dev
  - NGUYÊN TẮC: TUYỆT ĐỐI KHÔNG SỬA CODE BACKEND KHI GẶP LỖI
========================================================================================
                                           │
                                           ▼
========================================================================================
 GIAI ĐOẠN 3: ĐỒNG BỘ ĐỘNG VÀO EXCEL DOANH NGHIỆP (DYNAMIC EXCEL REPORTING)
  - Điền Actual Result & Status (PASS/FAIL) vào Sheet 'Test Cases' theo dải động
  - Bảo tồn 100% công thức động (=COUNTIF, =COUNTIFS, =COUNTA) trên Sheet 'Dashboard'
  - Tự động ghi nhận Bug mới vào Sheet 'Defect Log' (Cơ chế chống trùng lặp Bug)
  - Hỗ trợ cơ chế Safe File-Lock: Tự động lưu bản Sync an toàn nếu file Excel đang mở
========================================================================================
```

---

## GIAI ĐOẠN 1: NẠP YÊU CẦU & QUY CHUẨN TẠO FILE UNIT TEST

### 1. Nguồn dữ kiện đầu vào (Data Ingestion)
Quy trình chấp nhận 2 nguồn dữ liệu nghiệp vụ:
1. **File Excel yêu cầu nghiệp vụ chính thức** do người dùng cung cấp (chứa danh sách Module, User Story, Acceptance Criteria, Endpoint, Method, Payload).
2. **Kịch bản kiểm thử mẫu ban đầu (Sprint 1 Sample):** Được lưu giữ làm baseline tham chiếu.

### 2. Nguyên tắc thiết kế kịch bản kiểm thử (Test Case Construction)
Mỗi Endpoint được phân rã thành tối thiểu 4 nhóm kịch bản:
* **Nhóm 1 - Ràng buộc dữ liệu (Validation):** Kiểm tra dữ liệu rỗng, thiếu trường, sai kiểu dữ liệu, sai định dạng (HTTP 400 / 422).
* **Nhóm 2 - Luồng chuẩn (Happy Path):** Thực hiện đúng luồng với dữ liệu hợp lệ, kiểm tra mã trạng thái trả về (HTTP 200 / 201) và cấu trúc response.
* **Nhóm 3 - An toàn & Bảo mật (Security & RBAC):** Kiểm tra truy cập khi không có token (HTTP 401), token sai quyền (HTTP 403), chống rò rỉ thông tin nhạy cảm.
* **Nhóm 4 - Tương tác dữ liệu (Database Integrity):** Xác nhận dữ liệu được lưu, sửa, xóa đúng trong Database.

### 3. Quy chuẩn Thư mục & Đặt tên File Test mới (Directory & Naming Standard)

Tất cả các ca kiểm thử mới được tổ chức chặt chẽ trong thư mục [backend/test_client/](file:///d:/Em/Sales-Warehouse-System/backend/test_client):

```text
backend/test_client/
├── core/                                   # Các module nền tảng dùng chung
│   ├── context.py                          # Khởi tạo SQLite in-memory & nạp tài khoản mẫu
│   └── reporter.py                         # Thu thập kết quả & xuất báo cáo
├── suites/                                 # Chứa các gói kiểm thử (Test Packages)
│   ├── pkg_01_validation/                  # Package 1: Validation
│   ├── pkg_02_forgot_password/             # Package 2: Quên mật khẩu
│   ├── pkg_03_login_lockout/               # Package 3: Đăng nhập & Khóa 15p
│   ├── pkg_04_session_change_pwd/          # Package 4: Đổi mật khẩu & Phiên
│   ├── pkg_05_rbac_permissions/            # Package 5: Phân quyền vai trò
│   └── pkg_{XX}_{ten_module_tieng_anh}/    # <-- PHÂN HỆ MỚI ĐƯỢC TẠO TẠI ĐÂY
│       ├── __init__.py                     # Package init
│       └── test_{ten_module}.py            # File kiểm thử chính của phân hệ
├── runner.py                          # Master Runner (chạy lẻ từng package hoặc all)
├── test_live_api.py                        # Script kiểm thử Live Server mạng thật
├── runner.py                        # Script tự động cập nhật kết quả vào Excel
└── chay_test.bat                           # Giao diện menu một chạm trên Windows
```

* **Quy tắc đặt tên thư mục:** `pkg_{số thứ tự 2 chữ số}_{tên phân hệ tiếng Anh viết thường cách nhau bằng gạch dưới}`.  
  *Ví dụ:* `pkg_06_product_catalog`, `pkg_07_inventory_orders`.
* **Quy tắc đặt tên file test:** `test_{tên tính năng}.py`.  
  *Ví dụ:* `test_product_catalog.py`.
* **Quy tắc đặt tên hàm thực thi chính:** `chay_kiem_thu_{tên module}(bao_cao)`. Hàm này nhận tham số `bao_cao` (thể hiện của [BoBaoCaoKiemThu](file:///d:/Em/Sales-Warehouse-System/backend/test_client/core/reporter.py)).

### 4. Khung mã nguồn chuẩn (Boilerplate Template) cho một File Test mới

Mọi file kiểm thử mới trong `suites/` phải tuân theo khung mẫu chuẩn sau:

```python
"""
GÓI KIỂM THỬ: [Tên Phân Hệ Mới]
Endpoint áp dụng: [Danh sách Endpoint từ file Excel]
"""
import sys
from pathlib import Path

# Đảm bảo import được backend và test_client
thu_muc_backend = Path(__file__).resolve().parent.parent.parent
if str(thu_muc_backend) not in sys.path:
    sys.path.insert(0, str(thu_muc_backend))

from core.context import khoi_tao_app_test
from core.reporter import BoBaoCaoKiemThu


def chay_kiem_thu_ten_module(bao_cao: BoBaoCaoKiemThu):
    print("\n--- Đang thực thi: [Package XX: Tên Phân Hệ] ---")
    app, client, engine, SessionTest = khoi_tao_app_test()

    # --- Ca test 1: Validation ---
    try:
        res = client.post("/api/v1/new-endpoint", json={})
        if res.status_code == 422:
            bao_cao.ghi_nhan_pass("MOD-01", "Bắt lỗi thiếu trường bắt buộc (HTTP 422)", "Mã phản hồi đúng 422")
        else:
            bao_cao.ghi_nhan_fail("MOD-01", "Bắt lỗi thiếu trường bắt buộc", f"Kỳ vọng 422 nhưng nhận {res.status_code}")
    except Exception as e:
        bao_cao.ghi_nhan_fail("MOD-01", "Bắt lỗi thiếu trường bắt buộc", str(e))

    # --- Ca test 2: Luồng chuẩn (Happy Path) ---
    # Thêm các ca test nghiệp vụ tiếp theo...
```

### 5. Quy trình Đăng ký vào Master Runner & Excel Synchronizer
Sau khi tạo file test mới, chỉ cần 2 thao tác đăng ký:
1. **Trong [runner.py](file:///d:/Em/Sales-Warehouse-System/backend/test_client/runner.py):**
   * Import hàm `chay_kiem_thu_ten_module`.
   * Thêm vào từ điển menu `DANH_SACH_GOI` với phím bấm tương ứng và bổ sung vào danh sách chạy toàn bộ (`all`).
2. **Trong [runner.py](file:///d:/Em/Sales-Warehouse-System/backend/test_client/runner.py):**
   * Import và gọi hàm `chay_kiem_thu_ten_module(bao_cao)` để kết quả tự động thu thập và ghi vào file Excel.

---

## GIAI ĐOẠN 2: THỰC THI KIỂM THỬ ĐỘC LẬP (TEST ONLY)

Agent Antigravity chỉ được phép thực thi kiểm thử và báo cáo, tuyệt đối không can thiệp sửa mã nguồn.

### 1. Chế độ 1: In-Memory Automation (Chạy nhanh, môi trường độc lập)
Thực thi kiểm thử thông qua terminal:
```powershell
cd d:\Em\Sales-Warehouse-System\backend
py test_client/runner.py all
```
* **Đặc tính:** Sử dụng SQLite in-memory (`sqlite:///:memory:`), không làm bẩn database thật, không phụ thuộc mạng, thời gian chạy dưới 3 giây.
* **Giả lập thời gian (Time Mocking):** Dùng `timedelta` tác động trực tiếp vào session test để kiểm thử các logic hết hạn (TTL 30 phút, Khóa 15 phút) mà không làm trễ tiến trình.

### 2. Chế độ 2: Live Server API Test (Quy chuẩn Kiểm thử Máy chủ thật)

Khi nghiệm thu trên môi trường mạng nội bộ hoặc máy chủ thực tế, áp dụng bộ quy chuẩn Live Test tại [test_live_api.py](file:///d:/Em/Sales-Warehouse-System/backend/test_client/test_live_api.py):

#### A. Cấu hình Môi trường (Environment & Base URL)
* Mặc định kết nối: `http://127.0.0.1:8000`.
* Hỗ trợ nạp cấu hình qua biến môi trường `BACKEND_LIVE_URL` hoặc tệp `.env`.
* Thiết lập timeout chuẩn: `timeout = httpx.Timeout(10.0, connect=3.0)`.

#### B. Ma trận Xác thực 7 Vai trò Nghiệp vụ (Multi-Role Auth Headers)
Trước khi test các endpoint có phân quyền, script Live Test chuẩn bị sẵn Token Bearer cho từng vai trò thông qua hàm helper:
```python
def lay_token_theo_vai_tro(client: httpx.Client, vai_tro: str) -> dict:
    """Trả về headers {'Authorization': 'Bearer <token>'} tương ứng với vai trò."""
    # Tự động đăng nhập với tài khoản hạt giống (Seed Accounts)
    # Ví dụ: admin, sales_manager, sales_staff, warehouse_manager, warehouse_staff, accountant, customer
```

#### C. Nguyên tắc Vệ sinh Dữ liệu & Dọn dẹp (Data Hygiene & Teardown)
Kiểm thử trên Live Server có nguy cơ làm rác Database thật. Bắt buộc tuân thủ 3 nguyên tắc:
1. **Quy ước tiền tố nhận diện:** Mọi thực thể tạo mới (User, Sản phẩm, Đơn hàng) BẮT BUỘC có tiền tố `TEST_TMP_` (ví dụ: `TEST_TMP_SP001`, `test_tmp_user@test.local`).
2. **Khối Teardown dọn dẹp bắt buộc:**
   * Sau khi ca test tạo dữ liệu thành công, khối `finally` của bài test phải gọi API xóa (`DELETE /api/v1/...`) hoặc script dọn dẹp để đưa Database về trạng thái nguyên bản.
3. **Chống lỗi trùng lặp (Idempotency):** Dữ liệu test phải sử dụng mã sinh ngẫu nhiên (UUID / Timestamp) để lần chạy sau không bị lỗi khóa trùng (`Unique Constraint`).

#### D. Trình tự thực thi Live Test
1. **Khởi động server:**
   ```powershell
   cd d:\Em\Sales-Warehouse-System\backend
   py -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```
2. **Chạy kịch bản kiểm thử Live API:**
   ```powershell
   py test_client/test_live_api.py
   ```

### 3. Quy tắc xử lý khi gặp ca kiểm thử thất bại (Defect Handling - No Self-Healing)
Khi một ca kiểm thử trả về kết quả `[FAIL]`:
1. **KHÔNG** dùng tool sửa code (`replace_file_content` hoặc `write_to_file`) trên mã nguồn Backend.
2. Thu thập đầy đủ hồ sơ lỗi:
   * **Endpoint & HTTP Method:** Ví dụ `POST /api/v1/auth/reset-password`
   * **Payload gửi đi:** Dữ liệu đầu vào gây lỗi.
   * **Kỳ vọng (Expected Result):** Mã trạng thái và nội dung mong muốn theo đặc tả.
   * **Thực tế (Actual Result):** Mã trạng thái và response nhận được từ server.
   * **Stacktrace / Error Log:** Ghi nhận từ output của server hoặc test runner.
3. Xuất toàn bộ thông tin này sang Giai đoạn 3 để ghi nhận vào Sheet `Defect Log`.

---

## GIAI ĐOẠN 3: ĐỒNG BỘ KẾT QUẢ VÀO EXCEL DOANH NGHIỆP

File báo cáo chính thức: [reports/Bảng kiểm thử Backend.xlsx](file:///d:/Em/Sales-Warehouse-System/backend/test_client/reports/Bảng kiểm thử Backend.xlsx).

### 1. Cơ chế đồng bộ dữ liệu linh hoạt (Dynamic Mapping)
* **Vị trí file Excel CỐ ĐỊNH:** Nằm trực tiếp bên trong thư mục [backend/test_client/](file:///d:/Em/Sales-Warehouse-System/backend/test_client).
* **Sheet `Dashboard` (Bảng điều khiển động):**
  * Tự động co giãn theo số lượng test case thực tế (không cố định cứng dòng `D3:D32`).
  * Sử dụng công thức động: `=COUNTA('Test Cases'!D3:D...)`, `=COUNTIF('Test Cases'!L3:L..., "PASS")`, `=COUNTIF('Test Cases'!L3:L..., "FAIL")`.
  * Tuyệt đối không ghi số tĩnh lên các ô KPI.
* **Sheet `Test Cases` (Chi tiết ca kiểm thử):**
  * Cột K (Cột 11): Cập nhật kết quả thực tế (Actual Result kèm nguồn test: Live API hoặc In-Memory).
  * Cột L (Cột 12): Cập nhật trạng thái (`PASS` hoặc `FAIL`).
  * Kích hoạt tự động đổi màu ô (Conditional Formatting xanh lá cho PASS, đỏ cho FAIL).
* **Sheet `Defect Log` (Sổ theo dõi lỗi):**
  * Khi có ca test `FAIL`, tự động thêm dòng lỗi với trạng thái `OPEN`.
  * **Cơ chế chống trùng lặp (Defect Idempotency):** Kiểm tra mã test case, nếu lỗi của ca test đó đã được ghi nhận ở trạng thái `OPEN` thì cập nhật log chi tiết thay vì tạo dòng trùng lặp.
  * Khi Dev sửa xong và test chuyển sang `PASS`, trạng thái bug được chuyển sang `RESOLVED`.

### 2. Thực thi một chạm không cần bấm phím (Zero-Interaction Execution)
Chỉ cần chạy 1 lệnh duy nhất (hoặc click đúp [chay_test.bat](file:///d:/Em/Sales-Warehouse-System/backend/test_client/chay_test.bat)):
```powershell
cd d:\Em\Sales-Warehouse-System\backend
py test_client/runner.py
```
* **Hành vi tự động 100%:**
  1. Tự động kiểm tra: Nếu Live Server (cổng 8000) đang bật, tự động test HTTP thật.
  2. Tự động chạy toàn bộ các bài test của các Endpoint.
  3. Tự động đổ kết quả (`Actual Result`, `PASS/FAIL`) vào file Excel trong `backend/test_client/`.
  4. Nếu có lỗi, tự động ghi Defect vào Sheet `Defect Log`.
* **Cơ chế Safe File-Lock:** Nếu file Excel đang mở, tự động lưu vào [reports/Bảng kiểm thử Backend_Sync.xlsx](file:///d:/Em/Sales-Warehouse-System/backend/test_client/reports/Bảng kiểm thử Backend_Sync.xlsx).

---

## HƯỚNG DẪN DÀNH CHO TESTER & LẬP TRÌNH VIÊN

1. **Thực thi kiểm thử nhanh:**
   * Mở thư mục [backend/test_client](file:///d:/Em/Sales-Warehouse-System/backend/test_client), click đúp vào file [chay_test.bat](file:///d:/Em/Sales-Warehouse-System/backend/test_client/chay_test.bat) hoặc gõ `py test_client/runner.py`.
   * Hệ thống tự động test toàn bộ và đổ kết quả thẳng vào file Excel, **không cần bấm phím chọn menu**.
2. **Khi nạp file yêu cầu nghiệp vụ mới:**
   * Cung cấp file Excel yêu cầu nghiệp vụ hoặc danh sách endpoint mới.
   * Agent sẽ đọc file, xây dựng ma trận test theo đúng chuẩn package tại `backend/test_client/suites/` và thực hiện kiểm thử tự động theo đúng nguyên tắc **Chỉ Test - Không Sửa Code**.
3. **Khi xem kết quả:**
   * Mở file [reports/Bảng kiểm thử Backend.xlsx](file:///d:/Em/Sales-Warehouse-System/backend/test_client/reports/Bảng kiểm thử Backend.xlsx) nằm ngay trong thư mục `test_client`.
   * Sheet `Dashboard` hiển thị đầy đủ tỷ lệ Pass/Fail được tự động tính toán.
4. **Khi cần rà soát những Endpoint nào chưa được kiểm thử:**
   * Sử dụng prompt kiểm toán độ phủ (Coverage Audit):
     > *"Hãy rà soát toàn bộ các endpoint trong `backend/app/api/` và đối chiếu với file Excel trong `test_client`. Liệt kê danh sách các Endpoint CHƯA ĐƯỢC TEST (Method, URL, file router) và đề xuất kịch bản kiểm thử bổ sung."*
   * Agent sẽ quét mã nguồn, so khớp với ma trận test hiện có và xuất bảng báo cáo các endpoint bị bỏ sót để tiến hành kiểm thử bổ sung.
