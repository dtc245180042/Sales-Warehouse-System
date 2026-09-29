-scrum 204 Là người dùng của hệ thống, tôi muốn nhận thông báo rõ ràng khi truy cập nhầm chỗ hoặc không đủ quyền, để biết mình nên làm gì tiếp thay vì gặp một trang trắng :
+Trang báo lỗi dùng chung giao diện ứng dụng

+Mỗi trang lỗi có một hành động gợi ý để quay lại luồng làm việc

-scrum 207 Là Quản trị hệ thống, tôi muốn khoá và mở khoá tài khoản, để chặn ngay quyền tạo đơn khi một nhân viên nghỉ việc:
Tài khoản bị khoá không đăng nhập được và bị thu hồi phiên đang mở

Bắt buộc ghi lý do khoá

Đại lý do nhân viên bị khoá phụ trách được cảnh báo cần bàn giao

-scrum 203 Là người dùng của hệ thống, tôi muốn thấy menu điều hướng đúng theo quyền của mình, để không bị rối bởi những chức năng mình không được dùng:
Mục menu không thuộc quyền thì không hiển thị

Hiển thị tên, vai trò và kho hoặc địa bàn đang làm việc

Dùng được thuận tiện trên màn hình 360px
-scrum206 Là Quản trị hệ thống, tôi muốn gán vai trò và gắn người dùng với kho hoặc địa bàn, để thủ kho chỉ thao tác được trên kho mình phụ trách:

Một người dùng có thể giữ nhiều vai trò cùng lúc

Người dùng thuộc vai trò kho phải gắn với ít nhất một kho cụ thể

Không thể tự thu hồi vai trò quản trị của chính mình

-scrum200 Là người dùng của hệ thống, tôi muốn đặt lại mật khẩu khi quên thông qua email, để tự lấy lại quyền truy cập khi đang đi thị trường mà không gọi được về văn phòng:
Nhập email nhận được liên kết đặt lại có hiệu lực 30 phút

Liên kết chỉ dùng được một lần

Email không tồn tại vẫn hiển thị cùng một thông báo
-scrum 198: Là người dùng của hệ thống, tôi muốn đăng nhập bằng tài khoản và mật khẩu, để truy cập được phần việc của mình mà dữ liệu giá vốn không lọt ra ngoài:
Đăng nhập đúng thì vào được trang chủ tương ứng với vai trò

Sai thông tin hiển thị thông báo chung, không tiết lộ tài khoản có tồn tại hay không

Khoá tạm 15 phút sau 5 lần sai liên tiếp
-scum 201 Là người dùng của hệ thống, tôi muốn đổi mật khẩu khi đang đăng nhập, để chủ động bảo vệ tài khoản sau khi được cấp mật khẩu tạm.:
Bắt buộc nhập mật khẩu hiện tại

Mật khẩu mới tối thiểu 8 ký tự, có chữ và số

Đổi xong thu hồi các phiên đăng nhập khác
-scum 202 Là Quản trị hệ thống, tôi muốn phân quyền theo vai trò cho toàn hệ thống, để đảm bảo nhân viên kinh doanh không sửa được tồn kho và thủ kho không xem được giá vốn.:
Khai báo được quyền cho từng vai trò trong bảy vai trò nghiệp vụ

Mọi chức năng đều kiểm quyền ở tầng server, mặc định là từ chối

Giá vốn và biên lợi nhuận chỉ lộ ra với vai trò Quản lý kinh doanh

Có kiểm thử tự động cho ít nhất ba vai trò
-scum 199Là người dùng của hệ thống, tôi muốn duy trì phiên đăng nhập và đăng xuất an toàn, để không mất đơn đang gõ dở khi mạng ở cửa hàng chập chờn.:
Phiên được gia hạn tự động khi còn hoạt động

Đăng xuất làm mất hiệu lực phiên ngay lập tức phía server

Phiên hết hạn đưa về trang đăng nhập kèm thông báo rõ ràng
-scrum205Là Quản trị hệ thống, tôi muốn tạo, sửa và tìm kiếm tài khoản người dùng, để cấp quyền cho nhân viên kinh doanh mới ngay ngày đầu họ nhận địa bàn.:
Tạo tài khoản gửi email kích hoạt kèm mật khẩu tạm

Tài khoản trùng bị từ chối kèm thông báo cụ thể

Tìm theo tên, tài khoản, số điện thoại; lọc theo vai trò và trạng thái

Danh sách phân trang, mặc định 20 dòng

