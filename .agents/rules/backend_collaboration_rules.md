# Backend Zero-Conflict Multi-Agent Rule

Mục tiêu: Đảm bảo nhiều AI Agent làm việc song song trên các task Scrum khác nhau mà không bao giờ gây xung đột code hoặc xung đột merge vào cuối tuần.

## RÀNG BUỘC CỐT LÕI
1. TUYỆT ĐỐI KHÔNG sửa các file tổng:
   - `backend/main.py`
   - `backend/app/api/__init__.py`
   - `backend/app/models/__init__.py`
   - `backend/app/models/auth.py`
   - `backend/app/core/*`
2. Mọi tính năng API mới chỉ được phép tạo mới trong `backend/app/api/endpoints/<feature_name>.py` với biến `router = APIRouter(...)`.
3. Mọi model mới chỉ được phép tạo mới trong `backend/app/models/<feature_name>.py` kế thừa từ `Base`.

## QUY CHUẨN ĐẶT TÊN & API (BẮT BUỘC)
1. **API URL**: `/api/v1/<resource-plural>` (kebab-case, không dùng động từ). Ví dụ: `GET /api/v1/orders`, `POST /api/v1/orders/{id}/cancel`.
2. **JSON keys**: 100% `snake_case` (ví dụ: `full_name`, `is_active`).
3. **Identifiers (Class, Hàm, Biến, Cột DB)**: 100% bằng TIẾNG ANH theo chuẩn PEP 8:
   - Class: `PascalCase` (`OrderService`, `Product`)
   - Hàm & Biến: `snake_case` (`get_order_by_id`, `current_user`)
   - Boolean: tiền tố `is_`, `has_`, `can_` (`is_active`, `has_permission`)
4. **Thông báo lỗi HTTPException, comment, docstring**: Viết bằng TIẾNG VIỆT rõ nghĩa.
5. **Kiến trúc 3 tầng**: Router chỉ kiểm tra quyền và schema -> gọi Service xử lý logic và DB -> Model định nghĩa bảng.
6. Trước khi kết thúc nhiệm vụ, kiểm tra `git status` và chạy `python -m pytest` để đảm bảo 100% test pass.
