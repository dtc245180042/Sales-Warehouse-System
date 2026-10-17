export type TargetStatus = 'active' | 'locked';
export type TargetScope = 'individual' | 'territory'; // Cá nhân hoặc khu vực

export interface SalesTarget {
  id: string;
  year: number;
  month: number;              // 1-12
  period: string;             // "Tháng 10/2026"
  scope: TargetScope;
  userId?: string;            // Nếu scope = individual
  userName?: string;
  userRole?: string;
  territory?: string;         // Nếu scope = territory (Hà Nội, TP. HCM, Đà Nẵng, Miền Tây...)
  targetRevenue: number;      // Chỉ tiêu doanh số (VND)
  targetOrders?: number;      // Chỉ tiêu số đơn hàng
  status: TargetStatus;
  lockedAt?: string;
  lockedBy?: string;
  lockedByName?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SalesTargetCreateRequest {
  year: number;
  month: number;
  scope: TargetScope;
  userId?: string;
  userName?: string;
  territory?: string;
  targetRevenue: number;
  targetOrders?: number;
}

export interface SalesTargetUpdateRequest {
  targetRevenue?: number;
  targetOrders?: number;
  reason?: string; // Bắt buộc nếu chỉ tiêu đã bị locked (SCRUM-805)
}

export interface SalesTargetProgressItem {
  targetId: string;
  scope: TargetScope;
  userId?: string;
  userName?: string;
  userRole?: string;
  territory?: string;
  targetRevenue: number;
  currentRevenue: number;
  remainingRevenue: number;
  revenuePercentage: number;
  targetOrders: number;
  currentOrders: number;
  ordersPercentage: number;
  status: TargetStatus;
}

export interface SalesTargetAuditRecord {
  id: string;
  targetId: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: 'CREATE' | 'UPDATE' | 'UPDATE_LOCKED' | 'LOCK';
  oldRevenue?: number;
  newRevenue?: number;
  reason?: string;
  changeSummary: string;
}
