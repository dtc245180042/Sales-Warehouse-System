export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  createdAt: string;
  status: 'active' | 'inactive';
}
