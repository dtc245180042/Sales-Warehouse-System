export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  customer_group?: string;
  customerGroup?: string;
  tax_code?: string;
  taxCode?: string;
  region?: string;
  assigned_sales_rep?: string;
  assignedSalesRep?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  createdAt: string;
  status: 'active' | 'inactive' | 'locked' | string;
  isLocked?: boolean;
  lockReason?: string;
  lockedAt?: string;
  lockedBy?: string;
  assigned_staff_id?: string;
  assignedStaffId?: string;
  assigned_staff_name?: string;
  assignedStaffName?: string;
  assigned_staff_phone?: string;
  assignedStaffPhone?: string;
  assigned_at?: string;
  assignedAt?: string;
  credit_limit?: number;
  creditLimit?: number;
  current_debt?: number;
  currentDebt?: number;
  max_debt_days?: number;
  maxDebtDays?: number;
  available_credit?: number;
  availableCredit?: number;
}

export interface SalesRep {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  isActive: boolean;
  assignedCustomerCount: number;
}

export interface CustomerAssignmentBrief {
  id?: number;
  customerId: string;
  customerName?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  assignedStaffPhone?: string;
  assignedBy?: string;
  assignedAt?: string;
}

export interface CustomerAssignmentHistory {
  id: number;
  batchId?: string;
  customerId: string;
  customerName: string;
  fromStaffId?: string;
  fromStaffName?: string;
  toStaffId?: string;
  toStaffName?: string;
  actionType: string;
  reason: string;
  performedBy: string;
  createdAt?: string;
}

export interface CustomerFilterParams {
  search?: string;
  customer_group?: string;
  region?: string;
  assigned_sales_rep?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface CustomerPaginatedResponse {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CustomerFilterOptions {
  regions: string[];
  customer_groups: string[];
  sales_reps: string[];
  statuses: string[];
}
