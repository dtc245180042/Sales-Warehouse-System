# 🤖 NGUYÊN TẮC BẮT BUỘC DÀNH CHO TẤT CẢ AI AGENT (ZERO-CONFLICT BACKEND RULES)

Dự án này sử dụng mô hình làm việc đa Agent (Multi-Agent Parallel Development). Để đảm bảo **KHÔNG BAO GIỜ XẢY RA XUNG ĐỘT (MERGE CONFLICT)** giữa các Agent làm các nhiệm vụ Backlog/Scrum khác nhau:

## 🛑 1. CÁC TẬP TIN BẤT KHẢ XÂM PHẠM (STRICT NO-TOUCH FILES)
Bất kỳ AI Agent nào khi thực hiện nhiệm vụ đều **TUYỆT ĐỐI KHÔNG ĐƯỢC CHỈNH SỬA** các tập tin và thư mục sau:
- ❌ `backend/main.py`
- ❌ `backend/app/api/__init__.py`
- ❌ `backend/app/core/*` (Bao gồm `config.py`, `database.py`, `security.py`, `dependencies.py`)
- ❌ `backend/app/models/auth.py` và `backend/app/models/__init__.py`
- ❌ `backend/app/api/auth.py` và `backend/app/api/users.py`
- ❌ `backend/app/services/seed_service.py`
- ❌ `backend/pytest.ini`

> **Lý do:** Hệ thống đã được thiết kế sẵn cơ chế **Auto-Discovery (Tự động nạp)**. Bạn không cần phải chèn router hay import model vào các file tổng!

---

## 🟢 2. NGUYÊN TẮC "CHỈ THÊM MỚI" (ADDITIVE-ONLY POLICY)
Khi thực hiện một nhiệm vụ (Scrum Story/Task):

1. **Thêm Endpoint API mới**:
   - Tạo file mới tại: `backend/app/api/endpoints/<ten_tinh_nang>.py`
   - Khai báo một biến router:
     ```python
     from fastapi import APIRouter
     router = APIRouter(prefix="/<ten_tinh_nang>", tags=["<Tên Nhóm>"])
     ```
   - Hệ thống sẽ **tự động nạp** router này vào cả `/api` và `/api/v1`. Không cần chỉnh sửa bất kỳ file nào khác.

2. **Thêm Model cơ sở dữ liệu mới (Quy tắc Chống Phụ Thuộc Chéo)**:
   - Tạo file model độc lập tại: `backend/app/models/<ten_model>.py`
   - Kế thừa từ `Base` (từ `app.core.database`).
   - **CẤM sửa bảng cũ**: Không được thêm cột vào `User` hay bảng của module khác. Nếu cần thêm thông tin nghiệp vụ, hãy tạo **Bảng Profile 1-1** (ví dụ: `SalesProfile`, `CustomerProfile`).
   - **Liên kết lỏng qua ID**: Giữa các module khác nhau, chỉ lưu `Scalar ID` (ví dụ `customer_id: int`), **KHÔNG dùng `relationship()` hai chiều nối chéo**.
   - **Tra cứu trước khi code**: CẤM đoán mò tên cột! Chạy lệnh:
     ```bash
     python scripts/inspect_db.py <ten_bang>
     ```
   - Hệ thống tự động import và tự động tạo bảng khi khởi chạy.

3. **Thêm Schema & Service**:
   - Tạo file mới tại: `backend/app/schemas/<ten_schema>.py`
   - Tạo file mới tại: `backend/app/services/<ten_service>.py`
   - Tuân thủ kiến trúc 3 tầng: Router chỉ nhận request/check quyền $\rightarrow$ Service xử lý logic và query $\rightarrow$ Model định nghĩa bảng.

4. **Thêm Unit Test**:
   - Tạo file mới tại: `backend/tests/test_<ten_tinh_nang>.py`

---

## 🏷️ 3. CHUẨN ĐẶT TÊN BIẾN, HÀM, VÀ API (NAMING & API STANDARDS)
- **API URL**: Bắt buộc `/api/v1/<resource-plural>` dạng kebab-case. Ví dụ: `/api/v1/order-items`. CẤM dùng động từ trong URL.
- **JSON Key**: 100% dùng `snake_case`. Ví dụ: `{"full_name": "...", "is_active": true}`.
- **Ngôn ngữ Code**: 100% Tên class (`PascalCase`), Tên hàm (`snake_case`), Tên biến (`snake_case`) bằng **TIẾNG ANH**.
- **Thông báo**: Docstring, comment và lỗi `HTTPException(detail=...)` viết bằng **TIẾNG VIỆT**.
- Chi tiết xem tại: `backend/skill/coding_standards.md`.

## ⚠️ 4. QUY TRÌNH NGOẠI LỆ: KHI BUỘC PHẢI SỬA CODE CŨ / FILE DÙNG CHUNG
Nếu một nghiệp vụ thực sự cốt lõi và bắt buộc phải sửa file cũ để tránh cồng kềnh, Agent PHẢI tuân thủ:
1. **Quy tắc CSDL Không Phá Vỡ (Non-breaking DB)**: Khi thêm cột mới vào bảng có sẵn, BẮT BUỘC phải đặt `nullable=True` hoặc có `default=...`. CẤM thêm cột `nullable=False` không default.
2. **Quy tắc Tương Thích Ngược (Backward Compatibility)**: Khi sửa hàm dùng chung, chỉ được thêm tham số tùy chọn (`param: Optional[...] = None`), CẤM đổi tên hàm hay đổi cấu trúc dữ liệu trả về đang có.
3. **Phạm vi tối thiểu**: Chỉ sửa đúng dòng cần thêm, CẤM reformat hay viết lại các phần code khác xung quanh.

---

## 🛡️ 5. QUY TRÌNH KIỂM SOÁT PHẠM VI (BLAST RADIUS PROTOCOL)
Trước khi thông báo hoàn thành nhiệm vụ, AI Agent **BẮT BUỘC** phải:
1. Chạy `git status` để kiểm tra.
2. Xác nhận rằng **KHÔNG CÓ** file nào trong danh sách "Bất khả xâm phạm" bị modified.
3. Nếu phát hiện lỡ sửa file dùng chung, Agent phải hoàn tác ngay (`git checkout -- <file>`).
4. Chạy `python -m pytest` để đảm bảo không làm hỏng các test hiện có.
