export interface SupplierStockReceiptItem {
  id?: number;
  product_id: string;
  sku: string;
  product_name: string;
  input_quantity: number;
  input_unit: string;
  conversion_rate: number;
  quantity_base: number;
  lot_number?: string;
  expiry_date?: string;
  manufacture_date?: string;
  note?: string;
}

export interface SupplierStockReceipt {
  id: number;
  receipt_code: string;
  supplier_id: number;
  supplier_name: string;
  warehouse_id: number;
  warehouse_name: string;
  receipt_date: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  total_items: number;
  total_quantity_base: number;
  created_by_id: number;
  created_by_name: string;
  confirmed_by_name?: string;
  confirmed_at?: string;
  note?: string;
  created_at: string;
  items: SupplierStockReceiptItem[];
}

export interface SupplierStockReceiptCreateItem {
  product_id: string;
  input_quantity: number;
  input_unit?: string;
  conversion_rate?: number;
  lot_number?: string;
  expiry_date?: string;
  manufacture_date?: string;
  note?: string;
}

export interface SupplierStockReceiptCreatePayload {
  supplier_id?: string | number;
  warehouse_id: number;
  receipt_code?: string;
  receipt_date?: string;
  note?: string;
  items: SupplierStockReceiptCreateItem[];
}

export interface StockReceiptAdjustmentItem {
  product_id: string;
  adjusted_quantity_base: number;
  lot_number?: string;
  expiry_date?: string;
  note?: string;
}

export interface StockReceiptAdjustmentPayload {
  adjustment_reason: string;
  note?: string;
  items: StockReceiptAdjustmentItem[];
}
