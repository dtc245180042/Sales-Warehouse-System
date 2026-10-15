export type ReturnStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED';

export type ReturnReason =
  | 'DEFECTIVE_PRODUCT'
  | 'DAMAGED_IN_TRANSIT'
  | 'WRONG_DELIVERY'
  | 'EXPIRY_NEAR'
  | 'CUSTOMER_RETURN'
  | 'OTHER';

export type ItemCondition = 'GOOD' | 'DAMAGED';

export interface ReturnOrderItem {
  id: number;
  invoice_item_id: number;
  product_id: string;
  sku: string;
  product_name?: string;
  unit?: string;
  quantity: number;
  condition: ItemCondition;
  lot_id?: number | null;
  lot_number?: string | null;
  unit_price: number;
  discount_amount: number;
  vat_amount: number;
  subtotal: number;
}

export interface ReturnOrder {
  id: string;
  client_request_id?: string;
  invoice_id: string;
  customer_id: string;
  customer_name?: string;
  status: ReturnStatus;
  return_reason: ReturnReason;
  notes?: string;
  origin_warehouse_id: number;
  requested_by: number;
  requested_by_name?: string;
  requested_at: string;
  confirmed_by?: number | null;
  confirmed_by_name?: string | null;
  confirmed_at?: string | null;
  cancelled_by?: number | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  total_returned_value: number;
  created_at: string;
  items: ReturnOrderItem[];
}

export interface ReturnOrderCreateItemInput {
  invoice_item_id: number;
  lot_id?: number | null;
  quantity: number;
  condition: ItemCondition;
}

export interface ReturnOrderCreateRequest {
  client_request_id?: string;
  invoice_id: string;
  return_reason: ReturnReason;
  notes?: string;
  items: ReturnOrderCreateItemInput[];
}

export interface ReturnConfirmRequest {
  notes?: string;
}

export interface ReturnCancelRequest {
  cancel_reason: string;
}
