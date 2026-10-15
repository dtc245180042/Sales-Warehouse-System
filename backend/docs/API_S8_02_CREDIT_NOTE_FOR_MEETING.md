# 📑 TÀI LIỆU KỸ THUẬT & BÀN GIAO API CHỨNG TỪ GIẢM NỢ KHI TRẢ HÀNG (STORY S8-02)

> **Người thực hiện**: Nhóm trưởng (Tech Lead)  
> **Nhánh Git**: `feature/s8-02-credit-note` (tách từ `feature/s8-01-return`)  
> **Bộ test**: `backend/tests/test_s8_02_credit_note.py` (12/12 test cases passed 100%)  
> **Toàn bộ regression suite lõi**: 66/66 test cases passed 100% (S6-01, S6-04, S6-05, S7-01, S8-01, S8-02)  
> **Mục tiêu**: Xử lý nghiệp vụ lập chứng từ điều chỉnh giảm trừ công nợ kế toán (Credit Note) khi đại lý trả hàng: đối trừ nợ hoá đơn gốc, giữ bất biến chứng từ, phân quyền bảo mật và cung cấp hook an toàn cho Sổ nợ.

---

## 👥 1. BẢNG PHÂN VAI & ĐỐI TƯỢNG BÀN GIAO TRONG TEAM

| Thành viên | Trách nhiệm | Điểm chạm & Cách sử dụng API S8-02 |
|:---|:---|:---|
| **Trang** | Chốt sổ nợ (`S8-10`) / Sổ công nợ (`S7-03`) | Nhận bàn giao hook an toàn `hook_sau_khi_lap_chung_tu_giam_no(db, credit_note)` trong `credit_note_service.py` để cập nhật số dư công nợ tổng và hạn mức khả dụng của đại lý mà không lo crash transaction. |
| **Thủy** | In ấn chứng từ (`S7-09`) / Báo cáo nợ (`S8-09`) | Lấy thông tin chi tiết `CreditNote` và `CreditNoteItem` để render mẫu in Biên bản điều chỉnh giảm công nợ khi trả hàng. |
| **Quang** | Giao diện Công nợ & Lịch sử đại lý | Ráp giao diện hiển thị danh sách chứng từ giảm nợ và tra cứu theo từng hoá đơn/phiếu trả hàng. |
| **Trung** | Giao diện Trả hàng (`S8-01` / `S8-02`) | Sau khi Quản lý kho xác nhận phiếu trả (CONFIRMED), hiển thị nút kích hoạt hoặc trạng thái liên kết tới Credit Note tương ứng. |

---

## ⚡ 2. CÁC TIÊU CHÍ CHẤP NHẬN (AC) & NGUYÊN TẮC KỸ THUẬT ĐẠT 100%

1. **Nguồn phát sinh & Ràng buộc duy nhất (AC-1)**:
   - Chứng từ giảm nợ chỉ được lập từ Phiếu trả hàng đã được Quản lý kho xác nhận nhập kho (`ReturnOrder.status == "CONFIRMED"`).
   - Phiếu đang ở trạng thái `REQUESTED` hoặc `CANCELLED` sẽ bị từ chối bằng **HTTP 400 Bad Request**.
   - Ràng buộc Unique trên `return_order_id`: 1 Phiếu trả hàng chỉ được lập duy nhất 1 Credit Note, chống lập trùng lặp.
2. **Giá trị giảm trừ tính theo đơn giá hoá đơn gốc (AC-2)**:
   - Tuyệt đối không lấy theo bảng giá hiện tại.
   - Sao lưu chính xác `unit_price`, `discount_amount`, `vat_amount`, `subtotal` từ các dòng hàng trả (`ReturnOrderItem`) sang `CreditNoteItem`.
   - `CreditNote.adjustment_amount = ReturnOrder.total_returned_value`.
3. **Đối trừ công nợ & Hook an toàn (AC-3)**:
   - Giảm trừ trực tiếp số nợ còn lại trên hoá đơn gốc:
     $$\text{deduct\_amount} = \min(\text{invoice.remaining\_amount}, \text{credit\_note.adjustment\_amount})$$
     $$\text{invoice.remaining\_amount} \leftarrow \text{invoice.remaining\_amount} - \text{deduct\_amount}$$
   - Nếu `remaining_amount == 0` $\rightarrow$ `invoice.status = "PAID"`. Ngược lại $\rightarrow$ `invoice.status = "PARTIALLY_PAID"`.
   - **Bảo vệ toàn vẹn**: KHÔNG ghi đè trực tiếp vào `CustomerCreditProfile.current_debt`. Sử dụng hook an toàn `hook_sau_khi_lap_chung_tu_giam_no` bọc trong `try-except`.
4. **Bảo toàn tính bất biến của hoá đơn gốc (AC-4)**:
   - Các trường tài chính gốc của hoá đơn: `total_amount`, `subtotal_amount`, `vat_amount`, `discount_amount` và danh sách `InvoiceItem` được **giữ nguyên vẹn 100%**.
