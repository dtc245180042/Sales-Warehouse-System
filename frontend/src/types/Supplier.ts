export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  totalImports: number;
  totalSpent: number;
  createdAt: string;
  status: 'active' | 'inactive';
}
