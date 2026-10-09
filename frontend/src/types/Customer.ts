export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  customer_group?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  createdAt: string;
  status: 'active' | 'inactive';
  assigned_staff_id?: string;
  assignedStaffId?: string;
  assigned_staff_name?: string;
  assignedStaffName?: string;
  assigned_staff_phone?: string;
  assignedStaffPhone?: string;
  assigned_at?: string;
  assignedAt?: string;
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
