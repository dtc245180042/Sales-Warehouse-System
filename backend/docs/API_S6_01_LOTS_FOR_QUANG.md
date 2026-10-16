# 📦 TÀI LIỆU TÓM TẮT API PHẦN A (STORY S6-01: QUẢN LÝ LÔ & HẠN SỬ DỤNG)
> **Dành cho**: Quang (Ráp Giao diện Thẻ kho, Quản lý Lô & Danh mục)  
> **Backend Base URL**: `/api/v1` (tương thích `/api`)  
> **Định dạng dữ liệu**: `application/json`  
> **Xác thực**: Bearer Token (`Authorization: Bearer <token>`)

---

## 1. Bật / Tắt Quản lý Lô cho Sản phẩm

- **URL**: `PUT /api/v1/products/{product_id}/lot-tracking` (hoặc `PUT /api/v1/lots/products/{product_id}/lot-tracking`)
- **Mô tả**: Bật (`manage_by_lot: true`) hoặc tắt (`manage_by_lot: false`) tính năng quản lý lô cho SKU.
  - **Quy tắc khi bật**: Nếu sản phẩm đang có tồn kho vật lý (`physical_stock > 0`) tại kho nào, bắt buộc phải cung cấp thông tin lô đầu kỳ cho kho đó trong `initial_lots`.
  - **Quy tắc khi tắt**: Chỉ cho phép tắt khi tổng tồn kho của các lô hàng còn lại bằng 0.

### Request Mẫu: Bật quản lý lô (Sản phẩm có tồn ở Kho 1 và Kho 2)
```http
PUT /api/v1/products/PRD-LAPTOP-01/lot-tracking
Content-Type: application/json
Authorization: Bearer <token>

{
  "manage_by_lot": true,
  "near_expiry_threshold_days": 30,
  "initial_lots": [
    {
      "warehouse_id": 1,
      "lot_number": "LOT-HN-2026-01",
      "mfg_date": "2026-01-15",
      "exp_date": "2026-12-31"
    },
    {
      "warehouse_id": 2,
      "lot_number": "LOT-DN-2026-01",
      "mfg_date": "2026-02-01",
      "exp_date": "2026-11-30"
    }
  ]
}
```

### Response Mẫu: Thành công (HTTP 200 OK)
```json
{
  "product_id": "PRD-LAPTOP-01",
  "manage_by_lot": true,
  "near_expiry_threshold_days": 30,
  "message": "Kích hoạt quản lý theo lô thành công."
}
```

### Các Mã Lỗi Thường Gặp:
- **HTTP 400 Bad Request** (Kho có tồn nhưng thiếu lô đầu kỳ):
```json
{
  "detail": "Sản phẩm đang có tồn kho vật lý nhưng thiếu thông tin lô đầu kỳ cho các kho sau: Kho Đà Nẵng (warehouse_id=2, tồn=20). Vui lòng cung cấp danh sách initial_lots cho từng kho có tồn để kích hoạt quản lý lô."
}
```
- **HTTP 400 Bad Request** (Tắt lô khi còn tồn):
```json
{
  "detail": "Không thể tắt quản lý lô khi sản phẩm vẫn còn tồn trong các lô hàng (50 đơn vị còn tồn)."
}
```
- **HTTP 404 Not Found**:
```json
{
  "detail": "Không tìm thấy sản phẩm có mã 'PRD-INVALID'."
}
```

---

## 2. Khai báo Lô hàng Mới

- **URL**: `POST /api/v1/lots`
- **Mô tả**: Khai báo một lô hàng mới cho sản phẩm tại một kho cụ thể.
- **Quy tắc quan trọng**:
  - **POST /lots chỉ khai báo lô, tuyệt đối KHÔNG cộng tồn kho vật lý.**
  - **Chặn** nếu tổng `remaining_quantity` của tất cả các lô tại kho đó vượt quá `physical_stock` hiện tại.
  - Ngày hết hạn `exp_date` phải sau ngày sản xuất `mfg_date`.

### Request Mẫu:
```http
POST /api/v1/lots
Content-Type: application/json
Authorization: Bearer <token>

{
  "product_id": "PRD-LAPTOP-01",
  "warehouse_id": 1,
  "lot_number": "LOT-DELL-2026-X1",
  "mfg_date": "2026-03-01",
  "exp_date": "2026-09-01",
  "initial_quantity": 40,
  "remaining_quantity": 40
}
```

