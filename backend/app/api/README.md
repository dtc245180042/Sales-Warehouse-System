# THƯ MỤC: backend/app/api/
MỤC ĐÍCH:
- Chứa các Router/Endpoints tiếp nhận request HTTP từ Frontend (GET, POST, PUT, DELETE).
- Xác thực dữ liệu đầu vào bằng Schema và gọi xuống tầng Services để xử lý nghiệp vụ.
- Tuyệt đối không viết câu truy vấn cơ sở dữ liệu hoặc logic phức tạp trực tiếp tại đây.
VÍ DỤ: auth.py, products.py, orders.py.
