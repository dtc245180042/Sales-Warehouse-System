# 📐 QUY CHUẨN CODE & THIẾT KẾ API BACKEND (CODING & API STANDARDS)
**Áp dụng bắt buộc cho toàn bộ Developer và AI Agent trong dự án OMS**

---

## 1. THIẾT KẾ RESTFUL API

### 1.1. Cấu trúc URL Endpoint
- **Prefix bắt buộc:** `/api/v1/<resource>`
- **Tên Resource:** Danh từ số nhiều, viết thường, ngăn cách bằng dấu gạch ngang (`kebab-case`).
  - ✅ `/api/v1/products`
  - ✅ `/api/v1/order-items`
  - ✅ `/api/v1/warehouse-locations`
  - ❌ `/api/v1/createProduct` (Không dùng động từ)
  - ❌ `/api/v1/order_items` (Không dùng snake_case trên URL)

### 1.2. Chuẩn HTTP Methods
| Method | Mục đích | Status Code thành công | Ví dụ |
| :--- | :--- | :--- | :--- |
| `GET` | Lấy danh sách hoặc chi tiết | `200 OK` | `GET /api/v1/products` |
| `POST` | Tạo mới một tài nguyên | `201 Created` | `POST /api/v1/products` |
| `PUT` | Cập nhật toàn bộ tài nguyên | `200 OK` | `PUT /api/v1/products/{id}` |
| `PATCH` | Cập nhật một phần thuộc tính | `200 OK` | `PATCH /api/v1/products/{id}` |
| `DELETE`| Xóa tài nguyên | `200 OK` hoặc `204 No Content` | `DELETE /api/v1/products/{id}` |

### 1.3. Hành động đặc biệt (Sub-resource Action)
Với các thao tác không phải CRUD thuần túy, dùng cú pháp: `POST /api/v1/<resource>/{id}/<action>`
- ✅ `POST /api/v1/users/{id}/lock`
- ✅ `POST /api/v1/users/{id}/unlock`
- ✅ `POST /api/v1/orders/{id}/cancel`

---

## 2. QUY CHUẨN DỮ LIỆU JSON (REQUEST & RESPONSE)

1. **Khóa thuộc tính (Keys):** 100% dùng `snake_case`.
   ```json
   {
     "user_id": 10,
     "full_name": "Nguyen Van A",
     "phone_number": "0901234567",
     "is_active": true
   }
   ```
2. **Cấu trúc danh sách phân trang (Pagination):**
   ```json
   {
     "items": [],
     "total": 100,
     "page": 1,
     "page_size": 20,
     "total_pages": 5
   }
   ```
3. **Cấu trúc báo lỗi (Error Response):**
   ```json
   {
     "detail": "Mô tả nguyên nhân lỗi bằng tiếng Việt rõ ràng cho người dùng."
   }
   ```

---

## 3. QUY TẮC ĐẶT TÊN TRONG CODE (PEP 8 & LANGUAGE)

### 3.1. Ngôn ngữ
- **Toàn bộ tên biến, hàm, class, cột database:** Bắt buộc dùng **TIẾNG ANH**.
- **Docstring, comment, thông báo lỗi HTTPException:** Dùng **TIẾNG VIỆT**.

### 3.2. Quy tắc đặt tên cụ thể
| Loại | Cú pháp | Quy ước | Ví dụ |
| :--- | :--- | :--- | :--- |
| **Model / Schema Class** | `PascalCase` | Danh từ | `Product`, `OrderItem`, `UserCreateRequest` |
| **Hàm / Method** | `snake_case` | Động từ + Danh từ | `get_product_by_id()`, `calculate_subtotal()` |
| **Biến thông thường** | `snake_case` | Danh từ | `current_user`, `order_list`, `total_amount` |
| **Biến Boolean** | `snake_case` | Tiền tố: `is_`, `has_`, `can_` | `is_active`, `has_permission`, `can_edit` |
| **Hằng số (Constants)** | `UPPER_SNAKE_CASE` | Viết hoa toàn bộ | `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE` |
| **Bảng Database** | `snake_case` | Danh từ số nhiều | `products`, `orders`, `user_roles` |
| **Tên File Module** | `snake_case.py` | Danh từ số nhiều | `products.py`, `order_service.py` |

---

## 4. KIẾN TRÚC 3 TẦNG (3-TIER ARCHITECTURE)

1. **Router (`app/api/endpoints/<ten>.py`):**
   - Chỉ chịu trách nhiệm: Nhận request $\rightarrow$ Validate Pydantic $\rightarrow$ Check quyền $\rightarrow$ Gọi Service $\rightarrow$ Trả Response.
   - **CẤM:** Viết query SQL phức tạp hoặc logic tính toán nghiệp vụ tại tầng này.
2. **Service (`app/services/<ten>_service.py`):**
   - Nơi xử lý 100% logic: Tính toán công nợ, trừ kho, kiểm tra điều kiện ràng buộc.
3. **Model (`app/models/<ten>.py`):**
   - Khai báo cấu trúc bảng cơ sở dữ liệu kế thừa từ `Base` (SQLAlchemy).

---

## 5. QUY TẮC THIẾT KẾ CSDL KHÔNG PHỤ THUỘC CHÉO (DECOUPLED DATABASE RULES)

Khi cơ sở dữ liệu phát triển qua nhiều Sprint, để tránh tình trạng các chức năng dẫm chân lên nhau:

1. **Nguyên tắc "Bảng Mở Rộng 1-1" (Profile Table Pattern):**
   - Bảng cốt lõi (`users`, `products`, `orders`) chỉ chứa thông tin danh tính tối giản.
   - Nếu Sprint mới cần thêm nhiều trường đặc thù nghiệp vụ, hãy tạo bảng mở rộng riêng:
     - Ví dụ: `sales_agent_profiles (user_id PK/FK, commission_rate, sales_quota)`
     - Tuyệt đối KHÔNG thêm 10 cột nghiệp vụ bán hàng vào bảng `users`.
2. **Nguyên tắc "Liên Kết Lỏng qua ID" (Loose Coupling via Scalar ID):**
   - Giữa các phân hệ độc lập (Kho, Bán hàng, Kế toán), chỉ lưu `customer_id: int` hoặc `product_id: int`.
   - **CẤM** dùng `relationship()` hai chiều chằng chịt giữa các module khác nhau. Khi cần thông tin, gọi qua Service tương ứng (`ProductService.get_product_by_id`).
3. **Trường dữ liệu mở rộng JSON (Metadata):**
   - Với các thuộc tính động, tùy biến nhanh theo từng khách hàng hoặc SKU, sử dụng cột `extra_info = Column(JSON, default=dict)` thay vì liên tục thay đổi schema bảng.
4. **Tra cứu Schema trước khi viết code (Inspect, Don't Guess):**
   - Agent **bắt buộc** chạy lệnh sau để xem chính xác các cột thực tế:
     ```bash
     python scripts/inspect_db.py <ten_bang>
     ```
