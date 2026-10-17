# SC254 / S6-03 — Phiếu soạn hàng

## Phạm vi và tích hợp

- Backend chỉ thêm file model, schema, service, router và test của tính năng. Router/model được tự nạp, không sửa `main.py`, `core`, `api/__init__.py`, model xác thực hoặc service nghiệp vụ cũ.
- Frontend thêm API client và hai trang; chỉ nối menu/sidebar, routes và tên breadcrumb vào giao diện hiện có.
- Truy cập **Quản lý kho → Phiếu soạn hàng**, URL `/inventory/picking-lists`.
- Vai trò được dùng: Admin, WH Manager, Warehouse. Hai vai trò kho chỉ truy cập kho được phân công. Cấu hình vị trí lấy hàng dành cho Admin/WH Manager.

## Cách sử dụng

1. Quản lý kho chọn kho, mở **Cấu hình vị trí lấy hàng**, nhập SKU, vị trí kệ và thứ tự đi qua kệ theo đường đi thực tế trong kho.
2. Chọn **Tạo phiếu soạn**, chọn một hoặc nhiều đơn đã duyệt cùng kho, bấm **Xem trước / Kiểm tra lại**.
3. Kiểm tra tổng dòng, tổng số lượng, thứ tự vị trí và các cảnh báo. Thiếu vị trí, khác đơn vị cơ sở hoặc thiếu tồn để giữ thêm sẽ chặn tạo để tránh soạn sai.
4. Xác nhận tạo phiếu. Các dòng được sắp xếp theo thứ tự vị trí, mã vị trí, SKU và đơn nguồn; cùng SKU của nhiều đơn nằm cạnh nhau nhưng giữ dòng nguồn riêng để truy vết.
5. Trên điện thoại, nhập số thực soạn và xác nhận từng dòng. Số thực soạn có thể bằng 0; thiếu bất kỳ số lượng nào đều phải có lý do không rỗng.
6. Khi tất cả dòng được ghi nhận đủ/thiếu, phiếu tự hoàn tất. Có thể điều chỉnh số đã soạn trước khi đơn chuyển xuất/giao hàng; mọi thay đổi đều ghi lịch sử.

## Hợp đồng tồn kho và trạng thái

- Nhận các trạng thái đã duyệt hiện có: `APPROVED`, `approved`, `confirmed`, `reserved`, `PACKING`, `packing`, `preparing`. Từ chối đơn nháp/chờ duyệt/hủy/đã xuất.
- Khi tạo phiếu, khóa đơn nguồn và các dòng tồn liên quan; kiểm tra lại dữ liệu bên trong transaction. Đơn được chuyển sang `PACKING`, có `OrderStatusHistory`, tương thích API xuất kho S6-05.
- Giữ nguyên các `StockReservation` đang `active`; chỉ bổ sung phần giữ chỗ còn thiếu ở đúng kho nếu tồn khả dụng đủ. Không giữ chỗ lại toàn bộ đơn.
- Đồng bộ tồn khả dụng của kho và các chỉ số tổng hợp sau khi lập phiếu/cập nhật dòng. Hàng đã soạn vẫn nằm trong kho, nên **không trừ tồn vật lý, không ghi OUT_SALE và không chuyển reservation sang fulfilled khi soạn**.
- Soạn thiếu giữ nguyên giữ chỗ phần còn lại cho đơn, tương thích luồng nợ hàng của S6-05. Số đã soạn/thiếu được ghi ở từng dòng phiếu và tổng hợp trên phiếu.
- API xuất kho S6-05 tiếp tục chịu trách nhiệm trừ tồn vật lý và hoàn tất giữ chỗ khi thực xuất. Không sửa hoặc thêm ràng buộc vào API của module đó; người lập phiếu xuất cần đối chiếu số thực soạn.
- Có thể hủy phiếu chưa hoàn tất sau khi trả hàng đã lấy về kệ. Phiếu giữ nguyên dữ liệu lịch sử, nhả khóa nhận đơn, khôi phục trạng thái nguồn nếu đơn còn `PACKING`; reservation của đơn vẫn giữ nguyên. Không hủy đơn hàng.
- Vị trí được chụp lại lúc tạo phiếu. Sửa cấu hình vị trí chỉ áp dụng cho phiếu mới.
- Đây là thứ tự tuyến đi do kho cấu hình, không phải thuật toán tìm đường ngắn nhất theo bản đồ. Mỗi SKU có một vị trí lấy hàng chính trong một kho. Tính năng nhiều ô chứa/phân bổ số lượng theo ô có thể mở rộng sau bằng module vị trí kho.

