# 💳 TÀI LIỆU KỸ THUẬT & BÀN GIAO API THANH TOÁN & ĐỐI TRỪ CÔNG NỢ (STORY S7-02)

> **Người thực hiện**: Nhóm trưởng (Tech Lead)  
> **Nhánh Git**: `feature/s7-02-payment`  
> **Bộ test**: `backend/tests/test_s7_02_payment.py` (10/10 test cases passed 100%)  
> **Mục tiêu**: Kế toán ghi nhận thanh toán tiền mặt/chuyển khoản/thẻ từ đại lý và đối trừ vào hóa đơn bán hàng theo nguyên tắc FIFO hoặc chỉ định cụ thể.

---

## 📌 1. ĐỐI TƯỢNG BÀN GIAO TRONG NHÓM

| Thành viên | Trách nhiệm | Điểm chạm & Cách sử dụng API S7-02 |
|:---|:---|:---|
| **Trang** | Sổ công nợ (`S7-03`), Khóa bán (`S7-04`), Chốt sổ (`S8-10`) | Cắm logic ghi giảm nợ sổ cái vào hàm `hook_sau_khi_ghi_nhan_thanh_toan` tại `payment_service.py`. Lỗi bên Trang được bọc try-except không làm hỏng phiếu thu. |
| **Quang** | Giao diện Thanh toán | Gọi `POST /api/v1/payments` để nộp tiền; `GET /api/v1/payments` để hiển thị lịch sử phiếu thu. |
| **Thủy** | Báo cáo nợ quá hạn (`S8-09`) | Lấy danh sách phiếu thu và các dòng `allocations` để tính toán nợ thực tế và ngày trả nợ của từng hóa đơn. |

---

## ⚡ 2. CÁC TIÊU CHÍ CHẤP NHẬN (ACCEPTANCE CRITERIA - AC) ĐÃ ĐẠT 100%

- **AC-1: Đầy đủ thông tin chứng từ thu**:
  - Ghi nhận `amount` (VNĐ dạng BigInteger), `payment_method` (`CASH`, `BANK_TRANSFER`, `CARD`), `payment_date`, `collector_id`, `collector_name`, `reference_code`, `notes`.
  - Sinh mã tự động `PT-YYYY-XXXXXXX` liên tục không nhảy cóc qua bộ đếm `payment_sequences` trong transaction (rollback không mất số).
- **AC-2: Cơ chế đối trừ công nợ linh hoạt**:
  - **Tự động (FIFO)**: Nếu `allocations` để trống, hệ thống tự động tìm các hóa đơn chưa trả của đại lý theo thứ tự hạn nợ cũ nhất trước (`due_date ASC, issued_at ASC, id ASC`) để đối trừ.
  - **Thủ công**: Nếu truyền danh sách `allocations: [{"invoice_id": "...", "allocated_amount": ...}]`, hệ thống đối trừ chính xác vào hóa đơn được chỉ định.
- **AC-3: Hỗ trợ thanh toán một phần**:
  - Tự động cập nhật `invoice.paid_amount` và `invoice.remaining_amount`.
  - Chuyển `invoice.status` sang `PARTIALLY_PAID` (nếu còn nợ > 0) hoặc `PAID` (nếu nợ = 0).
- **AC-4: Chặn thu vượt quá tổng công nợ còn lại**:
  - Nếu `amount` > tổng số nợ còn lại của đại lý, trả về HTTP 400 Bad Request kèm thông báo số tiền chi tiết.
  - Nếu đối trừ thủ công vượt quá số nợ của hóa đơn chỉ định, trả về HTTP 400 Bad Request.
- **AC-5: Tính bất biến (Immutability)**:
  - Phiếu thu một khi đã ghi nhận **không được phép sửa hoặc xóa**.
  - Các thao tác `PUT` và `DELETE` trên `/api/v1/payments/{id}` đều bị từ chối bằng **HTTP 405 Method Not Allowed**.
- **Chống bấm 2 lần (Idempotency)**:
  - Header/Body chứa `client_request_id`.
  - Gửi lại cùng payload: Trả về bản ghi cũ (không bị trừ nợ 2 lần).
  - Gửi lại cùng ID nhưng khác payload: Báo **HTTP 409 Conflict**.
- **Bảo mật Customer Scope (Anti-IDOR)**:
  - Người dùng có vai trò `Customer` chỉ xem được các phiếu thu của chính đại lý mình. Truy cập phiếu của đại lý khác bị chặn bằng **HTTP 403 Forbidden**.

---

## 🌐 3. DANH SÁCH ENDPOINTS CHI TIẾT

### 1. `POST /api/v1/payments` - Ghi nhận thanh toán & đối trừ công nợ
- **Quyền**: Accountant, Admin, Sales.
- **Request Body mẫu (Tự động FIFO)**:
```json
{
  "client_request_id": "REQ-PAY-20261016-001",
  "customer_id": "CUST-001",
  "amount": 55000000,
  "payment_method": "BANK_TRANSFER",
  "reference_code": "VCB-987654321",
  "notes": "Thu tiền chuyển khoản Vietcombank"
}
```
- **Request Body mẫu (Chỉ định hóa đơn thủ công)**:
```json
{
  "client_request_id": "REQ-PAY-20261016-002",
  "customer_id": "CUST-001",
  "amount": 30000000,
  "payment_method": "CASH",
  "notes": "Đại lý nộp tiền mặt thanh toán đích danh hóa đơn 2",
  "allocations": [
    {
      "invoice_id": "HD-2026-0000002",
      "allocated_amount": 30000000
    }
  ]
}
```
- **Response 201 Created**:
```json
{
  "id": "PT-2026-0000001",
  "client_request_id": "REQ-PAY-20261016-001",
  "customer_id": "CUST-001",
  "customer_name": "Đại lý Dược Phẩm Hà Nội",
  "amount": 55000000,
  "payment_method": "BANK_TRANSFER",
  "payment_date": "2026-10-16T02:00:00Z",
  "collector_id": 2,
  "collector_name": "Kế toán Thu",
  "reference_code": "VCB-987654321",
  "notes": "Thu tiền chuyển khoản Vietcombank",
  "created_at": "2026-10-16T02:00:00Z",
  "allocations": [
    {
      "id": 1,
      "payment_id": "PT-2026-0000001",
      "invoice_id": "HD-2026-0000001",
      "allocated_amount": 55000000,
      "created_at": "2026-10-16T02:00:00Z"
    }
  ]
}
```

### 2. `GET /api/v1/payments` - Danh sách phiếu thu
- **Query Params**: `customer_id`, `payment_method`, `from_date`, `to_date`, `skip`, `limit`.
- **Customer Scope**: Tự động lọc theo đại lý của tài khoản đăng nhập nếu là `Customer`.

### 3. `GET /api/v1/payments/{id}` - Chi tiết phiếu thu & danh sách phân bổ
- Trả về thông tin phiếu thu kèm danh sách phân bổ `allocations`.

### 4. `PUT /api/v1/payments/{id}` & `DELETE /api/v1/payments/{id}`
- Trả về **HTTP 405 Method Not Allowed** (Bất biến).
