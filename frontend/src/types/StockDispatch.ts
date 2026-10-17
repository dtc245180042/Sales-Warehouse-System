export type DispatchStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export interface StockDispatchLotItem {
  id?: number;
  lot_id: number;
  lot_number?: string;
  quantity: number;
  override_reason?: string;
}

export interface StockDispatchItem {
  id?: number;
  dispatch_id?: string;
  product_id: string;
  sku: string;
  product_name?: string;
  unit?: string;
  ordered_quantity: number;
  dispatched_quantity: number;
  shortfall_quantity: number;
  lots?: StockDispatchLotItem[];
}

export interface StockDispatch {
  id: string;
  order_id: string;
  customer_id: string;
  customer_name?: string;
  warehouse_id: number;
  warehouse_name?: string;
  status: DispatchStatus;
  dispatched_by?: number;
  dispatched_by_name?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  items: StockDispatchItem[];
}

export interface BackorderItem {
  id: number;
  dispatch_id: string;
  order_id: string;
  customer_id: string;
  customer_name?: string;
  product_id: string;
  sku: string;
  product_name?: string;
  unit?: string;
  ordered_quantity: number;
  dispatched_quantity: number;
  shortfall_quantity: number;
  warehouse_id: number;
  warehouse_name?: string;
  status?: string;
  created_at: string;
}
