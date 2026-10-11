import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// gắn token vào môi request
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('kv_auth_token') || localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Tự động xóa Content-Type để Axios và trình duyệt tự động đính kèm multipart/form-data cùng boundary chuẩn
    if (config.data instanceof FormData && config.headers) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// bắt lỗi sử dụng api không lợp lệ dùng sai quyền 
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      // xử lý 401
      if (status === 401 && !error.config?.url?.includes('/auth/login')) {
        localStorage.removeItem('kv_auth_token');
        localStorage.removeItem('kv_current_user');
        window.dispatchEvent(
          new CustomEvent('auth:unauthorized', {
            detail: data?.detail || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
          })
        );
      }

      const detailMsg = data?.detail;
      let finalMessage = 'Có lỗi xảy ra khi kết nối máy chủ.';

      if (typeof detailMsg === 'string') {
        finalMessage = detailMsg;
      } else if (Array.isArray(detailMsg) && detailMsg.length > 0) {
        //kiểm tra lỗi 422
        finalMessage = detailMsg.map((err) => `${err.loc?.slice(-1)?.[0] || 'Trường'}: ${err.msg}`).join(', ');
      } else if (data?.message) {
        finalMessage = data.message;
      }

      const enhancedError = new Error(finalMessage);
      (enhancedError as any).status = status;
      (enhancedError as any).data = data;
      return Promise.reject(enhancedError);
    }

    // Kiểm tra kết nối mạng hoặc server không phản hồi
    const networkError = new Error('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng hoặc thử lại sau.');
    (networkError as any).status = 503;
    return Promise.reject(networkError);
  }
);
