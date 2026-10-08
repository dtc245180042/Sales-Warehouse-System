# Hệ Thống Quản Lý Bán Hàng & Kho Hàng (Sales & Warehouse Management System)

Dự án website quản lý bán hàng và kho hàng tích hợp xác thực JWT, phân quyền vai trò người dùng (RBAC), quản lý xuất nhập tồn kho và cổng đặt hàng trực tuyến cho đại lý.

---

## 🚀 Hướng Dẫn Khởi Chạy Hệ Thống

### 1. Khởi chạy Backend (FastAPI)
```powershell
cd backend
# Cài đặt thư viện phụ thuộc (nếu chưa cài)
pip install -r requirements.txt

# Khởi chạy server API (cổng 8000)
python main.py
# hoặc: uvicorn main:app --reload --port 8000
```
- **Swagger UI (Tài liệu API tương tác)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Kiểm thử tự động (Pytest)**:
  ```powershell
  python -m pytest tests
  ```

### 2. Khởi chạy Frontend (React + Vite)
```powershell
cd frontend
# Cài đặt dependencies (nếu chưa cài)
npm install

# Chạy server phát triển (cổng 5173)
npm run dev
```
- Truy cập giao diện ứng dụng tại: [http://localhost:5173](http://localhost:5173)

---

## 🔑 Danh Sách Tài Khoản Kiểm Thử (Test Accounts)

### 1. Tài khoản kiểm thử Backend API (Database Seed - 7 Vai trò nghiệp vụ)
> Có thể sử dụng **Username** hoặc **Email** để đăng nhập tại các endpoint `/api/v1/auth/login` hoặc `/api/auth/login`.

| STT | Tên đăng nhập (Username) | Địa chỉ Email | Mật khẩu (Password) | Vai trò (Role) | Phạm vi & Chức năng chính |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | `admin` | `admin@warehouse.local` | **`123456`** | **Admin** | Quản trị toàn hệ thống, tạo/sửa/khóa tài khoản, gán quyền và kho |
| **2** | `sales_mgr` | `sales_mgr@warehouse.local` | **`123456`** | **Sales Manager** | Quản lý kinh doanh, xem giá vốn, biên lợi nhuận, duyệt đơn hàng |
| **3** | `sales_rep` | `sales_rep@warehouse.local` | **`123456`** | **Sales Rep** | Nhân viên kinh doanh phụ trách đại lý và tạo đơn hàng theo địa bàn |
| **4** | `wh_mgr` | `wh_mgr@warehouse.local` | **`123456`** | **WH Manager** | Quản lý kho, điều phối xuất nhập kho và tồn kho các chi nhánh |
| **5** | `warehouse` | `warehouse@warehouse.local` | **`123456`** | **Warehouse** | Thủ kho/nhân viên kho (phải gắn với ít nhất một kho cụ thể) |
| **6** | `accountant` | `accountant@warehouse.local` | **`123456`** | **Accountant** | Kế toán viên theo dõi công nợ, hóa đơn và doanh thu |
| **7** | `customer` | `customer@warehouse.local` | **`123456`** | **Customer** | Khách hàng / Đại lý đặt hàng trực tuyến |

---

### 2. Tài khoản kiểm thử nhanh trên Giao diện Frontend (Portal OMS Pro)
> Đăng nhập trực tiếp trên giao diện web [http://localhost:5173](http://localhost:5173):

| Username | Mật khẩu | Phân hệ hiển thị | Mô tả nghiệp vụ |
| :--- | :--- | :--- | :--- |
| **`admin`** | `admin123` | Bảng điều khiển Quản trị | Quản trị đại lý, duyệt hạn mức công nợ, thống kê doanh thu toàn sàn |
| **`staff`** | `staff123` | Phân hệ Bán hàng & Kho | Tiếp nhận đơn đặt hàng từ đại lý, xử lý xuất kho, POS bán lẻ |
| **`customer`** | `customer123` | Cổng Đại lý trực tuyến | Xem danh mục sản phẩm, thêm giỏ hàng, đặt hàng và xem hồ sơ đại lý |

---

### 3. Thông tin kiểm thử SCRUM-300 (Header & Chọn kho làm việc)
> Nhấn nút **`🔍 Xem Demo SCRUM-300`** ở góc dưới cùng bên phải màn hình giao diện:
- **Tài khoản mẫu**: `Nguyễn Văn A`
- **Vai trò chuyển đổi thử nghiệm**:
  - `Quản trị viên` (Admin)
  - `Quản lý kho` (WH Manager)
  - `Nhân viên kho` (Warehouse)
  - `Nhân viên bán hàng` (Sales Rep)
  - `Đại lý` (Customer)
- **Danh sách kho trực thuộc thử nghiệm**:
  - `Kho Tổng Hà Nội`
  - `Kho Đà Nẵng`
  - `Kho TP. Hồ Chí Minh`
  - `Kho Miền Tây`

---

## 🛡️ Các Cơ Chế Bảo Mật Đã Tích Hợp
- **Xác thực JWT Bearer**: Token mang thông tin `user_id`, `role`, và `token_version`.
- **Khóa tạm thời 15 phút (SCRUM-198)**: Tự động khóa khi người dùng nhập sai mật khẩu 5 lần liên tiếp.
- **Duy trì phiên & Đăng xuất an toàn (SCRUM-199)**: Endpoint `/api/v1/auth/refresh` gia hạn token và `/api/v1/auth/logout` hủy phiên ngay lập tức phía server.
- **Quên mật khẩu an toàn (SCRUM-200)**: Token có thời hạn đúng 30 phút, chỉ sử dụng được 1 lần.
- **Thu hồi phiên khi đổi mật khẩu (SCRUM-201)**: Tăng `token_version` trong CSDL để vô hiệu hóa toàn bộ token cũ đang đăng nhập ở các thiết bị khác.
- **Ràng buộc vai trò kho (SCRUM-206)**: Bắt buộc tài khoản thuộc vai trò kho phải gắn ít nhất một kho/địa bàn cụ thể; chặn người dùng tự thu hồi quyền quản trị của chính mình.
- **Khóa tài khoản nhân viên (SCRUM-207)**: Bắt buộc ghi rõ lý do khóa và cảnh báo bàn giao danh sách khách hàng/đại lý ngay khi khóa nhân viên kinh doanh.


