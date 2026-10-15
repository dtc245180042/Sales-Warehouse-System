export interface CreditNoteItem {
  id: number;
  credit_note_id: string;
  return_order_item_id: number;
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

export interface CreditNote {
  id: string;
  client_request_id?: string;
  return_order_id: string;
  invoice_id: string;
  customer_id: string;
  customer_name?: string;
  adjustment_amount: number;
  adjustment_date: string;
  created_by: number;
  created_by_name?: string;
  notes?: string;
  created_at: string;
  items: CreditNoteItem[];
}

export interface CreditNoteCreateRequest {
  client_request_id?: string;
  return_order_id: string;
  notes?: string;
  adjustment_date?: string;
}
