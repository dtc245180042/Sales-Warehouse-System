export interface ProductImportRow {
  sku: string;
  name: string;
  category?: string;
  category_id?: number | null;
  unit: string;
  packaging_spec?: string;
  cost_price: number;
  price: number;
  quantity?: number;
  description?: string;
  status: string;
  action: 'CREATE' | 'UPDATE';
}

export interface ProductImportRowError {
  row: number;
  sku: string;
  errors: string[];
}

export interface ProductImportPreviewResponse {
  total_rows: number;
  valid_count: number;
  invalid_rows_count: number;
  to_create_count: number;
  to_update_count: number;
  valid_data: ProductImportRow[];
  errors: ProductImportRowError[];
}

export interface ProductImportExecuteResponse {
  success_count: number;
  created_count: number;
  updated_count: number;
  created_skus: string[];
  updated_skus: string[];
  failed_count: number;
}
