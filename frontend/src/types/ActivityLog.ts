// ActivityLog type definitions

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VIEW'
  | 'EXPORT'
  | 'IMPORT'
  | 'APPROVE'
  | 'REJECT'
  | 'LOCK'
  | 'UNLOCK'
  | 'RESET_PASSWORD'
  | 'ASSIGN_ROLE'
  | 'CHANGE_STATUS';

export type ActivityModule =
  | 'AUTH'
  | 'USER_MANAGEMENT'
  | 'PRODUCT'
  | 'INVENTORY'
  | 'ORDER'
  | 'CUSTOMER'
  | 'SUPPLIER'
  | 'REPORT'
  | 'SETTINGS';

export type ActivityStatus = 'success' | 'failed' | 'warning';

export interface ActivityLog {
  id: string;
  timestamp: string; // ISO datetime string
  userId: string;
  userName: string;
  userRole: string;
  userAvatar?: string;
  action: ActivityAction;
  module: ActivityModule;
  target: string; // e.g. "Sản phẩm #SP-001", "Người dùng: Nguyễn Văn A"
  detail: string; // Human-readable description
  ipAddress: string;
  device?: string; // Tên thiết bị / hệ điều hành / trình duyệt (Ví dụ: Windows 11 · Chrome)
  status: ActivityStatus;
  metadata?: Record<string, string | number | boolean>;
}
