# BỘ KIỂM THỬ BACKEND TỰ ĐỘNG CHUẨN DOANH NGHIỆP (ENTERPRISE TEST CLIENT)

Hệ thống khung kiểm thử Backend tự động (Automation Test Harness) được thiết kế theo kiến trúc phân tầng (Layered Architecture), module hóa theo từng Domain nghiệp vụ, hỗ trợ kiểm thử song song cả **In-Memory** lẫn **Live HTTP Server**, và tự động trích xuất kết quả vào **File Excel chuẩn Doanh nghiệp**.

---

## 1. Cấu Trúc Gói (Package Architecture)

```text
backend/test_client/
│
├── config/                          # Quản lý cấu hình tập trung
│   ├── __init__.py
│   └── settings.py                  # BASE_URL, HTTP_TIMEOUT, DUONG_DAN_EXCEL
│
├── core/                            # Động cơ xử lý lõi (Core Engines)
│   ├── __init__.py                  # Expose BoBaoCaoKiemThu, dong_bo_ket_qua_excel...
│   ├── context.py                   # Thiết lập môi trường SQLite In-Memory & TestClient
│   ├── reporter.py                  # Bộ thu thập & in bảng tổng hợp kết quả kiểm thử
│   ├── excel_sync.py                # Động cơ đồng bộ kết quả vào Sheet Test Cases & Defect Log
│   └── template_generator.py        # Tiện ích sinh file template Excel với công thức động 100%
│
├── suites/                          # Các gói kịch bản kiểm thử theo Module Nghiệp Vụ
│   ├── __init__.py                  # SUITES_REGISTRY (Danh mục phân hệ đăng ký kiểm thử)
│   └── auth/                        # Phân hệ Xác thực & Phân quyền (Auth & RBAC)
│       ├── __init__.py              # Runner chạy trọn gói phân hệ Auth
│       ├── test_validation.py       # TC01: Kiểm tra ràng buộc và schema đầu vào
│       ├── test_forgot_password.py  # TC02: Quên mật khẩu, chống Enumeration & TTL token
│       ├── test_login_lockout.py    # TC03: Đăng nhập username/email & Khóa tạm 15 phút
│       ├── test_change_pwd.py       # TC04: Đổi mật khẩu, thu hồi token phiên cũ & Đăng xuất
│       └── test_rbac_security.py    # TC05: Phân quyền RBAC đa vai trò & Bảo vệ giá vốn
│
├── live/                            # Kiểm thử trực tiếp qua mạng với Live HTTP Server
│   ├── __init__.py
│   └── test_live_api.py             # Gửi request HTTP thật qua httpx với đa vai trò
│
├── reports/                         # Thư mục lưu trữ báo cáo & file Excel
│   ├── __init__.py
│   └── Bảng kiểm thử Backend.xlsx   # File Excel chuẩn Doanh nghiệp (Dashboard, Test Cases, Defect Log)
│
├── docs/                            # Tài liệu quy chuẩn và ma trận nghiệp vụ
│   ├── TEST_SKILL.md                # Quy trình chi tiết kiểm thử tự động cho Tester & AI Agent
│   └── QUY_TAC_NGHIEP_VU.md         # Bảng ma trận ánh xạ Story/Endpoint và tiêu chí nghiệm thu
│
├── runner.py                        # Master Test Runner (Entrypoint duy nhất điều phối toàn bộ)
├── chay_test.bat                    # 1-Click Launcher tiện lợi cho Tester trên Windows
└── README.md                        # Hướng dẫn tổng quan (Tài liệu này)
```

---

## 2. Hướng Dẫn Sử Dụng (Quick Start)

### Cách 1: Chạy 1-Click trên Windows (Dành cho Tester & QC)
Chỉ cần nhấp đúp chuột vào file:
```cmd
backend\test_client\chay_test.bat
```
Hệ thống sẽ tự động thực thi tất cả kịch bản và đổ kết quả vào file Excel tại `reports/Bảng kiểm thử Backend.xlsx`.

---

### Cách 2: Sử Dụng Dòng Lệnh với Master Test Runner (Dành cho Dev & AI Agent)

Di chuyển vào thư mục `backend/` và gọi Python Launcher:

```powershell
# 1. Chạy mặc định (Tự động nhận diện Live Server, chạy toàn bộ suites và ghi vào Excel):
py test_client/runner.py

# 2. Chạy riêng một phân hệ nghiệp vụ cụ thể (Ví dụ: auth):
py test_client/runner.py auth

# 3. Chỉ kiểm thử Live Server qua HTTP thật (yêu cầu máy chủ uvicorn đang chạy):
py test_client/runner.py --live

# 4. Chỉ kiểm thử In-Memory (SQLite độc lập, tốc độ cực nhanh):
py test_client/runner.py --in-memory

# 5. Chạy kiểm thử nhưng không ghi đè vào file Excel:
py test_client/runner.py --no-sync

# 6. Xem danh sách các Phân hệ kiểm thử đã đăng ký:
py test_client/runner.py --list

# 7. Khởi tạo lại template Excel chuẩn mới tinh:
py test_client/runner.py --init-excel
```

---

## 3. Quy Trình Mở Rộng Thêm Phân Hệ Mới (Extensibility)

Khi dự án có thêm phân hệ nghiệp vụ mới (ví dụ: `products`, `orders`, `warehouse`):

1. **Tạo thư mục suite mới:**
   Tạo `suites/products/` với file test nghiệp vụ `test_products.py` và `__init__.py`.
2. **Đăng ký vào `suites/__init__.py`:**
   Bổ sung suite mới vào `SUITES_REGISTRY`:
   ```python
   SUITES_REGISTRY["products"] = {
       "title": "Phân hệ Quản lý Sản phẩm & Danh mục",
       "runner": chay_toan_bo_products,
       "description": "CRUD sản phẩm, danh mục, đơn vị tính",
   }
   ```
3. **Thực thi:**
   Chạy `py test_client/runner.py products` hoặc `py test_client/runner.py` để chạy toàn bộ regression suite.

---

## 4. Nguyên Tắc Cốt Lõi: "CHỈ TEST — TUYỆT ĐỐI KHÔNG SỬA CODE"

- Toàn bộ mã nguồn sản phẩm (`app/`, `main.py`) được bảo vệ nghiêm ngặt.
- Agent / Tester chỉ phát hiện lỗi, ghi nhận mã lỗi và tự động đồng bộ vào Sheet `Defect Log` trong file Excel để bàn giao cho đội ngũ Backend Developer khắc phục.
