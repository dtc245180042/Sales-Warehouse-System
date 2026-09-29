# 🌿 GitFlow & Quy Trình Merge Cuối Tuần (Zero-Conflict AI Workflow)
**Dự án:** Hệ thống Bán hàng & Kho (OMS) — K13C4  
**Mục tiêu cốt lõi:** Các thành viên và AI Agent làm các task Scrum khác nhau **tuyệt đối không sửa code của nhau**, chỉ thêm file/tính năng mới độc lập để **Team Lead tự merge vào `develop` vào cuối tuần mà không gặp bất kỳ xung đột (merge conflict) nào**.

---

## 1. Nguyên Tắc Vàng: "Chỉ Thêm Mới, Không Sửa Cũ" (Additive-Only)

Để đảm bảo 100% không xung đột khi merge nhiều nhánh vào cuối tuần:

| Danh mục | Quy định |
| :--- | :--- |
| **CẤM CHẠM VÀO (Locked Hotspots)** | `backend/main.py`<br>`backend/app/core/*`<br>`backend/app/api/__init__.py`<br>`backend/app/models/auth.py`<br>`backend/app/models/__init__.py`<br>`backend/app/services/seed_service.py` |
| **ĐƯỢC PHÉP TẠO MỚI** | `backend/app/api/endpoints/<ten_tinh_nang>.py`<br>`backend/app/models/<ten_model>.py`<br>`backend/app/schemas/<ten_schema>.py`<br>`backend/app/services/<ten_service>.py`<br>`backend/tests/test_<ten_tinh_nang>.py` |
| **CƠ CHẾ AUTO-LOAD** | Backend đã có sẵn cơ chế **Auto-Discovery**: Mọi file router mới trong `app/api/endpoints/` và model mới trong `app/models/` sẽ **tự động nạp** vào hệ thống mà không cần sửa `main.py`. |

---

## 2. Quy Chuẩn Đặt Tên Nhánh (Branch Convention)

Mỗi nhiệm vụ trong Backlog/Scrum bắt buộc phải làm trên một nhánh độc lập tách từ `develop`:

```bash
feature/scrum-<id>-<mo_ta_ngan>
```

**Ví dụ hợp lệ:**
- `feature/scrum-208-order-creation`
- `feature/scrum-209-inventory-check`
- `feature/scrum-210-customer-debts`

---

## 3. Quy Trình Làm Việc Hàng Ngày Dành Cho Dev & AI Agent

### Bước 1: Khởi tạo nhánh từ `develop` mới nhất
Trước khi bắt đầu bất kỳ task nào, dev hoặc agent phải kéo code mới nhất từ nhánh `develop`:
```bash
git checkout develop
git pull origin develop
git checkout -b feature/scrum-<id>-<ten_tinh_nang>
```

### Bước 2: Triển khai tính năng (Chỉ tạo file mới)
1. **Endpoint**: Tạo file `backend/app/api/endpoints/<ten_tinh_nang>.py`.
   Khai báo `router = APIRouter(prefix="/<ten>", tags=["..."])`.
2. **Model**: Nếu có bảng dữ liệu mới, tạo file `backend/app/models/<ten_model>.py` kế thừa từ `Base` (import từ `app.core.database`).
3. **Schema / Service**: Tạo file tương ứng trong `app/schemas/` và `app/services/`.
4. **Test**: Viết unit test trong `backend/tests/test_<ten_tinh_nang>.py`.

### Bước 3: Tự kiểm tra phạm vi (Pre-commit Blast Radius Check)
Trước khi commit, bắt buộc kiểm tra xem có vô tình sửa file dùng chung không:
```bash
git status
```
* **Hợp lệ:** Chỉ thấy các file mới tạo (`Untracked files`) hoặc file thuộc đúng tính năng đó.
* **KHÔNG hợp lệ:** Xuất hiện `modified: backend/main.py` hoặc `modified: app/core/...`. Nếu có, phải revert lại file đó ngay:
  ```bash
  git checkout -- backend/main.py
  ```

### Bước 4: Chạy kiểm thử tự động
```bash
cd backend
python -m pytest
```
Đảm bảo tất cả 27 test cũ và các test mới đều PASS (100% xanh).

### Bước 5: Commit và Push lên remote
```bash
git add .
git commit -m "feat(scrum-<id>): them tinh nang <ten_tinh_nang>"
git push origin feature/scrum-<id>-<ten_tinh_nang>
```

---

## 4. Quy Trình Cuối Tuần Dành Cho Team Lead (Weekend Merge)

Vào cuối tuần, Team Lead sẽ gom và merge tất cả các feature branch vào nhánh `develop`.

Vì tất cả các Agent và Dev đều tuân thủ nguyên tắc **Additive-Only (chỉ thêm file độc lập)**, quá trình merge sẽ diễn ra **hoàn toàn tự động, 0 xung đột**.

### Cách 1: Merge tuần tự từng branch qua dòng lệnh (Khuyên dùng)
```bash
# 1. Chuyển về develop và cập nhật mới nhất
git checkout develop
git pull origin develop

# 2. Lấy danh sách các nhánh feature cần merge
git fetch --all

# 3. Merge lần lượt từng nhánh vào develop
git merge origin/feature/scrum-208-order-creation -m "merge: hoan tat scrum-208"
git merge origin/feature/scrum-209-inventory-check -m "merge: hoan tat scrum-209"
git merge origin/feature/scrum-210-customer-debts -m "merge: hoan tat scrum-210"

# 4. Chạy toàn bộ test suite để nghiệm thu
python -m pytest

# 5. Đẩy nhánh develop đã hoàn thiện lên server
git push origin develop
```

### Cách 2: Sử dụng Script tự động merge tất cả nhánh feature (PowerShell)
Team Lead có thể chạy script ngắn này vào chiều Chủ Nhật:
```powershell
# Chuyển về develop
git checkout develop
git pull origin develop

# Lấy tất cả nhánh feature trên remote
$branches = git branch -r | Select-String "origin/feature/scrum-"

foreach ($b in $branches) {
    $branchName = $b.ToString().Trim()
    Write-Host "Dang merge $branchName vao develop..." -ForegroundColor Cyan
    git merge $branchName --no-edit
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Phat hien xung dot tai $branchName! Dung lai de kiem tra." -ForegroundColor Red
        break
    }
}

Write-Host "Kiem tra toan bo test suite..." -ForegroundColor Yellow
python -m pytest

if ($LASTEXITCODE -eq 0) {
    Write-Host "Test xanh 100%! Dang push develop len remote..." -ForegroundColor Green
    git push origin develop
}
```

---

## 5. Bảng Tóm Tắt Khắc Phục Sự Cố Cho Agent

| Tình huống | Hành động đúng của Agent |
| :--- | :--- |
| **Agent cần đăng ký router mới** | Chỉ cần đặt file trong `app/api/endpoints/` có biến `router = APIRouter(...)`. Hệ thống tự động nạp. **CẤM sửa `main.py`**. |
| **Agent cần thêm model DB mới** | Tạo file riêng trong `app/models/` kế thừa `Base`. Hệ thống tự động nạp. **CẤM sửa `models/auth.py`**. |
| **Agent thấy hàm tiện ích trong `core/` chưa đủ tính năng** | Viết hàm helper riêng trong `app/services/` của tính năng đó. **CẤM sửa trực tiếp `app/core/`**. |
| **Branch bị báo conflict khi pull** | Tuyệt đối không force push (`git push -f`). Báo lại cho Team Lead để kiểm tra file nào bị chạm ngoài phạm vi. |
