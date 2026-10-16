# 📋 TÀI LIỆU TỔNG HỢP API PHIẾU XUẤT KHO (S6-05) - DÀNH CHO HỌP TEAM & BÀN GIAO

> **Dự án**: Sales & Warehouse System  
> **Story**: S6-05 (Stock Dispatches - Quản lý Phiếu xuất kho)  
> **Nhánh**: `feature/s6-05-dispatch`  
> **Thời gian hoàn thành**: 16/10/2026  
> **Đầu mối phụ trách**: Nhóm trưởng (Tech Lead)  

---

## 👥 BẢN ĐỒ BÀN GIAO & KẾT NỐI VỚI CÁC THÀNH VIÊN

| Thành viên | Vai trò | Điểm chạm / Endpoint sử dụng | Mục đích tích hợp |
|:---|:---|:---|:---|
| **Trường** | Fullstack (S6-06 / S6-08) | `GET /api/v1/dispatches?status=CONFIRMED` | Lấy danh sách phiếu xuất đã xác nhận để làm thuật toán phân tuyến xe (`S6-06`) và giao diện tài xế xác nhận giao hàng (`S6-08`). |
| **Trung** | Backend (S6-07) | `GET /api/v1/dispatches/{id}` | Lấy chi tiết sản phẩm và danh sách lô của chuyến hàng để ráp màn hình "Hàng trên đường" (`S6-07`). |
| **Quang** | Frontend (S6-09) | `POST /api/v1/dispatches`<br>`POST /api/v1/lots/fefo-suggest` | Ráp giao diện tạo phiếu xuất kho, tự động gợi ý lô theo thuật toán FEFO và hiển thị cảnh báo cận date. |
| **Phúc** | Backend (S8-03) | `record_stock_movement` (`OUT_SALE`) | Nhận cấu trúc bút toán sổ cái kho tập trung có kèm `lot_id` để chuẩn hóa cho luồng Điều chỉnh tồn kho (`S8-03`). |

---

## 🚀 1. POST /api/v1/dispatches
**Mô tả**: Tạo và xác nhận Phiếu xuất kho trong 1 transaction duy nhất (AC-1).  
**Hành vi hệ thống**:
- Trừ tồn lô nguyên tử (`FEFOService.deduct_lot_stock_atomic`).
- Trừ tồn vật lý `physical_stock` và ghi sổ cái `OUT_SALE` (`record_stock_movement`).
- Chuyển giữ chỗ `StockReservation` từ `active` ➔ `fulfilled` (bảo vệ tồn khả dụng, không trừ trùng 2 lần).
- Chống bấm 2 lần qua `client_request_id` (trùng lặp trả HTTP 409).
- Tự động gợi ý FEFO nếu mảng `lots` rỗng (nếu kho không đủ hàng trả HTTP 400, không tự ý xuất thiếu).
- Đơn hàng chuyển sang trạng thái `EXPORTED`.

### Request Mẫu (Đầy đủ trường):
```json
{
  "client_request_id": "REQ-20261016-001-A1B2",
  "order_id": "ORD-20261016-0001",
  "warehouse_id": 1,
  "delivery_type": null,
  "notes": "Xuất kho đợt 1 cho đại lý Minh Anh",
  "items": [
    {
      "product_id": "PRD-IP15",
      "dispatched_quantity": 8,
      "lot_override_reason": "Ưu tiên xuất kiện nguyên theo yêu cầu khách",
      "lots": [
        {
          "lot_id": 102,
          "quantity": 8,
          "expiry_override_reason": null,
          "lot_override_reason": "Ưu tiên xuất kiện nguyên theo yêu cầu khách"
        }
      ]
    },
    {
      "product_id": "PRD-CABLE-TYPEC",
      "dispatched_quantity": 20,
      "lots": []
    }
  ]
}
```

