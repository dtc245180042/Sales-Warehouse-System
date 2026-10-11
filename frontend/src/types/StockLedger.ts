export interface StockBalanceItem {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  warehouse_id: number;
  warehouse_code: string;
  warehouse_name: string;
  physical_stock: number;  // Cột 1: Tồn thực tế trong kho
  reserved_stock: number;  // Cột 2: Tồn đang giữ chỗ
  available_stock: number; // Cột 3: Tồn khả dụng (Physical - Reserved)
  min_stock: number;
  is_low_stock: boolean;   // Cảnh báo tồn dưới mức tối thiểu (S5-09)
}

export interface StockBalanceListResponse {
  items: StockBalanceItem[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}

export interface StockLedgerEntryItem {
  id: number;
  idempotency_key?: string;
  reference_code: string;
  line_ref?: string;
  movement_type: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  warehouse_id: number;
  warehouse_name: string;
  quantity_base: number;
  previous_physical: number;
  new_physical: number;
  performer_id: number;
  performer_name?: string;
  note?: string;
  created_at?: string;
}

export interface StockLedgerEntryListResponse {
  items: StockLedgerEntryItem[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}

export interface ProductStockCardResponse {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  balances: StockBalanceItem[];
  entries: StockLedgerEntryListResponse;
}
