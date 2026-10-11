export type StockTransferStatus = 'draft' | 'in_transit' | 'completed' | 'cancelled';

export interface StockTransferItem {
  id?: number;
  transfer_id?: string;
  product_id: string;
  sku?: string;
  product_name: string;
  unit: string;
  transfer_quantity: number;
  received_quantity?: number | null;
  discrepancy_quantity?: number;
  discrepancy_reason?: string;
  cost_price?: number;
  available_stock?: number; // Tồn khả dụng tại kho xuất (hỗ trợ UI lập phiếu)
}

export interface StockTransfer {
  id: string;
  code: string;
  source_warehouse: string;
  destination_warehouse: string;
  status: StockTransferStatus;
  transfer_date: string;
  total_items: number;
  total_received_items: number;
  has_discrepancy: boolean;
  discrepancy_reason?: string;
  note?: string;
  created_by?: string;
  created_by_id?: number;
  shipped_by?: string;
  shipped_at?: string;
  received_by?: string;
  received_at?: string;
  cancelled_by?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  created_at: string;
  updated_at: string;
  items: StockTransferItem[];
}

export interface StockTransferCreatePayload {
  source_warehouse: string;
  destination_warehouse: string;
  items: {
    product_id: string;
    sku?: string;
    product_name: string;
    unit?: string;
    transfer_quantity: number;
    cost_price?: number;
  }[];
  note?: string;
  ship_immediately?: boolean;
}

export interface StockTransferShipPayload {
  shipped_by?: string;
  note?: string;
}

export interface StockTransferReceivePayload {
  items: {
    product_id: string;
    received_quantity: number;
    discrepancy_reason?: string;
  }[];
  discrepancy_reason?: string;
  received_by?: string;
  note?: string;
}

export interface StockTransferCancelPayload {
  cancel_reason?: string;
}

export interface WarehouseStockItem {
  id: number;
  warehouse: string;
  product_id: string;
  sku?: string;
  product_name?: string;
  unit?: string;
  cost_price?: number;
  stock: number;
  physical_stock: number;
  in_transit_stock: number;
  updated_at: string;
}

export interface InTransitSummaryItem {
  transfer_id: string;
  transfer_code: string;
  source_warehouse: string;
  destination_warehouse: string;
  product_id: string;
  sku?: string;
  product_name: string;
  unit: string;
  in_transit_quantity: number;
  shipped_at?: string;
  created_by?: string;
}
