export type StockTakeScope = 'WAREHOUSE' | 'CATEGORY' | 'CUSTOM';

export type StockTakeStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

export interface StockTakeItem {
  id: number;
  stock_take_id: string;
  product_id: string;
  sku?: string | null;
  product_name: string;
  category_name?: string | null;
  unit: string;
  system_quantity: number;
  actual_quantity: number | null;
  discrepancy_quantity: number;
  is_counted: boolean;
  cost_price?: number;
  note?: string | null;
}

export interface StockTake {
  id: string;
  code: string;
  warehouse: string;
  scope_type: StockTakeScope;
  category_id?: number | null;
  category_name?: string | null;
  status: StockTakeStatus;
  total_items: number;
  total_system_qty: number;
  total_actual_qty: number;
  total_discrepancy_qty: number;
  has_discrepancy: boolean;
  adjustment_reason?: string | null;
  note?: string | null;
  cancel_reason?: string | null;
  created_by_id?: number | null;
  created_by_name?: string | null;
  confirmed_by_id?: number | null;
  confirmed_by_name?: string | null;
  confirmed_at?: string | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
  items: StockTakeItem[];
}

export interface StockTakeCreateRequest {
  warehouse: string;
  scope_type: StockTakeScope;
  category_id?: number | null;
  product_ids?: string[];
  note?: string;
}

export interface StockTakeItemCountInput {
  id?: number;
  product_id?: string;
  actual_quantity: number;
  note?: string;
}

export interface StockTakeCountUpdateRequest {
  items: StockTakeItemCountInput[];
}

export interface StockTakeConfirmRequest {
  adjustment_reason?: string;
}

export interface StockTakeCancelRequest {
  cancel_reason?: string;
}

export interface StockTakePreviewItem {
  product_id: string;
  sku?: string | null;
  name: string;
  category: string;
  category_id?: number | null;
  unit: string;
  system_quantity: number;
  cost_price: number;
}
