export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'DEBT_OFFSET';

export interface PaymentAllocation {
  id: number;
  payment_id: string;
  invoice_id: string;
  allocated_amount: number;
  created_at: string;
}

export interface Payment {
  id: string;
  client_request_id?: string;
  customer_id: string;
  customer_name?: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  collector_id: number;
  collector_name?: string;
  reference_code?: string;
  notes?: string;
  created_at: string;
  allocations: PaymentAllocation[];
}

export interface PaymentCreateRequest {
  client_request_id?: string;
  customer_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date?: string;
  reference_code?: string;
  notes?: string;
  allocations?: {
    invoice_id: string;
    allocated_amount: number;
  }[];
}