### Response Mẫu (HTTP 201 Created):
```json
{
  "id": "PXK-20261016-0012",
  "client_request_id": "REQ-20261016-001-A1B2",
  "order_id": "ORD-20261016-0001",
  "customer_id": "CUST-001",
  "customer_name": "Công ty TNHH Minh Anh",
  "customer_address": "Số 15 Lê Duẩn, Hà Nội",
  "warehouse_id": 1,
  "warehouse_name": "Kho Tổng Hà Nội",
  "status": "CONFIRMED",
  "delivery_type": null,
  "total_items": 2,
  "total_dispatched_quantity": 28,
  "is_partial": true,
  "has_shortfall": true,
  "dispatched_by": 1,
  "dispatched_at": "2026-10-16T08:30:00Z",
  "notes": "Xuất kho đợt 1 cho đại lý Minh Anh",
  "items": [
    {
      "id": 1,
      "product_id": "PRD-IP15",
      "sku": "IP15-128GB",
      "product_name": "iPhone 15 128GB",
      "ordered_quantity": 10,
      "dispatched_quantity": 8,
      "shortfall_quantity": 2,
      "lot_override_reason": "Ưu tiên xuất kiện nguyên theo yêu cầu khách",
      "lots": [
        {
          "id": 1,
          "lot_id": 102,
          "lot_number": "LOT-IP15-202601",
          "quantity": 8,
          "expiry_override_reason": null,
          "lot_override_reason": "Ưu tiên xuất kiện nguyên theo yêu cầu khách"
        }
      ]
    },
    {
      "id": 2,
      "product_id": "PRD-CABLE-TYPEC",
      "sku": "CABLE-TC",
      "product_name": "Cáp sạc Type-C",
      "ordered_quantity": 20,
      "dispatched_quantity": 20,
      "shortfall_quantity": 0,
      "lot_override_reason": null,
      "lots": []
    }
  ]
}
```

---

## 🔍 2. GET /api/v1/dispatches/pending-orders
**Mô tả**: Endpoint chỉ đọc tra cứu các đơn hàng còn nợ hàng cấp đơn (AC-2). Khai báo trước `/{id}`.  
**Công thức**: `Shortfall = Tổng đặt - Tổng đã xuất trên các phiếu CONFIRMED`.

### Response Mẫu (HTTP 200 OK):
```json
[
  {
    "order_id": "ORD-20261016-0001",
    "order_code": "ORD-20261016-0001",
    "customer_id": "CUST-001",
    "customer_name": "Công ty TNHH Minh Anh",
    "order_status": "EXPORTED",
    "total_ordered": 30,
    "total_dispatched": 28,
    "total_shortfall": 2,
    "shortfall_items": [
      {
        "product_id": "PRD-IP15",
        "sku": "IP15-128GB",
        "product_name": "iPhone 15 128GB",
        "ordered_quantity": 10,
        "dispatched_quantity": 8,
        "remaining_shortfall": 2
      }
    ]
  }
]
```

---

## 📦 3. GET /api/v1/dispatches
**Mô tả**: Danh sách phiếu xuất kho có phân trang và bộ lọc (bàn giao cho Trường phân tuyến xe).  
**Query Params**:
- `status`: Lọc theo trạng thái (chỉ có `CONFIRMED`).
- `warehouse_id`: Lọc theo kho xuất.
- `order_id`: Lọc theo đơn hàng.
- `customer_id`: Lọc theo đại lý.
- `is_partial`: `true`/`false` (lọc phiếu xuất một phần).
- `skip`, `limit`: Phân trang.

### Response Mẫu (HTTP 200 OK):
```json
[
  {
    "id": "PXK-20261016-0012",
    "client_request_id": "REQ-20261016-001-A1B2",
    "order_id": "ORD-20261016-0001",
    "customer_id": "CUST-001",
    "customer_name": "Công ty TNHH Minh Anh",
    "customer_address": "Số 15 Lê Duẩn, Hà Nội",
    "warehouse_id": 1,
    "warehouse_name": "Kho Tổng Hà Nội",
    "status": "CONFIRMED",
    "delivery_type": null,
    "total_items": 2,
    "total_dispatched_quantity": 28,
    "is_partial": true,
    "has_shortfall": true,
    "dispatched_by": 1,
    "dispatched_at": "2026-10-16T08:30:00Z",
    "notes": "Xuất kho đợt 1 cho đại lý Minh Anh",
    "items": []
  }
]
```

---

