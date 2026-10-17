/**
 * Types for Advanced Inventory Report
 * SCRUM-826 & SCRUM-833
 */

export type InventoryDrillDimension = 'warehouse' | 'category' | 'sku';

export interface WarehouseSummaryRow {
  warehouseId: number;
  warehouseName: string;
  totalSkus: number;
  totalStock: number;
  totalValue: number;          // VND theo giá vốn
  lowStockCount: number;       // Số SKU dưới min_stock
  turnoverDays?: number;       // Số ngày luân chuyển trung bình
}

export interface CategorySummaryRow {
  categoryId: string;
  categoryName: string;
  skuCount: number;
  totalStock: number;
  totalValue: number;
  slowMovingCount: number;     // Số SKU chậm luân chuyển (>90 ngày)
}

export interface SkuDetailRow {
  productId: string;
  sku: string;
  productName: string;
  categoryName: string;
  warehouseName: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  minStock: number;
  costPrice: number;
  stockValue: number;          // physicalStock * costPrice
  lastMovementDate?: string;   // Ngày giao dịch cuối cùng
  daysSinceLastMovement?: number;
  isLowStock: boolean;
  isSlowMoving: boolean;       // > 90 ngày không có giao dịch
}

export interface InventoryReportData {
  asOfDate: string;
  totalSkus: number;
  totalStockValue: number;
  lowStockTotal: number;
  slowMovingTotal: number;
  avgStockDays: number;
  warehouseSummaries: WarehouseSummaryRow[];
  categorySummaries: CategorySummaryRow[];
  skuDetails: SkuDetailRow[];
}

export interface InventoryReportFilter {
  warehouseId?: number | 'all';
  categoryId?: string | 'all';
  search?: string;
  onlyLowStock?: boolean;
  onlySlowMoving?: boolean;
}
