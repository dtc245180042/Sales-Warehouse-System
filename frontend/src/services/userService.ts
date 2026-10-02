import { User } from '../types/User';
import { apiClient } from '../api/client';
import { mapBackendUserToFrontend } from './authService';

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
  // 1. Lấy danh sách người dùng từ CSDL Backend
  getAll: async (params?: { q?: string; role?: string; is_active?: boolean; page?: number; page_size?: number }): Promise<User[]> => {
    const query = new URLSearchParams();
    if (params?.q) query.append('q', params.q);
    if (params?.role) query.append('role', mapFrontendRoleToBackend(params.role));
    if (params?.is_active !== undefined) query.append('is_active', String(params.is_active));
    query.append('page', String(params?.page || 1));
    query.append('page_size', String(params?.page_size || 100));

    const response = await apiClient.get(`/users?${query.toString()}`);
    const data = response.data;
    const items = data.items || data || [];
    return items.map(mapBackendUserToFrontend);
  },

  // 2. Tạo tài khoản người dùng mới trong CSDL Backend
  create: async (data: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<User> => {
    const backendRole = mapFrontendRoleToBackend(data.role);
    const username = data.email.split('@')[0] + Math.floor(Math.random() * 1000);

    const payload = {
      username: username,
      email: data.email.trim().toLowerCase(),
      full_name: data.name,
      phone_number: data.phone || null,
      password: data.password || 'Warehouse@1234', // Mật khẩu mặc định/tạm nếu không nhập
      role: backendRole,
      assigned_warehouse: data.warehouse || null,
    };

    const response = await apiClient.post('/users', payload);
    return mapBackendUserToFrontend(response.data);
  },

  // 3. Cập nhật thông tin tài khoản trong CSDL Backend
  update: async (id: string, data: Partial<User>): Promise<User> => {
    const payload: Record<string, any> = {};

    if (data.name !== undefined) payload.full_name = data.name;
    if (data.phone !== undefined) payload.phone_number = data.phone;
    if (data.warehouse !== undefined) payload.assigned_warehouse = data.warehouse;
    if (data.role) payload.role = mapFrontendRoleToBackend(data.role);
    if (data.status) payload.is_active = data.status === 'active';

    const response = await apiClient.put(`/users/${id}`, payload);
    return mapBackendUserToFrontend(response.data);
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