### Response Mẫu: Thành công (HTTP 201 Created)
```json
{
  "id": 105,
  "lot_number": "LOT-DELL-2026-X1",
  "product_id": "PRD-LAPTOP-01",
  "warehouse_id": 1,
  "mfg_date": "2026-03-01",
  "exp_date": "2026-09-01",
  "initial_quantity": 40,
  "remaining_quantity": 40,
  "status": "ACTIVE",
  "days_to_expiry": 138,
  "created_at": "2026-10-16T08:30:00+07:00",
  "updated_at": "2026-10-16T08:30:00+07:00"
}
```

### Các Mã Lỗi Thường Gặp:
- **HTTP 400 Bad Request** (Tổng tồn lô vượt tồn vật lý):
```json
{
  "detail": "Tổng số lượng tồn các lô (120) vượt quá tồn kho vật lý hiện tại của sản phẩm tại kho (100 đơn vị). POST /lots chỉ khai báo lô và không được vượt quá số lượng tồn vật lý sẵn có."
}
```
- **HTTP 400 Bad Request** (Trùng số lô tại kho):
```json
{
  "detail": "Lô hàng 'LOT-DELL-2026-X1' đã tồn tại cho sản phẩm này tại kho #1."
}
```
- **HTTP 400 Bad Request** (Ngày hết hạn trước ngày sản xuất):
```json
{
  "detail": "Ngày hết hạn (exp_date) phải sau ngày sản xuất (mfg_date)."
}
```

---

## 3. Lấy Danh sách Lô hàng & Phân trang

- **URL**: `GET /api/v1/lots`
- **Query Params**:
  - `product_id` (tùy chọn): Lọc theo mã sản phẩm
  - `warehouse_id` (tùy chọn): Lọc theo mã kho (1: Hà Nội, 2: Đà Nẵng, 3: TP.HCM)
  - `status` (tùy chọn): Lọc theo trạng thái (`ACTIVE`, `NEAR_EXPIRY`, `EXPIRED`, `EXHAUSTED`)
  - `page` (mặc định: 1): Số trang
  - `page_size` (mặc định: 20): Số bản ghi mỗi trang

### Request Mẫu:
```http
GET /api/v1/lots?warehouse_id=1&status=ACTIVE&page=1&page_size=20
Authorization: Bearer <token>
```

### Response Mẫu: Thành công (HTTP 200 OK)
```json
{
  "total": 1,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 105,
      "lot_number": "LOT-DELL-2026-X1",
      "product_id": "PRD-LAPTOP-01",
      "warehouse_id": 1,
      "mfg_date": "2026-03-01",
      "exp_date": "2026-09-01",
      "initial_quantity": 40,
      "remaining_quantity": 40,
      "status": "ACTIVE",
      "days_to_expiry": 138,
      "created_at": "2026-10-16T08:30:00+07:00",
      "updated_at": "2026-10-16T08:30:00+07:00"
    }
  ]
}
```

---

## 4. Danh sách Cảnh báo Lô Cận Date & Hết hạn

- **URL**: `GET /api/v1/lots/near-expiry`
- **Mô tả**: Trả về tất cả các lô hàng sắp hết hạn (trong ngưỡng `threshold_days`) hoặc đã quá hạn mà còn tồn kho (`remaining_quantity > 0`).
- **Query Params**:
  - `warehouse_id` (tùy chọn): Lọc theo kho hàng
  - `threshold_days` (tùy chọn, mặc định lấy theo ngưỡng sản phẩm hoặc 30 ngày)

### Request Mẫu:
```http
GET /api/v1/lots/near-expiry?warehouse_id=1
Authorization: Bearer <token>
```

### Response Mẫu: Thành công (HTTP 200 OK)
```json
{
  "total_warnings": 2,
  "near_expiry_count": 1,
  "expired_count": 1,
  "items": [
    {
      "lot_id": 88,
      "lot_number": "LOT-OLD-01",
      "product_id": "PRD-MOUSE-01",
      "product_name": "Chuột không dây Logitech",
      "warehouse_id": 1,
      "warehouse_name": "Kho #1",
      "exp_date": "2026-10-10",
      "days_to_expiry": -6,
      "remaining_quantity": 12,
      "status": "EXPIRED"
    },
    {
      "lot_id": 92,
      "lot_number": "LOT-WARN-02",
      "product_id": "PRD-HEADSET-01",
      "product_name": "Tai nghe Gaming",
      "warehouse_id": 1,
      "warehouse_name": "Kho #1",
      "exp_date": "2026-10-28",
      "days_to_expiry": 12,
      "remaining_quantity": 25,
      "status": "NEAR_EXPIRY"
    }
  ]
}
```

