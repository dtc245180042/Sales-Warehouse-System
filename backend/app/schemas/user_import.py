from typing import Optional, List, Any
from pydantic import BaseModel, Field


class UserImportRow(BaseModel):
    """Chi tiết một dòng dữ liệu từ file Excel import."""
    row_index: int = Field(..., description="Số thứ tự dòng trong file Excel (bắt đầu từ dòng dữ liệu 2)")
    username: Optional[str] = Field(None, description="Tên đăng nhập")
    email: Optional[str] = Field(None, description="Địa chỉ email")
    full_name: Optional[str] = Field(None, description="Họ và tên")
    phone_number: Optional[str] = Field(None, description="Số điện thoại")
    role: Optional[str] = Field(None, description="Vai trò hệ thống")
    assigned_warehouse: Optional[str] = Field(None, description="Kho phụ trách")
    password: Optional[str] = Field(None, description="Mật khẩu tùy chọn")
    is_valid: bool = Field(..., description="Dòng hợp lệ để nhập vào CSDL")
    errors: List[str] = Field(default_factory=list, description="Danh sách các lỗi phát hiện trên dòng này")


class UserImportPreviewResponse(BaseModel):
    """Kết quả đọc và kiểm tra trước (preview) tệp Excel."""
    filename: str = Field(..., description="Tên file đã tải lên")
    total_rows: int = Field(..., description="Tổng số dòng dữ liệu")
    valid_count: int = Field(..., description="Số dòng hợp lệ")
    invalid_count: int = Field(..., description="Số dòng có lỗi")
    rows: List[UserImportRow] = Field(default_factory=list, description="Danh sách chi tiết từng dòng")


class CreatedUserInfo(BaseModel):
    """Thông tin tóm tắt của tài khoản được tạo thành công."""
    id: int
    username: str
    email: str
    role: str
    full_name: Optional[str] = None
    temporary_password: Optional[str] = None


class RowErrorInfo(BaseModel):
    """Thông tin dòng bị lỗi bị bỏ qua."""
    row_index: int
    username: Optional[str] = None
    email: Optional[str] = None
    errors: List[str]


class UserImportSummaryResponse(BaseModel):
    """Báo cáo tổng kết sau khi thực hiện import một phần."""
    total_processed: int = Field(..., description="Tổng số dòng được xử lý")
    success_count: int = Field(..., description="Số tài khoản được tạo thành công")
    failed_count: int = Field(..., description="Số dòng bị bỏ qua do lỗi")
    created_users: List[CreatedUserInfo] = Field(default_factory=list, description="Danh sách người dùng đã tạo")
    row_errors: List[RowErrorInfo] = Field(default_factory=list, description="Chi tiết các dòng bị bỏ qua kèm lý do")
    message: str = Field(..., description="Thông báo kết quả chung")
