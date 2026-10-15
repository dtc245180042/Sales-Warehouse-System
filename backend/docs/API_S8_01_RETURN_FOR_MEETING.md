# 📦 TÀI LIỆU KỸ THUẬT & BÀN GIAO API TRẢ HÀNG & NHẬP LẠI KHO (STORY S8-01)

> **Người thực hiện**: Nhóm trưởng (Tech Lead)  
> **Nhánh Git**: `feature/s8-01-return` (tách từ `testGUI` sau khi merge S7-01)  
> **Bộ test**: `backend/tests/test_s8_01_return.py` (11/11 test cases passed 100%)  
> **Mục tiêu**: Xử lý quy trình trả hàng từ đại lý chuẩn mực: lập yêu cầu $\rightarrow$ kiểm đếm $\rightarrow$ nhập lại đúng kho & đúng lô hoặc kho hàng lỗi $\rightarrow$ ghi sổ cái kho `IN_RETURN`.

---

## 👥 1. BẢNG PHÂN VAI & ĐỐI TƯỢNG BÀN GIAO TRONG TEAM

| Thành viên | Trách nhiệm | Điểm chạm & Cách sử dụng API S8-01 |
|:---|:---|:---|
| **Trung** | Giao diện Trả hàng (`S8-01`) | Sử dụng bộ JSON Request/Response mẫu ở Mục 3 để dựng UI tiếp nhận và xác nhận trả hàng. |
| **Phúc** | Điều chỉnh tồn kho (`S8-03`) | Nhận thông báo: Sổ cái kho đã bổ sung loại biến động `IN_RETURN = "IN_RETURN"` (`_INCREASE`) và kho hàng lỗi `DAMAGED_WAREHOUSE_ID = 99`. |
| **Trang** | Chốt sổ nợ (`S8-10`) / Giảm nợ (`S8-02`) | Dữ liệu tài chính phân bổ (`unit_price`, `discount_amount`, `vat_amount`, `subtotal`) đã được lưu đầy đủ trên `return_order_items` để sẵn sàng cho Story S8-02 sinh Credit Note. Hoá đơn gốc được giữ nguyên bất biến. |

---

## ⚡ 2. CÁC TIÊU CHÍ CHẤP NHẬN (AC) & NGUYÊN TẮC KỸ THUẬT ĐẠT 100%

1. **Phân quyền vai trò chuẩn (`UserRole`)**:
   - **Lập phiếu yêu cầu**: `Sales Rep`, `Sales Manager`, `Admin`. Vai trò `Customer` chỉ được lập cho hoá đơn của chính đại lý mình (Anti-IDOR).
   - **Xác nhận nhập kho & Hủy phiếu**: Chỉ dành riêng cho `WH Manager` và `Admin`. Thủ kho thường (`Warehouse`) bị từ chối bằng **HTTP 403 Forbidden**.
2. **Quản lý Lô & Hạn mức từng Lô (AC-1, AC-2, AC-3)**:
   - Dòng hàng liên kết trực tiếp tới `StockDispatchLot` thông qua `InvoiceItem.dispatch_item_id`.
   - SKU quản lý lô thiếu `lot_id` $\rightarrow$ Báo lỗi 400; SKU không quản lý lô kèm `lot_id` $\rightarrow$ Báo lỗi 400.
   - `lot_id` phải thuộc danh sách các lô đã xuất của dòng đó; hạn mức tính riêng theo từng lô.
3. **Phân luồng Kho Nhận & Kho Hàng Lỗi**:
   - **Hàng tốt (`condition == 'GOOD'`)**: Nhập lại đúng kho xuất gốc (`StockDispatch.warehouse_id`).
   - **Hàng hỏng (`condition == 'DAMAGED'`)**: Nhập vào Kho hàng lỗi (`DAMAGED_WAREHOUSE_ID = 99`).
   - **Bảo toàn tồn bán**: Hàng nhập kho lỗi 99 **tuyệt đối không làm tăng tồn bán khả dụng** (`Product.stock` và `WarehouseStock(wh_origin).stock` không đổi).
   - Giữ thông tin lô tại kho lỗi và đảm bảo: $\sum \text{remaining\_quantity các lô kho 99} \le \text{physical\_stock kho 99}$.
4. **Cộng tồn duy nhất qua `record_stock_movement`**:
   - Ghi thẻ kho biến động loại `IN_RETURN` có kèm `lot_id`. Không cộng thủ công `WarehouseStock` thêm lần nữa.
5. **Xác nhận nguyên tử & Tính bất biến**:
   - `UPDATE ... WHERE status='REQUESTED'` kiểm tra `rowcount == 1` chống xác nhận hai lần.
   - Hạn mức trả tính nguyên tử gộp các phiếu `REQUESTED` và `CONFIRMED`. Hủy phiếu (`CANCELLED`) giải phóng hạn mức.
   - `PUT` và `DELETE` trên `/api/v1/returns/{id}` trả về **HTTP 405 Method Not Allowed** ở mọi trạng thái.

---

## 🌐 3. BỘ JSON MẪU CHUẨN BÀN GIAO CHO TRUNG DỰNG GIAO DIỆN

