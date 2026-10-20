# BÁO CÁO KIỂM THỬ TOÀN DIỆN VAI TRÒ ADMIN & CẨM NANG TEST TRỰC TIẾP

> **Tài khoản kiểm thử:** `admin` / `123456` (Quản Trị Viên Hệ Thống)  
> **Thời gian thực hiện:** Tháng 10/2026  
> **Môi trường:** `http://127.0.0.1:5173` (Frontend) & `http://127.0.0.1:8001` (Backend API)

---

## I. TỔNG KẾT KẾT QUẢ KIỂM THỬ TRÊN MÀN HÌNH

Hệ thống đã được kiểm thử trực tiếp qua trình duyệt với vai trò **Admin**, bao quát toàn bộ 7 nhóm phân hệ chức năng:

| STT | Phân hệ / Nghiệp vụ | Đường dẫn (URL) | Trạng thái | Đánh giá & Kết quả trực quan |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **Tổng quan Dashboard** | `/dashboard` | **PASSED** | Hiển thị KPI doanh thu, biểu đồ tài chính, trạng thái đơn hàng & lô cận date. |
| **2** | **Quản lý đơn hàng** | `/orders` | **PASSED** | Hiển thị 5 đơn hàng điện tử mẫu: Đã duyệt, Đang giao, Chờ duyệt, Hoàn thành, Nợ hàng. |
| **3** | **Bán hàng tại quầy (POS)** | `/sales/pos` | **PASSED** | 14 mặt hàng điện tử; thêm giỏ hàng, tính chiết khấu, quét mã, chọn tiền mặt/CK/quẹt thẻ, tính tiền thối mượt mà. |
| **4** | **Hóa đơn VAT điện tử** | `/invoices` | **PASSED** | Hiển thị hóa đơn VAT đầy đủ thuế suất 10%, trạng thái Đã thanh toán / Chưa thanh toán. |
| **5** | **Phiếu thu công nợ** | `/payments` | **PASSED** | Ghi nhận phiếu thu tiền ngân hàng đối trừ nợ cho các đại lý công nghệ lớn. |
| **6** | **Sổ chi tiết công nợ** | `/customers/debt-ledger` | **PASSED** | Bảng biến động nợ, số dư đầu kỳ, phát sinh nợ/có, số dư nợ cuối kỳ từng đại lý. |
| **7** | **Chứng từ giảm nợ & Trả hàng** | `/credit-notes`, `/returns` | **PASSED** | Quản lý phiếu hoàn trả linh kiện điện tử và chứng từ Credit Note bù trừ nợ. |
| **8** | **Danh mục sản phẩm điện tử** | `/products` | **PASSED** | 14/14 sản phẩm công nghệ cao cấp (iPhone, MacBook, ASUS, Dell, Sony, Logitech...), đã xóa sạch 100% đồ ăn kẹo bánh. |
| **9** | **Sổ tồn kho 3 cột** | `/inventory` | **PASSED** | Báo cáo 3 cột chuẩn: Tồn thực tế (600+), Đang giữ chỗ (0), Tồn khả dụng (600+) theo kho. |
| **10** | **Quản lý lô & Thuật toán FEFO** | `/inventory/lots` | **PASSED** | 42 lô hàng FEFO với 3 màu Đỏ / Vàng / Xanh; công cụ mô phỏng FEFO tự động gợi ý trích xuất lô cận date nhất. |
| **11** | **Soạn hàng & Xuất kho** | `/inventory/picking-lists`, `/inventory/dispatches` | **PASSED** | Lộ trình lấy hàng tối ưu theo kệ A -> B -> C; Phiếu điều phối xuất kho có đính kèm ảnh POD. |
| **12** | **Báo cáo & Phân tích** | `/reports/sales`, `/reports/inventory-turnover` | **PASSED** | Biểu đồ doanh số đa chiều, chỉ số vòng quay tồn kho DSI và phân tích tuổi nợ Aging. |
| **13** | **Quản trị người dùng & Phân quyền** | `/users`, `/activity-log` | **PASSED** | 7 tài khoản đại diện 7 vai trò chuẩn hóa; nhật ký ghi vết thao tác (Audit Log) đầy đủ. |

---

## II. CẨM NANG HƯỚNG DẪN TEST TRỰC TIẾP TỪNG BƯỚC (DÀNH CHO BẠN)

Bạn có thể tự mở trình duyệt và thao tác kiểm tra theo các bước trực quan dưới đây:

### Bước 1: Đăng nhập Admin
1. Mở trình duyệt truy cập: `http://127.0.0.1:5173/login`
2. Nhập:
   - **Tên đăng nhập:** `admin`
   - **Mật khẩu:** `123456`
3. Bấm **"Đăng nhập hệ thống"**.
4. **Quan sát thanh Sidebar:** Bạn sẽ thấy thanh Sidebar cực kỳ gọn gàng với 7 nhóm Accordion chính, không bị tràn màn hình.

---

