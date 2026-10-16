export interface ProductLot {
  id: number;
  lot_number: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  warehouse_id: number;
  warehouse_name?: string;
  mfg_date: string;
  exp_date: string;
  initial_quantity: number;
  remaining_quantity: number;
  status?: 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED' | 'DEPLETED';
  notes?: string;
  created_at?: string;
}

export interface FEFOSuggestionItem {
  lot_id: number;
  lot_number: string;
  exp_date: string;
  available_quantity: number;
  allocated_quantity: number;
  is_near_expiry?: boolean;
  days_to_expiry?: number;
}

export interface FEFOSuggestionResponse {
  product_id: string;
  sku: string;
  requested_quantity: number;
  total_allocated: number;
  shortfall: number;
  suggestions: FEFOSuggestionItem[];
}