### 1. `POST /api/v1/returns` - Lập yêu cầu trả hàng
- **Roles**: Sales Rep, Sales Manager, Admin, Customer (cùng đại lý).
- **Request Body**:
```json
{
  "client_request_id": "REQ-RET-20261016-001",
  "invoice_id": "HD-2026-0000001",
  "return_reason": "DEFECTIVE_PRODUCT",
  "notes": "Đại lý báo hàng bị lỗi vỉ thuốc và móp méo vỏ hộp",
  "items": [
    {
      "invoice_item_id": 301,
      "lot_id": 10,
      "quantity": 5,
      "condition": "GOOD"
    },
    {
      "invoice_item_id": 301,
      "lot_id": 11,
      "quantity": 3,
      "condition": "DAMAGED"
    },
    {
      "invoice_item_id": 302,
      "lot_id": null,
      "quantity": 10,
      "condition": "GOOD"
    }
  ]
}
```
- **Response 201 Created**:
```json
{
  "id": "TH-2026-0000001",
  "client_request_id": "REQ-RET-20261016-001",
  "invoice_id": "HD-2026-0000001",
  "customer_id": "CUST-001",
  "customer_name": "Đại lý Dược Phẩm Hà Nội",
  "status": "REQUESTED",
  "return_reason": "DEFECTIVE_PRODUCT",
  "notes": "Đại lý báo hàng bị lỗi vỉ thuốc và móp méo vỏ hộp",
  "origin_warehouse_id": 2,
  "requested_by": 4,
  "requested_by_name": "Nguyễn Văn Sales",
  "requested_at": "2026-10-16T08:30:00Z",
  "confirmed_by": null,
  "confirmed_by_name": null,
  "confirmed_at": null,
  "cancelled_by": null,
  "cancelled_by_name": null,
  "cancelled_at": null,
  "cancel_reason": null,
  "total_returned_value": 1042250,
  "created_at": "2026-10-16T08:30:00Z",
  "items": [
    {
      "id": 1,
      "invoice_item_id": 301,
      "product_id": "PROD-LOT-01",
      "sku": "SKU-LOT-01",
      "product_name": "Thuốc Kháng Sinh Amox 500",
      "unit": "hộp",
      "quantity": 5,
      "condition": "GOOD",
      "lot_id": 10,
      "lot_number": "LOT-2026-A1",
      "unit_price": 100000,
      "discount_amount": 25000,
      "vat_amount": 47500,
      "subtotal": 522500
    },
    {
      "id": 2,
      "invoice_item_id": 301,
      "product_id": "PROD-LOT-01",
      "sku": "SKU-LOT-01",
      "product_name": "Thuốc Kháng Sinh Amox 500",
      "unit": "hộp",
      "quantity": 3,
      "condition": "DAMAGED",
      "lot_id": 11,
      "lot_number": "LOT-2026-A2",
      "unit_price": 100000,
      "discount_amount": 15000,
      "vat_amount": 28500,
      "subtotal": 313500
    },
    {
      "id": 3,
      "invoice_item_id": 302,
      "product_id": "PROD-NO-LOT-02",
      "sku": "SKU-NO-LOT-02",
      "product_name": "Bông Băng Y Tế Tiệt Trùng",
      "unit": "cuộn",
      "quantity": 10,
      "condition": "GOOD",
      "lot_id": null,
      "lot_number": null,
      "unit_price": 20000,
      "discount_amount": 12500,
      "vat_amount": 18750,
      "subtotal": 206250
    }
  ]
}
```

### 2. `POST /api/v1/returns/{id}/confirm` - Quản lý kho xác nhận nhận hàng
- **Roles**: CHỈ WH Manager, Admin.
- **Request Body**:
```json
{
  "notes": "Đã kiểm đếm đủ thực tế: 15 hộp nguyên vẹn nhập kho 2, 3 hộp rách bao bì nhập kho lỗi 99"
}
```
- **Response 200 OK**:
```json
{
  "id": "TH-2026-0000001",
  "client_request_id": "REQ-RET-20261016-001",
  "invoice_id": "HD-2026-0000001",
  "customer_id": "CUST-001",
  "customer_name": "Đại lý Dược Phẩm Hà Nội",
  "status": "CONFIRMED",
  "return_reason": "DEFECTIVE_PRODUCT",
  "notes": "Đại lý báo hàng bị lỗi vỉ thuốc và móp méo vỏ hộp\n[Kho kiểm đếm]: Đã kiểm đếm đủ thực tế...",
  "origin_warehouse_id": 2,
  "requested_by": 4,
  "requested_by_name": "Nguyễn Văn Sales",
  "requested_at": "2026-10-16T08:30:00Z",
  "confirmed_by": 2,
  "confirmed_by_name": "Trần Quản Lý Kho",
  "confirmed_at": "2026-10-16T09:15:00Z",
  "total_returned_value": 1042250,
  "items": [...]
}
```

### 3. `POST /api/v1/returns/{id}/cancel` - Hủy yêu cầu trả hàng
- **Roles**: WH Manager, Admin, Sales Rep.
- **Request Body**:
```json
{
  "cancel_reason": "Đại lý báo giữ lại bán tiếp sau khi thương lượng chiết khấu thêm"
}
```
- **Response 200 OK**:
```json
{
  "id": "TH-2026-0000001",
  "status": "CANCELLED",
  "cancel_reason": "Đại lý báo giữ lại bán tiếp sau khi thương lượng chiết khấu thêm",
  "cancelled_by": 2,
  "cancelled_by_name": "Trần Quản Lý Kho",
  "cancelled_at": "2026-10-16T09:00:00Z"
}
```

### 4. `GET /api/v1/returns` - Danh sách phiếu trả hàng
- **Query Params**: `customer_id`, `status` (`REQUESTED`, `CONFIRMED`, `CANCELLED`), `from_date`, `to_date`, `skip`, `limit`.
- **Customer Scope**: Tự động lọc theo đại lý của tài khoản đăng nhập nếu là vai trò `Customer`.
- **Response 200 OK**: Mảng các `ReturnOrderResponse`.

### 5. `PUT /api/v1/returns/{id}` & `DELETE /api/v1/returns/{id}`
- Trả về **HTTP 405 Method Not Allowed** (Bất biến).
