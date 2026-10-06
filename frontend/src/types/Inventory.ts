export type InventoryTransactionType = 'in' | 'out' | 'adjust' | 'transfer';
export type StockOutReason = 'sale' | 'damaged' | 'transfer' | 'expired' | 'other';

export interface InventoryItemSummary {
  productId: string;
  sku: string;
  name: string;
  warehouse: string;
  initialStock: number;
  imported: number;
  exported: number;
  currentStock: number;
  minStock: number;
  costPrice: number;
  totalValue: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface StockInItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;       // Số lượng theo đơn vị nhập
  unitName?: string;      // Đơn vị nhập (VD: Thùng, Lốc, Chiếc)
  unitRatio?: number;     // Hệ số quy đổi (1 unitName = unitRatio đơn vị cơ sở)
  baseQty?: number;       // Số lượng quy đổi về đơn vị cơ sở
  costPrice: number;
  subtotal: number;
}

export interface StockInReceipt {
  id: string;
  code: string;
  supplierId: string;
  supplierName: string;
  warehouse: string;
  date: string;
  items: StockInItem[];
  totalQuantity: number;
  totalAmount: number;
  note?: string;
  status: 'draft' | 'completed' | 'cancelled';
  createdBy: string;
  createdAt: string;
}

export interface StockOutItem {
  productId: string;
  sku: string;
  name: string;
  currentStock: number;
  quantity: number;       // Số lượng theo đơn vị xuất
  unitName?: string;      // Đơn vị xuất (VD: Thùng, Lốc, Chiếc)
  unitRatio?: number;     // Hệ số quy đổi (1 unitName = unitRatio đơn vị cơ sở)
  baseQty?: number;       // Số lượng quy đổi về đơn vị cơ sở
  costPrice: number;
  subtotal: number;
}

export interface StockOutReceipt {
  id: string;
  code: string;
  reason: StockOutReason;
  warehouse: string;
  destinationWarehouse?: string;
  date: string;
  items: StockOutItem[];
  totalQuantity: number;
  totalAmount: number;
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: string;
}

export interface InventoryHistoryRecord {
  id: string;
  code: string;
  type: InventoryTransactionType;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  balanceAfter: number;
  warehouse: string;
  performer: string;
  date: string;
  note: string;
}
