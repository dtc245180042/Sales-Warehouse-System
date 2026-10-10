export type BusinessRole = 
  | 'Admin'             // Quản trị hệ thống
  | 'SalesManager'      // Quản lý kinh doanh (xem giá vốn, biên lợi nhuận)
  | 'SalesStaff'        // Nhân viên kinh doanh (gắn địa bàn)
  | 'WarehouseManager'  // Quản lý kho (gắn kho)
  | 'WarehouseStaff'    // Thủ kho (gắn kho, không xem giá vốn)
  | 'Accountant'        // Kế toán
  | 'Director';         // Ban giám đốc

export type UserRole = BusinessRole | 'Manager' | 'Staff' | 'User' | 'Customer';

export type UserStatus = 'active' | 'inactive' | 'locked';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  roles?: UserRole[];
  status: UserStatus;
  avatar: string;
  phone?: string;
  department?: string;
  warehouse?: string;
  territory?: string;
  assignedDealersCount?: number;
  assignedDealers?: string[];
  lockReason?: string;
  lockedAt?: string;
  handoverTo?: string;
  lastLogin: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface UserDependencyDetails {
  orders_count: number;
  stock_receipts_count: number;
  price_lists_count: number;
  audit_logs_count: number;
}

export interface UserCanDeleteResponse {
  user_id: number | string;
  username: string;
  full_name?: string;
  can_delete: boolean;
  has_dependencies: boolean;
  dependencies: UserDependencyDetails;
  reason: string;
  suggested_action: 'delete' | 'lock' | 'none';
}

export interface UserDeleteResponse {
  success: boolean;
  message: string;
  deleted_user_id: number | string;
  action_taken: string;
}