---

## 5. Xem Chi tiết Một Lô hàng

- **URL**: `GET /api/v1/lots/{lot_id}`
- **Mô tả**: Lấy chi tiết thông tin và trạng thái động của một lô hàng theo `lot_id`.

### Request Mẫu:
```http
GET /api/v1/lots/105
Authorization: Bearer <token>
```

### Response Mẫu: Thành công (HTTP 200 OK)
```json
{
  "id": 105,
  "lot_number": "LOT-DELL-2026-X1",
  "product_id": "PRD-LAPTOP-01",
  "warehouse_id": 1,
  "mfg_date": "2026-03-01",
  "exp_date": "2026-09-01",
  "initial_quantity": 40,
  "remaining_quantity": 40,
  "status": "ACTIVE",
  "days_to_expiry": 138,
  "created_at": "2026-10-16T08:30:00+07:00",
  "updated_at": "2026-10-16T08:30:00+07:00"
}
```

---

## 6. Kiểm tra Hạn dùng & Phân quyền Xuất Lô

- **URL**: `POST /api/v1/lots/check-dispatch`
- **Mô tả**: Kiểm tra tính hợp lệ trước khi chọn lô để xuất hàng.
- **Quy tắc**:
  - Nếu lô chưa hết hạn: Luôn hợp lệ (`valid: true`).
  - Nếu lô **đã hết hạn**:
    - Chỉ **Quản trị viên (Admin)** hoặc **Quản lý kho (WH Manager)** mới được duyệt.
    - **Bắt buộc** phải truyền `override_reason` (lý do ghi đè).
    - Nhân viên kho thông thường hoặc không có lý do sẽ bị trả lỗi **HTTP 400**.

### Request Mẫu: Xuất lô đã hết hạn có lý do ghi đè
```http
POST /api/v1/lots/check-dispatch
Content-Type: application/json
Authorization: Bearer <token_wh_manager_or_admin>

{
  "lot_id": 88,
  "override_reason": "Xuất hủy hàng thanh lý theo quyết định kiểm định BLĐ"
}
```

### Response Mẫu: Thành công (HTTP 200 OK)
```json
{
  "valid": true,
  "lot_id": 88,
  "status": "EXPIRED",
  "days_to_expiry": -6,
  "is_expired": true,
  "override_allowed": true,
  "message": "Cho phép xuất lô hết hạn với lý do ghi đè: Xuất hủy hàng thanh lý theo quyết định kiểm định BLĐ"
}
```

### Các Mã Lỗi Thường Gặp:
- **HTTP 400 Bad Request** (Nhân viên không có quyền ghi đè):
```json
{
  "detail": "Lô hàng 'LOT-OLD-01' đã hết hạn sử dụng (2026-10-10). Chỉ Quản trị viên (Admin) hoặc Quản lý kho (WH Manager) mới có thẩm quyền xuất lô hết hạn."
}
```
- **HTTP 400 Bad Request** (Có quyền nhưng thiếu lý do):
```json
{
  "detail": "Lô hàng 'LOT-OLD-01' đã hết hạn sử dụng. Bắt buộc phải cung cấp lý do ghi đè (override_reason) để phê duyệt xuất lô này."
}
```

---

## 🎯 Gợi ý màu sắc / Badge cho giao diện của Quang:
- `ACTIVE`: Badge **Xanh lá (Green)** - Hàng tốt, hạn sử dụng dài.
- `NEAR_EXPIRY`: Badge **Vàng / Cam (Warning/Amber)** - Cận date (còn <= ngưỡng ngày cảnh báo).
- `EXPIRED`: Badge **Đỏ (Danger/Red)** - Quá hạn sử dụng.
- `EXHAUSTED`: Badge **Xám (Secondary/Gray)** - Hết hàng tồn (remaining = 0).