## API (prefix `/api/v1/picking-lists`)

| Method | Đường dẫn | Chức năng |
| --- | --- | --- |
| GET | `/warehouses` | Các kho được phép thao tác |
| GET | `/locations?warehouse_id=1` | Vị trí lấy hàng của kho |
| PUT | `/locations/{warehouse_id}/{product_id_or_sku}` | Lưu vị trí và `route_sequence` |
| GET | `/eligible-orders?warehouse_id=1` | Đơn đủ điều kiện, tìm kiếm/phân trang |
| POST | `/previews` | Xem trước `warehouse_id`, `order_ids` |
| POST | `` | Tạo phiếu với `warehouse_id`, `order_ids`, `client_request_id`, `notes` |
| GET | `?warehouse_id=1` | Danh sách, lọc `status`, `search`, `page`, `page_size` |
| GET | `/{id}` | Chi tiết và dòng theo thứ tự tuyến |
| PATCH | `/{id}/items/{item_id}` | Ghi `picked_quantity`, `shortfall_reason`, `expected_version` |
| GET | `/{id}/history` | Lịch sử trước/sau, người sửa, thời điểm UTC; có phân trang |
| PATCH | `/{id}` | Hủy với `status: cancelled`, `reason` |

`client_request_id` giúp thử lại khi mất mạng mà không tạo trùng phiếu. Khóa duy nhất ở liên kết đơn ngăn hai phiếu cùng nhận một đơn. `expected_version` chặn ghi đè thao tác từ điện thoại khác, trả HTTP 409 để người dùng làm mới.

## Kiểm tra

Chạy trên CSDL test tách biệt; không dùng CSDL đang vận hành:

```powershell
$env:DATABASE_URL = 'sqlite:///:memory:'
python -m pytest tests/test_s6_03_picking_lists.py tests/test_s6_05_dispatch.py tests/test_s5_06_reservations.py -q -p no:cacheprovider
```

Checklist UI: màn hình 390px, chọn nhiều đơn → xem trước → tạo → soạn thiếu không lý do bị chặn → lưu thiếu có lý do → xem lịch sử → sửa số thực soạn → làm mới → kiểm tra tiến độ. Dữ liệu danh sách/chi tiết có cache RAM theo tài khoản; lỗi API hiển thị thật, không fallback dữ liệu demo.

Khởi động lại backend sau khi thêm module để Auto-Discovery tạo các bảng mới. Không cần thay đổi schema bảng của module khác.

### Kết quả kiểm tra trên nhánh triển khai

- 20 ca SC254 và 16 ca hồi quy xuất kho/giữ chỗ: **36 passed**.
- Dữ liệu đơn cũ có ID sản phẩm dạng số được đối chiếu SKU để lấy ID chuẩn; đơn vị “cái”/“Chiếc” được xem là tương đương. Khi chưa có dòng tồn đa kho, chỉ backfill profile tồn vào đúng kho được lưu trên profile.
- `npm run lint`: thành công, không lỗi/cảnh báo. `npm run build`: thành công; Vite còn cảnh báo bundle lớn của ứng dụng.
- Đã thử UI thật với API và CSDL test riêng trên Chrome ở chiều rộng 390px: gộp hai đơn, tạo phiếu bốn dòng theo tuyến, chặn lý do thiếu trống, lưu thiếu có lý do và xem lịch sử. Kiểm tra DOM không thấy tràn ngang.
- Bộ pytest tổng chưa xanh khi dùng CSDL SQLite in-memory: nhiều fixture cũ phụ thuộc bảng/tài khoản seed hoặc CSDL dùng chung và gặp `no such table: users`. Checkout `testGUI` gốc ở commit `cb1e834` trong worktree riêng cũng gặp các lỗi này. Không sửa fixture/service cũ để giữ phạm vi chống xung đột.
- Kiểm tra TypeScript toàn dự án còn lỗi ở các file có sẵn (ví dụ `Breadcrumb` trùng key, props `Modal`/`Button`, kiểu trạng thái đơn). Không có chẩn đoán TypeScript tại ba file API/trang mới của SC254. Build Vite không thực hiện bước typecheck này.
- Không thay đổi file backend trong danh sách cấm. Ba điểm tích hợp frontend chỉ thêm tên breadcrumb, mục menu và hai route.
