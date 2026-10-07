export interface Supplier {
  id: string;
  code: string;
  name: string;
  taxCode?: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms?: string;
  totalImports: number;
  totalSpent: number;
  createdAt: string;
  status: 'active' | 'inactive';
  suspendReason?: string;
}

