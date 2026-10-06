import { User } from '../types/User';
import { apiClient } from '../api/client';
import { mapBackendUserToFrontend } from './authService';
import { initialUsers } from '../mock/users';
import { getStorageItem, setStorageItem } from './storage';
import { validateVNPhoneNumber } from '../utils/phoneUtils';

const STORAGE_KEY = 'kv_users';

// Chuyển đổi Role từ Frontend sang tên Role chuẩn của Backend DB
function mapFrontendRoleToBackend(role?: string): string {
  switch (role) {
    case 'Admin':
      return 'Admin';
    case 'SalesManager':
      return 'Sales Manager';
    case 'SalesStaff':
      return 'Sales Rep';
    case 'WarehouseManager':
      return 'WH Manager';
    case 'WarehouseStaff':
      return 'Warehouse';
    case 'Accountant':
      return 'Accountant';
    case 'Director':
      return 'Director';
    case 'User':
      return 'Customer';
    default:
      return role || 'Customer';
  }
}

export const userService = {
  // 1. Lấy danh sách người dùng từ CSDL Backend (với fallback bộ nhớ)
  getAll: async (params?: { q?: string; role?: string; is_active?: boolean; page?: number; page_size?: number }): Promise<User[]> => {
    try {
      const query = new URLSearchParams();
      if (params?.q) query.append('q', params.q);
      if (params?.role) query.append('role', mapFrontendRoleToBackend(params.role));
      if (params?.is_active !== undefined) query.append('is_active', String(params.is_active));
      query.append('page', String(params?.page || 1));
      query.append('page_size', String(params?.page_size || 100));

      const response = await apiClient.get(`/users?${query.toString()}`);
      const data = response.data;
      const items = data.items || data || [];
      if (Array.isArray(items) && items.length > 0) {
        const mapped = items.map(mapBackendUserToFrontend);
        setStorageItem(STORAGE_KEY, mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('[userService] Backend offline, fallback to storage:', err);
    }
    return getStorageItem<User[]>(STORAGE_KEY, initialUsers);
  },

  // 2. Tạo tài khoản người dùng mới trong CSDL Backend
  create: async (data: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<User> => {
    let normalizedPhone = data.phone;
    if (data.phone && data.phone.trim()) {
      const phoneVal = validateVNPhoneNumber(data.phone);
      if (!phoneVal.valid) {
        throw new Error(phoneVal.message || 'Số điện thoại không hợp lệ.');
      }
      normalizedPhone = phoneVal.normalized;
    }

    try {
      const backendRole = mapFrontendRoleToBackend(data.role);
      const baseUsername = data.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user';
      const username = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;

      const payload = {
        username: username,
        email: data.email.trim().toLowerCase(),
        full_name: data.name.trim(),
        phone_number: normalizedPhone || null,
        password: data.password || 'Warehouse@1234',
        role: backendRole,
        role_names: data.roles && data.roles.length > 0 ? data.roles.map(mapFrontendRoleToBackend) : [backendRole],
        assigned_warehouse: data.warehouse || data.territory || null,
      };

      const response = await apiClient.post('/users', payload);
      const created = mapBackendUserToFrontend(response.data);
      const cached = getStorageItem<User[]>(STORAGE_KEY, initialUsers);
      setStorageItem(STORAGE_KEY, [created, ...cached]);
      return created;
    } catch (err) {
      console.warn('[userService] Backend error, creating locally:', err);
      const users = getStorageItem<User[]>(STORAGE_KEY, initialUsers);
      const existing = users.find((u) => u.email.toLowerCase() === data.email.toLowerCase().trim());
      if (existing) {
        throw new Error(`Email "${data.email}" đã tồn tại trong hệ thống. Vui lòng nhập email khác.`);
      }

      const newUser: User = {
        ...data,
        phone: normalizedPhone,
        id: `USR-${String(users.length + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString().split('T')[0],
        lastLogin: 'Chưa đăng nhập (Chờ kích hoạt)',
      };
      setStorageItem(STORAGE_KEY, [...users, newUser]);
      return newUser;
    }
  },

  // 3. Cập nhật thông tin tài khoản trong CSDL Backend
  update: async (id: string, data: Partial<User>): Promise<User> => {
    let normalizedPhone = data.phone;
    if (data.phone !== undefined && data.phone !== null && data.phone.trim()) {
      const phoneVal = validateVNPhoneNumber(data.phone);
      if (!phoneVal.valid) {
        throw new Error(phoneVal.message || 'Số điện thoại không hợp lệ.');
      }
      normalizedPhone = phoneVal.normalized;
    }

    try {
      const payload: Record<string, any> = {};

      if (data.name !== undefined) payload.full_name = data.name.trim();
      if (data.phone !== undefined) payload.phone_number = normalizedPhone || null;
      if (data.warehouse !== undefined || data.territory !== undefined) {
        payload.assigned_warehouse = data.warehouse || data.territory || null;
      }
      if (data.role) payload.role = mapFrontendRoleToBackend(data.role);
      if (data.roles && data.roles.length > 0) {
        payload.role_names = data.roles.map(mapFrontendRoleToBackend);
      }
      if (data.status) payload.is_active = data.status === 'active';

      const response = await apiClient.put(`/users/${id}`, payload);
      const updated = mapBackendUserToFrontend(response.data);
      const users = getStorageItem<User[]>(STORAGE_KEY, initialUsers);
      const idx = users.findIndex((u) => u.id === id);
      if (idx !== -1) {
        users[idx] = updated;
        setStorageItem(STORAGE_KEY, [...users]);
      }
      return updated;
    } catch (err) {
      console.warn('[userService] Backend error, updating locally:', err);
      const users = getStorageItem<User[]>(STORAGE_KEY, initialUsers);
      const index = users.findIndex((u) => u.id === id);
      if (index === -1) throw new Error('Không tìm thấy người dùng');

      const updated = {
        ...users[index],
        ...data,
        ...(data.phone !== undefined ? { phone: normalizedPhone } : {}),
      };
      users[index] = updated;
      setStorageItem(STORAGE_KEY, [...users]);
      return updated;
    }
  },

  // 4. Khóa tài khoản trong CSDL Backend (SCRUM-207)
  lockAccount: async (id: string, reason: string, handoverTo?: string): Promise<User> => {
    if (!reason || !reason.trim()) {
      throw new Error('Bắt buộc phải ghi rõ lý do khóa tài khoản.');
    }

    await apiClient.post(`/users/${id}/lock`, {
      reason: reason.trim(),
    });

    // Lấy lại thông tin user đã cập nhật
    const allUsers = await userService.getAll();
    const updated = allUsers.find((u) => u.id === id);
    if (!updated) throw new Error('Không tìm thấy người dùng sau khi khóa');
    return updated;
  },

  // 5. Mở khóa tài khoản trong CSDL Backend (SCRUM-207)
  unlockAccount: async (id: string): Promise<User> => {
    await apiClient.post(`/users/${id}/unlock`);

    const allUsers = await userService.getAll();
    const updated = allUsers.find((u) => u.id === id);
    if (!updated) throw new Error('Không tìm thấy người dùng sau khi mở khóa');
    return updated;
  },

  // 6. Xóa / Khóa tài khoản
  delete: async (id: string): Promise<boolean> => {
    // Để đảm bảo tính toàn vẹn dữ liệu hệ thống kho, ta chuyển thành khóa tài khoản
    await apiClient.post(`/users/${id}/lock`, {
      reason: 'Đã xóa / ngừng hoạt động bởi Quản trị viên',
    });
    return true;
  },
};
