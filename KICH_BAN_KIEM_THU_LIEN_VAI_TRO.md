# KỊCH BẢN KIỂM THỬ TOÀN TRÌNH LIÊN PHÒNG BAN (END-TO-END WORKFLOW)
## HỆ THỐNG KHO VẬN & BÁN HÀNG DOANH NGHIỆP CÔNG NGHỆ

> **Phiên bản:** 2.0 - Khởi tạo từ vai trò **Admin (Quản Trị Viên)**  
> **Môi trường:** `http://127.0.0.1:5173` (Frontend) & `http://127.0.0.1:8001` (Backend)  
> **Mật khẩu chung cho tất cả tài khoản:** `123456`

---

## MA TRẬN 7 VAI TRÒ KIỂM THỬ TRONG HỆ THỐNG

| STT | Mã tài khoản | Vai trò hệ thống | Nhân sự phụ trách | Phạm vi thẩm quyền trên Sidebar |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `admin` | **Admin** | Quản Trị Viên Hệ Thống | Toàn quyền kiểm soát, cấu hình hệ thống & phân quyền |
| **2** | `wh_mgr` | **WH Manager** | Vũ Thị Quản Lý Kho | Giám sát toàn bộ kho (Hà Nội), quản trị lô FEFO, kiểm kê, DSI |
| **3** | `warehouse` | **Warehouse Staff** | Hoàng Văn Thủ Kho | Trực tiếp nhập kho, nhặt hàng picking, xuất kho dispatch (Đà Nẵng) |
| **4** | `sales_rep` | **Sales Rep** | Lê Thị Nhân Viên KD | Lên đơn hàng B2B, bán hàng tại quầy POS, theo dõi KPI cá nhân |
| **5** | `sales_mgr` | **Sales Manager** | Nguyễn Văn Giám Đốc KD | Duyệt đơn hàng, phê duyệt bảng giá chiết khấu, giao chỉ tiêu KPI |
| **6** | `accountant` | **Accountant** | Trần Văn Kế Toán | Xuất hóa đơn VAT, thu tiền gạch nợ, chặn bán rủi ro, sổ chi tiết nợ |
| **7** | `customer` | **Customer** | Đại Lý B2B Tuấn Phương | Cổng đại lý đặt hàng, xem hóa đơn VAT & tra cứu sổ công nợ |

*(Tại màn hình đăng nhập, bạn có thể click vào các nút bấm màu ở mục **"⚡ Tài khoản kiểm thử nhanh"** để đăng nhập ngay mà không cần gõ phím).*

---

## KỊCH BẢN KIỂM THỬ 7 BƯỚC TUẦN TỰ (CHU TRÌNH DOANH NGHIỆP)

```
[BƯỚC 1: ADMIN] ──> Khởi tạo bảng giá, chính sách nợ & phân quyền
       │
[BƯỚC 2: QUẢN LÝ KHO & THỦ KHO] ──> Nhập hàng từ NCC Apple & Quản lý lô FEFO
       │
[BƯỚC 3: SALES REP] ──> Lên đơn hàng điện tử cho Đại Lý B2B
       │
[BƯỚC 4: SALES MANAGER] ──> Phê duyệt đơn hàng & Khóa giữ chỗ kho (Reserved)
       │
[BƯỚC 5: THỦ KHO] ──> Soạn hàng theo kệ A-B-C & Xuất kho kèm ảnh POD
       │
[BƯỚC 6: KẾ TOÁN] ──> Xuất Hóa đơn VAT & Lập phiếu thu tiền gạch nợ
       │
[BƯỚC 7: ĐẠI LÝ B2B] ──> Đăng nhập kiểm tra hóa đơn & Đối soát sổ nợ
```

---

### GIAI ĐOẠN 1: ADMIN THIẾT LẬP HỆ THỐNG
* **Mục tiêu:** Cấu hình danh mục hàng hóa, bảng giá sỉ và hạn mức tín dụng cho đại lý.
* **Tài khoản:** `admin` / `123456`.
* **Các bước kiểm thử:**
  1. Đăng nhập với tài khoản `admin`.
  2. Mở **Kho & Hàng Hóa ➔ Danh mục sản phẩm** (`/products`):
     - Xác nhận hệ thống có 14 mặt hàng điện tử cao cấp (iPhone 15, MacBook M2, Chuột Logitech, Bàn phím Keychron...).
  3. Mở **Kinh Doanh & Bán Hàng ➔ Bảng giá & Khách hàng** (`/price-lists`):
     - Kiểm tra các bảng giá `PL-WHOLESALE-MAIN`, `PL-TIER1-MAIN` đang ở trạng thái `APPROVED`.
  4. Mở **Tài Chính & Công Nợ ➔ Quy tắc rủi ro & Chặn bán** (`/settings/debt-risk`):
     - Cấu hình ngưỡng cảnh báo nợ (80% hạn mức) và chặn xuất hàng khi nợ quá hạn trên 30 ngày.
  5. Đăng xuất tài khoản `admin`.