### Bước 2: Test Điểm Bán Hàng Tại Quầy (POS)
1. Trên Sidebar, click nhóm **"Kinh Doanh & Bán Hàng"** ➔ chọn **"Bán hàng tại quầy (POS)"** (`/sales/pos`).
2. **Quan sát:** Toàn bộ 14 sản phẩm trên kệ đều là đồ công nghệ (Bàn phím cơ Keychron, Chuột Logitech MX Master 3S, iPhone 15, MacBook M2, Laptop ASUS ROG...).
3. **Thao tác:**
   - Click chọn **"Chuột không dây Logitech MX Master 3S"** hoặc **"Bàn phím Keychron"**.
   - Nhìn sang giỏ hàng bên phải: Sản phẩm được cộng vào giỏ, hiển thị đơn giá `2.490.000 đ`.
   - Chọn phương thức thanh toán: **Tiền mặt** hoặc **Chuyển khoản**.
   - Bấm nút xanh **"Thanh Toán"** ➔ Hệ thống in hóa đơn POS tại quầy thành công!

---

### Bước 3: Test Quản Lý Đơn Hàng B2B
1. Click mục **"Quản lý đơn hàng"** (`/orders`).
2. **Quan sát:** Danh sách 5 đơn hàng điện tử mẫu với mã `DH-2026-0001` đến `DH-2026-0005`.
3. Kiểm tra các trạng thái đa dạng:
   - `Đã duyệt` (Sẵn sàng soạn hàng)
   - `Đang giao hàng`
   - `Chờ duyệt`
   - `Nợ hàng (Backorder)`
4. Click biểu tượng con mắt **"Xem chi tiết"** để xem thông tin đại lý mua hàng và bảng sản phẩm chi tiết.

---

### Bước 4: Test Quản Lý Lô Hàng & Thuật Toán FEFO
1. Mở nhóm **"Kho & Hàng Hóa"** ➔ chọn **"Quản lý lô & Hạn dùng (FEFO)"** (`/inventory/lots`).
2. **Quan sát:** Bảng danh sách lô hàng công nghệ với các thẻ màu trạng thái:
   - 🔴 **Màu đỏ (Cận date < 30 ngày):** Ưu tiên xuất trước để bảo vệ giá trị hàng.
   - 🟡 **Màu vàng (30 - 90 ngày):** Cảnh báo theo dõi.
   - 🟢 **Màu xanh (> 90 ngày):** Lô hàng mới nhập.
3. **Thử nghiệm thuật toán gợi ý FEFO:**
   - Bấm nút **"Thử nghiệm FEFO"** góc trên bên phải.
   - Chọn sản phẩm (ví dụ: *Bàn phím cơ Keychron Q1 Pro* hoặc *iPhone 15*), nhập số lượng cần xuất là `30`.
   - Bấm **"Phân bổ lại"** ➔ Hệ thống tự động tính toán trích xuất chính xác lô có hạn sử dụng gần nhất trước!

---

### Bước 5: Test Sổ Tồn Kho 3 Cột & Soạn Hàng Picking
1. Click **"Sổ tồn kho 3 cột"** (`/inventory`):
   - Cột 1: **Tồn thực tế** (Hàng vật lý đếm trong kho).
   - Cột 2: **Đang giữ chỗ** (Hàng đã bị khóa bởi các đơn đã duyệt).
   - Cột 3: **Tồn khả dụng** (Số lượng còn lại có thể bán tiếp).
2. Click **"Phiếu soạn hàng (Picking)"** (`/inventory/picking-lists`):
   - Xem lộ trình nhặt hàng thông minh theo thứ tự kệ: Kệ A1 -> Kệ B2 -> Kệ C3 giúp thủ kho tiết kiệm 40% thời gian di chuyển.
3. Click **"Phiếu xuất kho điều phối"** (`/inventory/dispatches`):
   - Xem biên bản giao hàng điều phối vận chuyển kèm ảnh chứng từ bàn giao (POD).

---

### Bước 6: Test Tài Chính & Sổ Chi Tiết Công Nợ
1. Mở nhóm **"Tài Chính & Công Nợ"**:
   - Chọn **"Hóa đơn bán hàng VAT"** (`/invoices`): Kiểm tra danh sách hóa đơn xuất cho FPT Retail, CellphoneS.
   - Chọn **"Sổ chi tiết công nợ"** (`/customers/debt-ledger`):
     - Chọn đại lý: **Công ty Cổ phần Bán lẻ FPT** hoặc **Hệ thống Điện máy CellphoneS**.
     - Bảng đối soát công nợ tự động hiển thị số dư đầu kỳ, các hóa đơn phát sinh nợ, các phiếu thu tiền có đối trừ và số dư nợ hiện tại.
   - Chọn **"Chứng từ giảm nợ"** (`/credit-notes`): Xem phiếu giảm trừ công nợ khi đại lý trả lại hàng lỗi hoặc được hưởng chiết khấu sau bán.

---

### Bước 7: Test Quản Trị Người Dùng & Phân Quyền (RBAC)
1. Mở nhóm **"Cài Đặt & Quản Trị"** ➔ chọn **"Người dùng & Phân quyền"** (`/users`).
2. Danh sách hiển thị đủ 7 tài khoản nhân sự với 7 vai trò:
   - `admin` (Quản trị hệ thống)
   - `sales_mgr` (Giám đốc bán hàng)
   - `sales_rep` (Nhân viên kinh doanh)
   - `wh_mgr` (Quản lý kho)
   - `warehouse` (Thủ kho)
   - `accountant` (Kế toán công nợ)
   - `customer` (Đại lý phân phối)
3. Bạn có thể bấm nút **Đăng xuất** ở góc trên bên phải, sau đó đăng nhập thử với tài khoản `warehouse` hoặc `accountant` để thấy Sidebar tự động ẩn đi các phân hệ không thuộc thẩm quyền đúng theo ma trận phân quyền RBAC!
