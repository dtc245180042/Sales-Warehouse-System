# QUY TẮC PHÁT TRIỂN & CHỈ THỊ DÀNH CHO AI AGENT & THÀNH VIÊN NHÓM
Dự án: **Sales-Warehouse-System_Frontend (OMS Pro)**
Công nghệ: **React 19 + Vite + Vanilla CSS**

---

## 1. CẤU TRÚC THƯ MỤC CỐ ĐỊNH (NGHIÊM CẤM THAY ĐỔI)
Dự án này là một Single Page Application (SPA) độc lập ở tầng Frontend.
- **Thư mục gốc `./` chứa trực tiếp**:
  - `index.html` (Entry point bắt buộc của Vite, **TUYỆT ĐỐI KHÔNG XÓA/DI CHUYỂN**)
  - `package.json`, `package-lock.json`, `vite.config.js`, `eslint.config.js`
  - `src/` (chứa toàn bộ mã nguồn)
  - `public/` (chứa assets tĩnh)
- **CẤM TẠO THÊM THƯ MỤC LỒNG NHAU**: Không tạo thư mục `frontend/` bọc ngoài `./src/`. Toàn bộ file phải nằm theo cây thư mục gốc.

---

## 2. NGUYÊN TẮC QUẢN LÝ GIT & TRÁNH XUNG ĐỘT (MERGE CONFLICTS)
1. **Tuyệt đối KHÔNG xóa trắng hoặc làm trống nhánh `develop`**:
   - Không được chạy lệnh xóa sạch file rồi commit lên `develop`. Hành động này sẽ tạo ra `Modify/Delete Tree Conflicts` phá hỏng toàn bộ các nhánh tính năng của bạn bè.
2. **Quy trình làm việc theo nhánh**:
   - Khi bắt đầu tính năng mới: luôn checkout từ `develop` mới nhất (`git checkout -b feat/<tên-tính-năng>`).
   - Trước khi tạo Pull Request hoặc Merge vào `develop`:
     - Phải kéo cập nhật mới nhất từ `develop` về: `git merge origin/develop` hoặc `git rebase origin/develop`.
     - Phải tự giải quyết conflict trên nhánh của mình trước khi merge vào nhánh chung.
3. **CẤM Force Push (`git push -f`)** lên các nhánh dùng chung: `develop`, `main`.

---

## 3. CHỈ THỊ BẮT BUỘC DÀNH CHO AI AGENTS (ANTIGRAVITY, CURSOR, COPILOT, ETC.)
Mỗi khi AI Agent thực hiện bất kỳ thay đổi nào:
1. **BẮT BUỘC CHẠY KIỂM TRA TRƯỚC KHI KẾT THÚC TASK**:
   - Phải chạy: `npm run lint` (hoặc `cmd /c "npm run lint"` trên Windows) và đạt **0 error, 0 warning**.
   - Phải chạy: `npm run build` (hoặc `cmd /c "npm run build"` trên Windows) và đảm bảo **Build thành công**.
   - **Nghiêm cấm** kết thúc câu trả lời nếu lệnh build hoặc lint đang bị lỗi.
2. **Quy tắc React & JSX**:
   - **KHÔNG ĐƯỢC khai báo Component con lồng bên trong hàm render của Component cha** (vi phạm quy tắc React Hooks `react-hooks/static-components` / `react/no-unstable-nested-components`). Mọi component phụ phải tách ra ngoài component chính hoặc viết thành file riêng.
   - Không khai báo các biến, import, hoặc props không sử dụng (`no-unused-vars`).
3. **Kiến trúc Module hóa (Tránh Monolithic File)**:
   - **KHÔNG tiếp tục dồn toàn bộ code vào `App.jsx`**.
   - Màn hình mới -> Đặt trong `src/pages/` (ví dụ: `UserRoleAssignmentPage.jsx`, `InventoryPage.jsx`).
   - Component tái sử dụng -> Đặt trong `src/components/` (ví dụ: `Navigation.jsx`, `Modal.jsx`).
   - API client -> Đặt trong `src/api/`.
   - Cấu hình menu/phân quyền -> Đặt trong `src/config/`.
4. **Không can thiệp hoặc xóa code của thành viên khác**:
   - Khi tích hợp tính năng, ưu tiên giữ lại giao diện và logic hiện có, chỉ nối ghép qua Routes hoặc Menu điều hướng thay vì ghi đè hoặc xóa tính năng cũ.

---

## 4. BẢO MẬT & DỮ LIỆU
- Không hardcode mật khẩu người dùng hoặc token nhạy cảm trong commit.
- Đối với dữ liệu Mock: Tập trung vào thư mục `src/utils/` hoặc `src/mock/`, tránh khai báo rải rác trong các file UI.