---

### GIAI ĐOẠN 2: THỦ KHO NHẬP HÀNG & QUẢN TRỊ LÔ FEFO
* **Mục tiêu:** Nhập hàng điện tử mới từ nhà cung cấp và theo dõi hạn sử dụng bảo hành.
* **Tài khoản:** `warehouse` (hoặc `wh_mgr`) / `123456`.
* **Các bước kiểm thử:**
  1. Đăng nhập tài khoản `warehouse` (Thủ Kho Đà Nẵng).
  2. **Quan sát phân quyền:** Thanh Sidebar chỉ có 2 nhóm chính: **Dashboard** và **Kho & Hàng Hóa**. Không thấy các menu bán hàng hay tài chính.
  3. Mở **Kho & Hàng Hóa ➔ Nhập kho nhà cung cấp** (`/inventory/stock-in`):
     - Chọn Nhà cung cấp: *Công ty TNHH Apple Việt Nam*.
     - Chọn Kho nhập: *Kho Tổng Hà Nội*.
     - Chọn sản phẩm: *Bàn phím cơ Keychron Q1 Pro RGB* hoặc *iPhone 15*.
     - Nhập số lượng: `50`. Bấm **"Lưu và Xác Nhận Nhập Kho"**.
  4. Mở **Kho & Hàng Hóa ➔ Quản lý lô & Hạn dùng (FEFO)** (`/inventory/lots`):
     - Kiểm tra danh sách lô hàng với 3 màu: Đỏ (cận date), Vàng (cảnh báo), Xanh (còn hạn).
     - Bấm **"Thử nghiệm FEFO"** để xem thuật toán tự động đề xuất xuất lô cận date trước.
  5. Đăng xuất tài khoản.

---

### GIAI ĐOẠN 3: SALES REP LÊN ĐƠN HÀNG B2B
* **Mục tiêu:** Nhân viên kinh doanh tư vấn và tạo đơn hàng cho đại lý.
* **Tài khoản:** `sales_rep` / `123456`.
* **Các bước kiểm thử:**
  1. Đăng nhập tài khoản `sales_rep`.
  2. **Quan sát phân quyền:** Sidebar tập trung vào **Kinh Doanh & Bán Hàng** và **Đối Tác**, không có quyền xuất nhập kho nội bộ.
  3. Mở **Kinh Doanh & Bán Hàng ➔ Tạo đơn hàng mới** (`/orders/create`):
     - Chọn khách hàng: *Lê Hoàng Long* hoặc *Công ty TNHH Đại Lý Tuấn Phương*.
     - Thêm sản phẩm vừa nhập: *Bàn phím cơ Keychron Q1 Pro* (Số lượng: `10`).
     - Quan sát hệ thống tự động áp dụng giá bán buôn chiết khấu và kiểm tra hạn mức công nợ còn lại.
     - Bấm **"Chốt đơn hàng"** ➔ Đơn hàng được tạo với trạng thái `Chờ duyệt`.
  4. Mở **Chỉ tiêu doanh số KPI** (`/sales/targets/progress`):
     - Kiểm tra tiến độ hoàn thành KPI tháng 10/2026 của nhân viên.
  5. Đăng xuất tài khoản.

---

### GIAI ĐOẠN 4: SALES MANAGER DUYỆT ĐƠN & KHÓA GIỮ CHỖ KHO
* **Mục tiêu:** Trưởng phòng kinh doanh thẩm định và duyệt đơn hàng lớn.
* **Tài khoản:** `sales_mgr` / `123456`.
* **Các bước kiểm thử:**
  1. Đăng nhập tài khoản `sales_mgr`.
  2. Mở **Kinh Doanh & Bán Hàng ➔ Quản lý đơn hàng** (`/orders`):
     - Tìm đơn hàng mới tạo ở Bước 3 (trạng thái `Chờ duyệt`).
     - Click xem chi tiết đơn hàng, kiểm tra giá bán sàn và thông tin đại lý.
     - Bấm nút **"Phê duyệt đơn hàng"** ➔ Trạng thái chuyển sang `Đã duyệt (APPROVED)`.
  3. Mở **Kho & Hàng Hóa ➔ Sổ tồn kho 3 cột** (`/inventory`):
     - Kiểm tra cột **"Đang giữ chỗ" (Cột 2):** Lập tức tăng thêm `10 đơn vị` (Hàng đã bị khóa giữ chỗ cho đơn vừa duyệt).
     - Cột **"Tồn khả dụng" (Cột 3):** Tự động giảm đi tương ứng để tránh bán âm kho.
  4. Đăng xuất tài khoản.

---

