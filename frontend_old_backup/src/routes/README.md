# THƯ MỤC: src/routes/
MỤC ĐÍCH:
- Cấu hình định tuyến toàn bộ ứng dụng (dùng react-router-dom).
- Thiết lập phân quyền truy cập (PrivateRoute / ProtectedRoute): chặn người chưa đăng nhập hoặc không đúng Role.
VÍ DỤ:
- AppRoutes.jsx (khai báo danh sách các path và component tương ứng)
- ProtectedRoute.jsx (kiểm tra token trước khi cho vào trang quản trị)