## 🔎 4. GET /api/v1/dispatches/{id}
**Mô tả**: Xem chi tiết phiếu xuất kho kèm danh sách lô (bàn giao cho Trung ráp màn hình Hàng trên đường).

### Response Mẫu (HTTP 200 OK):
```json
{
  "id": "PXK-20261016-0012",
  "client_request_id": "REQ-20261016-001-A1B2",
  "order_id": "ORD-20261016-0001",
  "customer_id": "CUST-001",
  "customer_name": "Công ty TNHH Minh Anh",
  "customer_address": "Số 15 Lê Duẩn, Hà Nội",
  "warehouse_id": 1,
  "warehouse_name": "Kho Tổng Hà Nội",
  "status": "CONFIRMED",
  "delivery_type": null,
  "total_items": 2,
  "total_dispatched_quantity": 28,
  "is_partial": true,
  "has_shortfall": true,
  "dispatched_by": 1,
  "dispatched_at": "2026-10-16T08:30:00Z",
  "notes": "Xuất kho đợt 1 cho đại lý Minh Anh",
  "items": [
    {
      "id": 1,
      "product_id": "PRD-IP15",
      "sku": "IP15-128GB",
      "product_name": "iPhone 15 128GB",
      "ordered_quantity": 10,
      "dispatched_quantity": 8,
      "shortfall_quantity": 2,
      "lot_override_reason": "Ưu tiên xuất kiện nguyên theo yêu cầu khách",
      "lots": [
        {
          "id": 1,
          "lot_id": 102,
          "lot_number": "LOT-IP15-202601",
          "quantity": 8,
          "expiry_override_reason": null,
          "lot_override_reason": "Ưu tiên xuất kiện nguyên theo yêu cầu khách"
        }
      ]
    }
  ]
}
```

---

## ⛔ 5. CHẶN PUT / DELETE (AC-4)
- Mọi request `PUT /api/v1/dispatches/{id}` hoặc `DELETE /api/v1/dispatches/{id}` đều bị từ chối với:
  **HTTP 405 Method Not Allowed**: `"Phiếu xuất kho một khi đã xác nhận không được phép chỉnh sửa hoặc xóa."`

---

## ⚠️ DANH MỤC MÃ LỖI CHUẨN ĐỂ FRONTEND BẮT EXCEPTION
| Mã HTTP | Tình huống kích hoạt | Chi tiết thông báo |
|:---|:---|:---|
| **400 Bad Request** | Xuất vượt quá số lượng còn lại của đơn hàng | `"Sản phẩm '{prod_name}' yêu cầu xuất X vượt quá số lượng còn lại chưa giao (Y cái)."` |
| **400 Bad Request** | FEFO tự động không đủ hàng | `"Kho '{wh}' không đủ tồn các lô còn hạn để xuất theo FEFO (Thiếu Z cái). Hệ thống không tự ý xuất thiếu khi chạy tự động FEFO."` |
| **400 Bad Request** | Thiếu `lot_override_reason` khi chọn lô khác FEFO | `"Bắt buộc nhập lý do ghi đè (lot_override_reason) khi chọn tập lô khác gợi ý FEFO."` |
| **400 Bad Request** | Nhân viên kho xuất lô hết hạn | `"Lô hàng '{lot}' đã hết hạn sử dụng. Chỉ Quản trị viên (Admin) hoặc Quản lý kho (WH Manager) mới có thẩm quyền xuất lô hết hạn."` |
| **400 Bad Request** | SKU không quản lý lô nhưng truyền danh sách lô | `"Sản phẩm '{prod_name}' không quản lý theo lô, không được truyền danh sách lô."` |
| **404 Not Found** | Đơn hàng hoặc sản phẩm không tồn tại | `"Không tìm thấy đơn hàng với mã '{order_id}'."` |
| **405 Method Not Allowed** | Thử sửa hoặc xóa phiếu xuất đã xác nhận | `"Phiếu xuất kho một khi đã xác nhận không được phép chỉnh sửa hoặc xóa."` |
| **409 Conflict** | Bấm 2 lần trùng `client_request_id` | `"Yêu cầu xuất kho trùng lặp với client_request_id='{id}' (Phiếu đã tạo: PXK-xxx)."` |