5. **Bộ đếm số liên tục & Tính bất biến của Credit Note**:
   - Sinh mã dạng `CN-YYYY-XXXXXXX` qua bảng `credit_note_sequences` trong cùng transaction theo giờ Việt Nam (`Asia/Ho_Chi_Minh`), rollback không tiêu số.
   - Bất biến: `PUT` và `DELETE` trên `/api/v1/credit-notes/{id}` trả về **HTTP 405 Method Not Allowed**.
   - Idempotency với `client_request_id`: chống gửi lặp request.
6. **Phân quyền vai trò & Customer Scope (Anti-IDOR)**:
   - Lập chứng từ (`POST`): Chỉ dành riêng cho Kế toán (`Accountant`) và Quản trị viên (`Admin`). Vai trò khác bị từ chối **HTTP 403 Forbidden**.
   - Tra cứu (`GET`): Đại lý (`Customer`) chỉ xem được chứng từ giảm nợ của chính mình.

---

## 🌐 3. BỘ JSON MẪU BÀN GIAO CHO FRONTEND & TEAM MEMBERS

### 1. `POST /api/v1/credit-notes` - Lập chứng từ giảm nợ
- **Roles**: Kế toán (`Accountant`), Admin.
- **Request Body**:
```json
{
  "client_request_id": "REQ-CN-20261016-001",
  "return_order_id": "TH-2026-0000001",
  "notes": "Giảm trừ công nợ theo phiếu trả hàng lỗi kỹ thuật của đại lý Dược Phẩm Hà Nội",
  "adjustment_date": "2026-10-16T10:00:00Z"
}
```
- **Response 201 Created**:
```json
{
  "id": "CN-2026-0000001",
  "client_request_id": "REQ-CN-20261016-001",
  "return_order_id": "TH-2026-0000001",
  "invoice_id": "HD-2026-0000001",
  "customer_id": "CUST-001",
  "customer_name": "Đại lý Dược Phẩm Hà Nội",
  "adjustment_amount": 297000,
  "adjustment_date": "2026-10-16T10:00:00Z",
  "created_by": 2,
  "created_by_name": "Kế toán Nguyễn Thị Dung",
  "notes": "Giảm trừ công nợ theo phiếu trả hàng lỗi kỹ thuật của đại lý Dược Phẩm Hà Nội",
  "created_at": "2026-10-16T10:00:00Z",
  "items": [
    {
      "id": 1,
      "credit_note_id": "CN-2026-0000001",
      "return_order_item_id": 1,
      "product_id": "PROD-01",
      "sku": "SKU-01",
      "product_name": "Thuốc Kháng Sinh Amox 500",
      "unit": "hộp",
      "quantity": 3,
      "unit_price": 100000,
      "discount_amount": 30000,
      "vat_amount": 27000,
      "subtotal": 297000
    }
  ]
}
```

### 2. `GET /api/v1/credit-notes/{id}` - Xem chi tiết chứng từ giảm nợ
- **Roles**: Nội bộ hoặc Customer (Anti-IDOR: chỉ xem của đại lý mình).
- **Response 200 OK**: Thông tin chi tiết như mẫu trên.

### 3. `GET /api/v1/credit-notes` - Danh sách chứng từ giảm nợ
- **Query Params**:
  - `customer_id`: Lọc theo mã đại lý.
  - `invoice_id`: Lọc theo hoá đơn gốc.
  - `return_order_id`: Lọc theo phiếu trả hàng.
  - `from_date`, `to_date`: Lọc theo khoảng ngày lập.
  - `skip`, `limit`: Phân trang.
- **Customer Scope**: Tự động lọc theo `customer_id` của tài khoản đăng nhập nếu là vai trò `Customer`.

### 4. `PUT /api/v1/credit-notes/{id}` & `DELETE /api/v1/credit-notes/{id}`
- Trả về **HTTP 405 Method Not Allowed** (Chứng từ kế toán bất biến).

---

## 🔗 4. HƯỚNG DẪN TÍCH HỢP HOOK SỔ NỢ CHO TRANG (STORY S8-10)

Vị trí hook: `backend/app/services/credit_note_service.py`
```python
def hook_sau_khi_lap_chung_tu_giam_no(db: Session, credit_note: CreditNote) -> None:
    """
    Trang bổ sung logic Sổ nợ chi tiết và cập nhật CustomerCreditProfile tại đây.
    Tham số:
      - credit_note.customer_id
      - credit_note.adjustment_amount
      - credit_note.invoice_id
      - credit_note.return_order_id
    """
    pass
```
*Ghi chú: Hook đã được bọc `try-except` an toàn, nếu có lỗi phát sinh bên trong hook thì hệ thống sẽ ghi log và không làm rollback giao dịch lập Credit Note.*
