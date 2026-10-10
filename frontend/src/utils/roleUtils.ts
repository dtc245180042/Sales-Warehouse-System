import { UserRole } from '../types/User';

export const getHomePathForRole = (role?: UserRole): string => {
  switch (role) {
    case 'Admin':
      return '/users'; // Trung tâm quản trị người dùng & phân quyền Sprint 1
    case 'Customer':
    case 'User':
      return '/portal/order';
    case 'SalesManager':
    case 'SalesStaff':
    case 'WarehouseManager':
    case 'WarehouseStaff':
    case 'Accountant':
    case 'Director':
    default:
      return '/dashboard'; // Bảng điều khiển phân quyền Sprint 1
  }
};

export const getRoleDisplayName = (role?: UserRole): string => {
  switch (role) {
    case 'Admin':
      return 'Quản trị hệ thống';
    case 'SalesManager':
      return 'Quản lý kinh doanh';
    case 'SalesStaff':
      return 'Nhân viên kinh doanh';
    case 'WarehouseManager':
      return 'Quản lý kho';
    case 'WarehouseStaff':
      return 'Thủ kho';
    case 'Accountant':
      return 'Kế toán';
    case 'Director':
      return 'Ban giám đốc';
    case 'Manager':
      return 'Quản lý';
    case 'Staff':
      return 'Nhân viên';
    case 'Customer':
    case 'User':
      return 'Đại lý / Khách hàng';
    default:
      return role || 'Người dùng';
  }
};

export const getHomeTitleForRole = (role?: UserRole): string => {
  switch (role) {
    case 'Admin':
      return 'Về Quản lý người dùng';
    default:
      return 'Về Bảng điều khiển';
  }
};
