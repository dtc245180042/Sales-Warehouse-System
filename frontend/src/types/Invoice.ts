export type InvoiceStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface InvoiceItem {
  id: number;
  invoice_id: string;
  dispatch_id: string;
  dispatch_item_id: number;
  order_id?: string;
  product_id: string;
  sku: string;
  product_name?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  vat_amount: number;
  subtotal: number;
}

export interface Invoice {
  id: string;
  client_request_id?: string;
  customer_id: string;
  customer_name?: string;
  customer_address?: string;
  customer_tax_code?: string;
  subtotal_amount: number;
  discount_amount: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: InvoiceStatus;
  issued_at: string;
  due_date: string;
  issued_by: number;
  issued_by_name?: string;
  notes?: string;
  created_at: string;
  items: InvoiceItem[];
}

export interface InvoiceCreateRequest {
  client_request_id?: string;
  customer_id: string;
  dispatch_ids: string[];
  due_date?: string;
  notes?: string;
}
