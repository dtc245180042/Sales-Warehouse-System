export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  customer_group?: string;
  customerGroup?: string;
  region?: string;
  assigned_sales_rep?: string;
  assignedSalesRep?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  createdAt: string;
  status: 'active' | 'inactive' | 'locked';
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

