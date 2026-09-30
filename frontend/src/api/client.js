// API Client kết nối trực tiếp với FastAPI backend
const API_BASE_URL = 'http://localhost:8000/api/v1';

/**
 * Hàm gọi API tổng quát có tự động gán Bearer Token và xử lý lỗi chuẩn RESTful
 */
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('access_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      // Nếu bị 401 Unauthorized (Phiên hết hạn hoặc bị server thu hồi)
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        window.dispatchEvent(
          new CustomEvent('auth:unauthorized', {
            detail: data?.detail || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          })
        );
      }

      const errorMessage = data?.detail || data?.message || 'Có lỗi xảy ra khi kết nối máy chủ.';
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.status) throw error;
    // Lỗi mạng hoặc server không phản hồi
    const networkError = new Error('Không thể kết nối đến máy chủ Backend (cổng 8000). Vui lòng kiểm tra lại dịch vụ.');
    networkError.status = 503;
    throw networkError;
  }
}

// -----------------------------------------------------------------------------
// 1. NHÓM API XÁC THỰC & BẢO MẬT TÀI KHOẢN (SCRUM-198, 199, 200, 201, 202)
// -----------------------------------------------------------------------------
export const authApi = {
  // SCRUM-198: Đăng nhập tài khoản
  login: (credentials) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  // SCRUM-199: Lấy thông tin người dùng đang đăng nhập
  getMe: () =>
    request('/auth/me', {
      method: 'GET',
    }),

  // SCRUM-199: Đăng xuất & thu hồi phiên phía server ngay lập tức
  logout: () =>
    request('/auth/logout', {
      method: 'POST',
    }),

  // SCRUM-199: Gia hạn phiên tự động
  refresh: () =>
    request('/auth/refresh', {
      method: 'POST',
    }),

  // SCRUM-200: Quên mật khẩu qua email (link 30 phút)
  forgotPassword: (payload) =>
    request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // SCRUM-200: Đặt lại mật khẩu bằng token
  resetPassword: (payload) =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // SCRUM-201: Đổi mật khẩu khi đang đăng nhập (thu hồi phiên khác)
  changePassword: (payload) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // SCRUM-202: Báo cáo Giá vốn & Biên lợi nhuận (Chỉ dành cho Sales Manager & Admin)
  getFinancialCostAndMargin: () =>
    request('/auth/financial/cost-and-margin', {
      method: 'GET',
    }),
};

// -----------------------------------------------------------------------------
// 2. NHÓM API QUẢN TRỊ TÀI KHOẢN DÀNH CHO ADMIN (SCRUM-205, 206, 207)
// -----------------------------------------------------------------------------
export const usersApi = {
  // SCRUM-205: Danh sách phân trang 20 dòng, tìm kiếm theo tên, user, SĐT; lọc theo role/trạng thái
  getUsers: ({ q = '', role = '', is_active = '', page = 1, page_size = 20 } = {}) => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (role) params.append('role', role);
    if (is_active !== '' && is_active !== null && is_active !== undefined) {
      params.append('is_active', String(is_active));
    }
    params.append('page', String(page));
    params.append('page_size', String(page_size));

    return request(`/users?${params.toString()}`, {
      method: 'GET',
    });
  },

  // SCRUM-205, 206: Tạo tài khoản mới kèm mật khẩu tạm & ràng buộc kho
  createUser: (userData) =>
    request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  // SCRUM-206: Chỉnh sửa thông tin, vai trò, kho phụ trách (chặn tự tước quyền admin)
  updateUser: (userId, userData) =>
    request(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    }),

  // SCRUM-207: Khóa tài khoản (bắt buộc lý do, thu hồi phiên ngay, cảnh báo bàn giao đại lý)
  lockUser: (userId, { reason }) =>
    request(`/users/${userId}/lock`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // SCRUM-207: Mở khóa tài khoản
  unlockUser: (userId) =>
    request(`/users/${userId}/unlock`, {
      method: 'POST',
    }),
};
