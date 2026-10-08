import { User, UserRole } from '../types/User';
import { apiClient } from '../api/client';
import { getStorageItem, setStorageItem, removeStorageItem } from './storage';
import { validateVNPhoneNumber } from '../utils/phoneUtils';

const STORAGE_KEYS = {
  CURRENT_USER: 'kv_current_user',
  AUTH_TOKEN: 'kv_auth_token',
  REMEMBER_EMAIL: 'kv_remember_email',
};

// Helper: Chuyển đổi tên vai trò từ Backend DB sang UserRole chuẩn của Frontend
export function mapBackendRoleNameToFrontend(rawRoleName: any): UserRole {
  const str = String(typeof rawRoleName === 'object' && rawRoleName !== null ? rawRoleName.name : rawRoleName || '');
  const norm = str.toUpperCase().replace(/[\s_-]+/g, '');
  if (norm.includes('ADMIN')) return 'Admin';
  if (norm.includes('SALESMGR') || norm.includes('SALESMANAGER') || norm === 'MANAGER') return 'SalesManager';
  if (norm.includes('SALESREP') || norm.includes('SALESSTAFF') || norm === 'SALES') return 'SalesStaff';
  if (norm.includes('WHMANAGER') || norm.includes('WAREHOUSEMGR') || norm.includes('WAREHOUSEMANAGER')) return 'WarehouseManager';
  if (norm.includes('WHSTAFF') || norm.includes('WAREHOUSESTAFF') || norm === 'WAREHOUSE') return 'WarehouseStaff';
  if (norm.includes('ACCOUNTANT') || norm.includes('KETOAN')) return 'Accountant';
  if (norm.includes('DIRECTOR') || norm.includes('GIAMDOC')) return 'Director';
  if (norm.includes('CUSTOMER') || norm.includes('KHACHHANG')) return 'User';
  return 'SalesStaff';
}

// Helper: Chuyển đổi định dạng User từ Backend API sang User của Frontend
export function mapBackendUserToFrontend(apiUser: any): User {
  const rawRole = apiUser.role || '';
  const role: UserRole = mapBackendRoleNameToFrontend(rawRole);

  const displayName = apiUser.full_name || apiUser.username || apiUser.email;
  const isSalesRole = ['SalesManager', 'SalesStaff'].includes(role);
  const location = apiUser.assigned_warehouse || '';

  // Chuyển đổi mảng roles quan hệ từ backend sang các UserRole của frontend
  let mappedRoles: UserRole[] = [];
  if (Array.isArray(apiUser.roles) && apiUser.roles.length > 0) {
    mappedRoles = apiUser.roles.map((r: any) => mapBackendRoleNameToFrontend(r));
  }
  if (!mappedRoles.includes(role)) {
    mappedRoles.unshift(role);
  }
  // Loại bỏ các vai trò trùng lặp
  mappedRoles = Array.from(new Set(mappedRoles));

  return {
    id: String(apiUser.id),
    name: displayName,
    email: apiUser.email,
    role: role,
    roles: mappedRoles,
    status: apiUser.is_active ? 'active' : 'locked',
    avatar: apiUser.avatar_url || apiUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff`,
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

    // Tự động kiểm tra và đồng bộ ảnh đại diện đã tải lên từ backend (SCRUM-364)
    try {
      const avatarRes = await apiClient.get('/user-avatars/me');
      if (avatarRes.data?.avatar_url) {
        user.avatar = avatarRes.data.avatar_url;
      }
    } catch {
      // Bỏ qua nếu người dùng chưa cài đặt avatar
    }

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

    try {
      const avatarRes = await apiClient.get('/user-avatars/me');
      if (avatarRes.data?.avatar_url) {
        user.avatar = avatarRes.data.avatar_url;
      }
    } catch {
      // Bỏ qua nếu người dùng chưa cài đặt avatar
    }

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

  updateProfile: async (data: { name: string; phone: string; avatar?: string }): Promise<User> => {
    const trimmedName = data.name ? data.name.trim() : '';
    if (!trimmedName || trimmedName.length < 2) {
      throw new Error('Họ và tên không được để trống (tối thiểu 2 ký tự).');
    }

    const phoneValidation = validateVNPhoneNumber(data.phone);
    if (!phoneValidation.valid) {
      throw new Error(phoneValidation.message || 'Số điện thoại không hợp lệ.');
    }

    const currentUser = authService.getCurrentUser();
    // Luôn giữ avatar hợp lệ nhất: data.avatar hoặc currentUser?.avatar
    const effectiveAvatar =
      (data.avatar && data.avatar.trim()) ||
      (currentUser?.avatar && !currentUser.avatar.includes('ui-avatars.com') ? currentUser.avatar : undefined);

    if (effectiveAvatar) {
      try {
        await apiClient.post('/user-avatars/set-url', {
          avatar_url: effectiveAvatar,
        });
      } catch (avatarErr) {
        console.warn('Lỗi đồng bộ avatar URL:', avatarErr);
      }
    }

    try {
      const res = await apiClient.put('/profile/me', {
        full_name: trimmedName,
        phone_number: phoneValidation.normalized || data.phone.trim(),
        avatar_url: effectiveAvatar,
      });
      if (res.data) {
        const user = mapBackendUserToFrontend(res.data);
        if (effectiveAvatar) {
          user.avatar = effectiveAvatar;
        }
        setStorageItem(STORAGE_KEYS.CURRENT_USER, user);
        return user;
      }
    } catch {
      // Fallback local
    }

    if (!currentUser) throw new Error('Chưa đăng nhập');

    const updatedUser: User = {
      ...currentUser,
      name: trimmedName,
      phone: phoneValidation.normalized || data.phone.trim(),
      ...(effectiveAvatar ? { avatar: effectiveAvatar } : {}),
    };

    setStorageItem(STORAGE_KEYS.CURRENT_USER, updatedUser);
    return updatedUser;
  },

  getRememberedEmail: (): string => {
    return getStorageItem<string>(STORAGE_KEYS.REMEMBER_EMAIL, 'admin@warehouse.local');
  },
};
