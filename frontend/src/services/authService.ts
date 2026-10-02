import { User, UserRole } from '../types/User';
import { apiClient } from '../api/client';
import { getStorageItem, setStorageItem, removeStorageItem } from './storage';

const STORAGE_KEYS = {
  CURRENT_USER: 'kv_current_user',
  AUTH_TOKEN: 'kv_auth_token',
  REMEMBER_EMAIL: 'kv_remember_email',
};

// Helper: Chuyển đổi định dạng User từ Backend API sang User của Frontend
export function mapBackendUserToFrontend(apiUser: any): User {
  let role: UserRole = 'Staff';
  const rawRole = apiUser.role || '';

  if (rawRole === 'Admin') role = 'Admin';
  else if (rawRole === 'Sales Manager') role = 'SalesManager';
  else if (rawRole === 'Sales Rep') role = 'SalesStaff';
  else if (rawRole === 'WH Manager') role = 'WarehouseManager';
  else if (rawRole === 'Warehouse') role = 'WarehouseStaff';
  else if (rawRole === 'Accountant') role = 'Accountant';
  else if (rawRole === 'Director') role = 'Director';
  else if (rawRole === 'Customer') role = 'User';
  else role = (rawRole as UserRole) || 'Staff';

  const displayName = apiUser.full_name || apiUser.username || apiUser.email;
  const isSalesRole = ['SalesManager', 'SalesStaff'].includes(role);
  const location = apiUser.assigned_warehouse || '';

  return {
    id: String(apiUser.id),
    name: displayName,
    email: apiUser.email,
    role: role,
    roles: apiUser.roles?.map((r: any) => r.name || r) || [role],
    status: apiUser.is_active ? 'active' : 'locked',
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff`,
    phone: apiUser.phone_number || '',
    warehouse: isSalesRole ? '' : location,
    territory: isSalesRole ? location : '',
    lockReason: apiUser.lock_reason || undefined,
    lastLogin: apiUser.created_at || new Date().toISOString(),
    createdAt: apiUser.created_at || new Date().toISOString(),
  };
};

export const authService = {
  getCurrentUser: (): User | null => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) return null;
    return getStorageItem<User | null>(STORAGE_KEYS.CURRENT_USER, null);
  },

  login: async (emailOrUsername: string, password: string, remember: boolean = true): Promise<User> => {
    // Gọi trực tiếp API Backend FastAPI: POST /api/v1/auth/login
    const response = await apiClient.post('/auth/login', {
      username: emailOrUsername.trim(),
      password: password,
    });

    const data = response.data;
    const { access_token, user: apiUser } = data;

    // Lưu JWT token và thông tin phiên
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, access_token);
    localStorage.setItem('access_token', access_token); // Hỗ trợ tương thích ngược

    const user = mapBackendUserToFrontend(apiUser);
    setStorageItem(STORAGE_KEYS.CURRENT_USER, user);

    if (remember) {
      setStorageItem(STORAGE_KEYS.REMEMBER_EMAIL, emailOrUsername.trim());
    } else {
      removeStorageItem(STORAGE_KEYS.REMEMBER_EMAIL);
    }

    return user;
  },

  getMe: async (): Promise<User> => {
    const response = await apiClient.get('/auth/me');
    const user = mapBackendUserToFrontend(response.data);
    setStorageItem(STORAGE_KEYS.CURRENT_USER, user);
    return user;
  },

  logout: async (): Promise<void> => {
    try {
      // Thu hồi phiên trên Backend Database
      await apiClient.post('/auth/logout');
    } catch {
      // Bỏ qua nếu lỗi mạng hoặc token đã hết hạn
    } finally {
      removeStorageItem(STORAGE_KEYS.CURRENT_USER);
      removeStorageItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem('access_token');
      localStorage.removeItem('kv_session_expires_at');
    }
  },

  switchRole: (role: UserRole): User => {
    const current = authService.getCurrentUser();
    if (!current) throw new Error('Chưa đăng nhập');
    const updated = { ...current, role };
    setStorageItem(STORAGE_KEYS.CURRENT_USER, updated);
    return updated;
  },

  changePassword: async (
    currentPassword: string,
    newPassword: string,
    revokeOtherSessions: boolean = true
  ): Promise<void> => {
    // Gọi trực tiếp Backend FastAPI: POST /api/v1/auth/change-password
    await apiClient.post('/auth/change-password', {
      old_password: currentPassword,
      new_password: newPassword,
      revoke_other_sessions: revokeOtherSessions,
    });
  },

  forgotPassword: async (email: string): Promise<string> => {
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res.data?.message || 'Liên kết đặt lại mật khẩu đã được gửi đến email.';
  },

  resetPassword: async (tokenOrCode: string, newPassword: string): Promise<string> => {
    const res = await apiClient.post('/auth/reset-password', {
      token: tokenOrCode,
      new_password: newPassword,
    });
    return res.data?.message || 'Đặt lại mật khẩu thành công.';
  },

  getRememberedEmail: (): string => {
    return getStorageItem<string>(STORAGE_KEYS.REMEMBER_EMAIL, 'admin@warehouse.local');
  },
};