### GIAI ĐOẠN 5: THỦ KHO SOẠN HÀNG & XUẤT KHO ĐIỀU PHỐI (DISPATCH)
* **Mục tiêu:** Thủ kho đóng gói theo vị trí kệ và giao hàng cho đơn vị vận chuyển.
* **Tài khoản:** `warehouse` / `123456`.
* **Các bước kiểm thử:**
  1. Đăng nhập tài khoản `warehouse`.
  2. Mở **Kho & Hàng Hóa ➔ Phiếu soạn hàng (Picking)** (`/inventory/picking-lists`):
     - Mở phiếu soạn hàng của đơn vừa duyệt.
     - Quan sát tuyến đường nhặt hàng tối ưu được gợi ý theo kệ A -> B -> C.
     - Bấm **"Xác nhận đã nhặt đủ hàng"**.
  3. Mở **Kho & Hàng Hóa ➔ Phiếu xuất kho điều phối** (`/inventory/dispatches`):
     - Kiểm tra phiếu xuất kho giao hàng.
     - Xác nhận biên bản bàn giao có chữ ký tài xế và ảnh chụp chứng từ bàn giao (POD).
     - Trạng thái đơn hàng chuyển sang `Đang giao hàng` hoặc `Đã giao`.
  4. Đăng xuất tài khoản.

---

### GIAI ĐOẠN 6: KẾ TOÁN XUẤT HÓA ĐƠN VAT & THU TIỀN ĐỐI TRỪ
* **Mục tiêu:** Ghi nhận doanh thu, phát hành hóa đơn điện tử và gạch nợ cho đại lý.
* **Tài khoản:** `accountant` / `123456`.
* **Các bước kiểm thử:**
  1. Đăng nhập tài khoản `accountant`.
  2. **Quan sát phân quyền:** Nhóm **Tài Chính & Công Nợ** hiển thị đầy đủ, không hiển thị chức năng bán lẻ POS hay nhặt hàng kho.
  3. Mở **Tài Chính & Công Nợ ➔ Hóa đơn bán hàng VAT** (`/invoices`):
     - Xem hóa đơn điện tử VAT được phát hành tự động từ đơn hàng xuất kho (thuế suất VAT 10%).
  4. Mở **Tài Chính & Công Nợ ➔ Phiếu thu công nợ** (`/payments`):
     - Bấm **"Lập phiếu thu tiền"**.
     - Chọn đại lý, phương thức thanh toán: *Chuyển khoản Vietcombank*.
     - Chọn hóa đơn cần gạch nợ ➔ Bấm **"Xác nhận thu tiền"**.
  5. Mở **Sổ chi tiết công nợ** (`/customers/debt-ledger`):
     - Chọn đại lý vừa thu tiền ➔ Bảng đối chiếu công nợ lập tức trừ số dư nợ cuối kỳ minh bạch và chính xác theo thời gian thực.
  6. Đăng xuất tài khoản.

---

### GIAI ĐOẠN 7: ĐẠI LÝ B2B TRA CỨU ĐƠN HÀNG & ĐỐI SOÁT
* **Mục tiêu:** Khách hàng đại lý tự tra cứu lịch sử mua sắm và công nợ.
* **Tài khoản:** `customer` / `123456`.
* **Các bước kiểm thử:**
  1. Đăng nhập tài khoản `customer`.
  2. **Quan sát phân quyền:** Cực kỳ gọn gàng, khách hàng chỉ thấy các mục thuộc Cổng đại lý (Dashboard, Đơn hàng của tôi, Hóa đơn VAT, Sổ nợ của tôi). Toàn bộ nghiệp vụ nội bộ của công ty đều được ẩn an toàn.
  3. Mở **Quản lý đơn hàng** (`/orders`):
     - Tra cứu tình trạng giao nhận của đơn hàng mình đã đặt.
  4. Mở **Sổ chi tiết công nợ** (`/customers/debt-ledger`):
     - Tự đối soát hạn mức nợ, lịch sử mua hàng và các khoản tiền đã chuyển khoản thanh toán.
  5. Đăng xuất tài khoản ➔ Hoàn tất chu trình kiểm thử toàn diện!

---

## KẾT LUẬN & ĐÁNH GIÁ CHUNG
- ✅ **Tính liên kết dữ liệu (Data Integrity):** Dữ liệu di chuyển liền mạch giữa các khâu từ Mua hàng (Stock-in) ➔ Bán hàng (Order) ➔ Kho vận (Picking/Dispatch) ➔ Tài chính (Invoice/Payment) mà không bị đứt gãy.
- ✅ **Phân quyền vai trò (RBAC):** Mỗi nhân sự chỉ truy cập đúng các phân hệ trong phạm vi nhiệm vụ của mình, bảo mật tối đa dữ liệu nhạy cảm.
- ✅ **Giao diện hiện đại (UX/UI):** Thanh Sidebar thu gọn thông minh và các nút chọn tài khoản nhanh giúp kiểm thử và vận hành tiện lợi, chuyên nghiệp.
