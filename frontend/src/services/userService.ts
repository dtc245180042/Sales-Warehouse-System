import { User, UserCanDeleteResponse, UserDeleteResponse } from '../types/User';
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

  // 6. Kiểm tra xem tài khoản có thể xóa cứng hay không (không phụ thuộc dữ liệu)
  canDelete: async (id: string): Promise<UserCanDeleteResponse> => {
    try {
      const res = await apiClient.get<UserCanDeleteResponse>(`/users/${id}/can-delete`);
      return res.data;
    } catch (err: any) {
      console.warn('[userService] canDelete API error, using fallback:', err);
      // Fallback khi offline
      const users = getStorageItem<User[]>(STORAGE_KEY, initialUsers);
      const target = users.find((u) => u.id === id);
      const isDefaultUser = id === '1' || target?.name?.toLowerCase().includes('admin') || target?.email?.includes('admin');

      if (isDefaultUser) {
        return {
          user_id: id,
          username: target?.email || id,
          can_delete: false,
          has_dependencies: true,
          dependencies: { orders_count: 0, stock_receipts_count: 0, price_lists_count: 0, audit_logs_count: 0 },
          reason: 'Tài khoản Quản trị viên gốc không được phép xóa.',
          suggested_action: 'none',
        };
      }

      const hasMockHistory = ['1', '2', '3'].includes(id) || Boolean(target?.assignedDealersCount && target.assignedDealersCount > 0);
      if (hasMockHistory) {
        return {
          user_id: id,
          username: target?.email || id,
          can_delete: false,
          has_dependencies: true,
          dependencies: { orders_count: 3, stock_receipts_count: 1, price_lists_count: 0, audit_logs_count: 5 },
          reason: `Tài khoản '${target?.name || id}' đã phát sinh giao dịch trong hệ thống (3 đơn hàng, 1 phiếu kho). Không thể xóa vĩnh viễn để bảo vệ toàn vẹn dữ liệu.`,
          suggested_action: 'lock',
        };
      }

      return {
        user_id: id,
        username: target?.email || id,
        can_delete: true,
        has_dependencies: false,
        dependencies: { orders_count: 0, stock_receipts_count: 0, price_lists_count: 0, audit_logs_count: 0 },
        reason: `Tài khoản '${target?.name || id}' chưa phát sinh dữ liệu giao dịch phụ thuộc. Có thể xóa vĩnh viễn an toàn.`,
        suggested_action: 'delete',
      };
    }
  },

  // 7. Xóa vĩnh viễn tài khoản (Hard delete nếu không phụ thuộc dữ liệu)
  delete: async (id: string): Promise<UserDeleteResponse> => {
    try {
      const res = await apiClient.delete<UserDeleteResponse>(`/users/${id}`);
      // Dọn dẹp local storage nếu có
      const users = getStorageItem<User[]>(STORAGE_KEY, initialUsers);
      const remaining = users.filter((u) => u.id !== id);
      setStorageItem(STORAGE_KEY, remaining);
      return res.data;
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || 'Lỗi khi xóa người dùng';
      throw new Error(errMsg);
    }
  },
};
